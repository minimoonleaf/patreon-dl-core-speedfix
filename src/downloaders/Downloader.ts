import { SPEEDFIX_LABEL } from '../utils/SpeedFixVersion.js';
import fs from 'fs';
import { EventEmitter } from 'events';
import deepFreeze from 'deep-freeze';
import Fetcher from '../utils/Fetcher.js';
import Bootstrap, { type PostDownloaderBootstrapData, type ProductDownloaderBootstrapData, type DownloaderBootstrapData, type DownloaderType } from './Bootstrap.js';
import { type DownloaderInit, type DownloaderOptions, type FileExistsAction, getDownloaderInit } from './DownloaderOptions.js';
import { type DownloaderEvent, type DownloaderEventPayloadOf } from './DownloaderEvent.js';
import {type LogLevel} from '../utils/logging/Logger.js';
import Logger from '../utils/logging/Logger.js';
import { commonLog } from '../utils/logging/Logger.js';
import { type Campaign } from '../entities/Campaign.js';
import FSHelper, { type WriteTextFileResult } from '../utils/FSHelper.js';
import DownloadTaskBatch from './task/DownloadTaskBatch.js';
import { type IDownloadTask } from './task/DownloadTask.js';
import DownloadTaskFactory from './task/DownloadTaskFactory.js';
import FilenameFormatHelper from '../utils/FilenameFormatHelper.js';
import { type Downloadable } from '../entities/Downloadable.js';
import { generateCampaignSummary } from './templates/CampaignInfo.js';
import path from 'path';
import Bottleneck from 'bottleneck';
import URLHelper from '../utils/URLHelper.js';
import ffmpeg from 'fluent-ffmpeg';
import InnertubeLoader from '../utils/yt/InnertubeLoader.js';
import FFmpegDownloadTaskBase from './task/FFmpegDownloadTaskBase.js';
import ExternalDownloaderTask from './task/ExternalDownloaderTask.js';
import DB, { type DBInstance } from '../browse/db/index.js';
import PostParser from '../parsers/PostParser.js';
import { isDenoInstalled } from '../utils/Misc.js';
import { type Collection } from '../entities/Post.js';

export type DownloaderConfig<T extends DownloaderType> =
  DownloaderInit &
  DownloaderBootstrapData<T>;

export interface DownloaderStartParams {
  signal?: AbortSignal;
}

export type GetCampaignParams = 
  string |
  { userId: string; vanity?: never, campaignId?: never; } |
  { userId?: never; vanity: string, campaignId?: never; } |
  { vanity?: never; userId?: never; campaignId: string; };

interface CreateDownloadTaskParams<T extends DownloaderType> {
  target: Downloadable[];
  targetName: string;
  src: T | Campaign | Collection,
  dirs: {
    campaign: string | null;
    main: string;
    thumbnails: string | null;
  };
  fileExistsAction: FileExistsAction;
  isAttachment?: boolean;
  ignoreCreateTaskErrors?: boolean;
}

export default abstract class Downloader<T extends DownloaderType> extends EventEmitter {

  abstract name: string;

  protected fetcher: Fetcher;
  protected fsHelper: FSHelper;
  protected config: DownloaderConfig<T>;
  protected logger?: Logger | null;
  protected db: () => Promise<DBInstance>;
  #dbPromise: Promise<DBInstance> | null;

  #hasEmittedEndEventOnAbort: boolean;

  constructor(config: DownloaderConfig<T>, db: () => Promise<DBInstance>, logger?: Logger | null) {
    super();

    this.config = config;
    this.fetcher = new Fetcher(this.config, logger);
    this.fsHelper = new FSHelper(this.config, logger);
    this.#dbPromise = null;
    this.db = async () => {
      if (!this.#dbPromise) {
        this.#dbPromise = db();
      }
      return this.#dbPromise;
    }
    this.logger = logger;

    if (this.config.pathToFFmpeg) {
      ffmpeg.setFfmpegPath(this.config.pathToFFmpeg);
    }

    InnertubeLoader.setLogger(this.logger);
    if (this.config.pathToYouTubeCredentials) {
      InnertubeLoader.setCredentialsFile(this.config.pathToYouTubeCredentials);
    }

    this.#hasEmittedEndEventOnAbort = false;
  }

  protected createDownloadTaskBatch(
    name: string,
    signal?: AbortSignal,
    ...createTasks: Array<CreateDownloadTaskParams<T> | null>
  ): Promise<{ batch: DownloadTaskBatch; errorCount: number; }> {

    const __getDownloadIdString = (task: IDownloadTask, batch: DownloadTaskBatch) => {
      let result = `#${batch.id}.${task.id}`;
      if (task.retryCount > 0) {
        result += `-r${task.retryCount}`;
      }
      return result;
    };

    const batch = new DownloadTaskBatch({
      name,
      fetcher: this.fetcher,
      limiter: this.config.request,
      logger: this.logger
    });

    // SpeedFix v2.5.1: time *active* tasks, excluding queued limiter wait.
    const speedFixV251TaskStartedAt = new WeakMap<object, number>();
    // v2.5.3: active skip / error / abort timings; queued time is excluded.
    const speedFixV253SkipTiming = { observed: 0, slow: 0, totalMs: 0, maxMs: 0, maxTaskId: '' };
    const speedFixV253FinishTask = (task: object, outcome: string) => {
      const start = speedFixV251TaskStartedAt.get(task);
      speedFixV251TaskStartedAt.delete(task);
      if (start === undefined) return undefined;
      const elapsed = Date.now() - start;
      if (elapsed >= 3000) {
        const t = task as { id: string | number; srcEntity: { type: string; id: string | number } };
        this.log('info', `${SPEEDFIX_LABEL} Slow ${outcome}: ${elapsed} ms; type ${t.srcEntity.type}; item #${t.srcEntity.id}; batch #${batch.id}.${t.id}; active task time (includes destination I/O)`);
      }
      return elapsed;
    };
    batch.on('taskStart', ({task}) => {
      speedFixV251TaskStartedAt.set(task, Date.now());
      const retryOrBeginStr = task.retryCount > 0 ? 'retry' : 'begin';
      const isExternal = task instanceof ExternalDownloaderTask;
      const destStr = isExternal ? ' -> Unknown destination (external process)' : task.resolvedDestFilename ? ` -> ${task.resolvedDestFilename}` : '';
      this.log('info', `Download ${retryOrBeginStr} (${__getDownloadIdString(task, batch)}): [type: ${task.srcEntity.type}; ID: #${task.srcEntity.id}]${destStr}`);
      if (task instanceof FFmpegDownloadTaskBase) {
        const retryOrBeginStr = task.retryCount > 0 ? 'Retry' : 'Begin';
        this.log('info', `${retryOrBeginStr} FFmpeg task (${__getDownloadIdString(task, batch)}): ${task.commandLine}`);
      }
    });

    batch.on('taskComplete', ({task}) => {
      // SpeedFix v2.5.1: includes network transfer and destination I/O; not pure GET latency.
      const speedFixV251StartedAt = speedFixV251TaskStartedAt.get(task);
      if (speedFixV251StartedAt !== undefined) {
        const speedFixV251Elapsed = Date.now() - speedFixV251StartedAt;
        if (speedFixV251Elapsed >= 3000) {
          this.log('info', `${SPEEDFIX_LABEL} Slow task: ${speedFixV251Elapsed} ms; type ${task.srcEntity.type}; item #${task.srcEntity.id}; batch #${batch.id}.${task.id}; network + destination I/O`);
        }
        speedFixV251TaskStartedAt.delete(task);
      }
      const isExternal = task instanceof ExternalDownloaderTask;
      const destStr = isExternal ? ': Unknown destination (external process)' : task.resolvedDestPath ? `: "${task.resolvedDestPath}"` : '';
      this.log('info', `Download complete (${__getDownloadIdString(task, batch)})${destStr}`);
    });

    batch.on('taskError', ({error, willRetry}) => {
      speedFixV253FinishTask(error.task, willRetry ? 'retry/error' : 'error');
      const { task, cause, message } = error;
      const retryStr = willRetry ? '- will retry' : '';
      this.log('error', `Download error (${__getDownloadIdString(task, batch)}):`, cause || message, `(${task.src})`, retryStr);
    });

    batch.on('taskAbort', ({task}) => {
      speedFixV253FinishTask(task, 'abort');
      this.log('warn', `Download aborted (${__getDownloadIdString(task, batch)})`);
    });

    batch.on('taskSkip', ({task, reason}) => {
      const speedFixV253SkipMs = speedFixV253FinishTask(task, 'skip');
      if (speedFixV253SkipMs !== undefined) {
        speedFixV253SkipTiming.observed++;
        speedFixV253SkipTiming.totalMs += speedFixV253SkipMs;
        if (speedFixV253SkipMs >= 3000) speedFixV253SkipTiming.slow++;
        if (speedFixV253SkipMs > speedFixV253SkipTiming.maxMs) {
          speedFixV253SkipTiming.maxMs = speedFixV253SkipMs;
          speedFixV253SkipTiming.maxTaskId = `#${batch.id}.${task.id}`;
        }
      }
      this.log('warn', `Download skipped (${__getDownloadIdString(task, batch)}): ${reason.message}`);
    });

    batch.on('taskSpawn', ({origin, spawn}) => {
      this.log('info', `Download spawned: #${batch.id}.${origin.id} -> #${batch.id}.${spawn.id}`);
    });

    /**
     * Uncomment this block to log download progress

    batch.on('taskProgress', ({task, progress}) => {
      if (progress) {
        if (progress.length) {
          this.log('info', `Download progress (${__getDownloadIdString(task, batch)}): ${progress.lengthDownloaded} / ${progress.length} ${progress.lengthUnit}s / ${progress.percent}% (${progress.speed} kB/s)`,);
        }
        else {
          this.log('info', `Download progress (${__getDownloadIdString(task, batch)}): ${progress.lengthDownloaded} / ? ${progress.lengthUnit}s (${progress.speed} kB/s)`,);
        }
      }
      else {
        this.log('warn', `Download progress not available (${__getDownloadIdString(task, batch)})`);
      }
    });

    */

    batch.on('complete', () => {
      // Avoid noisy logging for a single fast-skipped collection thumbnail.
      if (speedFixV253SkipTiming.observed >= 20 || speedFixV253SkipTiming.slow > 0) {
        const s = speedFixV253SkipTiming;
        this.log('info', `${SPEEDFIX_LABEL} Skip timing batch #${batch.id}: ${s.observed} observed; mean ${Math.round(s.totalMs / s.observed)} ms; slow >=3s ${s.slow}; max ${s.maxMs} ms (${s.maxTaskId})`);
      }
      const total = batch.getTasks().length;
      const completed = batch.getTasks('completed').length;
      const error = batch.getTasks('error').length;
      const aborted = batch.getTasks('aborted').length;
      const skipped = batch.getTasks('skipped').length;
      const counts = [
        `${total} downloads`,
        `${completed} completed`,
        `${error} errors`,
        `${skipped} skipped`,
        `${aborted} aborted`
      ].join('; ');
      this.log('info', `Download batch complete (#${batch.id}): ${counts}`);
    });

    return this.addToDownloadTaskBatch(batch, signal, ...createTasks);
  }

  protected async addToDownloadTaskBatch(
    batch: DownloadTaskBatch,
    signal?: AbortSignal,
    ...createTasks: Array<CreateDownloadTaskParams<T> | null>
  ) {
    let failedCreateTaskCount = 0;
    for (const task of createTasks) {
      if (!task) {
        continue;
      }
      const { target, targetName, src, dirs } = task;
      this.log('info', `Create download tasks for ${targetName}`);
      if (task.target.length === 0) {
        this.log('warn', `No items in ${targetName}`);
        continue;
      }
      // === SpeedFix v2.4.2: preparation only; media GET limiter remains unchanged ===
      const speedFixStart = Date.now();
      const speedFixHeadCacheBefore = { ...this.fetcher.__speedFixV231HeadMetrics };
      const speedFixWorkers = Math.max(1, Math.min(4, Number(this.config.request.maxConcurrent) || 1));
      // SpeedFix v2.5.2: cautiously reduce HEAD base pacing (75 -> 60 ms).
      // Optional environment override 50..150 ms; existing 429 backoff is retained.
      const speedFixConfiguredGap = Number(process.env.SPEEDFIX_HEAD_GAP_MS);
      const speedFixBaseGap = process.env.SPEEDFIX_HEAD_GAP_MS !== undefined &&
        Number.isFinite(speedFixConfiguredGap)
          ? Math.round(Math.max(50, Math.min(150, speedFixConfiguredGap)))
          : 60;
      let speedFixGap = speedFixBaseGap;
      const speedFixPreparationLimiter = new Bottleneck({
        maxConcurrent: speedFixWorkers,
        minTime: speedFixGap
      });
      type SpeedFixTaskResult = Awaited<ReturnType<typeof DownloadTaskFactory.createFromDownloadable>>;
      const speedFixResults: Array<{
        tt: Downloadable;
        tasks?: SpeedFixTaskResult;
        error?: unknown;
        ms: number;
      } | undefined> = new Array(target.length);
      const speedFixOriginalResolver = this.fetcher.resolveDestFilePath;
      const speedFixHadOwnResolver = Object.prototype.hasOwnProperty.call(this.fetcher, 'resolveDestFilePath');
      const speedFixBoundResolver = speedFixOriginalResolver.bind(this.fetcher);
      let speedFixNextIndex = 0;
      let speedFixCooldownUntil = 0;
      let speedFix429Streak = 0;
      let speedFixLast429 = 0;
      let speedFixSuccessesAfter429 = 0;
      let speedFixHeadAttempts = 0;
      let speedFix429Count = 0;
      let speedFixSlowestHead: { ms: number } | null = null;
      const speedFixPause = async (ms: number, abortSignal?: AbortSignal) => {
        if (abortSignal?.aborted) throw new Error('HEAD preparation aborted');
        if (ms <= 0) return;
        await new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout>;
          const cleanup = () => {
            clearTimeout(timer);
            abortSignal?.removeEventListener('abort', onAbort);
          };
          const onAbort = () => {
            cleanup();
            reject(new Error('HEAD preparation aborted'));
          };
          timer = setTimeout(() => { cleanup(); resolve(); }, ms);
          abortSignal?.addEventListener('abort', onAbort, { once: true });
          if (abortSignal?.aborted) onAbort();
        });
      };
      // This per-batch wrapper also honors Patreon Retry-After on HEAD 429.
      // Type assertion is localized: we temporarily replace a generic instance method.
      (this.fetcher as any).resolveDestFilePath = async (params: Parameters<Fetcher['resolveDestFilePath']>[0]) => {
        const max429Retries = Math.max(0, Math.min(10, Number(this.config.request.maxRetries) || 0));
        for (let attempt = 0; attempt <= max429Retries; attempt++) {
          while (Date.now() < speedFixCooldownUntil) {
            await speedFixPause(Math.min(speedFixCooldownUntil - Date.now(), 60000), params?.signal || signal);
          }
          if (params?.signal?.aborted || signal?.aborted) throw new Error('HEAD preparation aborted');
          const started = Date.now();
          speedFixHeadAttempts++;
          try {
            const result = await speedFixBoundResolver(params);
            const elapsed = Date.now() - started;
            if (!speedFixSlowestHead || elapsed > speedFixSlowestHead.ms) speedFixSlowestHead = { ms: elapsed };
            if (speedFixLast429 > 0) {
              speedFixSuccessesAfter429++;
              if (speedFixGap > speedFixBaseGap && Date.now() - speedFixLast429 >= 60000 && speedFixSuccessesAfter429 >= 30) {
                speedFixGap = Math.max(speedFixBaseGap, speedFixGap - 25);
                await speedFixPreparationLimiter.updateSettings({ minTime: speedFixGap });
                speedFixSuccessesAfter429 = 0;
                speedFix429Streak = 0;
                this.log('info', `${SPEEDFIX_LABEL} HEAD rate recovered: gap ${speedFixGap} ms`);
              }
            }
            return result;
          }
          catch (caught: unknown) {
            const error = caught as Error & { status?: number; retryAfterMs?: number | null };
            const is429 = error?.status === 429 || /^429\s*[-:]/.test(String(error?.message || ''));
            if (!is429 || params?.signal?.aborted || signal?.aborted) throw caught;
            speedFix429Count++;
            speedFix429Streak++;
            speedFixLast429 = Date.now();
            speedFixSuccessesAfter429 = 0;
            const fallbackMs = Math.min(60000, 5000 * (2 ** Math.min(speedFix429Streak - 1, 4)));
            const serverMs = typeof error.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 0;
            const waitMs = Math.max(fallbackMs, serverMs);
            speedFixCooldownUntil = Math.max(speedFixCooldownUntil, Date.now() + waitMs);
            speedFixGap = Math.min(150, speedFixBaseGap + 25 * speedFix429Streak);
            await speedFixPreparationLimiter.updateSettings({ minTime: speedFixGap });
            const willRetry = attempt < max429Retries;
            this.log('warn', `${SPEEDFIX_LABEL} HEAD 429: cooldown ${Math.ceil(waitMs / 1000)}s; HEAD gap ${speedFixGap} ms; attempt ${attempt + 1}/${max429Retries + 1}; retry=${willRetry}`);
            if (!willRetry) throw caught;
          }
        }
        throw new Error('HEAD preparation retries exhausted');
      };
      let speedFixSlowest: { id: string | number; ms: number } | null = null;
      try {
        await Promise.all(Array.from({ length: Math.min(speedFixWorkers, target.length) }, async () => {
          while (!signal?.aborted) {
            const index = speedFixNextIndex++;
            if (index >= target.length) return;
            const tt = target[index];
            const started = Date.now();
            try {
              const tasks = await DownloadTaskFactory.createFromDownloadable({
                config: this.config,
                dirs,
                item: tt,
                src,
                fetcher: this.fetcher,
                fileExistsAction: task.fileExistsAction,
                isAttachment: task.isAttachment,
                limiter: speedFixPreparationLimiter,
                signal,
                logger: this.logger
              });
              speedFixResults[index] = { tt, tasks, ms: Date.now() - started };
            }
            catch (error) {
              speedFixResults[index] = { tt, error, ms: Date.now() - started };
            }
          }
        }));
      }
      finally {
        if (speedFixHadOwnResolver) (this.fetcher as any).resolveDestFilePath = speedFixOriginalResolver;
        else delete (this.fetcher as any).resolveDestFilePath;
      }
      const ensureDirsSet = new Set<string>();
      for (const result of speedFixResults) {
        if (signal?.aborted) return { batch, errorCount: failedCreateTaskCount };
        if (!result) continue;
        const { tt, tasks, error, ms } = result;
        if (!speedFixSlowest || ms > speedFixSlowest.ms) speedFixSlowest = { id: tt.id, ms };
        try {
          if (error) throw error;
          if (!tasks) throw new Error('No download tasks returned');
          for (const createdTask of tasks) {
            if (createdTask.doa) {
              this.log('error', `Failed to create download task for item #${tt.id} in ${targetName}:`, createdTask.doa.msg, createdTask.doa.cause);
              failedCreateTaskCount++;
            }
          }
          const createdTasks = tasks.filter((createdTask) => !createdTask.doa);
          batch.addTasks(createdTasks);
          for (const createdTask of createdTasks) {
            const dir = createdTask.resolvedDestPath ? path.dirname(createdTask.resolvedDestPath) : null;
            if (dir) ensureDirsSet.add(dir);
          }
        }
        catch (error) {
          if (signal?.aborted) {
            this.log('warn', 'Operation aborted');
            return { batch, errorCount: failedCreateTaskCount };
          }
          if (!task.ignoreCreateTaskErrors) {
            this.log('error', `Failed to create download task(s) for item #${tt.id} in ${targetName}:`, error);
            failedCreateTaskCount++;
          }
        }
      }
      const speedFixHeadCacheAfter = this.fetcher.__speedFixV231HeadMetrics;
      this.log('info', `${SPEEDFIX_LABEL} HEAD cache: ${speedFixHeadCacheAfter.hits - speedFixHeadCacheBefore.hits} reused; ${speedFixHeadCacheAfter.misses - speedFixHeadCacheBefore.misses} requests (exact URL, 20s TTL)`);
      this.log('info', `${SPEEDFIX_LABEL} Prepared ${target.length} item(s) for ${targetName} in ${Date.now() - speedFixStart} ms (up to ${speedFixWorkers} concurrent; HEAD gap ${speedFixBaseGap} -> ${speedFixGap} ms; HEAD attempts ${speedFixHeadAttempts}; HTTP 429s ${speedFix429Count}${speedFixSlowestHead ? `; slowest HEAD ${(speedFixSlowestHead as { ms: number }).ms} ms` : ''}${speedFixSlowest ? `; slowest item #${(speedFixSlowest as { id: string | number; ms: number }).id}: ${(speedFixSlowest as { ms: number }).ms} ms` : ''})`);
      // === End SpeedFix v2.4.2 preparation ===
      for (const dir of ensureDirsSet) {
        this.fsHelper.createDir(dir);
      }
    }
    if (failedCreateTaskCount > 0) {
      this.log('warn', `${failedCreateTaskCount} items could not be processed for downloading`);
    }
    return { batch, errorCount: failedCreateTaskCount };
  }

  async start(params: DownloaderStartParams) {
    try {
      await this.doStart(params);
    }
    finally {
      InnertubeLoader.reset();
    }
  }

  abstract doStart(params: DownloaderStartParams): Promise<void>;

  static async getInstance(
    target: string | ProductDownloaderBootstrapData | PostDownloaderBootstrapData,
    options?: DownloaderOptions
  ) {
    const bootstrap = typeof target === 'string' ? Bootstrap.getDownloaderBootstrapDataByURL(target) : target;
    if (!bootstrap) {
      throw Error('Could not determine downloader type from URL');
    }
    this.#validateOptions(options);

    const config = {
      ...bootstrap,
      ...getDownloaderInit(options)
    };
    const logger = options?.logger;
    const fsHelper = new FSHelper(config, logger);
    const db = () => DB.getInstance(fsHelper.getDBFilePath(), config.dryRun, logger);
    
    switch (config.type) {
      case 'product': {
        const ProductDownloader = (await import('./ProductDownloader.js')).default;
        return new ProductDownloader(config, db, logger);
      }
      case 'post': {
        const PostDownloader = (await import('./PostDownloader.js')).default;
        return new PostDownloader(config, db, logger);
      }
    }
  }

  static async getCampaign(
    params: GetCampaignParams,
    signal?: AbortSignal,
    options?: Logger | null | Pick<DownloaderOptions, 'cookie' | 'request' | 'logger'>
  ) {
    // Backwards compatibility - if 'params' is string type, then it is vanity
    let url: string;
    if (typeof params === 'string') {
      url = URLHelper.constructUserPostsURL({ vanity: params });
    }
    else if (params.userId || params.vanity) {
      url = URLHelper.constructUserPostsURL(params);
    }
    else {
      // Sole purpose of passing 'dummy' vanity is to create the PostDownloader instance
      url = URLHelper.constructUserPostsURL({ vanity: 'dummy' });
    }
    const downloader = await this.getInstance(
      url,
      options instanceof Logger ? { logger: options } : (options || undefined)
    );
    const PostDownloader = (await import('./PostDownloader.js')).default;
    if (downloader instanceof PostDownloader) {
      if (typeof params === 'object' && params.campaignId) {
        const { json } = await downloader.fetchCampaign(params.campaignId, signal);
        const parser = new PostParser(downloader.getFetcher(), options instanceof Logger ? options : options?.logger);
        return parser.parseCampaignAPIResponse(json);
      }
      return downloader.__getCampaign(signal);
    }
    throw Error('Type mismatch: PostDownloader expected');
  }

  static #validateOptions(options?: DownloaderOptions) {
    if (!options) {
      return true;
    }

    // Check FFmpeg path exists
    if (options.pathToFFmpeg) {
      if (!fs.existsSync(options.pathToFFmpeg)) {
        throw Error(`Path to FFmpeg executable "${options.pathToFFmpeg}" does not exist`);
      }
      else if (!fs.lstatSync(options.pathToFFmpeg).isFile()) {
        throw Error(`Path to FFmpeg executable "${options.pathToFFmpeg}" does not point to a file`);
      }
    }

    // Check Deno path exists and startable
    if (options.pathToDeno) {
      if (!fs.existsSync(options.pathToDeno)) {
        throw Error(`Path to Deno executable "${options.pathToDeno}" does not exist`);
      }
      else if (!fs.lstatSync(options.pathToDeno).isFile()) {
        throw Error(`Path to Deno executable "${options.pathToDeno}" does not point to a file`);
      }
      const di = isDenoInstalled(options.pathToDeno);
      if (!di.installed) {
        throw Error(`Could not start Deno executable "${options.pathToDeno}"`, { cause: di.error });
      }
    }

    // Check outDir is a directory
    if (options.outDir) {
      if (fs.existsSync(options.outDir) && !fs.lstatSync(options.outDir).isDirectory()) {
        throw Error(`"${options.outDir}" is not a directory`);
      }
    }

    // Check formats are valid
    const campaignDirNameFormat = options.dirNameFormat?.campaign;
    if (campaignDirNameFormat) {
      const validate = FilenameFormatHelper.validateCampaignDirNameFormat(campaignDirNameFormat);
      if (!validate.validateOK) {
        throw Error(`Campaign directory name format '${campaignDirNameFormat}' is invalid (matched against ${validate.regex})`);
      }
    }
    const contentDirNameFormat = options.dirNameFormat?.content;
    if (contentDirNameFormat) {
      const validate = FilenameFormatHelper.validateContentDirNameFormat(contentDirNameFormat);
      if (!validate.validateOK) {
        throw Error(`Content directory name format '${contentDirNameFormat}' is invalid (matched against ${validate.regex})`);
      }
    }
    const mediaFilenameFormat = options.filenameFormat?.media;
    if (mediaFilenameFormat) {
      const validate = FilenameFormatHelper.validateMediaFilenameFormat(mediaFilenameFormat);
      if (!validate.validateOK) {
        throw Error(`Media filename format '${mediaFilenameFormat}' is invalid (matched against ${validate.regex})`);
      }
    }

    return true;
  }

  protected async saveCampaignInfo(campaign: Campaign | null, signal?: AbortSignal) {
    const db = await this.db();
    if (!this.config.include.campaignInfo) {
      if (campaign) {
        db.saveCampaign(campaign, new Date());
      }
      return;
    }

    if (this.checkAbortSignal(signal)) {
      return;
    }

    let batch: DownloadTaskBatch | null = null;
    const abortHandler = () => {
      void (async () => {
        if (batch) {
          await batch.abort();
        }
      })();
    };
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    if (!campaign) {
      this.log('warn', 'Skipped saving campaign info: target unavailable');
      return;
    }

    this.log('info', `Save campaign info #${campaign.id}`);
    this.emit('targetBegin', { target: campaign });
    this.emit('phaseBegin', { target: campaign, phase: 'saveInfo' });

    // Step 1: create campaign directories
    const campaignDirs = this.fsHelper.getCampaignDirs(campaign);
    this.log('debug', 'Campaign directories: ', campaignDirs);
    this.fsHelper.createDir(campaignDirs.root);
    this.fsHelper.createDir(campaignDirs.info);

    // Step 2: save summary and raw json
    const summary = generateCampaignSummary(campaign);
    const summaryFile = path.resolve(campaignDirs.info, 'info.txt');
    const saveSummaryResult = await this.fsHelper.writeTextFile(summaryFile, summary, this.config.fileExistsAction.info);
    this.logWriteTextFileResult(saveSummaryResult, campaign, 'campaign summary');

    // Campaign / creator raw data might not be complete. Fetch directly from API.
    // Strictly speaking, we should check for 'error' in results, but since it's not going to be fatal we'll just skip it.
    const { json: fetchedCampaignAPIData } = await this.fetchCampaign(campaign.id, signal);
    const { json: fetchedCreatorAPIData } = campaign.creator ? await this.fetchUser(campaign.creator.id, signal) : { json: null };

    if (this.checkAbortSignal(signal)) {
      return;
    }

    const campaignRawFile = path.resolve(campaignDirs.info, 'campaign-api.json');
    const saveCampaignRawResult = await this.fsHelper.writeTextFile(
      campaignRawFile, fetchedCampaignAPIData || campaign.raw, this.config.fileExistsAction.infoAPI);
    this.logWriteTextFileResult(saveCampaignRawResult, campaign, 'campaign API data');

    if (campaign.creator) {
      const creatorRawFile = path.resolve(campaignDirs.info, 'creator-api.json');
      const saveCreatorRawResult = await this.fsHelper.writeTextFile(
        creatorRawFile, fetchedCreatorAPIData || campaign.creator.raw, this.config.fileExistsAction.infoAPI);
      this.logWriteTextFileResult(saveCreatorRawResult, campaign.creator, 'creator API data');
    }

    this.emit('phaseEnd', { target: campaign, phase: 'saveInfo' });

    // Step 3: download campaign media items
    this.emit('phaseBegin', { target: campaign, phase: 'saveMedia' });
    const campaignMedia: Downloadable[] = [
      campaign.avatarImage,
      campaign.coverPhoto
    ];
    if (campaign.creator) {
      campaignMedia.push(
        campaign.creator.image,
        campaign.creator.thumbnail
      );
    }
    for (const reward of campaign.rewards) {
      if (reward.image) {
        campaignMedia.push(reward.image);
      }
    }
    batch = (await this.createDownloadTaskBatch(
      `Campaign #${campaign.id} (${campaign.name})`,
      signal,
      {
        target: campaignMedia,
        targetName: `campaign #${campaign.id} -> images`,
        src: campaign,
        dirs: {
          campaign: campaignDirs.root,
          main: campaignDirs.info,
          thumbnails: null
        },
        fileExistsAction: this.config.fileExistsAction.info
      }
    )).batch;
    if (this.checkAbortSignal(signal)) {
      return;
    }
    batch.prestart();
    this.emit('phaseBegin', { target: campaign, phase: 'batchDownload', batch });
    await batch.start();
    await batch.destroy();
    this.emit('phaseEnd', { target: campaign, phase: 'batchDownload' });
    this.emit('phaseEnd', { target: campaign, phase: 'saveMedia' });

    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
    if (this.checkAbortSignal(signal)) {
      return;
    }

    // Step 4: save to DB
    db.saveCampaign(campaign, new Date());

    // Done
    this.log('info', 'Done saving campaign info');
    this.emit('targetEnd', { target: campaign, isSkipped: false });
  }

  protected log(level: LogLevel, ...msg: any[]) {
    commonLog(this.logger, level, this.name, ...msg);
  }

  getConfig(ro: false): DownloaderConfig<T>;
  getConfig(ro?: true): deepFreeze.DeepReadonly<DownloaderConfig<T>>;
  getConfig(ro = true) {
    return ro ? deepFreeze(this.config) : this.config;
  }

  protected checkAbortSignal(signal: AbortSignal | undefined) {
    if (signal && signal.aborted) {
      if (!this.#hasEmittedEndEventOnAbort) {
        this.emit('end', { aborted: true, message: 'Download aborted' });
        this.#hasEmittedEndEventOnAbort = true;
      }
      return true;
    }
    return false;
  }

  protected logWriteTextFileResult(result: WriteTextFileResult, target: {id: string}, targetName: string) {
    switch (result.status) {
      case 'completed':
        this.log('info', `Saved ${targetName} to "${result.filePath}"`);
        break;
      case 'skipped':
        this.log('warn', `Skipped saving ${targetName} #${target.id}: ${result.message}`);
        break;
      case 'error':
        this.log('error', `Error saving ${targetName} #${target.id} to "${result.filePath}":`, result.error);
    }
  }

  protected async commonFetchAPI(url: string, signal?: AbortSignal) {
    let json, requestAPIError: any;
    try {
      json = (await this.fetcher.get({ url, type: 'json', maxRetries: this.config.request.maxRetries, signal })).json;
    }
    catch (error) {
      if (signal?.aborted) {
        this.log('warn', 'API request aborted');
      }
      else {
        this.log('error', `Error requesting API URL "${url}": `, error);
        requestAPIError = error;
      }
      json = null;
    }
    return { json, error: requestAPIError };
  }

  protected fetchCampaign(campaignId: string, signal?: AbortSignal) {
    const url = URLHelper.constructCampaignAPIURL(campaignId);
    this.log('debug', `Fetch campaign data from API URL "${url}"`);
    return this.commonFetchAPI(url, signal);
  }

  protected fetchUser(userId: string, signal?: AbortSignal) {
    const url = URLHelper.constructUserAPIURL(userId);
    this.log('debug', `Fetch user data from API URL "${url}"`);
    return this.commonFetchAPI(url, signal);
  }

  protected async closeDB() {
    if (this.#dbPromise) {
      (await this.#dbPromise).close();
      this.#dbPromise = null;
    }
  }

  getFetcher() {
    return this.fetcher;
  }

  on<T extends DownloaderEvent>(event: T, listener: (args: DownloaderEventPayloadOf<T>) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  once<T extends DownloaderEvent>(event: T, listener: (args: DownloaderEventPayloadOf<T>) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }

  off<T extends DownloaderEvent>(event: T, listener: (args: DownloaderEventPayloadOf<T>) => void): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  emit<T extends DownloaderEvent>(event: T, args: DownloaderEventPayloadOf<T>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}

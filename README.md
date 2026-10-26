<!-- SPEEDFIX-FORK-INTRO-BEGIN -->
# Patreon Downloader Core — SpeedFix

Download and organize Patreon content you can access, with less overhead when processing large archives or scanning previously downloaded posts.

Version: SpeedFix v2.5.5 · Core package `3.9.0-speedfix.255` · Node.js CLI / library · Community-maintained fork

[Windows GUI / MSI installer](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases) · [SpeedFix GUI source](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix) · [Core tags](https://github.com/minimoonleaf/patreon-dl-core-speedfix/tags) · [Original Core](https://github.com/patrickkfkan/patreon-dl)

## English

### 1. What is Patreon Downloader?

Patreon Downloader is an open-source tool created by Patrick Kan for downloading and organizing Patreon content that your account is already permitted to access. It helps preserve local copies of creator posts and associated media, subject to their availability and your access rights.

Supported content includes creator and individual posts, collections, images, audio, attachments, supported videos, and purchased shop content. The Core provides a Node.js command-line tool and reusable library. For a Windows graphical application, use the companion [cw3 + SpeedFix GUI](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases).

The downloader does not unlock unsubscribed content or bypass DRM.

### 2. Why SpeedFix?

The original downloader provides extensive features, but processing a large creator archive or running the same download job again may require many individual post refreshes, metadata checks, and file-preparation steps. Some of that work is unnecessary when posts are already downloaded and the available metadata confirms that nothing relevant has changed.

SpeedFix focuses on reducing this repeated work without simply raising media transfer limits:

1. Skip unnecessary individual post refreshes when status-cache validation is safe.
2. Prepare media tasks with controlled parallelism.
3. Reuse recent HEAD responses and handle HTTP 429 rate limits.
4. Reduce duplicate destination-path scanning overhead.
5. Expose timing and skip statistics for troubleshooting.

### 3. Performance comparison with original Core v3.9.0

The table compares identifiable operations in the original source and SpeedFix. It does not claim that total download time improves by the same percentages.

| Optimization | Original Core v3.9.0 | SpeedFix v2.5.5 | Quantified difference |
|---|---|---|---|
| Individual post refreshes for 360 eligible, unchanged posts | The original bulk-post flow refreshes each post before status-cache validation: 360 requests under these conditions | In a reported v2.5.4 run, 360/360 posts qualified for Fast Skip, so these individual refreshes were avoided | 360 → 0 requests; 100% fewer individual refreshes for this specific sample |
| Media task preparation | One item is awaited at a time | Up to 4 preparation workers, limited by the configured concurrency | Up to 4× as many simultaneous preparation workers (+300% concurrency capacity); not a measured 4× speedup |
| Repeated HEAD requests for an identical URL | No corresponding short-lived HEAD response cache; 10 qualifying lookups can result in 10 requests | One successful response can be reused for subsequent matching lookups within 20 seconds (cache capacity: 64 entries) | Example: 10 → 1 requests, a 90% reduction; conditional illustration, not a benchmark |
| Destination-path collision checks | Repeated scans of the task list | Indexed groups using a `Map` | Reduces repeated scan work; no verified runtime percentage yet |

#### Additional improvement within the SpeedFix series

| HEAD preparation pacing | Earlier SpeedFix setting | Current setting | Calculated change |
|---|---|---|---|
| Minimum request-start interval | 75 ms | 60 ms | 20% shorter interval; approximately 25% higher theoretical initiation rate when pacing is the sole bottleneck |

The 75 ms → 60 ms figure compares two SpeedFix revisions, not the original Core: upstream v3.9.0 did not have this separate HEAD preparation pacing setting.

#### How to interpret these figures

- The 360/360 figure comes from an earlier v2.5.4 cache-heavy run; the Fast Skip functionality remains in v2.5.5. It describes requests avoided for those eligible posts, not a 100% reduction in all API requests or total runtime.
- Parallel worker count measures available concurrency, not a proven wall-clock speedup. Network latency, request pacing, file I/O, and rate limits may reduce the benefit.
- The 90% HEAD example assumes ten identical eligible HEAD lookups within the cache lifetime, with a reusable successful response.
- There is currently no controlled, repeatable end-to-end benchmark proving a fixed overall download-speed percentage versus upstream v3.9.0. Media GET rate limiting is not intentionally increased.

### 4. Other SpeedFix improvements

| Feature | Details |
|---|---|
| Fast Skip safety checks | Requires matching status-cache validation and usable list metadata; posts that do not qualify use the normal refresh flow. |
| HEAD cache | 20-second lifetime, maximum 64 entries. |
| HEAD pacing | Default 60 ms; configurable through `SPEEDFIX_HEAD_GAP_MS` (50–150 ms). |
| HTTP 429 handling | Observes `Retry-After` where supplied, bounded retries, and adaptive cooldown. |
| Batch diagnostics | Reports preparation time, slow tasks, Fast Skip totals, and collision-scan timing. |

### 5. Download and installation

- Windows desktop users: download the MSI from the [GUI Releases page](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases). The packaged GUI includes its required Core.
- CLI users and developers: use this repository's `speedfix` branch, or the [`v2.5.5-speedfix` source tag](https://github.com/minimoonleaf/patreon-dl-core-speedfix/tree/v2.5.5-speedfix). See “Installation (SpeedFix fork)” further down this README.
- GUI source builders: build this Core, create `patreon-dl-3.9.0-speedfix.255.tgz` using `npm pack`, and place it in the GUI repository's `vendor` directory before installing GUI dependencies.

Note: `npm i -g patreon-dl` installs the standard npm registry release, not this SpeedFix fork.

---

## 繁體中文

### 1. Patreon Downloader 是什麼？

Patreon Downloader 是由 Patrick Kan 開發的開源工具，用來下載並整理帳號原本就有權限存取的 Patreon 內容，方便保存創作者貼文與相關媒體的本機副本。

依內容與存取權限，可處理創作者與單篇貼文、收藏集、圖片、音訊、附件、支援的影片以及已購買的商店內容。本儲存庫提供 Node.js 命令列工具與程式庫；希望使用 Windows 圖形介面者，請下載 [cw3 + SpeedFix GUI](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases)。

本工具不會解鎖未訂閱內容，也不能繞過 DRM。

### 2. 為什麼開發 SpeedFix？

原版功能完整，但在掃描大量創作者貼文、或重複執行已下載過的工作時，仍可能花費時間逐篇重新請求貼文、查詢媒體資訊、準備下載任務。當快取和最新列表資訊已能確認部分內容未變更時，這些處理就可能成為可避免的負擔。

SpeedFix 的重點是降低重複工作，而不是直接提高媒體下載連線限制：

1. 安全符合條件時，省略不必要的逐篇貼文刷新請求。
2. 使用受限制的並行 Worker 加快媒體任務準備。
3. 快取近期 HEAD 回應並改善 HTTP 429 流量限制處理。
4. 減少輸出路徑衝突檢查的重複掃描。
5. 加入耗時與跳過統計，方便評估效果與排查問題。

### 3. 與官方原版 Core v3.9.0 的效能比較

下表的百分比是特定操作的請求數或理論並行能力，不代表整體下載時間有相同比例的加速。

| 最佳化項目 | 官方原版 Core v3.9.0 | SpeedFix v2.5.5 | 量化差異 |
|---|---|---|---|
| 360 篇符合條件、未變更貼文的逐篇刷新 | 原版大量貼文流程會先逐篇刷新再驗證快取；依該條件會有 360 次請求 | 先前 v2.5.4 測試紀錄顯示 360/360 篇符合 Fast Skip，省略這些逐篇刷新 | 360 → 0 次，該樣本的逐篇刷新請求減少 100% |
| 媒體任務準備 | 逐項等待完成後處理下一項 | 最多 4 個準備 Worker，受並行設定限制 | 同時處理容量最高為原版 4 倍（+300%），不是實測快 4 倍 |
| 相同 URL 的重複 HEAD | 無對應的短期 HEAD 回應快取；符合條件時查詢 10 次可能發出 10 次請求 | 成功回應在 20 秒內可重用；快取上限 64 筆 | 範例：10 → 1 次，減少 90%；屬情境推算 |
| 輸出檔名路徑衝突 | 重複掃描任務清單 | 以 `Map` 建立路徑索引分組 | 降低重複掃描量，尚無可靠的實測耗時百分比 |

#### SpeedFix 版本內部的額外改善

| HEAD 準備節奏 | SpeedFix 早期設定 | 目前設定 | 計算結果 |
|---|---|---|---|
| 最小請求啟動間隔 | 75 ms | 60 ms | 間隔縮短 20%；若只有節奏限制是瓶頸，理論啟動頻率約提高 25% |

75 ms → 60 ms 是 SpeedFix 不同版本之間的調整，並非官方原版與 SpeedFix 的對照；官方原版沒有這套獨立 HEAD 準備節奏設定。

#### 數據的適用範圍

- 360/360 是先前 v2.5.4 高快取命中率案例；v2.5.5 保留 Fast Skip 功能。減少 100% 指該樣本可省略的逐篇刷新請求，不是所有 API 請求，也不是總下載時間。
- Worker 數量代表並行容量，不等於實測加速倍數；網路、HEAD 節奏、磁碟 I/O 與伺服器流量限制都可能影響效果。
- HEAD 減少 90% 是假設同一 URL 在 20 秒內發生 10 次符合快取條件的查詢所得的計算範例。
- 目前還沒有與官方 Core v3.9.0 在相同條件下、可重現的完整下載耗時 Benchmark，因此不宣稱整體下載固定快了多少％。媒體 GET 的速率限制也沒有刻意提高。

### 4. SpeedFix 其他改進

| 功能 | 說明 |
|---|---|
| Fast Skip 安全驗證 | 必須同時符合狀態快取與列表資訊要求；不符合者沿用原本刷新流程。 |
| HEAD 快取 | 保存 20 秒，最多 64 筆。 |
| HEAD 節奏 | 預設 60 ms；可用 `SPEEDFIX_HEAD_GAP_MS` 設為 50–150 ms。 |
| HTTP 429 防護 | 參考 `Retry-After`、有限次數重試及自適應冷卻。 |
| 效能日誌 | 記錄準備耗時、慢速任務、Fast Skip 數量及路徑衝突處理時間。 |

### 5. 下載與安裝

- Windows 使用者：直接到 [GUI Releases](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases) 下載 MSI；安裝版已包含配套 Core。
- 命令列使用者或開發者：使用本儲存庫的 `speedfix` 分支或 [`v2.5.5-speedfix` 原始碼標記](https://github.com/minimoonleaf/patreon-dl-core-speedfix/tree/v2.5.5-speedfix)，並參考下方的「Installation (SpeedFix fork)」教學。
- 自行編譯 GUI：先建置 Core 並用 `npm pack` 產生 `patreon-dl-3.9.0-speedfix.255.tgz`，放入 GUI 的 `vendor` 資料夾後再安裝 GUI 相依套件。

提醒：直接執行 `npm i -g patreon-dl` 取得的是 npm 套件庫中的一般版本，不是 SpeedFix Fork。

---

## Credits & License / 作者與授權

| Contribution / 貢獻 | Maintainer / 維護者 |
|---|---|
| Original Patreon Downloader Core / 原始核心 | [Patrick Kan (@patrickkfkan)](https://github.com/patrickkfkan/patreon-dl) |
| cw3 GUI modifications / cw3 介面修改 | [Moe Haduki (@hadukimoe)](https://github.com/patrickkfkan/patreon-dl-gui/issues/85) |
| SpeedFix changes & maintenance / SpeedFix 修改及維護 | [minimoonleaf](https://github.com/minimoonleaf) |

This is an unofficial community-maintained fork, not an official release from the original maintainers. The original MIT license, copyright statements, `LICENSE`, `NOTICE`, and third-party attributions remain applicable.

本專案為非官方社群維護版本。原專案的 MIT 授權、著作權宣告、`LICENSE`、`NOTICE` 與第三方致謝仍須保留。

The original project's detailed CLI, configuration, features, limitations, and changelog continue below. / 以下保留原版的 CLI、設定、功能、限制與版本歷史文件。
<!-- SPEEDFIX-FORK-INTRO-END -->

<a href='https://ko-fi.com/minimoonleaf' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

The remaining sections of this README retain the original author's technical documentation for reference.
---
# patreon-dl

A Patreon downloader written in [Node.js](https://nodejs.org).

This repo contains the `patreon-dl` library and its command-line tool. For GUI application, check out [patreon-dl-gui](https://github.com/patrickkfkan/patreon-dl-gui).

### Features
- Access to patron-only content through cookie. This refers to content you have access to under your account. It does not include locked content that you don't have a subscription for.
- Download posts by user, in a collection or single post.
- Download products (aka shop purchases)
- Items included in downloads:
    - videos - but see [limitations](#limitations) on Patreon-hosted videos
    - images
    - audio
    - attachments
    - embedded videos
      - YouTube downloader built-in with configurable max resolution
      - Supports [external downloader](#embedded-videos--links---external-downloader)
- Save campaign and content info 
- Extensively configurable
- Browse downloaded content through integrated web server

You can run `patreon-dl` from the command-line or [use it as a library](./docs/Library.md) for your project. Node.js v20 or higher required.

### Limitations

**Embedded videos / links**

- Embedded links are not followed; only info about the embed is saved. Exception:
  - YouTube video link - in which case the video is downloaded; or
  - An external downloader is configured for the link provider.

For information on external downloaders, see the [Embedded videos / links - external downloader](#embedded-videos--links---external-downloader) section. Example config is provided for fetching YouTube (replacing the built-in downloader) and Vimeo videos.

**Patreon-hosted videos with DRM protection**

Some videos served by Patreon are now protected with DRM. Because these videos require a real-time decryption key available only during authorized streaming, they cannot be played back normally after being downloaded.

By default, `patreon-dl` will skip DRM-protected content to avoid broken downloads. If you still wish to download these files, you can force the download using:

- CLI: Use the `protected.media` option (see [example.conf](./example.conf)).
- Library: Use the `include.protectedMedia` option (see [documentation](./docs/Library.md)).

### FFmpeg dependency

[FFmpeg](https://ffmpeg.org) is required when downloading:
- videos that are provided only in streaming format; and
- embedded YouTube videos.

Not all video downloads require FFmpeg, but you should have it installed on your system anyway.

### Embedded YouTube videos / links

`patreon-dl` supports downloading embedded YouTube videos or from embedded YouTube video links.

#### Deno dependency

The built-in YouTube downloader runs code retrieved from YouTube or Google servers. If [Deno](https://deno.com/) is installed on your system, it will be used to execute this code within a secure, sandboxed environment. Without Deno, the code runs without isolation, increasing the risk of security vulnerabilities such as unauthorized access, data corruption, or malicious behavior. For this reason, installing Deno is strongly recommended.

When needed, the downloader will attempt to invoke the `deno` command. If it’s not found, it will default to unsafe execution. If Deno is installed but the `deno` executable isn’t available in your system’s PATH, you can manually specify its location using the `--deno` CLI option or `path.to.deno` config file option:

```
// CLI
$ patreon-dl --deno path/to/deno ...

// Config file
[downloader]
path.to.deno = "path/to/deno"
...
```

#### Premium access / "Login required" error

If you have a YouTube Premium subscription, you can connect `patreon-dl` to your account and download videos at qualities available only to Premium accounts (e.g. '1080p Premium'). You will also need to connect to an account (not necessarily Premium) if you get a "Login required" error message during download.

For CLI users, you would configure `patreon-dl` as follows:

```
$ patreon-dl --configure-youtube
```

### Embedded videos / links - external downloader

You can specify external programs to download embedded videos or from embedded links. For YouTube videos, this will replace the built-in downloader.

See the [example config](./example-embed.conf) on how to configure an external downloader to fetch YouTube, Vimeo and SproutVideo content through [yt-dlp](https://github.com/yt-dlp/yt-dlp). Helper scripts bundled with `patreon-dl` are used in the case of Vimeo and SproutVideo ([patreon-dl-vimeo.js](./bin/patreon-dl-vimeo.js) and [patreon-dl-sprout.js](./bin/patreon-dl-sprout.js) respectively).

## Installation

1. First, install [Node.js](https://nodejs.org). 
2. Then, install [FFmpeg](https://ffmpeg.org) (if you are going to download videos).
3. Then, in a terminal, run the following command:

   ```
   $ npm i -g patreon-dl
   ```

   The `-g` option is for installing `patreon-dl` globally and have the CLI executable added to the PATH. Depending on your usage, you might not need this.

## CLI usage

```
$ patreon-dl [OPTION]... URL
```

### OPTION

| Option    | Alias | Description |
|-----------|-------|-------------|
| `--help`  | `-h`  | Display usage guide |
| <code><nobr>--config-file &lt;path&gt;</nobr></code> | `-C` | Load [configuration file](#configuration-file) at `<path>` for setting full options |
| `--cookie <string>` | `-c` | Cookie for accessing patron-only content; [how to obtain cookie](https://github.com/patrickkfkan/patreon-dl/wiki/How-to-obtain-Cookie). |
| `--ffmpeg <path>` | `-f` | Path to FFmpeg executable |
| `--deno <path>` | `-d` | Path to Deno executable |
| `--out-dir <path>` |`-o` | Directory to save content |
| `--log-level <level>` | `-l` | Log level of the console logger: `info`, `debug`, `warn` or `error`; set to `none` to disable the logger. |
| `--no-prompt` | `-y` | Do not prompt for confirmation to proceed |
| `--dry-run`   |      | Run without writing files to disk (except logs, if any). Intended for testing / debugging. |
| <code><nobr>--list-tiers &lt;creator&gt;</nobr></code> | | <p>List tiers for the given creator(s). Separate multiple creators with a comma.</p>The purpose of this is to let you find out what tier IDs to set for `posts.in.tier` filtering option under `include` section of [configuration file](#configuration-file). |
| <code><nobr>--list-tiers-uid &lt;user ID&gt;</nobr></code> | | Same as `--list-tiers`, but takes user ID instead of vanity. |
| <code><nobr>--list-posts &lt;creator&gt;</nobr></code> | | <p>List posts by the given creator(s). Separate multiple creators with a comma.</p> |
| <code><nobr>--list-posts-uid &lt;user ID&gt;</nobr></code> | | Same as `--list-posts`, but takes user ID instead of vanity. |
| `--configure-youtube` | | <p>Configure YouTube connection.</p>`patreon-dl` supports downloading embedded YouTube videos. If you have a YouTube Premium account, you can connect `patreon-dl` to it for downloading Premium-quality streams. You will also need to connect to an account if you get a "Login required" error message during download.|

### URL

#### Supported URL formats

```
// Download products from a creator's shop
https://www.patreon.com/<creator>/shop
https://www.patreon.com/c/<creator>/shop
https://www.patreon.com/cw/<creator>/shop

// Download a single product
https://www.patreon.com/<creator>/shop/<slug>-<product_id>

// Download posts by creator
https://www.patreon.com/<creator>/posts
https://www.patreon.com/c/<creator>/posts
https://www.patreon.com/cw/<creator>/posts
https://www.patreon.com/user/posts?u=<user_id>

// Dowload a single post
https://www.patreon.com/posts/<post_id>
https://www.patreon.com/posts/<slug>-<post_id>

// Download posts in a collection
https://www.patreon.com/collection/<collection_id>

```

#### Custom URLs

Some creators host their Patreon pages on custom domains. You can provide this custom URL to `patreon-dl`, which will download posts from the associated creator.

#### Multiple URLs

You may specify multiple URLs by separating them with a comma. E.g.:

```
// First download posts by johndoe, followed by posts by janedoe.
$ patreon-dl "https://www.patreon.com/johndoe/posts,https://www.patreon.com/janedoe/posts"
```

#### Supplying URLs through file

You can also use a file to supply URLs to `patreon-dl`. For example, you can have a `urls.txt` that has the following content:

```
# Each URL is placed in its own line
# Comments (lines starting with '#') will be ignored

https://www.patreon.com/johndoe/posts
https://www.patreon.com/janedoe/posts

```

You can then pass `urls.txt` to `patreon-dl`:

```
$ patreon-dl urls.txt
```

In this file, you can also override `include` options provided in a [configuration file](#configuration-file) passed to `patreon-dl` (through the `-C` option). `include` options allow you specify what to include in downloads. This overriding mechanism allows you to specify different content to download for each target URL. For example, you might have the following `include` option in your configuration file:

```
...

[include]

# Include posts that belong only to tier ID '-1' (public tier)
posts.in.tier = -1

...
```

Then, in your `urls.txt`, you can override as follows:

```
# URL 1
https://www.patreon.com/johndoe/posts

# Override 'posts.in.tier = -1' in [include] section of configuration file.
# This will cause downloader to download posts from URL 1 belonging to tier with
# ID '123456' or '789100'.

include.posts.in.tier = 123456, 789100

# Other include options - they basically have the same name as those
# in the configuation file, but prepended with 'include.':
#
# include.locked.content
# include.posts.with.media.type
# include.posts.published.after
# include.posts.published.before
# include.campaign.info
# include.content.info
# include.preview.media
# include.content.media
# include.protected.media
# include.all.media.variants
# include.images.by.filename
# include.audio.by.filename
# include.attachments.by.filename
# include.comments

# URL 2 
https://www.patreon.com/janedoe/posts

# If you don't place any 'include.*' statements here, the downloader will use
# options from configuration file or default values if none provided.

# URL 3
...

```

### Directory structure

Content is saved with the following directory structure:
```
out-dir
    ├── campaign
        ├── campaign_info
        ├── posts
        │   ├── post 1
        │   │   ├── post_info
        │   │   ├── images
        │   │   ├── ...
        │   ├── post 2
        │       ├── post_info
        │       ├── images
        │       ├── ...
        ├──shop
            ├── product 1
                ├── product_info
                ├── content_media
                ├── ...
```


### Configuration file

Command-line options are limited. To access the full range of options, create a configuration file and pass it to `patreon-dl` with the (capital) `-C` option.

Refer to the [example config](./example.conf) to see what options are offered. Also see [How to obtain Cookie](https://github.com/patrickkfkan/patreon-dl/wiki/How-to-obtain-Cookie).

Note that you can override an option from a configuration file with one provided at the command-line, provided of course that a command-line equivalent is available.

## Browsing downloaded content

`patreon-dl` comes with a web server that allows you to browse downloaded content. To start the web server:

```
$ patreon-dl-server [OPTION]
```

### OPTION

| Option    | Alias | Description |
|-----------|-------|-------------|
| `--help`  | `-h`  | Display usage guide |
| `--data-dir <dir>` |`-i` | Directory containing downloaded content. Default: current working directory |
| `--port <number>` |`-p` | Web server port. Default: `3000`, or a random port if `3000` is already in use. |
| `--log-level <level>` | `-l` | Log level of the console logger: `info`, `debug`, `warn` or `error`; set to `none` to disable the logger. Default: `info` |
| `--log-file <file>` | `-f` | Save logs to `<file>`. |


### Example usage

Say you downloaded something with `patreon-dl`:

```
$ patreon-dl -o "C:\PatreonDownloads" <url>
```

This will download content to `C:\PatreonDownloads`. To view the downloaded content, start `patreon-dl` server as follows:

```
$ patreon-dl-server -i "C:\PatreonDownloads"

...info: Web server is running on <URL>
```

Note the URL shown in the output. Open this URL in a web browser to begin viewing the downloaded content.

> Keep in mind that the web server is in no way secure. It is meant for local browsing and should not be exposed to outside parties!

## Changelog

3.9.0
- Fix "initial data not found" error for certain targets ([#134](https://github.com/patrickkfkan/patreon-dl/issues/134)).
- Fix order of images in post content ([patreon-dl-gui#60](https://github.com/patrickkfkan/patreon-dl-gui/issues/60)).
- Support `media.index` field in `media.filename.format`.
- Handle conditional separators properly in filename format patterns.
- Browse: use slugified links.
- Minor bug fixes.

See the [full changelog](./CHANGELOG.md) for older versions.

---
This project is licensed under the MIT License and includes third-party software—see the [NOTICE](./NOTICE) file for attributions.

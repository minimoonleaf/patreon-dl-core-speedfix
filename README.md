<!-- SPEEDFIX-FORK-INTRO-BEGIN -->
# Patreon Downloader Core — SpeedFix

**Download and organize Patreon content you have access to — with less waiting during large or repeated downloads.**

**SpeedFix v2.5.5 · Core `3.9.0-speedfix.255` · Node.js CLI / library · Unofficial community fork**

[**Windows GUI & MSI installer**](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases) · [**GUI source**](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix) · [**Core releases / tags**](https://github.com/minimoonleaf/patreon-dl-core-speedfix/tags) · [**Original project**](https://github.com/patrickkfkan/patreon-dl)

## What is Patreon Downloader?

[Patreon](https://www.patreon.com/) is a platform where creators publish posts and share media with their audiences. **Patreon Downloader** is an open-source tool originally developed by Patrick Kan that helps you save and organize Patreon content available to your account, so you can maintain a local copy of posts and their media.

Depending on the content and your access permissions, it can download:

- Creator posts, individual posts, and collections.
- Images, audio, attachments, and supported videos / embedded media.
- Purchased shop products and associated content.
- Post and creator information, with options to organize downloaded files and browse them locally.

The **Core** is the Node.js command-line downloader and reusable library. If you prefer a graphical interface, use the matching **[cw3 + SpeedFix GUI for Windows](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases)** instead.

**Access and limitations:** This tool uses access you already have (for example, through your Patreon account cookie). It does not grant access to posts you have not subscribed to or purchased, and it does not bypass DRM. See the original feature, dependency, and limitation documentation below.

## Why does SpeedFix exist?

The original downloader already supports many content types and useful configuration options. However, **large creator archives and repeat downloads** can spend substantial time checking posts, requesting media metadata, and preparing download tasks—even when much of the content has not changed.

SpeedFix was created to reduce that avoidable overhead while retaining the original downloader's behavior and respecting Patreon API rate limits. Its goals are to:

1. **Avoid unnecessary work** when existing cache and fresh listing metadata safely indicate that a post can be skipped.
2. **Prepare downloads more efficiently** through limited concurrency and smarter metadata requests.
3. **Handle temporary rate limits more gracefully**, rather than simply making requests as fast as possible.
4. **Make performance observable** with clearer timing, skip statistics, and diagnostic logs.

This project is **not** a bandwidth-unlocking tool. Its main improvements target content discovery, validation, metadata requests, and download preparation; actual media-transfer speed still depends on the network and server.

## What's improved in SpeedFix v2.5.5?

| Area | Changes |
|---|---|
| **Fast Skip** | Skips unnecessary per-post refresh requests when existing status-cache checks and available fresh listing metadata meet the required conditions. Changes that are not reflected in this metadata might not be detected. |
| **Parallel preparation** | Supports up to **4 concurrent download-preparation workers**, subject to configured concurrency. |
| **HEAD request optimization** | Uses a default **60 ms** preparation gap and a **20-second cache** with up to **64 entries**, reducing repeated requests. `SPEEDFIX_HEAD_GAP_MS` can adjust the interval within its supported range. |
| **HTTP 429 handling** | Uses `Retry-After` when supplied, bounded retries, and adaptive cooldown for rate-limited HEAD requests. |
| **Destination handling** | Reduces overhead when checking for duplicate output paths. |
| **Diagnostics** | Adds Fast Skip statistics, preparation timing, slow-task information, and batch-level performance logs. |

### How much faster is it?

SpeedFix improves specific stages of the workflow, but **there is not yet a reproducible end-to-end benchmark showing a fixed overall speedup** over the original Core v3.9.0.

For perspective, comparing a **75 ms** request-preparation interval with **60 ms** gives a **20% shorter interval** and approximately **25% higher theoretical request-initiation frequency** *if request pacing is the only bottleneck*. This is a configuration-level comparison, **not a measured 25% improvement in total download speed**. With many unchanged posts, Fast Skip can avoid numerous API calls; when downloading large new videos, network transfer time may dominate instead.

Performance varies with the number of posts, cache hit rate, available metadata, network latency, and server rate limits. Media GET rate limiting is **not intentionally increased**.

## Which version should I use?

- **Windows users:** Download the installer from the [GUI Releases page](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases). You do not need to install the Core separately when using the packaged GUI.
- **CLI users / developers:** Use this Core repository. The `speedfix` branch is maintained for ongoing development, while [`v2.5.5-speedfix`](https://github.com/minimoonleaf/patreon-dl-core-speedfix/tree/v2.5.5-speedfix) identifies this release's source.
- **Building the GUI yourself:** The matching GUI depends on the locally packaged Core `patreon-dl-3.9.0-speedfix.255.tgz`. Build this Core, run `npm pack`, and place the tarball in the GUI's `vendor` folder as described in the GUI README.

**Installation warning:** `npm i -g patreon-dl` downloads the standard npm registry package, **not this SpeedFix fork**. Follow the **Installation (SpeedFix fork)** instructions below to build this version from source.

---

## 繁體中文｜專案介紹

### Patreon Downloader 是什麼？

[Patreon](https://www.patreon.com/) 是創作者發布貼文、圖片、影片、音訊及會員內容的平台。**Patreon Downloader** 是 Patrick Kan 開發的開源下載工具，可以將你**原本就有權限存取**的 Patreon 貼文與媒體保存到本機，方便整理、備份與瀏覽。

它支援依創作者、單篇貼文、收藏集及已購買商品下載內容，依內容類型與權限處理圖片、音訊、附件及支援的影片，並保存相關資訊。

這個 Repository 是 **Core 核心程式**，提供 Node.js 命令列工具及程式庫。如果你只想在 Windows 使用圖形介面，建議直接下載 **[cw3 + SpeedFix GUI 安裝版](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases)**，不需要另外手動安裝 Core。

**使用限制：** 本工具只能取得帳號本來就有權限瀏覽的內容，不會解鎖未訂閱或未購買的貼文，也不能繞過 DRM 保護。

### 為什麼開發 SpeedFix？

原版 Patreon Downloader 已有完整的下載及設定功能，但在**大量貼文、重複掃描或已下載過大部分內容**的情境下，程式可能仍需花費不少時間檢查貼文、查詢媒體資訊、準備下載任務，即使其中許多貼文根本沒有更新。

SpeedFix 的目的不是無限制增加下載連線，而是**減少不必要的 API 請求與等待，改善下載準備效率，同時維持原有功能並妥善處理 Patreon 的速率限制**。

### SpeedFix v2.5.5 改善了什麼？

- **Fast Skip：** 在狀態快取與最新列表資料符合條件時，省略未變更貼文不必要的逐篇重新請求；若遠端變更沒有反映在可取得的資料中，仍可能無法偵測。
- **並行準備：** 最多使用 **4 個 Worker** 準備下載任務，降低等待。
- **HEAD 最佳化：** 預設 **60 ms** 準備間隔、**20 秒**快取及最多 **64 筆**快取項目，減少重複請求。
- **HTTP 429 保護：** 透過 `Retry-After`、有限次數重試與自適應冷卻，更穩定地處理暫時的速率限制。
- **檔案與日誌：** 改善輸出路徑重複檢查效率，並提供 Fast Skip 統計、任務準備耗時、慢速任務及批次效能資訊。

### 大約可以快多少？

目前**尚無可重現的原版 Core 3.9.0 與 SpeedFix v2.5.5 完整下載時間對照測試**，因此不宣稱固定加速 2 倍、3 倍或某個百分比。

以設定差異舉例：將請求準備間隔由 **75 ms 調為 60 ms**，代表間隔縮短 **20%**；如果唯一瓶頸就是這個間隔，理論請求發起頻率約可提高 **25%**。**這不是整體下載速度提升 25% 的實測結果。**

實際效果取決於貼文是否有變更、快取命中率、API 回應速度、網路品質及媒體大小。重複掃描大量未變更貼文通常更能受益；下載大型新影片時，則可能主要受到網路速度限制。SpeedFix 並未刻意提高媒體 GET 的速率限制。

### 如何取得與安裝？

- **Windows 一般使用者：** 到 [GUI Releases](https://github.com/minimoonleaf/patreon-dl-gui-cw3-speedfix/releases) 下載 MSI 安裝程式。
- **命令列與開發者：** 使用本 Core Fork 的 `speedfix` 分支；正式版本以 [`v2.5.5-speedfix` Tag](https://github.com/minimoonleaf/patreon-dl-core-speedfix/tree/v2.5.5-speedfix) 標記。
- **自行編譯 GUI：** 必須先建置本 Core 並使用 `npm pack` 產生 `patreon-dl-3.9.0-speedfix.255.tgz`，放入 GUI 專案的 `vendor` 目錄。

提醒：直接執行 `npm i -g patreon-dl` 安裝的是 npm 上的**一般原版**，不是這個 SpeedFix Fork。請依照下方的 **Installation (SpeedFix fork)** 說明安裝。

## Credits & License / 作者與授權

- **Original Patreon Downloader / 原始核心作者：** [Patrick Kan (@patrickkfkan)](https://github.com/patrickkfkan/patreon-dl).
- **cw3 GUI improvements / cw3 介面修改：** [Moe Haduki (@hadukimoe)](https://github.com/patrickkfkan/patreon-dl-gui/issues/85).
- **SpeedFix integration & maintenance / SpeedFix 整合維護：** [minimoonleaf](https://github.com/minimoonleaf).
- The original project's MIT license, copyright notices, `LICENSE`, `NOTICE`, and third-party attributions remain in effect. / 原專案 MIT 授權、著作權宣告與第三方致謝仍須保留。

**This is an unofficial community-maintained fork**, not an official release by the original maintainers. / **本專案為非官方社群維護版本**。

The sections below preserve the original project's detailed features, CLI options, configuration, limitations, and changelog with fork-specific installation adjustments.
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

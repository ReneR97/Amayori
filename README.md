# Amayori — Domestika Course Downloader

A modern desktop application to download courses from Domestika that you own — either through purchase or your Plus subscription. Built with Electron, featuring a clean UI, automatic login, progress tracking, and one-click engine setup.

> \[!WARNING]
> You must own the course you want to download. This tool is intended for personal offline access to content you have legitimately purchased or received through a Domestika Plus subscription. Do not use it to distribute or share downloaded content.

\---

## Features

* 🔐 **Automatic Login** — Log into Domestika in a popup window; cookies are captured and persisted automatically
* ⚙️ **One-click Engine Setup** — Downloads and installs `N\_m3u8DL-RE` directly from GitHub inside the app
* 📥 **Course Scraper** — Paste a course URL to fetch all units and lessons with one click
* ✅ **Selective Downloads** — Check/uncheck individual lessons before downloading
* 📊 **Live Progress** — Per-lesson download progress bars, speed, and ETA
* 🎞️ **H.265 Transcoding** — Optional automatic transcoding to HEVC after download (CPU or NVIDIA GPU)
* 🌍 **Subtitle Support** — Download subtitles in multiple languages simultaneously
* ⚡ **Parallel Downloads** — Configurable concurrent download threads (1–6)
* 📚 **Local Library** — Browse your downloaded courses and open them in Explorer
* 🎬 **Final Project Support** — Automatically fetches the course's Final Project video when available

\---

## Download \& Installation

### Windows

1. Download `Amayori 1.0.0.exe` from the [Releases](../../releases) page.
2. Run the `.exe` — it is a **portable app**, no installation required.

### Linux

1. Download `amayori-downloader-1.0.0.tar.gz` from the [Releases](../../releases) page.
2. Extract the archive:

```bash
   tar -xzf amayori-downloader-1.0.0.tar.gz
   ```

3. Run the app:

```bash
   ./amayori-downloader-1.0.0/amayori-downloader
   ```

4. If you get a permission error, grant execute rights first:

```bash
   chmod +x amayori-downloader-1.0.0/amayori-downloader
   ```

### macOS

> \[!IMPORTANT]
> A pre-built macOS binary is not currently distributed because building macOS packages requires an Apple machine. To run on macOS, you need to build from source (see below).

\---

## Building from Source

### Prerequisites

* [Node.js](https://nodejs.org/) v18 or later
* [npm](https://www.npmjs.com/)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/YOUR\_USERNAME/amayori.git
cd amayori

# 2. Install dependencies
npm install

# 3. Run in development mode
npm start
```

### Building Binaries

```bash
# Windows — produces: release/Amayori 1.0.0.exe
npm run build:win

# Linux — produces: release/amayori-downloader-1.0.0.tar.gz
npm run build:linux

# macOS (must run on a Mac) — produces: release/Amayori-1.0.0-mac.zip
npm run build:mac
```

> \[!NOTE]
> The Windows build requires `cross-env` (automatically installed with `npm install`). If you encounter symlink errors during the Windows build, make sure \*\*Windows Developer Mode\*\* is enabled (Settings → System → For developers → Developer Mode).

\---

## First-Time Setup

### 1\. Install the Download Engine

On the **Dashboard**, check the **System Core Status** panel. If `N\_m3u8DL-RE` shows as **Missing**:

* Click **"Install N\_m3u8DL-RE"** on the dashboard, or
* Go to **Settings → Transcoding Engines → Install / Update**

The app will automatically fetch the latest release from GitHub and install it. No manual downloading needed.

### 2\. Authenticate

Go to **Settings → Authentication Credentials** and click **"Login Automatically"**.

A browser popup will open at the Domestika login page. Log in normally — the app detects the successful login, captures your session cookies automatically, and closes the popup.

Alternatively, you can paste cookies manually:

1. Install the [Cookie-Editor](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) browser extension
2. Log into [domestika.org](https://www.domestika.org)
3. Open Cookie-Editor and copy the value of `\_domestika\_session` into the first field
4. Copy the value of `\_credentials\_` into the second field
5. Click **Save All Settings**

### 3\. Install FFmpeg (Optional — for transcoding only)

FFmpeg is only needed if you want to transcode videos to H.265/HEVC. If you don't use transcoding, skip this step.

* **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or run:

```powershell
  winget install ffmpeg
  ```

* **macOS**:

```bash
  brew install ffmpeg
  ```

* **Linux**:

```bash
  sudo apt install ffmpeg   # Debian / Ubuntu
  sudo dnf install ffmpeg   # Fedora
  ```

Ensure `ffmpeg` and `ffprobe` are available in your system PATH. The app will show their status on the Dashboard.

\---

## Downloading a Course

1. Go to **Scrape \& Download**
2. Paste the course URL — it must end with `/course`, e.g.:

```
   https://www.domestika.org/en/courses/3086-creating-animated-stories-with-after-effects/course
   ```

3. Click **Fetch Lessons** — the app scrapes all units and videos
4. Select which lessons to download (or use **Select All**)
5. Configure your preferences:

   * **Subtitle Languages**: Pick one or more language codes, or download all available
   * **Transcode to H.265**: Reduces file size after download (requires FFmpeg)
   * **NVIDIA GPU (NVENC)**: Faster transcoding using your GPU (requires FFmpeg + NVIDIA GPU)
   * **Parallel Threads**: How many videos download at once (1–6)
6. Click **Start Downloads**

Progress, speed, and ETA for each lesson are shown in the download queue panel.

\---

## Output Structure

Downloaded courses are saved to your configured download folder (default: `\~/Downloads/Amayori Domestika`):

```
Amayori Domestika/
└── Course Title/
    └── Section Name/
        └── Unit Title/
            ├── 1\_Lesson Title.mp4
            ├── 2\_Lesson Title.mp4
            └── 2\_Lesson Title.en.srt
```

You can change the download folder in **Settings → Application Folders**.

\---

## Configuration Options

|Setting|Description|
|-|-|
|Download Folder|Where course files are saved|
|Subtitle Languages|One or more language codes (`en`, `es`, `pt`, `de`, `fr`, `it`) or `all`|
|Transcode to H.265|Automatically convert videos to HEVC after download|
|NVIDIA GPU (NVENC)|Use GPU acceleration for transcoding (NVIDIA only)|
|Parallel Threads|Number of simultaneous downloads (1–6)|

\---

## Troubleshooting

**"N\_m3u8DL-RE not found" error**
→ Go to Settings and click **Install / Update** next to the engine name.

**Login popup shows a blank page or 404**
→ If the popup fails, use the manual cookie method described in the Authentication section.

**No lessons found after scraping**
→ Make sure you are logged in and the course URL ends with `/course`. You must have purchased the course or have an active Plus subscription.

**Downloads fail immediately**
→ Check the System Log (terminal icon in the header) for detailed error messages.

**Transcoding not working**
→ Ensure FFmpeg is installed and available in your system PATH. The Dashboard will show FFmpeg as "Missing" if it cannot be detected.


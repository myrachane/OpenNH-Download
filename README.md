<div align="center">

<img src="assets/banner.png" alt="OpenNH-Download Banner" width="100%"/>

# OpenNH-Download

**A Chrome extension that bulk-downloads nhentai galleries into a ZIP archive — one click, zero hassle.**

[![Version](https://img.shields.io/badge/version-1.1.0-e8175d?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-MIT-ff6b9d?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/manifest-v3-141418?style=flat-square)](#)
[![Platform](https://img.shields.io/badge/Chrome-extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](#)

<img src="assets/demo.gif" alt="Demo GIF" width="480"/>

</div>

---

## ✨ Features

- 📦 **One-click ZIP download** — entire gallery packed and saved automatically
- 🔄 **Auto-loops** from page `1` to the end, stopping at the first `404`
- 🌐 **CDN-aware** — reads the real image server (`i1`, `i2`, `i3`… subdomains) directly from the page DOM, no guessing
- 🏷️ **Named after gallery code** — ZIP file is saved as `{gallery-id}.zip`
- 🖼️ **Padded filenames** — images saved as `0001.jpg`, `0002.jpg`… for correct ordering
- 🚫 **Cancel anytime** — stop mid-download and nothing is saved
- ⚡ **Zero dependencies** — pure JS, no external libraries, built-in ZIP engine

---

## 📸 Screenshots

<div align="center">

| Ready State | Downloading | Done |
|:-----------:|:-----------:|:----:|
| <img src="assets/screenshot-ready.png" width="220"/> | <img src="assets/screenshot-downloading.png" width="220"/> | <img src="assets/screenshot-done.png" width="220"/> |

</div>

---

## 🚀 Installation

> Chrome Web Store listing coming soon. For now, install manually:

### Step 1 — Download

Grab the latest release ZIP from the [Releases](../../releases) page and extract it.

### Step 2 — Load into Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle **Developer mode** on (top-right corner)
3. Click **Load unpacked**
4. Select the extracted `OpenNH-Download` folder

<div align="center">
<img src="assets/install-demo.gif" alt="Installation steps" width="600"/>
</div>

### Step 3 — Use it

1. Open [nhentai.net](https://nhentai.net) and navigate into any gallery reader
2. Wait for the page to fully load
3. Click the **OpenNH-Download** icon in your toolbar
4. Hit **⬇ Download ZIP**
5. The ZIP downloads automatically when done

---

## 🧠 How It Works

```
nhentai.net/g/177013/1/          ← you open this reader page
        │
        │  executeScript() injects scrapeImageSrc() into the page
        │
        ▼
i3.nhentai.net/galleries/177013/1.jpg   ← real CDN URL read from <img> src
        │
        │  strip page number → extract base URL + CDN subdomain
        │
        ▼
base: https://i3.nhentai.net/galleries/177013/
        │
        │  fetch loop: 1.jpg → 2.jpg → 3.jpg → ... → 404 (stop)
        │
        ▼
  ZipBuilder packs all Uint8Array buffers
        │
        ▼
  177013.zip  ← downloaded to your machine
```

The key insight: nhentai serves images from numbered CDN subdomains (`i1`, `i2`, `i3`, `i5`…) that vary per gallery. Rather than guessing which one, the extension reads the `src` of the image already loaded on the page — giving us the exact correct server every time.

---

## 📁 File Structure

```
OpenNH-Download/
├── manifest.json      # Chrome Extension Manifest v3
├── popup.html         # Extension popup UI
├── popup.js           # URL scraping, download loop, ZIP trigger
├── zipper.js          # Built-in ZIP builder (CRC-32, no deps)
├── icon16.png
├── icon48.png
├── icon128.png
└── README.md
```

---

## 🔒 Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the current tab's URL to detect nhentai |
| `scripting` | Inject `scrapeImageSrc()` into the page to grab the real CDN image URL |
| `downloads` | Trigger the ZIP file download |
| `host: *.nhentai.net` | Fetch images from all nhentai CDN subdomains |

No data is sent anywhere. Everything runs locally in your browser.

---

## ⚠️ Known Limitations

- Only works while on the **reader page** (`nhentai.net/g/XXXXXX/1/`), not the gallery overview
- The page must be **fully loaded** before opening the popup
- Very large galleries may take a moment to pack — the progress bar will show you

---

## 🛠️ Development

Clone the repo, make your changes, then reload the extension in `chrome://extensions/` using the refresh button.

```bash
git clone https://github.com/yourusername/OpenNH-Download.git
cd OpenNH-Download
# Edit files, then reload in chrome://extensions/
```

No build step required — it's plain HTML, CSS, and JS.

---

## 📄 License

```
MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

Made with ♥ &nbsp;·&nbsp; MIT Licensed &nbsp;·&nbsp; PRs welcome

</div>

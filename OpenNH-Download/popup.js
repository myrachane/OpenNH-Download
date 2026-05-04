/**
 * popup.js — OpenNH-Download v1.1
 *
 * How it works:
 * 1. Inject a script into the nhentai reader page to grab the <img> src.
 *    The src will be something like https://i3.nhentai.net/galleries/177013/2.jpg
 * 2. Strip the page number → base URL = https://i3.nhentai.net/galleries/177013/
 * 3. Loop 1.jpg, 2.jpg, 3.jpg ... until HTTP status is not OK (404, etc.)
 * 4. Pack all images into a ZIP named after the gallery code and download it.
 *
 * The CDN subdomain (i1, i2, i3, i5 ...) is embedded in the scraped URL,
 * so we never need to guess it — we use whatever the page is already using.
 */

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dot          = document.getElementById('dot');
const viewError    = document.getElementById('view-error');
const viewReady    = document.getElementById('view-ready');
const viewProgress = document.getElementById('view-progress');
const viewDone     = document.getElementById('view-done');
const errorMsg     = document.getElementById('error-msg');
const codeDisplay  = document.getElementById('code-display');
const startDisplay = document.getElementById('start-display');
const baseDisplay  = document.getElementById('base-display');
const countDisplay = document.getElementById('count-display');
const logMsg       = document.getElementById('log-msg');
const bar          = document.getElementById('bar');
const doneMsg      = document.getElementById('done-msg');
const doneSize     = document.getElementById('done-size');
const btnDownload  = document.getElementById('btn-download');
const btnCancel    = document.getElementById('btn-cancel');
const btnAgain     = document.getElementById('btn-again');

// ── Global state ──────────────────────────────────────────────────────────────
let cancelled  = false;
let parsedInfo = null;

// ── View switcher ─────────────────────────────────────────────────────────────
function showView(name) {
  ['error','ready','progress','done'].forEach(v =>
    document.getElementById(`view-${v}`).classList.add('hidden')
  );
  document.getElementById(`view-${name}`).classList.remove('hidden');
}
function setDot(state) { dot.className = `logo-dot ${state}`; }

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    showError('Cannot access the current tab.');
    return;
  }

  const tabUrl = tab.url || '';

  if (!tabUrl.includes('nhentai.net')) {
    showError('Only works on nhentai.net.\n\nOpen a gallery reader page first.');
    return;
  }

  // Inject a small script into the live page to scrape the image src
  let imgSrc = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeImageSrc,
    });
    imgSrc = results?.[0]?.result || null;
  } catch (e) {
    showError('Could not read the page.\n\nMake sure you are on the reader page (e.g. nhentai.net/g/XXXXXX/1/) and the page has finished loading.');
    return;
  }

  if (!imgSrc) {
    showError('No image found on this page.\n\nNavigate to the gallery reader (click into a gallery and open any page), wait for it to load, then try again.');
    return;
  }

  // Parse the CDN URL we grabbed from the DOM
  const info = parseCdnImageUrl(imgSrc);
  if (!info) {
    showError(`Unrecognised image URL:\n${imgSrc}\n\nPlease report this URL so the parser can be updated.`);
    return;
  }

  // Also extract the gallery code from the tab URL as a human label
  const galleryMatch = tabUrl.match(/\/g\/(\d+)/);
  info.galleryCode = galleryMatch ? galleryMatch[1] : info.mediaId;

  parsedInfo = info;
  codeDisplay.textContent  = info.galleryCode;
  startDisplay.textContent = info.mediaId;
  baseDisplay.textContent  = info.baseUrl;
  showView('ready');
  setDot('idle');
})();

// ─────────────────────────────────────────────────────────────────────────────
// scrapeImageSrc — runs INSIDE the page via executeScript
// Must be a self-contained function (no closure references).
// ─────────────────────────────────────────────────────────────────────────────
function scrapeImageSrc() {
  // Try the most common nhentai reader selectors first
  const selectors = [
    '#image-container img',
    '.image-container img',
    'section#image-container img',
    '.reader-images img',
    '.reader-container img',
    'img#image-container',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const src = el.src || el.currentSrc || el.getAttribute('data-src') || '';
    // Must look like an nhentai CDN image (has /galleries/DIGITS/DIGITS.ext)
    if (/\/galleries\/\d+\/\d+\.(jpg|jpeg|png|webp|gif)/i.test(src)) {
      return src;
    }
  }

  // Fallback: scan every <img> on the page
  for (const img of document.querySelectorAll('img')) {
    const src = img.src || img.getAttribute('data-src') || '';
    if (/nhentai\.net\/galleries\/\d+\/\d+\.(jpg|jpeg|png|webp|gif)/i.test(src)) {
      return src;
    }
    // Also match CDN subdomains without "galleries" (some mirrors differ)
    if (/i\d*\.nhentai\.net\/.+\/\d+\.(jpg|jpeg|png|webp|gif)/i.test(src)) {
      return src;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseCdnImageUrl
// Input:  "https://i3.nhentai.net/galleries/177013/2.jpg"
// Output: { mediaId: "177013", baseUrl: "https://i3.nhentai.net/galleries/177013/", ext: "jpg" }
// ─────────────────────────────────────────────────────────────────────────────
function parseCdnImageUrl(url) {
  // Standard CDN pattern — covers i1, i2, i3, i5, etc.
  const m = url.match(/^(https?:\/\/[^/]+\/(?:galleries\/)?(\d+))\/\d+\.(jpg|jpeg|png|webp|gif)/i);
  if (!m) return null;
  return {
    mediaId: m[2],
    baseUrl: m[1] + '/',
    ext:     m[3].toLowerCase(),
  };
}

// ── Buttons ───────────────────────────────────────────────────────────────────
btnDownload.addEventListener('click', startDownload);
btnCancel.addEventListener('click',   () => { cancelled = true; });
btnAgain.addEventListener('click',    () => location.reload());

// ── Main download loop ────────────────────────────────────────────────────────
async function startDownload() {
  cancelled = false;
  showView('progress');
  setDot('busy');

  const { galleryCode, mediaId, baseUrl, ext } = parsedInfo;
  const zip = new Zipper();
  let count = 0;
  let n     = 1;

  setLog('Starting…', 'info');

  while (!cancelled) {
    const imgUrl = `${baseUrl}${n}.${ext}`;
    countDisplay.textContent = `${count} saved  ·  trying ${n}.${ext}`;
    setLog(`↓  fetching ${n}.${ext}`, 'info');

    let response;
    try {
      response = await fetch(imgUrl);
    } catch (err) {
      setLog(`⚠  Network error on ${n}.${ext} — stopping.`, 'error');
      break;
    }

    // Any non-OK response means we've hit the end of the gallery
    if (!response.ok) {
      setLog(`✓  End at ${n}.${ext}  (HTTP ${response.status})`, 'ok');
      break;
    }

    let buffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (err) {
      setLog(`⚠  Read error on ${n}.${ext} — stopping.`, 'error');
      break;
    }

    if (buffer.byteLength === 0) {
      setLog(`⚠  Empty body at ${n}.${ext} — stopping.`, 'error');
      break;
    }

    // Pad filename: 0001.jpg, 0002.jpg …
    const filename = `${String(n).padStart(4, '0')}.${ext}`;
    zip.addFile(`${galleryCode}/${filename}`, new Uint8Array(buffer));
    count++;
    updateBar(count);
    n++;
  }

  if (cancelled) {
    setLog('Cancelled.', 'error');
    setDot('idle');
    showView('ready');
    return;
  }

  if (count === 0) {
    setLog('Nothing downloaded. The CDN may have blocked this request — try reloading the reader page and opening the extension again.', 'error');
    setDot('idle');
    showView('ready');
    return;
  }

  // Build ZIP
  setLog(`Zipping ${count} images…`, 'info');
  bar.classList.add('indeterminate');
  await tick();

  let zipBytes;
  try {
    zipBytes = zip.generate();
  } catch (e) {
    setLog(`ZIP error: ${e.message}`, 'error');
    setDot('idle');
    showView('ready');
    return;
  }

  // Trigger download
  const blob    = new Blob([zipBytes], { type: 'application/zip' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${galleryCode}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

  doneMsg.textContent = `${count} images  →  ${galleryCode}.zip`;
  doneSize.textContent = `ZIP size: ${fmtBytes(zipBytes.length)}`;
  showView('done');
  setDot('idle');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  showView('error');
  setDot('idle');
}
function setLog(msg, cls = 'info') {
  logMsg.textContent = msg;
  logMsg.className   = `log ${cls}`;
}
function updateBar(count) {
  bar.classList.remove('indeterminate');
  bar.style.width = (95 * (1 - Math.exp(-count / 30))) + '%';
}
function fmtBytes(b) {
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(2)} MB`;
}
function tick() { return new Promise(r => setTimeout(r, 30)); }

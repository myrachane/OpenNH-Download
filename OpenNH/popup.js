/**
 * popup.js — OpenNH-Download v2.0
 * Fixes: retry logic (distinguishes 404 from temp errors), metadata saving, dashboard link.
 */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dot          = document.getElementById("dot");
const viewError    = document.getElementById("view-error");
const viewReady    = document.getElementById("view-ready");
const viewProgress = document.getElementById("view-progress");
const viewDone     = document.getElementById("view-done");
const errorMsg     = document.getElementById("error-msg");
const codeDisplay  = document.getElementById("code-display");
const startDisplay = document.getElementById("start-display");
const baseDisplay  = document.getElementById("base-display");
const countDisplay = document.getElementById("count-display");
const logMsg       = document.getElementById("log-msg");
const bar          = document.getElementById("bar");
const doneMsg      = document.getElementById("done-msg");
const doneSize     = document.getElementById("done-size");
const btnDownload  = document.getElementById("btn-download");
const btnCancel    = document.getElementById("btn-cancel");
const btnAgain     = document.getElementById("btn-again");
const btnDash      = document.getElementById("btn-dashboard");

let cancelled  = false;
let parsedInfo = null;

// ── Views ─────────────────────────────────────────────────────────────────────
function showView(name) {
  ["error","ready","progress","done"].forEach(v =>
    document.getElementById("view-"+v).classList.add("hidden")
  );
  document.getElementById("view-"+name).classList.remove("hidden");
}
function setDot(state) { dot.className = "logo-dot "+state; }

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
  catch (e) { showError("Cannot access the current tab."); return; }  const tabUrl = tab.url || "";
  if (!tabUrl.includes("nhentai.net")) {
    showError("Only works on nhentai.net. Open a gallery reader page first.");
    return;
  }

  let pageData = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePageData,
    });
    pageData = results?.[0]?.result || null;
  } catch (e) {
    showError("Could not read the page. Make sure you are on the reader page and it has fully loaded.");
    return;
  }

  if (!pageData?.imgSrc) {
    showError("No image found. Navigate to the reader page, wait for it to fully load, then try again.");
    return;
  }

  const info = parseCdnImageUrl(pageData.imgSrc);
  if (!info) {
    showError("Unrecognised image URL: "+pageData.imgSrc); return; }  const galleryMatch = tabUrl.match(/\/g\/(\d+)/); info.galleryCode = galleryMatch ? galleryMatch[1] : info.mediaId; info.title = pageData.title || "";
  info.tags  = pageData.tags  || [];

  parsedInfo = info;
  codeDisplay.textContent  = info.galleryCode;
  startDisplay.textContent = info.title ? info.title.slice(0, 28) + (info.title.length > 28 ? "…" : "") : info.mediaId;
  baseDisplay.textContent  = info.baseUrl;
  showView("ready");
  setDot("idle");
})();

// ── Page scraper (runs inside the tab) ───────────────────────────────────────
function scrapePageData() {
  // -- Image src --
  let imgSrc = null;
  const selectors = [
    "#image-container img", ".image-container img",
    "section#image-container img", ".reader-images img",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const src = el.src || el.currentSrc || el.getAttribute("data-src") || "";
    if (/\/galleries\/\d+\/\d+\.(jpg|jpeg|png|webp|gif)/i.test(src)) { imgSrc = src; break; }
  }
  if (!imgSrc) {
    for (const img of document.querySelectorAll("img")) {
      const src = img.src || img.getAttribute("data-src") || "";
      if (/galleries\/\d+\/\d+\.(jpg|jpeg|png|webp|gif)/i.test(src)) { imgSrc = src; break; }
    }
  }

  // -- Title --
  const titleEl = document.querySelector("#info h1, h1.title, .title-name, h1");
  const title = titleEl?.textContent?.trim()
    || document.title?.split("»")[0]?.replace(/\(.+?\)/g,"").trim()
    || "";

  // -- Tags --
  const tagEls = document.querySelectorAll(".tag-container .tags .tag .name, .tags .tag .name");
  const tags = [...tagEls].map(el => el.textContent.trim()).filter(Boolean);

  return { imgSrc, title, tags };
}

// ── URL parser ────────────────────────────────────────────────────────────────
function parseCdnImageUrl(url) {
  const m = url.match(/^(https?:\/\/[^/]+\/(?:galleries\/)?(\d+))\/\d+\.(jpg|jpeg|png|webp|gif)/i);
  if (!m) return null;
  return { mediaId: m[2], baseUrl: m[1]+"/", ext: m[3].toLowerCase() };
}

// ── Buttons ───────────────────────────────────────────────────────────────────
btnDownload.addEventListener("click", startDownload);
btnCancel.addEventListener("click", () => { cancelled = true; });
btnAgain.addEventListener("click", () => location.reload());
btnDash?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// ── sleep helper ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Download loop with retry ──────────────────────────────────────────────────
async function startDownload() {
  cancelled = false;
  showView("progress");
  setDot("busy");

  const { galleryCode, mediaId, baseUrl, ext, title, tags } = parsedInfo;
  const zip = new Zipper();
  let count = 0;
  let n = 1;
  let consecutiveFailures = 0;
  const MAX_CONSEC = 3;   // stop if 3 pages in a row all fail non-404
  const MAX_RETRY  = 4;   // retries per single page

  setLog("Starting…", "info");

  outer: while (!cancelled) {
    const imgUrl = baseUrl+n+"."+ext;
    countDisplay.textContent = count+" saved  ·  fetching "+n+"."+ext;
    setLog("↓  "+n+"."+ext, "info");

    let buffer = null;

    for (let attempt = 1; attempt <= MAX_RETRY && !cancelled; attempt++) {
      if (attempt > 1) {
        setLog("↻  retry "+attempt+"/"+MAX_RETRY+" for "+n+"."+ext, "info");
        await sleep(700 * attempt); // 1.4s, 2.1s, 2.8s
      }

      let response;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 22000); // 22s per attempt
        response = await fetch(imgUrl, { signal: ctrl.signal });
        clearTimeout(timer);
      } catch (err) {
        // Network error or timeout — retry
        if (attempt === MAX_RETRY) setLog("⚠  timeout/network on "+n, "info");
        continue;
      }

      // ── 404 = definitively end of gallery ──
      if (response.status === 404) {
        setLog("✓  Done — end at page "+n+" (404)", "ok");
        break outer;
      }

      // ── Other non-200 (429, 5xx) — wait longer and retry ──
      if (!response.ok) {
        const wait = response.status === 429 ? 3000 : 900 * attempt;
        setLog("⚠  HTTP "+response.status+" on "+n+" — waiting "+Math.round(wait/1000)+"s", "info");
        await sleep(wait);
        continue;
      }

      // ── Read body ──
      let buf;
      try { buf = await response.arrayBuffer(); }
      catch { continue; } // read error — retry

      if (buf.byteLength === 0) { await sleep(400); continue; }

      buffer = buf;
      break;
    }

    if (cancelled) break;

    if (!buffer) {
      // Exhausted all retries for this page
      consecutiveFailures++;
      setLog("⚠  Skipping page "+n+" after "+MAX_RETRY+" failures", "info");
      if (consecutiveFailures >= MAX_CONSEC) {
        setLog("⚠  "+MAX_CONSEC+" consecutive pages failed — stopping", "error");
        break;
      }
      n++; // skip and continue
      continue;
    }

    consecutiveFailures = 0;
    zip.addFile(galleryCode+"/"+String(n).padStart(4,"0")+"."+ext, new Uint8Array(buffer));
    count++;
    updateBar(count);
    n++;
  }

  if (cancelled) { setLog("Cancelled.", "error"); setDot("idle"); showView("ready"); return; }
  if (count === 0) { setLog("Nothing downloaded. Try reloading the reader page.", "error"); setDot("idle"); showView("ready"); return; }

  setLog("Packing "+count+" images…", "info");
  bar.classList.add("indeterminate");
  await sleep(30);

  let zipBytes;
  try { zipBytes = zip.generate(); }
  catch (e) { setLog("ZIP error: "+e.message, "error"); setDot("idle"); showView("ready"); return; }

  const blob = new Blob([zipBytes], { type: "application/zip" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl; a.download = galleryCode+".zip"; a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

  // ── Save metadata to storage ──────────────────────────────────────────────
  await saveGalleryMeta({ galleryCode, title, tags, pages: count, zipSize: zipBytes.length });

  doneMsg.textContent = count+" images  →  "+galleryCode+".zip";
  doneSize.textContent = "ZIP size: "+fmtBytes(zipBytes.length);
  showView("done");
  setDot("idle");
}

// ── Save metadata ─────────────────────────────────────────────────────────────
async function saveGalleryMeta({ galleryCode, title, tags, pages, zipSize }) {
  try {
    const data = await chrome.storage.local.get(["galleries","stats"]);
    const galleries = data.galleries || {};
    const stats     = data.stats     || { totalDownloads: 0, totalPages: 0, totalZipBytes: 0 };

    const existing = galleries[galleryCode] || {};
    galleries[galleryCode] = {
      code:         galleryCode,
      title:        title || existing.title || galleryCode,
      tags:         (tags && tags.length) ? tags : (existing.tags || []),
      pages:        pages,
      zipSize:      zipSize,
      downloadedAt: existing.downloadedAt || Date.now(),
      lastDownload: Date.now(),
      isFavorite:   existing.isFavorite   || false,
      isReadLater:  existing.isReadLater  || false,
      isCompleted:  existing.isCompleted  || false,
      viewCount:    existing.viewCount    || 0,
      readTime:     existing.readTime     || 0,
      lastRead:     existing.lastRead     || null,
    };

    stats.totalDownloads = (stats.totalDownloads || 0) + 1;
    stats.totalPages     = (stats.totalPages     || 0) + pages;
    stats.totalZipBytes  = (stats.totalZipBytes  || 0) + zipSize;

    await chrome.storage.local.set({ galleries, stats });
  } catch (e) {
    console.warn("OpenNH: could not save metadata", e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) { errorMsg.textContent = msg; showView("error"); setDot("idle"); }
function setLog(msg, cls="info") { logMsg.textContent = msg; logMsg.className = "log "+cls; }
function updateBar(n) {
  bar.classList.remove("indeterminate");
  bar.style.width = (95*(1-Math.exp(-n/30)))+"%";
}
function fmtBytes(b) {
  if (b<1024) return b+" B";
  if (b<1048576) return (b/1024).toFixed(1)+" KB";
  return (b/1048576).toFixed(2)+" MB";
}

/**
 * tracker.js — Content script
 * Runs on nhentai.net/g/{code}/{page}/ — tracks views and read time.
 */
(async () => {
  const m = location.pathname.match(/^\/g\/(\d+)\//);
  if (!m) return;
  const code = m[1];
  const t0 = Date.now();

  function getMeta() {
    const el = document.querySelector('#info h1, h1.title, .title-name, h1');
    const title = el?.textContent?.trim() || '';
    const tagEls = document.querySelectorAll('.tag-container .tags .tag .name, .tags .tag .name');
    const tags = [...tagEls].map(e => e.textContent.trim()).filter(Boolean);
    return { title, tags };
  }

  try {
    const d = await chrome.storage.local.get('galleries');
    const galleries = d.galleries || {};
    const g = galleries[code];
    if (g) {
      g.viewCount = (g.viewCount || 0) + 1;
      g.lastRead  = Date.now();
      const meta = getMeta();
      if (meta.title && !g.title) g.title = meta.title;
      if (meta.tags.length && !(g.tags||[]).length) g.tags = meta.tags;
      await chrome.storage.local.set({ galleries });
    }
  } catch (e) {}

  window.addEventListener('pagehide', async () => {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    if (elapsed < 5) return;
    try {
      const d = await chrome.storage.local.get('galleries');
      const gs = d.galleries || {};
      if (gs[code]) {
        gs[code].readTime = (gs[code].readTime || 0) + elapsed;
        await chrome.storage.local.set({ galleries: gs });
      }
    } catch (e) {}
  });
})();

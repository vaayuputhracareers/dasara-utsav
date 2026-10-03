/* Light offline cache for the app shell. Supabase data is never cached.
   Works at any address: https://site.netlify.app/ or https://name.github.io/dasara-utsav/ */
const CACHE = 'dasara-v3';
const BASE = new URL('./', self.location).pathname; // "/" or "/dasara-utsav/"
const INDEX = BASE + 'index.html';
const SHELL = [BASE, INDEX, BASE + 'manifest.webmanifest', BASE + 'icons/icon-192.png'];

// Also keep the main script + style that index.html points to, so the app opens on a weak network.
async function cacheShell() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL).catch(() => {});
  try {
    const html = await (await fetch(INDEX, { cache: 'no-cache' })).text();
    const files = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await c.addAll(files);
  } catch { /* offline during install – fine */ }
}

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(cacheShell()); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/sb/')) return;
  if (req.mode === 'navigate') {
    // Network first, so a new version shows up immediately; the cached copy is only for offline.
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && (url.pathname === BASE || url.pathname === INDEX)) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(INDEX, copy));
      }
      return res;
    }).catch(() => caches.match(INDEX)));
    return;
  }
  if (url.pathname.startsWith(BASE + 'assets/') || url.pathname.startsWith(BASE + 'icons/')) {
    // File names in /assets change on every build, so these are safe to keep.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })));
    return;
  }
  // config.js (Supabase details) and the rest: network first, last good copy when offline.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && url.pathname === BASE + 'config.js') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(BASE + 'config.js', copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())));
});

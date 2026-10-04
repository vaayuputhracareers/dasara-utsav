/* Light offline cache for the app shell. Supabase data is never cached.
   Works at any address: https://site.netlify.app/ or https://name.github.io/dasara-utsav/ */
const CACHE = 'dasara-v7';
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
// Splash picture (Settings → Splash screen; a new file name for every upload): kept on the phone, so the
// app opens with it at once. Only the newest one is kept.
async function splashPicture(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  if (res.ok) {
    for (const k of await c.keys()) if (/\/assets\/splash-/.test(k.url) && k.url !== req.url) await c.delete(k);
    await c.put(req.url, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && /\/storage\/v1\/object\/public\/assets\/splash-[^/]+$/.test(url.pathname)) {
    e.respondWith(splashPicture(req));
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/sb/')) return;
  if (req.mode === 'navigate') {
    // Always the newest version: every screen of the app is index.html, so fetch a fresh copy of it with a
    // unique address (nothing on the way – phone, network or website cache – can hand back an old one).
    // The saved copy is only used when there is no internet.
    e.respondWith(fetch(`${INDEX}?fresh=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(INDEX, copy));
        return res;
      }
      return fetch(req);
    }).catch(() => caches.match(INDEX).then((hit) => hit || fetch(req))));
    return;
  }
  if (url.pathname.startsWith(BASE + 'assets/')) {
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
  // config.js (Supabase details), icons (made from the logo, can change) and the rest:
  // network first, last good copy when offline.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && url.pathname === BASE + 'config.js') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(BASE + 'config.js', copy));
    } else if (res.ok && url.pathname.startsWith(BASE + 'icons/')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(url.pathname, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || Response.error())));
});

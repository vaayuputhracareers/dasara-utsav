// Splash screen: a full-screen picture (Settings → Splash screen) shown for a few seconds when the app
// opens. The picture is drawn by the small script at the top of index.html – before the app itself has
// loaded – using what this file remembers on the phone (localStorage) whenever the settings are loaded.
export const SPLASH_KEY = 'dasara.splash';
const warmed = new Set();
const read = () => { try { return JSON.parse(localStorage.getItem(SPLASH_KEY) || 'null'); } catch { return null; } };

/** Remember the splash picture from the settings row or the public branding, for the next app start. */
export function rememberSplash(src) {
  if (!src || !('splash_url' in src)) return; // database older than version 4: nothing to remember
  try {
    const u = String(src.splash_url || '').trim();
    if (!u) { localStorage.setItem(SPLASH_KEY, JSON.stringify({ none: 1 })); return; } // "no splash" – no need to ask again
    const s = Math.min(10, Math.max(1, parseInt(src.splash_seconds, 10) || 5));
    const old = read();
    localStorage.setItem(SPLASH_KEY, JSON.stringify({ u, s, c: old && old.u === u ? old.c : undefined }));
    if (!warmed.has(u)) { warmed.add(u); warm(u); }
  } catch { /* private mode / storage full: no splash, the app works normally */ }
}

// Downloads the picture once (the service worker keeps it, so the next start shows it at once) and notes
// its average colour, shown behind the picture for the split second before it appears.
function warm(u) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0, 1, 1);
      const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
      const c = '#' + [r, gr, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      const cur = read();
      if (cur && cur.u === u) localStorage.setItem(SPLASH_KEY, JSON.stringify({ ...cur, c }));
    } catch { /* the colour is optional */ }
  };
  img.src = u;
}

/** Settings → Preview: show the splash right now. */
export function previewSplash(url, seconds) {
  if (url && typeof window.dasaraSplash === 'function') window.dasaraSplash(url, seconds);
}

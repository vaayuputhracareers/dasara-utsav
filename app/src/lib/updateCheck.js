// "A new version is ready – Update": the app often stays open in the background for hours, so after a
// change is published it would keep showing the old screens. Checks the website when the app comes back
// to the front (and every 5 minutes); one tap loads the new version. Plain DOM, works on every screen.
const BASE = import.meta.env.BASE_URL;
const running = () => {
  const s = document.querySelector('script[type="module"][src*="/assets/index-"]');
  return s ? new URL(s.src, location.href).pathname : '';
};
let shown = false;
let busy = false;
let last = 0;

async function check() {
  if (shown || busy || document.visibilityState !== 'visible' || Date.now() - last < 30000) return;
  const cur = running();
  if (!cur) return;
  busy = true;
  last = Date.now();
  try {
    const html = await (await fetch(`${BASE}index.html?v=${Date.now()}`, { cache: 'no-store' })).text();
    const m = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/);
    if (m && new URL(m[1], location.href).pathname !== cur) show();
  } catch { /* offline – try again later */ }
  busy = false;
}

function show() {
  shown = true;
  const te = (localStorage.getItem('lang') || '') === 'te';
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>🔄 ${te ? 'యాప్ కొత్త వెర్షన్ వచ్చింది' : 'A new version of the app is ready'}</span>`
    + `<button type="button">${te ? 'అప్‌డేట్' : 'Update'}</button>`;
  const btn = bar.querySelector('button');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await Promise.all([fetch(location.href, { cache: 'reload' }), fetch(`${BASE}index.html`, { cache: 'reload' })]); } catch { /* ignore */ }
    location.reload();
  });
  document.body.appendChild(bar);
}

export function startUpdateCheck() {
  if (!import.meta.env.PROD) return;
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  setInterval(check, 5 * 60 * 1000);
  setTimeout(check, 10000);
}

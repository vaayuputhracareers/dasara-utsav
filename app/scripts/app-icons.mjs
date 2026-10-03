#!/usr/bin/env node
/**
 * Makes the phone app icon (home screen, browser tab, iPhone) from the logo saved in the app's
 * Settings. Runs in the GitHub workflow after `vite build`. If anything goes wrong the website keeps
 * the default lamp icon – this script never stops a publish.
 *
 *   node scripts/app-icons.mjs --dist dist --config ../config.js
 *       → writes dist/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png from the logo,
 *         dist/icons/icon-source.json (which logo was used) and adds ?v=<hash> to the icon links,
 *         so phones and caches pick up a new icon.
 *
 *   node scripts/app-icons.mjs --check --site https://dasara.example.com/ --config ../config.js
 *       → prints/sets changed=true|false: is the logo in Settings different from the one the
 *         live website's icons were made from? (The scheduled workflow only rebuilds when true.)
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const gh = !!process.env.GITHUB_ACTIONS;
const warn = (msg) => console.log(gh ? `::warning title=App icon::${msg}` : `WARNING: ${msg}`);
const MAX_BYTES = 20 * 1024 * 1024;
const ICONS = [
  { file: 'icon-192.png', size: 192, pad: 0.06 },
  { file: 'icon-512.png', size: 512, pad: 0.06 },
  { file: 'maskable-512.png', size: 512, pad: 0.14 }, // Android may cut the corners: keep a see-through logo inside the safe circle
  { file: 'apple-touch-icon.png', size: 180, pad: 0.06 },
];

function readConfig(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { timeout: 1000 });
  const cfg = sandbox.window.APP_CONFIG || {};
  return { url: String(cfg.supabaseUrl || '').trim().replace(/\/+$/, ''), key: String(cfg.supabaseKey || '').trim() };
}

const okUrl = (u) => /^https:\/\//i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u);

/** The logo address saved in Settings ('' = no logo). Throws when Supabase cannot be reached. */
async function currentLogo(cfg) {
  if (!okUrl(cfg.url + '/') || !cfg.key) throw new Error('config.js has no Supabase details');
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${cfg.url}/rest/v1/rpc/get_branding`, {
        method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`get_branding answered ${r.status}`);
      const b = await r.json();
      return String((b && b.logo_url) || '').trim();
    } catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); }
  }
  throw lastErr;
}

async function download(url) {
  if (!okUrl(url)) throw new Error('the logo address is not an https:// link');
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`logo download answered ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) throw new Error(`logo file size ${buf.length} bytes`);
  return buf;
}

/** Square PNG icons. A normal picture fills the square (like the round logo in the app);
 *  a logo with a see-through background is shown whole on white with some margin. */
async function makeIcons(sharp, src) {
  const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
  const { isOpaque } = await sharp(src).stats();
  const out = {};
  for (const ic of ICONS) {
    let img;
    if (isOpaque) {
      img = sharp(src).resize(ic.size, ic.size, { fit: 'cover', position: 'centre' });
    } else {
      const inner = Math.round(ic.size * (1 - 2 * ic.pad));
      const fg = await sharp(src).resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
      img = sharp({ create: { width: ic.size, height: ic.size, channels: 4, background: WHITE } }).composite([{ input: fg, gravity: 'centre' }]);
    }
    // No transparency: iPhone shows see-through parts black, Android needs a full square for "maskable".
    out[ic.file] = await sharp(await img.png().toBuffer()).flatten({ background: WHITE }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  }
  return { out, isOpaque };
}

/** Adds ?v=<hash> to every icon link, so a new icon is not hidden behind an old cached one. */
function stampIconLinks(dist) {
  const hash = createHash('sha256');
  for (const ic of ICONS) hash.update(readFileSync(join(dist, 'icons', ic.file)));
  const v = hash.digest('hex').slice(0, 10);
  const re = new RegExp(`(icons/(?:${ICONS.map((i) => i.file.replace('.', '\\.')).join('|')}))(\\?v=[0-9a-f]+)?`, 'g');
  for (const f of ['index.html', '404.html', 'manifest.webmanifest']) {
    const p = join(dist, f);
    if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace(re, `$1?v=${v}`));
  }
  return v;
}

async function build() {
  const dist = args.dist || 'dist';
  if (!existsSync(join(dist, 'icons'))) throw new Error(`${dist}/icons not found – run vite build first`);
  const source = { logo_url: null, made_at: new Date().toISOString() };
  try {
    const cfg = readConfig(args.config || '../config.js');
    const logo = await currentLogo(cfg);
    if (!logo) {
      console.log('No logo in Settings – keeping the default lamp icon.');
      source.logo_url = '';
    } else {
      let sharp;
      try { sharp = (await import('sharp')).default; } catch { throw new Error('the "sharp" package is not installed'); }
      const { out, isOpaque } = await makeIcons(sharp, await download(logo));
      for (const [file, buf] of Object.entries(out)) writeFileSync(join(dist, 'icons', file), buf);
      source.logo_url = logo;
      source.fill = isOpaque ? 'cover' : 'contain';
      console.log(`App icon made from the logo (${isOpaque ? 'picture fills the icon' : 'see-through logo on white'}): ${logo}`);
    }
  } catch (e) {
    source.error = String(e.message || e);
    warn(`Could not make the app icon from the logo (${source.error}). The default lamp icon is used; the next check tries again.`);
  }
  writeFileSync(join(dist, 'icons', 'icon-source.json'), JSON.stringify(source, null, 2) + '\n');
  console.log(`Icon links stamped ?v=${stampIconLinks(dist)}`);
}

async function check() {
  let changed = false;
  try {
    const logo = await currentLogo(readConfig(args.config || '../config.js'));
    const site = String(args.site || '').replace(/\/?$/, '/');
    let live = null;
    try {
      const r = await fetch(new URL('icons/icon-source.json', site), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (r.ok) live = await r.json();
    } catch { /* not published yet */ }
    changed = !live || !!live.error || (live.logo_url || '') !== logo;
    console.log(changed ? `Logo changed (live icons: ${live ? live.logo_url || 'default' : 'unknown'}, Settings: ${logo || 'none'}) → rebuild.`
      : 'App icon is up to date – nothing to publish.');
  } catch (e) {
    warn(`Could not check the logo (${e.message || e}) – nothing is changed.`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  else console.log(`changed=${changed}`);
}

(args.check ? check() : build()).catch((e) => { warn(String(e.message || e)); process.exitCode = 0; });

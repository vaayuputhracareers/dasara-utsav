// QR poster (Public page & QR → 🖼️ QR poster): an A4 picture with the QR code of the public page.
// The admin keeps only the lines they want (switch each one on/off) and can change the words.
// Saved in app_settings.qr_poster (database version 6) as { key: { on, text } } – a missing text = automatic
// (made from the names in Settings, so it follows later name changes).
import { fmtDay } from './format.js';
import { qrDataUrl } from '../components/QrImage.jsx';

export const POSTER_W = 1240;   // A4 at 150 dpi
export const POSTER_H = 1754;

/** The lines of the poster, top to bottom. text: true = the words can be changed. */
export const POSTER_ITEMS = [
  { key: 'decor' },                 // garland (toran) along the top
  { key: 'logo' },
  { key: 'title', text: true },     // temple name
  { key: 'subtitle', text: true },  // festival name – year
  { key: 'dates', text: true },
  { key: 'scan_te', text: true },   // under the QR
  { key: 'scan_en', text: true },
  { key: 'link' },                  // web address under the QR
  { key: 'footer', text: true },    // – committee, village
];

const TE_LAST = { programs: 'కార్యక్రమాల', pujas: 'పూజల', accounts: 'లెక్కల', donate: 'విరాళాల' };
const TE = { programs: 'కార్యక్రమాలు', pujas: 'పూజలు', accounts: 'లెక్కలు', donate: 'విరాళాలు' };
const EN = { programs: 'programs', pujas: 'puja schedule', accounts: 'accounts', donate: 'donations' };
const joinList = (arr) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} & ${arr[arr.length - 1]}`);

/** What the visitor finds after scanning – only the parts that are switched on. */
export function posterParts(s) {
  return [
    s.show_programs && 'programs',
    s.show_pujas && 'pujas',
    (s.show_donation_total || s.show_donor_list || s.show_expense_summary || s.show_expense_details || s.show_net_position) && 'accounts',
    s.show_donate && s.upi_id && 'donate',
  ].filter(Boolean);
}

/** Automatic words for every text line (from Settings). */
export function posterAuto(s) {
  const parts = posterParts(s);
  const te = parts.map((p, i) => (i === parts.length - 1 ? TE_LAST[p] : TE[p]));
  const event = s.event_title_te || s.event_title_en || '';
  const village = s.village_te || s.village_en || '';
  const committee = s.committee_name_te || s.committee_name_en || '';
  return {
    title: s.temple_name_te || s.temple_name_en || '',
    subtitle: [event, s.event_year].filter(Boolean).join(' – '),
    dates: s.start_date && s.end_date ? `${fmtDay(s.start_date, 'te')} – ${fmtDay(s.end_date, 'te')}` : '',
    scan_te: parts.length ? `📱 ${joinList(te)} కోసం స్కాన్ చేయండి` : '📱 వివరాల కోసం స్కాన్ చేయండి',
    scan_en: parts.length ? `Scan for ${joinList(parts.map((p) => EN[p]))}` : 'Scan for details',
    footer: committee ? `– ${committee}${village ? `, ${village}` : ''}` : '',
  };
}

/** Saved choices + automatic words → { key: { on, text?, custom? } } for every line. */
export function resolvePoster(s, saved) {
  const auto = posterAuto(s);
  const src = saved && typeof saved === 'object' ? saved : {};
  const cfg = {};
  for (const it of POSTER_ITEMS) {
    const v = src[it.key] || {};
    cfg[it.key] = { on: v.on !== false };
    if (it.text) {
      const custom = typeof v.text === 'string';
      cfg[it.key].text = custom ? v.text : auto[it.key];
      cfg[it.key].custom = custom;
    }
  }
  return cfg;
}

/** What goes into app_settings.qr_poster: words equal to the automatic words are not stored (they keep following Settings). */
export function posterToSave(s, cfg) {
  const auto = posterAuto(s);
  const out = {};
  for (const it of POSTER_ITEMS) {
    const c = cfg[it.key] || { on: true };
    const v = { on: c.on !== false };
    if (it.text && typeof c.text === 'string' && c.text.trim() !== String(auto[it.key] || '').trim()) v.text = c.text.trim();
    out[it.key] = v;
  }
  return out;
}

const cache = new Map();
function loadImg(src, cors) {
  if (!cache.has(src)) {
    cache.set(src, new Promise((res, rej) => {
      const i = new Image();
      if (cors) i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = (e) => { cache.delete(src); rej(e); };
      i.src = src;
    }));
  }
  return cache.get(src);
}
const qrCache = new Map();
function qrImg(link) {
  if (!qrCache.has(link)) qrCache.set(link, qrDataUrl(link, { color: { dark: '#561010', light: '#ffffff' } }).then((u) => loadImg(u)));
  return qrCache.get(link);
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { const test = cur ? `${cur} ${w}` : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur);
  return lines;
}
const font = (w, s) => `${w} ${s}px "Noto Sans Telugu","Nirmala UI","Gautami",system-ui,sans-serif`;

/** Draws the poster into `canvas` (POSTER_W × POSTER_H). Lines that are off leave no gap. */
export async function drawPoster(canvas, s, link, cfg) {
  const W = POSTER_W, H = POSTER_H;
  canvas.width = W; canvas.height = H;
  const [logo, qr] = await Promise.all([
    cfg.logo.on && s.logo_url ? loadImg(s.logo_url, true).catch(() => null) : null,
    qrImg(link),
  ]);
  const x = canvas.getContext('2d');
  const on = (k) => cfg[k]?.on && (!('text' in cfg[k]) || String(cfg[k].text || '').trim());
  const txt = (k) => String(cfg[k].text || '').trim();
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';

  // ---- header (maroon band): logo, temple name, festival name, dates ----
  const head = [];
  if (logo) head.push({ h: 170, draw: (y) => { x.save(); x.beginPath(); x.arc(W / 2, y + 70, 70, 0, Math.PI * 2); x.clip(); x.drawImage(logo, W / 2 - 70, y, 140, 140); x.restore(); } });
  const textBlock = (k, f, lh, color, gap = 0) => {
    if (!on(k)) return;
    x.font = f; const lines = wrap(x, txt(k), W - 160);
    head.push({ h: lines.length * lh + gap, draw: (y) => { x.font = f; x.fillStyle = color; lines.forEach((l, i) => x.fillText(l, W / 2, y + (i + 1) * lh - lh * 0.22)); } });
  };
  textBlock('title', font(800, 64), 80, '#ffffff', 6);
  textBlock('subtitle', font(600, 40), 54, '#ffffff', 4);
  textBlock('dates', font(700, 34), 50, '#f6c344');
  const decor = cfg.decor.on;
  const topPad = decor ? 112 : 64;
  const headH = head.reduce((a, b) => a + b.h, 0);
  const bandH = head.length ? topPad + headH + 56 : (decor ? 96 : 0);

  x.fillStyle = '#fffaf2'; x.fillRect(0, 0, W, H);
  if (bandH) {
    const g = x.createLinearGradient(0, 0, W, bandH); g.addColorStop(0, '#561010'); g.addColorStop(1, '#a3361c');
    x.fillStyle = g; x.fillRect(0, 0, W, bandH);
  }
  if (decor) {
    for (let i = 0; i < W + 62; i += 62) {
      x.fillStyle = '#2e7d32'; x.beginPath(); x.ellipse(i + 31, 40, 14, 30, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#f9a825'; x.beginPath(); x.arc(i, 12, 12, 0, Math.PI * 2); x.fill();
    }
  }
  let y = topPad;
  head.forEach((b) => { b.draw(y); y += b.h; });

  // ---- footer ----
  let footTop = H;
  if (on('footer')) {
    x.font = font(700, 40); const lines = wrap(x, txt('footer'), W - 160);
    footTop = H - 70 - lines.length * 54;
    x.fillStyle = '#7a1d1d'; lines.forEach((l, i) => x.fillText(l, W / 2, footTop + (i + 1) * 54 - 12));
  }

  // ---- middle: QR + scan lines + web address, as big as fits, centred ----
  const below = [];
  const belowBlock = (lines, f, lh, color) => below.push({ lines, f, lh, color });
  if (on('scan_te')) { x.font = font(800, 50); belowBlock(wrap(x, txt('scan_te'), W - 120), font(800, 50), 66, '#7a1d1d'); }
  if (on('scan_en')) { x.font = font(600, 38); belowBlock(wrap(x, txt('scan_en'), W - 120), font(600, 38), 52, '#857266'); }
  if (cfg.link.on) { x.font = font(500, 28); belowBlock(wrap(x, link, W - 120), font(500, 28), 40, '#857266'); }
  const belowH = below.reduce((a, b) => a + b.lines.length * b.lh, 0) + (below.length ? 60 : 0);
  const top = bandH + 50, bottom = footTop - 40;
  const qs = Math.max(360, Math.min(760, bottom - top - belowH - 60));
  let qy = top + Math.max(30, (bottom - top - (qs + 60) - belowH) / 2) + 30;
  x.fillStyle = '#fff'; x.strokeStyle = '#f0e1cc'; x.lineWidth = 6;
  x.beginPath(); x.roundRect((W - qs) / 2 - 30, qy - 30, qs + 60, qs + 60, 40); x.fill(); x.stroke();
  x.drawImage(qr, (W - qs) / 2, qy, qs, qs);
  y = qy + qs + 30 + 60;
  below.forEach((b) => { x.font = b.f; x.fillStyle = b.color; b.lines.forEach((l) => { y += b.lh; x.fillText(l, W / 2, y - b.lh * 0.25); }); });
  return canvas;
}

/** The finished poster as a PNG file. */
export async function posterFile(s, link, cfg) {
  const c = await drawPoster(document.createElement('canvas'), s, link, cfg);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new File([blob], 'dasara-qr-poster.png', { type: 'image/png' });
}

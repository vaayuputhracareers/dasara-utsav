const TZ = 'Asia/Kolkata';

export const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const inr = (n) => (Number(n) < 0 ? '−₹' : '₹') + Math.abs(Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const inrSigned = (n) => (Number(n) > 0 ? '+ ' : Number(n) < 0 ? '− ' : '') + '₹' + Math.abs(Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const loc = (lang) => (lang === 'te' ? 'te-IN' : 'en-IN');

export function fmtDate(d, lang) {
  if (!d) return '';
  return new Intl.DateTimeFormat(loc(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(d));
}
export function fmtTime(d) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(d)).toUpperCase();
}
export function fmtDateTime(d, lang) {
  if (!d) return '';
  return `${fmtDate(d, lang)}, ${fmtTime(d)}`;
}
/** 05-10-2026 (used in the Telugu receipt) */
export function fmtDateNum(d) {
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).formatToParts(new Date(d));
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return `${g('day')}-${g('month')}-${g('year')}`;
}
/** YYYY-MM-DD in India time */
export const istDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
export const todayIST = () => istDate(new Date());

/** For plain dates 'YYYY-MM-DD' → 'ఆది, 11 అక్టో' / 'Sun, 11 Oct' */
export function fmtDay(ymd, lang, withYear = false) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00+05:30`);
  const opts = { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ };
  if (withYear) opts.year = 'numeric';
  return new Intl.DateTimeFormat(loc(lang), opts).format(d);
}
export function fmtShortDay(ymd, lang) {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  return new Intl.DateTimeFormat(loc(lang), { day: 'numeric', month: 'short', timeZone: TZ }).format(d);
}
/** '06:30:00' → '6:30 AM' */
export function fmtClock(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
export function dateRange(start, end) {
  if (!start || !end) return [];
  const out = [];
  let d = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  let guard = 0;
  while (d <= e && guard < 60) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
    guard++;
  }
  return out;
}
export function initials(name) {
  const s = String(name || '?').trim();
  return (s[0] || '?').toUpperCase();
}
export const personName = (p, lang) => (!p ? '' : lang === 'te' ? p.name_te || p.full_name : p.full_name || p.name_te);

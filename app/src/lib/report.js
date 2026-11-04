// Accounts summary report (change 28) – admin only, Settings → Data, next to the Excel backup.
// The pages are drawn on a canvas (so Telugu letters come out right on every phone) and packed into a PDF,
// one picture per A4 page (lib/pdf.js) – no extra library. The sums are the same as the Excel "Summary" sheet.
import { DICT } from './i18n.jsx';
import { fetchYear, filePrefix } from './dataTools.js';
import { pdfFromJpegs } from './pdf.js';
import { inr, fmtDay, fmtDateTime, istDate, todayIST, personName } from './format.js';

const W = 1240, H = 1754;              // A4 at 150 dpi
const M = 78, TOP = 74, BOTTOM = 108;  // margins (the footer sits in the bottom margin)
const CW = W - 2 * M;
const FT = '"Noto Sans Telugu","Nirmala UI","Gautami","Telugu Sangam MN","Mandali",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
const FN = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
const C = { maroon: '#7a1d1d', saffron: '#ef7d1a', gold: '#f6c344', ink: '#2b1a12', sub: '#5b4636', muted: '#857266', line: '#eadbc6', head: '#fbeedd', zebra: '#fdf9f3', total: '#fff3e0' };

const n2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const sum = (arr, f = (x) => x.amount) => n2(arr.reduce((s, x) => s + Number(f(x) || 0), 0));
const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (SEG ? Array.from(SEG.segment(s), (x) => x.segment) : Array.from(s));

/** t() for the chosen report language (the report can be in Telugu while the app is in English). */
export function translator(lang) {
  return (key, vars) => {
    const e = DICT[key];
    let s = e ? (lang === 'te' ? e[0] : e[1]) : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
}
const picker = (lang) => (te, en) => {
  const a = String((lang === 'te' ? te : en) || '').trim();
  return a || String((lang === 'te' ? en : te) || '').trim();
};

/** All the figures of the report (same rules as the Excel backup and the Cash & Bank page). */
export function computeReport(data, lang, t) {
  const P = picker(lang);
  const { donations, expenses, handovers, profiles } = data;
  const transfers = data.transfers || [];
  const valid = donations.filter((d) => d.status === 'active');
  const cancelled = donations.filter((d) => d.status === 'cancelled');
  const cash = valid.filter((d) => d.payment_mode === 'cash');
  const upi = valid.filter((d) => d.payment_mode === 'upi');
  const approved = expenses.filter((e) => e.status === 'approved');
  const pending = expenses.filter((e) => e.status === 'pending');

  const openCash = sum(transfers.filter((x) => x.kind === 'opening_cash'));
  const openBank = sum(transfers.filter((x) => x.kind === 'opening_bank'));
  const deposits = transfers.filter((x) => x.kind === 'deposit');
  const withdrawals = transfers.filter((x) => x.kind === 'withdrawal');
  const committeeCashExp = approved.filter((e) => !e.paid_by && e.payment_mode === 'cash');
  const committeeUpiExp = approved.filter((e) => !e.paid_by && e.payment_mode === 'upi');
  const setOff = approved.filter((e) => e.paid_by && !e.settled_mode);
  const backCash = approved.filter((e) => e.settled_mode === 'cash');
  const backUpi = approved.filter((e) => e.settled_mode === 'upi');
  const members = profiles.map((p) => {
    const mine = valid.filter((d) => d.collected_by === p.id);
    const mCash = sum(mine.filter((d) => d.payment_mode === 'cash'));
    const mUpi = sum(mine.filter((d) => d.payment_mode === 'upi'));
    const mExp = sum(approved.filter((e) => e.paid_by === p.id && !e.settled_mode));
    const mBack = sum(approved.filter((e) => e.paid_by === p.id && e.settled_mode));
    const mGiven = sum(handovers.filter((h) => h.member_id === p.id), (h) => h.amount_received);
    return { name: personName(p, lang) || p.mobile || '–', admin: p.role === 'admin', n: mine.length, cash: mCash, upi: mUpi,
      total: n2(mCash + mUpi), exp: mExp, back: mBack, given: mGiven, bal: n2(mCash - mExp - mGiven) };
  }).filter((r) => r.n || r.exp || r.back || r.given);
  const bals = members.filter((r) => !r.admin).map((r) => r.bal);
  const withMembers = n2(bals.reduce((a, b) => a + Math.max(b, 0), 0));
  const owed = n2(bals.reduce((a, b) => a + Math.max(-b, 0), 0));
  const hoUpi = sum(handovers.filter((h) => h.payment_mode === 'upi'), (h) => h.amount_received);
  const bank = n2(openBank + sum(upi) - sum(committeeUpiExp) - sum(backUpi) + sum(deposits) - sum(withdrawals) + hoUpi);
  const cashInHand = n2(openCash + sum(cash) - sum(committeeCashExp) - sum(setOff) - sum(backCash) - sum(deposits) + sum(withdrawals) + owed - hoUpi);

  const group = (list, keyOf, labelOf) => {
    const m = new Map();
    list.forEach((x) => {
      const k = keyOf(x);
      const g = m.get(k) || { label: labelOf(x), n: 0, cash: 0, upi: 0, total: 0 };
      const a = Number(x.amount || 0);
      g.n += 1;
      g.total += a;
      if (x.payment_mode === 'upi') g.upi += a; else g.cash += a;
      m.set(k, g);
    });
    return [...m.values()].map((g) => ({ ...g, cash: n2(g.cash), upi: n2(g.upi), total: n2(g.total) })).sort((a, b) => b.total - a.total);
  };
  const purposes = group(valid, (d) => `${d.purpose_te || ''}|${d.purpose_en || ''}`, (d) => P(d.purpose_te, d.purpose_en) || t('rp_general'));
  const categories = group(approved, (e) => `${e.category_te || ''}|${e.category_en || ''}`, (e) => P(e.category_te, e.category_en) || t('rp_other'));

  const days = new Map();
  const day = (k) => { if (!days.has(k)) days.set(k, { k, n: 0, rec: 0, pay: 0 }); return days.get(k); };
  valid.forEach((d) => { const r = day(istDate(d.collected_at)); r.n += 1; r.rec += Number(d.amount || 0); });
  approved.forEach((e) => { day(String(e.expense_date).slice(0, 10)).pay += Number(e.amount || 0); });
  const dayRows = [...days.values()].sort((a, b) => a.k.localeCompare(b.k)).map((r) => ({ ...r, rec: n2(r.rec), pay: n2(r.pay), net: n2(r.rec - r.pay) }));

  const auction = data.auction || [];
  const payList = data.auctionPayments || [];
  const hundi = data.hundi || [];
  const bid = sum(auction, (a) => a.bid_amount);
  const paid = sum(payList);
  return {
    openCash, openBank, opening: n2(openCash + openBank),
    receipts: { n: valid.length, total: sum(valid), cash: sum(cash), upi: sum(upi) },
    payments: { n: approved.length, total: sum(approved), cash: sum(approved.filter((e) => e.payment_mode !== 'upi')), upi: sum(approved.filter((e) => e.payment_mode === 'upi')) },
    cashInHand, bank, withMembers, withCommittee: n2(cashInHand - withMembers), owed,
    net: n2(openCash + openBank + sum(valid) - sum(approved)),
    cancelled: { n: cancelled.length, total: sum(cancelled) },
    pending: { n: pending.length, total: sum(pending) },
    purposes, categories, dayRows, members,
    deposits: { n: deposits.length, total: sum(deposits) },
    withdrawals: { n: withdrawals.length, total: sum(withdrawals) },
    paidBack: { n: backCash.length + backUpi.length, total: n2(sum(backCash) + sum(backUpi)) },
    auction: { n: auction.length, bid, paid, due: n2(bid - paid) },
    hundi: { n: hundi.length, total: sum(hundi) },
    sareeDonors: (data.sareeDonors || []).length,
    period: dayRows.length ? [dayRows[0].k, dayRows[dayRows.length - 1].k] : null,
  };
}

/** Draw the report on A4 canvases (one per page). */
function drawReport(R, { t, lang, settings, year, preparedBy, logo }) {
  const P = picker(lang);
  const pages = [];
  let g = null;
  let y = 0;
  const newPage = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle';
    pages.push(c);
    y = TOP;
  };
  const font = (size, weight = 400, fam = FT) => { g.font = `${weight} ${size}px ${fam}`; };
  const measure = (s) => g.measureText(s).width;
  const room = (h) => { if (y + h > H - BOTTOM) { newPage(); return true; } return false; };
  const text = (s, x, yy, { size = 22, weight = 400, color = C.ink, align = 'left', fam = FT } = {}) => {
    font(size, weight, fam);
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(String(s), x, yy);
  };
  const breakLong = (word, maxW, outLines) => {
    let part = '';
    graphemes(word).forEach((ch) => {
      if (part && measure(part + ch) > maxW) { outLines.push(part); part = ch; } else part += ch;
    });
    return part;
  };
  /** the lines of s that fit maxW (with the current font) */
  const wrap = (s, maxW) => {
    const lines = [];
    String(s ?? '').split('\n').forEach((para) => {
      let line = '';
      para.split(/\s+/).filter(Boolean).forEach((w) => {
        const test = line ? `${line} ${w}` : w;
        if (measure(test) <= maxW) { line = test; return; }
        if (line) lines.push(line);
        line = measure(w) <= maxW ? w : breakLong(w, maxW, lines);
      });
      lines.push(line);
    });
    return lines;
  };
  const para = (s, { size = 22, weight = 400, color = C.ink, align = 'left', lh = 1.5, after = 6 } = {}) => {
    font(size, weight);
    const LH = Math.round(size * lh);
    wrap(s, CW).forEach((ln) => {
      room(LH);
      text(ln, align === 'center' ? W / 2 : M, y + LH / 2, { size, weight, color, align });
      y += LH;
    });
    y += after;
  };
  const heading = (s) => {
    if (y > TOP) newPage();   // one table per page
    g.fillStyle = C.saffron;
    g.fillRect(M, y + 9, 8, 36);
    text(s, M + 22, y + 27, { size: 28, weight: 700, color: C.maroon });
    y += 60;
  };
  const subheading = (s) => {
    y += 18;
    room(50 + 48);
    text(s, M + 4, y + 22, { size: 24, weight: 700, color: C.sub });
    g.fillStyle = C.line;
    g.fillRect(M, y + 44, CW, 2);
    y += 50;
  };
  // label · count · amount rows (the summary and the other details)
  const stmt = (rows) => {
    const amtW = 220, cntW = 220;
    rows.forEach((r) => {
      const lvl = r.level || 0;
      const size = r.bold ? 23 : lvl ? 21 : 22;
      const weight = r.bold ? 700 : 400;
      const color = lvl ? C.sub : C.ink;
      const lx = M + 46 + lvl * 34;
      font(size, weight);
      const lines = wrap(r.label, M + CW - amtW - (r.count ? cntW : 0) - lx - 8);
      const LH = Math.round(size * 1.45);
      const h = Math.max(lvl ? 40 : 48, lines.length * LH + 12);
      room(h);
      if (r.shade) { g.fillStyle = C.total; g.fillRect(M, y, CW, h); }
      if (r.line) { g.fillStyle = C.line; g.fillRect(M, y, CW, 2); }
      if (r.sign) text(r.sign, M + 20, y + h / 2, { size: 24, weight: 700, color: C.muted, align: 'center', fam: FN });
      const top = y + (h - lines.length * LH) / 2;
      lines.forEach((ln, i) => text(ln, lx, top + LH * i + LH / 2, { size, weight, color }));
      if (r.count) text(r.count, M + CW - amtW - 12, y + h / 2, { size: 19, color: C.muted, align: 'right' });
      if (r.amount != null) text(inr(r.amount), M + CW - 12, y + h / 2, { size, weight, color, align: 'right', fam: FN });
      y += h;
    });
  };
  const table = (cols, rows, total) => {
    const ws = cols.map((c) => Math.round(c.w * CW));
    const xs = [];
    ws.reduce((x, w) => { xs.push(x); return x + w; }, M);
    const pad = 12;
    const build = (cells, kind) => {
      const head = kind === 'head';
      const size = head ? 19 : 21;
      const weight = head || kind === 'total' ? 700 : 400;
      const LH = Math.round(size * 1.45);
      font(size, weight);
      const lines = cells.map((v, i) => (cols[i].align === 'right' && !head ? [String(v ?? '')] : wrap(String(v ?? ''), ws[i] - 2 * pad)));
      const h = Math.max(head ? 46 : 42, Math.max(...lines.map((l) => l.length)) * LH + 14);
      return { lines, h, size, weight, LH, head };
    };
    const paint = (r, bg) => {
      if (bg) { g.fillStyle = bg; g.fillRect(M, y, CW, r.h); }
      r.lines.forEach((ls, i) => {
        const c = cols[i];
        const al = c.align || 'left';
        const tx = al === 'right' ? xs[i] + ws[i] - pad : xs[i] + pad;
        const top = y + (r.h - ls.length * r.LH) / 2;
        ls.forEach((ln, j) => text(ln, tx, top + r.LH * j + r.LH / 2,
          { size: r.size, weight: r.weight, color: r.head ? C.maroon : C.ink, align: al, fam: c.num && !r.head ? FN : FT }));
      });
      g.fillStyle = C.line;
      g.fillRect(M, y + r.h - 1, CW, 1);
      y += r.h;
    };
    const headRow = build(cols.map((c) => c.label), 'head');
    const head = () => paint(headRow, C.head);
    room(headRow.h + 44);
    head();
    rows.forEach((cells, i) => {
      const r = build(cells, 'row');
      if (room(r.h)) head();
      paint(r, i % 2 ? C.zebra : null);
    });
    if (total) {
      const r = build(total, 'total');
      if (room(r.h + 2)) head();
      g.fillStyle = C.maroon;
      g.fillRect(M, y, CW, 2);
      y += 2;
      paint(r, C.total);
    }
  };
  const cols5 = (first) => [
    { label: first, w: 0.38 },
    { label: t('rp_col_no'), w: 0.1, align: 'right', num: true },
    { label: t('rp_cash'), w: 0.17, align: 'right', num: true },
    { label: t('rp_upi'), w: 0.17, align: 'right', num: true },
    { label: t('total'), w: 0.18, align: 'right', num: true },
  ];

  // ---------- page 1: cover – centred, with borders (the summary starts on page 2)
  newPage();
  g.strokeStyle = C.maroon;
  g.lineWidth = 6;
  g.strokeRect(48, 48, W - 96, H - 96);
  g.strokeStyle = C.saffron;
  g.lineWidth = 2;
  g.strokeRect(64, 64, W - 128, H - 128);
  const temple = P(settings.temple_name_te, settings.temple_name_en);
  const fest = P(settings.event_title_te, settings.event_title_en);
  const committee = P(settings.committee_name_te, settings.committee_name_en);
  const village = P(settings.village_te, settings.village_en);
  const address = [P(settings.address_te, settings.address_en), village].filter(Boolean).join(', ');
  const fy = String(year || settings.event_year || '').trim();
  const festLine = fest && fy && !fest.includes(fy) ? `${fest} - ${fy}` : fest || fy;
  const period = R.period ? ` · ${t('rp_period', { from: fmtDay(R.period[0], lang, true), to: fmtDay(R.period[1], lang, true) })}` : '';
  const items = [
    logo && { logo: true },                                                                      // the logo from Settings
    temple && { s: temple, size: 46, weight: 800, color: C.maroon, after: 16 },                 // 1. temple name
    committee && { s: committee, size: 30, weight: 600, color: C.sub, after: 12 },              // 2. committee name
    address && { s: address, size: 26, weight: 400, color: C.muted, after: 0 },                 // 3. street / address, village / town
    festLine && { rule: true },
    festLine && { s: festLine, size: 34, weight: 700, color: C.saffron, after: 0 },             // 4. festival title - year
    { rule: true },
    { s: t('rp_title'), size: 44, weight: 800, color: C.ink, after: 18 },                       // 5. report heading
    { s: (year ? t('rp_records_of', { year }) : t('all_years')) + period, size: 24, weight: 400, color: C.muted, after: 10 },   // 6.
    { s: t('rp_prepared', { when: fmtDateTime(new Date(), lang), name: preparedBy || '–' }), size: 22, weight: 400, color: C.muted, after: 0 },   // 7.
  ].filter(Boolean);
  const coverW = W - 2 * 130;
  const RULE = 70;   // the short line between the groups, with its space
  const LOGO = 200;  // logo size on the cover
  const laid = items.map((it) => {
    if (it.rule) return { ...it, h: RULE };
    if (it.logo) return { ...it, h: LOGO + 36 };
    font(it.size, it.weight);
    const LH = Math.round(it.size * 1.4);
    const lines = wrap(it.s, coverW);
    return { ...it, LH, lines, h: lines.length * LH + it.after };
  });
  y = Math.max(110, (H - laid.reduce((a, it) => a + it.h, 0)) / 2);
  laid.forEach((it) => {
    if (it.logo) {
      const sc = Math.max(LOGO / logo.naturalWidth, LOGO / logo.naturalHeight);
      const lw = logo.naturalWidth * sc, lh = logo.naturalHeight * sc;
      g.save();
      g.beginPath();
      g.arc(W / 2, y + LOGO / 2, LOGO / 2, 0, Math.PI * 2);
      g.clip();
      g.drawImage(logo, (W - lw) / 2, y + (LOGO - lh) / 2, lw, lh);
      g.restore();
      g.strokeStyle = C.gold;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(W / 2, y + LOGO / 2, LOGO / 2 - 2, 0, Math.PI * 2);
      g.stroke();
    } else if (it.rule) {
      g.fillStyle = C.saffron;
      g.fillRect(W / 2 - 80, y + RULE / 2 - 2, 160, 4);
    } else {
      it.lines.forEach((ln, i) => text(ln, W / 2, y + it.LH * i + it.LH / 2, { size: it.size, weight: it.weight, color: it.color, align: 'center' }));
    }
    y += it.h;
  });
  newPage();

  // ---------- summary: opening + receipts − payments = closing
  heading(t('rp_sec_summary'));
  const S = [{ label: t('rp_opening'), amount: R.opening, bold: true }];
  S.push({ label: t('rp_cash_in_hand'), amount: R.openCash, level: 1 }, { label: t('rp_cash_at_bank'), amount: R.openBank, level: 1 });   // always the split
  S.push(
    { sign: '+', label: t('rp_receipts_total'), count: t('rp_receipts_n', { n: R.receipts.n }), amount: R.receipts.total, bold: true, line: true },
    { label: t('rp_cash'), amount: R.receipts.cash, level: 1 },
    { label: t('rp_upi'), amount: R.receipts.upi, level: 1 },
    { sign: '−', label: t('rp_payments_total'), count: t('entries_n', { n: R.payments.n }), amount: R.payments.total, bold: true, line: true },
    { label: t('rp_cash'), amount: R.payments.cash, level: 1 },
    { label: t('rp_upi'), amount: R.payments.upi, level: 1 },
    { sign: '=', label: t('rp_closing'), amount: n2(R.cashInHand + R.bank), bold: true, shade: true, line: true },
    { label: t('rp_cash_in_hand'), amount: R.cashInHand, level: 1 },
  );
  if (R.withMembers !== 0) S.push({ label: t('rp_with_committee'), amount: R.withCommittee, level: 2 }, { label: t('rp_with_members'), amount: R.withMembers, level: 2 });
  S.push({ label: t('rp_cash_at_bank'), amount: R.bank, level: 1 });
  if (R.owed > 0) {
    S.push(
      { sign: '−', label: t('rp_owed'), amount: R.owed, bold: true, line: true },
      { sign: '=', label: t('rp_net'), amount: R.net, bold: true, shade: true, line: true },
    );
  }
  stmt(S);
  y += 6;
  para(R.owed > 0 ? t('rp_check_owed') : t('rp_check'), { size: 19, color: C.muted, after: 0 });

  // ---------- receipts by purpose, payments by category
  heading(t('rp_sec_receipts'));
  if (R.purposes.length) {
    table(cols5(t('rp_col_purpose')), R.purposes.map((x) => [x.label, x.n, inr(x.cash), inr(x.upi), inr(x.total)]),
      [t('total'), R.receipts.n, inr(R.receipts.cash), inr(R.receipts.upi), inr(R.receipts.total)]);
  } else para(t('rp_none'), { size: 21, color: C.muted });

  heading(t('rp_sec_payments'));
  if (R.categories.length) {
    table(cols5(t('rp_col_category')), R.categories.map((x) => [x.label, x.n, inr(x.cash), inr(x.upi), inr(x.total)]),
      [t('total'), R.payments.n, inr(R.payments.cash), inr(R.payments.upi), inr(R.payments.total)]);
  } else para(t('rp_none'), { size: 21, color: C.muted });

  // ---------- day-wise
  if (R.dayRows.length) {
    heading(t('rp_sec_days'));
    table([
      { label: t('date'), w: 0.31 },
      { label: t('rp_col_no'), w: 0.1, align: 'right', num: true },
      { label: t('rp_col_receipts'), w: 0.2, align: 'right', num: true },
      { label: t('rp_col_payments'), w: 0.2, align: 'right', num: true },
      { label: t('rp_col_net'), w: 0.19, align: 'right', num: true },
    ], R.dayRows.map((r) => [fmtDay(r.k, lang, true), r.n, inr(r.rec), inr(r.pay), inr(r.net)]),
    [t('total'), R.receipts.n, inr(R.receipts.total), inr(R.payments.total), inr(n2(R.receipts.total - R.payments.total))]);
  }

  // ---------- member-wise
  if (R.members.length) {
    heading(t('rp_sec_members'));
    const ms = R.members;
    table([
      { label: t('rp_col_member'), w: 0.27 },
      { label: t('rp_col_no'), w: 0.08, align: 'right', num: true },
      { label: t('rp_cash'), w: 0.16, align: 'right', num: true },
      { label: t('rp_upi'), w: 0.15, align: 'right', num: true },
      { label: t('total'), w: 0.17, align: 'right', num: true },
      { label: t('rp_col_balance'), w: 0.17, align: 'right', num: true },
    ], ms.map((m) => [m.admin ? `${m.name} (${t('rp_admin')})` : m.name, m.n, inr(m.cash), inr(m.upi), inr(m.total), m.admin ? '–' : inr(m.bal)]),
    [t('total'), ms.reduce((a, m) => a + m.n, 0), inr(sum(ms, (m) => m.cash)), inr(sum(ms, (m) => m.upi)), inr(sum(ms, (m) => m.total)),
      inr(sum(ms.filter((m) => !m.admin), (m) => m.bal))]);
    y += 4;
    para(t('rp_members_note'), { size: 19, color: C.muted, after: 0 });
  }

  // ---------- other details: the saree part and the hundi part separately
  const pendingRows = R.pending.n ? [{ label: t('rp_pending'), count: t('entries_n', { n: R.pending.n }), amount: R.pending.total }] : [];
  const sareeRows = [];
  if (R.sareeDonors) sareeRows.push({ label: t('rp_saree_donors'), count: String(R.sareeDonors) });
  if (R.auction.n) {
    sareeRows.push(
      { label: t('rp_auction_bid', { n: R.auction.n }), amount: R.auction.bid },
      { label: t('rp_auction_paid'), amount: R.auction.paid },
      { label: t('rp_auction_due'), amount: R.auction.due },
    );
  }
  const hundiRows = R.hundi.n ? [{ label: t('rp_hundi'), count: t('entries_n', { n: R.hundi.n }), amount: R.hundi.total }] : [];
  if (pendingRows.length || sareeRows.length || hundiRows.length) {
    heading(t('rp_sec_other'));
    if (pendingRows.length) stmt(pendingRows);
    if (sareeRows.length) { subheading(t('rp_sub_saree')); stmt(sareeRows); }
    if (hundiRows.length) { subheading(t('rp_sub_hundi')); stmt(hundiRows); }
  }

  // ---------- end of the report (after all the tables), with symbols on the left and right
  y += 56;
  room(70);
  const endText = t('rp_end');
  font(26, 700);
  const tw = measure(endText);
  const cy = y + 30;
  text(endText, W / 2, cy, { size: 26, weight: 700, color: C.maroon, align: 'center' });
  const diamond = (cx, r) => {
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r, cy);
    g.closePath();
    g.fill();
  };
  g.fillStyle = C.saffron;
  [-1, 1].forEach((d) => {
    const inner = W / 2 + d * (tw / 2 + 28);
    diamond(inner, 10);
    diamond(inner + d * 28, 7);
    diamond(inner + d * 50, 5);
    g.fillRect(d < 0 ? inner - 210 : inner + 66, cy - 1.5, 144, 3);
  });
  y = cy + 40;

  // ---------- footer on every page
  const left = [temple, festLine].filter(Boolean).join(' · ');   // festival title - year
  pages.forEach((c, i) => {
    if (i === 0) return;   // no footer on the cover
    g = c.getContext('2d');
    g.fillStyle = C.line;
    g.fillRect(M, H - 78, CW, 2);
    const right = t('rp_page', { i: i + 1, n: pages.length });
    text(right, M + CW, H - 50, { size: 18, color: C.muted, align: 'right' });
    font(18);
    const max = CW - measure(right) - 40;
    let s = left;
    if (measure(s) > max) {
      const gs = graphemes(s);
      while (gs.length && measure(`${gs.join('')}…`) > max) gs.pop();
      s = `${gs.join('')}…`;
    }
    text(s, M, H - 50, { size: 18, color: C.muted });
  });
  return pages;
}

/** The temple logo from Settings (skipped when it cannot be drawn into the PDF). */
function loadLogo(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 4;
        c.getContext('2d').drawImage(img, 0, 0, 4, 4);
        c.toDataURL();   // throws when the picture would block saving the page
        res(img);
      } catch {
        res(null);
      }
    };
    img.onerror = () => res(null);
    setTimeout(() => res(null), 10000);
    img.src = url;
  });
}

async function toJpeg(canvas) {
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the page picture'))), 'image/jpeg', 0.88));
  return { blob, bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}

/** Make the PDF: { blob, name, title, urls (page pictures for the preview), n (pages) } */
export async function makeReport({ year, lang, settings, preparedBy }) {
  const t = translator(lang);
  const P = picker(lang);
  const s = settings || {};
  const data = await fetchYear(year || null);
  const R = computeReport(data, lang, t);
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch { /* system fonts */ }
  const logo = await loadLogo(s.logo_url);
  const canvases = drawReport(R, { t, lang, settings: s, year, preparedBy, logo });
  const pages = [];
  for (const c of canvases) {
    pages.push(await toJpeg(c));
    c.width = 0;   // free the memory
    c.height = 0;
  }
  const fest = P(s.event_title_te, s.event_title_en);
  const title = fest ? `${t('rp_title')} – ${fest}` : t('rp_title');
  return {
    blob: pdfFromJpegs(pages, title),
    name: `${filePrefix(s, year || null)}-accounts-report-${todayIST()}.pdf`,
    title,
    urls: pages.map((p) => URL.createObjectURL(p.blob)),
    n: pages.length,
  };
}

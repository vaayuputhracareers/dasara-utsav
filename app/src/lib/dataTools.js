// Settings → Data: yearly Excel export, bill-photo ZIP and "delete all data" (admin only).
import { settlementLabel } from './settle.js';
import { TRANSFER_SELECT, transferRows } from './cashbank.js';
import { supabase, fetchAll } from './supabase.js';
import { exportSheets } from './exportXlsx.js';
import { makeZip, saveBlob } from './zip.js';
import { fmtDateTime, fmtTime, istDate, todayIST } from './format.js';

const DON_SELECT = '*, collector:profiles!donations_collected_by_fkey(full_name,name_te,mobile)';
const EXP_SELECT = '*, creator:profiles!expenses_created_by_fkey(full_name,name_te), payer:profiles!expenses_paid_by_fkey(full_name,name_te), reviewer:profiles!expenses_reviewed_by_fkey(full_name,name_te)';
const LOCAL_KEY = 'utsav-last-export';

/** Where each kind of record gets its year from (dates are India time). */
const SOURCES = [
  { table: 'donations', col: 'collected_at', kind: 'ts' },
  { table: 'expenses', col: 'expense_date', kind: 'date' },
  { table: 'handovers', col: 'received_at', kind: 'ts' },
  { table: 'programs', col: 'program_date', kind: 'date' },
  { table: 'festival_days', col: 'day_date', kind: 'date' },
  { table: 'pujas', col: 'puja_date', kind: 'date', optional: true },   // version 5 – missing before the update
  { table: 'cash_transfers', col: 'transfer_date', kind: 'date', optional: true },   // version 8 – cash ⇄ bank entries
];
/** A table that is missing until the database update (e.g. the puja schedule before version 5). */
const missing = (s, error) => !!s.optional && !!error && (['PGRST205', '42P01'].includes(error.code) || /schema cache|does not exist/i.test(String(error.message || '')));

export const yearBounds = (y) => ({
  fromTs: `${y}-01-01T00:00:00+05:30`,
  toTs: `${y + 1}-01-01T00:00:00+05:30`,
  fromDate: `${y}-01-01`,
  toDate: `${y}-12-31`,
});
function byYear(q, col, y, kind) {
  if (!y) return q;
  const b = yearBounds(y);
  return kind === 'ts' ? q.gte(col, b.fromTs).lt(col, b.toTs) : q.gte(col, b.fromDate).lte(col, b.toDate);
}
const n2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const sum = (arr, f = (x) => x.amount) => n2(arr.reduce((s, x) => s + Number(f(x) || 0), 0));
const nameOf = (p) => (p ? p.full_name || p.name_te || p.mobile || '' : '');
/** 'YYYY-MM-DD' → Date at local midnight (Excel shows it as that calendar date) */
const dayCell = (ymd) => { if (!ymd) return ''; const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const weekday = (ymd) => (ymd ? new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${ymd}T12:00:00+05:30`)) : '');
const clock = (t) => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const slug = (s, max = 40) => String(s || '').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, max);

/** First whole words of a name, as a file-name part (max ~40 characters). */
function wordsSlug(s, max = 40) {
  let out = '';
  for (const w of slug(s, 200).split('-').filter(Boolean)) {
    if ((out ? out.length + 1 : 0) + w.length > max) break;
    out = out ? `${out}-${w}` : w;
  }
  return out || slug(s, max);
}

export function filePrefix(settings, y) {
  const temple = wordsSlug(settings?.temple_name_en || '').toLowerCase() || 'utsav';
  return `${temple}-${y ? `dasara-${y}` : 'all-years'}`;
}

/** Years that have any record, newest first. */
export async function listDataYears() {
  const found = new Set();
  await Promise.all(SOURCES.map(async (s) => {
    for (const ascending of [true, false]) {
      const { data, error } = await supabase.from(s.table).select(s.col).order(s.col, { ascending }).limit(1);
      if (missing(s, error)) return;
      if (error) throw error;
      const v = data?.[0]?.[s.col];
      if (v) found.add(Number((s.kind === 'ts' ? istDate(v) : String(v)).slice(0, 4)));
    }
  }));
  if (!found.size) return [];
  const lo = Math.min(...found), hi = Math.max(...found);
  const years = [];
  for (let y = hi; y >= lo && years.length < 30; y--) years.push(y);
  if (years.length <= 2) return years;
  const counts = await Promise.all(years.map((y) => countYear(y)));
  return years.filter((_, i) => counts[i].total > 0);
}

/** How many records a year has (y = null → all years). */
export async function countYear(y) {
  const out = {};
  await Promise.all(SOURCES.map(async (s) => {
    const { count, error } = await byYear(supabase.from(s.table).select('*', { count: 'exact', head: true }), s.col, y, s.kind);
    if (missing(s, error)) { out[s.table] = 0; return; }
    if (error) throw error;
    out[s.table] = count || 0;
  }));
  const { count: bills, error } = await byYear(
    supabase.from('expenses').select('*', { count: 'exact', head: true }).not('bill_path', 'is', null).neq('bill_path', ''),
    'expense_date', y, 'date');
  if (error) throw error;
  out.bills = bills || 0;
  out.total = SOURCES.reduce((n, s) => n + out[s.table], 0);
  return out;
}

const PUJAS = SOURCES.find((s) => s.table === 'pujas');
async function fetchPujas(y) {
  try {
    return await fetchAll(() => byYear(supabase.from('pujas').select('*'), 'puja_date', y, 'date').order('puja_date').order('puja_time', { nullsFirst: true }).order('created_at').order('id'));
  } catch (e) {
    if (missing(PUJAS, e)) return [];
    throw e;
  }
}

const TRANSFERS = SOURCES.find((s) => s.table === 'cash_transfers');
async function fetchTransfers(y) {
  try {
    return await fetchAll(() => byYear(supabase.from('cash_transfers').select(TRANSFER_SELECT), 'transfer_date', y, 'date').order('transfer_date').order('created_at').order('id'));
  } catch (e) {
    if (missing(TRANSFERS, e)) return [];
    throw e;
  }
}

export async function fetchYear(y) {
  const [donations, expenses, handovers, programs, days, profiles, pujas, transfers] = await Promise.all([
    fetchAll(() => byYear(supabase.from('donations').select(DON_SELECT), 'collected_at', y, 'ts').order('collected_at').order('id')),
    fetchAll(() => byYear(supabase.from('expenses').select(EXP_SELECT), 'expense_date', y, 'date').order('expense_date').order('created_at').order('id')),
    fetchAll(() => byYear(supabase.from('handovers').select('*'), 'received_at', y, 'ts').order('received_at').order('id')),
    fetchAll(() => byYear(supabase.from('programs').select('*'), 'program_date', y, 'date').order('program_date').order('start_time', { nullsFirst: true }).order('id')),
    fetchAll(() => byYear(supabase.from('festival_days').select('*'), 'day_date', y, 'date').order('day_date')),
    fetchAll(() => supabase.from('profiles').select('id,full_name,name_te,mobile,role,status').order('created_at').order('id')),
    fetchPujas(y),
    fetchTransfers(y),
  ]);
  return { donations, expenses, handovers, programs, days, profiles, pujas, transfers };
}

/** File name of a bill photo inside the ZIP (also written in the Excel "Bill File" column). */
export function billFileName(e) {
  const ext = (/\.[a-z0-9]{2,5}$/i.exec(e.bill_path || '') || ['.jpg'])[0].toLowerCase();
  const what = slug(e.category_en || e.category_te || e.description || 'expense', 30) || 'expense';
  return `${e.expense_date}_${String(n2(e.amount)).replace('.', '-')}_${what}_${String(e.id).slice(0, 6)}${ext}`;
}

/** All sheets of the yearly backup. */
export function buildSheets(data, { year, settings, lang, exportedBy }) {
  const { donations, expenses, handovers, programs, days, profiles } = data;
  const pujas = data.pujas || [];
  const people = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const valid = donations.filter((d) => d.status === 'active');
  const cancelled = donations.filter((d) => d.status === 'cancelled');
  const cash = valid.filter((d) => d.payment_mode === 'cash');
  const upi = valid.filter((d) => d.payment_mode === 'upi');
  const approved = expenses.filter((e) => e.status === 'approved');
  const pending = expenses.filter((e) => e.status === 'pending');
  const rejected = expenses.filter((e) => e.status === 'rejected');
  const L = (te, en) => (lang === 'te' ? te || en : en || te) || '';

  const donationRows = donations.map((d) => ({
    'Receipt No': d.receipt_no || '',
    Date: dayCell(istDate(d.collected_at)),
    Time: fmtTime(d.collected_at),
    Donor: d.donor_name || '',
    Mobile: d.mobile || '',
    Amount: n2(d.amount),
    Mode: d.payment_mode === 'upi' ? 'UPI' : 'Cash',
    'UPI Ref': d.upi_ref || '',
    'Village / Street': d.village || '',
    Gotram: d.gotram || '',
    Purpose: L(d.purpose_te, d.purpose_en),
    'Collected By': nameOf(d.collector),
    'Collector Mobile': d.collector?.mobile || '',
    Status: d.status === 'cancelled' ? 'Cancelled' : 'Valid',
    'Cancel Reason': d.cancel_reason || '',
    'Cancelled On': d.cancelled_at ? fmtDateTime(d.cancelled_at, 'en') : '',
    'Handed Over': d.payment_mode === 'cash' ? (d.handover_id ? 'Yes' : 'No') : '',
    'UPI Verified': d.payment_mode === 'upi' ? (d.upi_verified ? 'Yes' : 'No') : '',
    'WhatsApp Sent': d.shared_at ? 'Yes' : 'No',
    Notes: d.notes || '',
  }));

  const expenseRows = expenses.map((e) => ({
    Date: dayCell(e.expense_date),
    Category: e.category_en || e.category_te || '',
    'Category (Telugu)': e.category_te || '',
    Description: e.description || '',
    'Paid To': e.paid_to || '',
    Amount: n2(e.amount),
    Mode: e.payment_mode === 'upi' ? 'UPI' : 'Cash',
    'Paid From': e.payer ? `Cash with ${nameOf(e.payer)}` : 'Committee funds',
    'Recorded By': nameOf(e.creator),
    Status: e.status === 'approved' ? 'Approved' : e.status === 'rejected' ? 'Rejected' : 'Pending',
    'Reviewed By': nameOf(e.reviewer),
    'Reviewed On': e.reviewed_at ? fmtDateTime(e.reviewed_at, 'en') : '',
    'Review Note': e.review_note || '',
    Settlement: settlementLabel(e),   // version 7: set off / paid back (cash or temple UPI)
    'Paid Back On': e.settled_at ? fmtDateTime(e.settled_at, 'en') : '',
    'Paid Back By': e.settled_by ? nameOf(people[e.settled_by]) : '',
    'Paid Back Ref': e.settled_ref || '',
    'Bill File': e.bill_path ? billFileName(e) : '',
  }));

  const handoverRows = handovers.map((h) => ({
    Date: dayCell(istDate(h.received_at)),
    Time: fmtTime(h.received_at),
    Member: nameOf(people[h.member_id]),
    'Member Mobile': people[h.member_id]?.mobile || '',
    Due: n2(h.expected_amount),
    Received: n2(h.amount_received),
    Difference: n2(Number(h.expected_amount) - Number(h.amount_received)),
    'Received By': nameOf(people[h.received_by]),
    Note: h.note || '',
  }));

  const transfers = data.transfers || [];
  const memberRows = profiles.map((p) => {
    const mine = valid.filter((d) => d.collected_by === p.id);
    const mCash = sum(mine.filter((d) => d.payment_mode === 'cash'));
    const mUpi = sum(mine.filter((d) => d.payment_mode === 'upi'));
    const mExp = sum(approved.filter((e) => e.paid_by === p.id && !e.settled_mode));    // set off against collections
    const mBack = sum(approved.filter((e) => e.paid_by === p.id && e.settled_mode));    // paid back by the admin (not deducted)
    const mGiven = sum(handovers.filter((h) => h.member_id === p.id), (h) => h.amount_received);
    return {
      Member: p.full_name || '', 'Name (Telugu)': p.name_te || '', Mobile: p.mobile || '',
      Role: p.role === 'admin' ? 'Admin' : 'Member', Receipts: mine.length,
      'Cash Collected': mCash, 'UPI Collected': mUpi, 'Total Collected': n2(mCash + mUpi),
      'Expenses Set Off': mExp, 'Expenses Paid Back': mBack, 'Cash Handed Over': mGiven, 'Cash Balance': n2(mCash - mExp - mGiven),
    };
  }).filter((r) => r.Receipts || r['Expenses Set Off'] || r['Expenses Paid Back'] || r['Cash Handed Over']);

  const dayMap = new Map();
  const dayRow = (k) => {
    if (!dayMap.has(k)) dayMap.set(k, { k, Receipts: 0, Cash: 0, UPI: 0, Exp: 0 });
    return dayMap.get(k);
  };
  valid.forEach((d) => { const r = dayRow(istDate(d.collected_at)); r.Receipts++; r[d.payment_mode === 'upi' ? 'UPI' : 'Cash'] += Number(d.amount); });
  approved.forEach((e) => { dayRow(e.expense_date).Exp += Number(e.amount); });
  const dayRows = [...dayMap.values()].sort((a, b) => a.k.localeCompare(b.k)).map((r) => ({
    Date: dayCell(r.k), Day: weekday(r.k), Receipts: r.Receipts, Cash: n2(r.Cash), UPI: n2(r.UPI),
    'Total Donations': n2(r.Cash + r.UPI), 'Expenses (approved)': n2(r.Exp), 'Net For The Day': n2(r.Cash + r.UPI - r.Exp),
  }));

  const programRows = programs.map((p) => ({
    Date: dayCell(p.program_date), Day: weekday(p.program_date), Start: clock(p.start_time), End: clock(p.end_time),
    'Program (Telugu)': p.title_te || '', 'Program (English)': p.title_en || '',
    'Place (Telugu)': p.place_te || '', 'Place (English)': p.place || '', 'Details (Telugu)': p.details_te || '', 'Details (English)': p.details || '',
  }));
  const dayInfoRows = days.map((d) => ({
    Date: dayCell(d.day_date), Day: weekday(d.day_date), 'Alankaram (Telugu)': d.alankaram_te || '', 'Alankaram (English)': d.alankaram_en || '',
    'Note (Telugu)': d.note_te || '', 'Note (English)': d.note_en || '',
  }));

  const pujaRows = pujas.map((p) => ({   // Telugu columns: database version 6 (empty before)
    Date: dayCell(p.puja_date), Day: weekday(p.puja_date), Time: clock(p.puja_time),
    'Puja (Telugu)': p.puja_name_te || '', 'Puja (English)': p.puja_name || '',
    'Family (Telugu)': p.family_name_te || '', 'Family (English)': p.family_name || '',
    Status: String(p.family_name || '').trim() || String(p.family_name_te || '').trim() ? 'Reserved' : 'Available',
    'Village (Telugu)': p.village_te || '', 'Village (English)': p.village || '',
    'Gotram (Telugu)': p.gotram_te || '', 'Gotram (English)': p.gotram || '', Mobile: p.mobile || '', Note: p.note || '',
  }));

  const cats = new Map();
  approved.forEach((e) => {
    const k = e.category_en || e.category_te || 'Other';
    const c = cats.get(k) || { n: 0, s: 0 };
    c.n++; c.s += Number(e.amount); cats.set(k, c);
  });
  const both = (te, en) => [en, te].filter(Boolean).join(' / ');
  // Version 8 – net position = cash in hand + cash at bank − what the committee owes members
  const deposits = transfers.filter((x) => x.kind === 'deposit');
  const withdrawals = transfers.filter((x) => x.kind === 'withdrawal');
  const committeeCashExp = approved.filter((e) => !e.paid_by && e.payment_mode === 'cash');
  const committeeUpiExp = approved.filter((e) => !e.paid_by && e.payment_mode === 'upi');
  const setOff = approved.filter((e) => e.paid_by && !e.settled_mode);
  const backCash = approved.filter((e) => e.settled_mode === 'cash');
  const backUpi = approved.filter((e) => e.settled_mode === 'upi');
  const memberBal = memberRows.filter((r) => r.Role !== 'Admin').map((r) => r['Cash Balance']);
  const withMembers = n2(memberBal.reduce((a, b) => a + Math.max(b, 0), 0));
  const owed = n2(memberBal.reduce((a, b) => a + Math.max(-b, 0), 0));
  const bankBal = n2(sum(upi) - sum(committeeUpiExp) - sum(backUpi) + sum(deposits) - sum(withdrawals));
  const cashInHand = n2(sum(cash) - sum(committeeCashExp) - sum(setOff) - sum(backCash) - sum(deposits) + sum(withdrawals) + owed);
  const cashBankRows = [
    ['CASH IN HAND (with committee + with members)', '', cashInHand],
    ['      With the committee (admin)', '', n2(cashInHand - withMembers)],
    ['      Still with members', '', withMembers],
    ['CASH AT BANK', '', bankBal],
    ...(owed > 0 ? [['Committee owes members (they spent their own money)', '', owed]] : []),
    ['Cash deposited into bank', deposits.length, sum(deposits)],
    ['Cash withdrawn from bank', withdrawals.length, sum(withdrawals)],
  ];

  const summary = [
    ['Temple', both(settings.temple_name_te, settings.temple_name_en)],
    ['Committee', both(settings.committee_name_te, settings.committee_name_en)],
    ['Village', both(settings.village_te, settings.village_en)],
    ['Festival', both(settings.event_title_te, settings.event_title_en)],
    ['Records of', year ? String(year) : 'All years'],
    ['Exported on', fmtDateTime(new Date(), 'en')],
    ['Exported by', exportedBy || ''],
    [],
    ['Item', 'Count', 'Amount (₹)'],
    ['Donations – valid', valid.length, sum(valid)],
    ['      Cash', cash.length, sum(cash)],
    ['      UPI', upi.length, sum(upi)],
    ['Donations – cancelled', cancelled.length, sum(cancelled)],
    ['Expenses – approved', approved.length, sum(approved)],
    ['Expenses – waiting for approval', pending.length, sum(pending)],
    ['Expenses – rejected', rejected.length, sum(rejected)],
    ['NET POSITION (valid donations − approved expenses)', '', n2(sum(valid) - sum(approved))],
    ...cashBankRows,
    ['Cash handed over to admin', handovers.length, sum(handovers, (h) => h.amount_received)],
    ['Member expenses paid back – cash', approved.filter((e) => e.settled_mode === 'cash').length, sum(approved.filter((e) => e.settled_mode === 'cash'))],
    ['Member expenses paid back – temple UPI', approved.filter((e) => e.settled_mode === 'upi').length, sum(approved.filter((e) => e.settled_mode === 'upi'))],
    ['Puja schedule – days reserved / entries', `${pujaRows.filter((r) => r.Status === 'Reserved').length} / ${pujaRows.length}`, ''],
    [],
    ['Approved expenses by category', 'Count', 'Amount (₹)'],
    ...[...cats.entries()].sort((a, b) => b[1].s - a[1].s).map(([k, c]) => [k, c.n, n2(c.s)]),
    [],
    ['Sheets in this file: Summary, Donations, Expenses, Cash handovers, Cash & Bank, Members, Day-wise, Programs, Alankaram, Puja schedule'],
    ['Bill photos: Settings → Export data → "Bill photos (ZIP)". The "Bill File" column in Expenses matches the file names.'],
  ];

  return [
    { name: 'Summary', aoa: summary, cols: [52, 40, 16], money: [2] },
    { name: 'Donations', rows: donationRows, money: ['Amount'], filter: true },
    { name: 'Expenses', rows: expenseRows, money: ['Amount'], filter: true },
    { name: 'Cash handovers', rows: handoverRows, money: ['Due', 'Received', 'Difference'], filter: true },
    { name: 'Cash & Bank', rows: transferRows(transfers, dayCell), money: ['Amount', 'Cash In Hand', 'Cash At Bank'], filter: true },
    { name: 'Members', rows: memberRows, money: ['Cash Collected', 'UPI Collected', 'Total Collected', 'Expenses Set Off', 'Expenses Paid Back', 'Cash Handed Over', 'Cash Balance'], filter: true },
    { name: 'Day-wise', rows: dayRows, money: ['Cash', 'UPI', 'Total Donations', 'Expenses (approved)', 'Net For The Day'] },
    { name: 'Programs', rows: programRows, filter: true },
    { name: 'Alankaram', rows: dayInfoRows },
    { name: 'Puja schedule', rows: pujaRows, filter: true },
  ];
}

/** Download the Excel backup of one year (y = null → all years). */
export async function exportYear(y, ctx) {
  const data = await fetchYear(y);
  const fileName = `${filePrefix(ctx.settings, y)}-records-${todayIST()}.xlsx`;
  await exportSheets(fileName, buildSheets(data, { ...ctx, year: y }));
  const details = { file: fileName, donations: data.donations.length, expenses: data.expenses.length, handovers: data.handovers.length, programs: data.programs.length, pujas: (data.pujas || []).length, transfers: (data.transfers || []).length };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ at: new Date().toISOString(), entity_id: y ? String(y) : 'all', ...details })); } catch { /* private mode */ }
  await supabase.rpc('log_data_export', { p_year: y || null, p_details: details }).then(() => {}, () => {}); // older database: skip
  return details;
}

/** Latest export (server history, or this device if the database is not updated yet). */
export async function lastExport() {
  let server = null;
  const { data } = await supabase.from('audit_log').select('at, entity_id, actor, details').eq('action', 'data_exported').order('at', { ascending: false }).limit(1);
  if (data?.[0]) server = data[0];
  let local = null;
  try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { /* ignore */ }
  if (server && local) return Date.parse(server.at) >= Date.parse(local.at) ? server : local;
  return server || local;
}

/** For each year: was it exported after its last change? */
export async function exportStatus(years) {
  const { data: logs } = await supabase.from('audit_log').select('at, entity_id').eq('action', 'data_exported').order('at', { ascending: false }).limit(300);
  let local = null;
  try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'); } catch { /* ignore */ }
  const all = [...(logs || []), ...(local ? [local] : [])];
  const latest = (pred) => all.filter(pred).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
  return Promise.all(years.map(async (y) => {
    const last = latest((l) => l.entity_id === String(y) || l.entity_id === 'all');
    const changed = await lastChange(y);
    return { year: y, last, changed, ok: !!last && (!changed || Date.parse(last.at) >= Date.parse(changed)) };
  }));
}
async function lastChange(y) {
  const q = async (table, col, filterCol, kind) => {
    const { data } = await byYear(supabase.from(table).select(col), filterCol, y, kind).order(col, { ascending: false }).limit(1);
    return data?.[0]?.[col] || null;
  };
  const v = await Promise.all([
    q('donations', 'updated_at', 'collected_at', 'ts'),
    q('expenses', 'updated_at', 'expense_date', 'date'),
    q('handovers', 'received_at', 'received_at', 'ts'),
    q('programs', 'created_at', 'program_date', 'date'),
    q('pujas', 'updated_at', 'puja_date', 'date'),   // null (no error thrown) before the version 5 update
    q('cash_transfers', 'updated_at', 'transfer_date', 'date'),   // null before the version 8 update
  ]);
  return v.filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b)).pop() || null;
}

/** Download every bill photo of a year as one ZIP. */
export async function downloadBillsZip(y, settings, onProgress) {
  const exps = await fetchAll(() => byYear(
    supabase.from('expenses').select('id,expense_date,amount,category_en,category_te,description,bill_path,created_at').not('bill_path', 'is', null).neq('bill_path', ''),
    'expense_date', y, 'date').order('expense_date').order('id'));
  const files = [];
  let missing = 0, done = 0, next = 0;
  const worker = async () => {
    while (next < exps.length) {
      const e = exps[next++];
      const { data, error } = await supabase.storage.from('bills').download(e.bill_path);
      if (error || !data) missing++;
      else files.push({ name: billFileName(e), data: new Uint8Array(await data.arrayBuffer()), date: new Date(e.created_at) });
      onProgress?.(++done, exps.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  files.sort((a, b) => a.name.localeCompare(b.name));
  if (files.length) saveBlob(makeZip(files), `${filePrefix(settings, y)}-bill-photos-${todayIST()}.zip`);
  return { count: files.length, missing, total: exps.length };
}

/** Everything step 1 of "Delete data" shows. */
export async function deletePreview() {
  const head = (q) => q.then(({ count, error }) => { if (error) throw error; return count || 0; });
  const [counts, history, members, pending, balances, dash, years] = await Promise.all([
    countYear(null),
    head(supabase.from('audit_log').select('*', { count: 'exact', head: true })),
    head(supabase.from('profiles').select('*', { count: 'exact', head: true }).neq('role', 'admin')),
    head(supabase.from('expenses').select('*', { count: 'exact', head: true }).eq('status', 'pending')),
    supabase.rpc('get_member_balances'),
    supabase.rpc('get_dashboard'),
    listDataYears(),
  ]);
  const cash = (balances.data || []).filter((b) => b.role !== 'admin' && Number(b.balance) > 0);
  const status = await exportStatus(years);
  return {
    counts, history, members, pending, cash, status,
    donationsTotal: Number(dash.data?.donations_total || 0), expensesTotal: Number(dash.data?.expenses_total || 0),
  };
}

/** Bill photo files in storage: the given paths + anything else in the bucket (older replaced photos). */
export async function removeBillFiles(paths = []) {
  const all = new Set(paths.filter(Boolean));
  try {
    const { data: top, error } = await supabase.storage.from('bills').list('', { limit: 1000 });
    if (!error) {
      for (const it of top || []) {
        if (it.id) { all.add(it.name); continue; }          // a file at the top level
        for (let offset = 0; ; offset += 1000) {             // a folder (one per member)
          const { data: files, error: e2 } = await supabase.storage.from('bills').list(it.name, { limit: 1000, offset });
          if (e2) break;
          (files || []).forEach((f) => f.id && all.add(`${it.name}/${f.name}`));
          if (!files || files.length < 1000) break;
        }
      }
    }
  } catch { /* listing is best-effort; the known paths are still removed */ }
  const list = [...all];
  let removed = 0, failed = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const { data, error } = await supabase.storage.from('bills').remove(chunk);
    if (error) failed += chunk.length; else removed += (data || []).length;
  }
  return { removed, failed, total: list.length };
}

/** Server-side delete (checks the word DELETE + the admin password), then the bill photo files. */
export async function deleteAllData(password, word, removeMembers) {
  const { data, error } = await supabase.rpc('admin_delete_all_data', { p_password: password, p_confirm: word, p_remove_members: !!removeMembers });
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) throw new Error('db_update_needed');
    throw error;
  }
  if (!data?.ok) return data || { ok: false, error: 'unknown' };
  const bills = await removeBillFiles(data.bill_paths || []);
  return { ...data, bills };
}

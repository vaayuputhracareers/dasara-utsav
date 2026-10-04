import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, fetchAll } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { compressImage } from '../lib/image.js';
import { exportSheets } from '../lib/exportXlsx.js';
import { inr, fmtDay, fmtDateTime, todayIST, personName } from '../lib/format.js';
import { Page, Spinner, Empty, Modal, Field, Seg, Badge, useToast } from '../components/ui.jsx';
import { SettleBadge, settleStatus, PayBackModal, useMemberBalance, useMemberCash, balText, modeLabel } from '../components/Settle.jsx';
import { settlementLabel } from '../lib/settle.js';

export const EXPENSE_SELECT = '*, creator:profiles!expenses_created_by_fkey(id,full_name,name_te), payer:profiles!expenses_paid_by_fkey(id,full_name,name_te)';

export function expenseRows(list) {
  return list.map((e) => ({
    Date: e.expense_date,
    Category: e.category_en || e.category_te || '',
    'Category (Telugu)': e.category_te || '',
    Description: e.description || '',
    'Paid To': e.paid_to || '',
    Amount: Number(e.amount),
    Mode: e.payment_mode === 'upi' ? 'UPI' : 'Cash',
    'Paid From': e.payer ? `Cash with ${e.payer.full_name}` : 'Committee funds',
    'Recorded By': e.creator ? e.creator.full_name : '',
    Status: e.status,
    Settlement: settlementLabel(e),
    'Paid Back On': e.settled_at ? fmtDateTime(e.settled_at, 'en') : '',
    'Paid Back Ref': e.settled_ref || '',
    'Review Note': e.review_note || '',
    'Bill Photo': e.bill_path ? 'Yes' : 'No',
  }));
}

function StatusBadge({ s }) {
  const { t } = useLang();
  if (s === 'approved') return <Badge tone="green">{t('approved')}</Badge>;
  if (s === 'rejected') return <Badge tone="red">{t('rejected')}</Badge>;
  return <Badge tone="orange">{t('pending')}</Badge>;
}

export function ExpenseForm({ open, onClose, onSaved, edit }) {
  const { t, P, lang } = useLang();
  const { isAdmin, profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const cats = Array.isArray(settings.expense_categories) ? settings.expense_categories : [];
  const fileRef = useRef(null);
  const [members, setMembers] = useState([]);
  const [f, setF] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      const ci = cats.findIndex((c) => c.te === edit.category_te && c.en === edit.category_en);
      setF({ expense_date: edit.expense_date, cat: ci >= 0 ? String(ci) : '', description: edit.description || '', paid_to: edit.paid_to || '', amount: String(edit.amount), payment_mode: edit.payment_mode, paid_by: edit.paid_by || '' });
    } else {
      setF({ expense_date: todayIST(), cat: cats.length ? '0' : '', description: '', paid_to: '', amount: '', payment_mode: 'cash', paid_by: '' });
    }
    setPhoto(null); setErr('');
    if (isAdmin) {
      supabase.from('profiles').select('id,full_name,name_te,role,status').eq('status', 'active').order('full_name')
        .then(({ data }) => setMembers((data || []).filter((m) => m.id !== profile.id)));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setErr('');
    const amount = Number(f.amount);
    if (!(amount > 0)) return setErr(t('amount_invalid'));
    if (f.cat === '' && !f.description.trim()) return setErr(t('required') + ': ' + t('category'));
    setBusy(true);
    try {
      let bill_path = edit?.bill_path || null;
      if (photo) {
        const blob = await compressImage(photo);
        const path = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: upErr } = await supabase.storage.from('bills').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        bill_path = path;
      }
      const c = f.cat !== '' ? cats[Number(f.cat)] : null;
      const row = {
        expense_date: f.expense_date, category_te: c?.te || null, category_en: c?.en || null,
        description: f.description.trim() || null, paid_to: f.paid_to.trim() || null, amount,
        payment_mode: f.payment_mode, bill_path,
      };
      if (isAdmin) row.paid_by = f.paid_by || null;
      let error;
      if (edit) ({ error } = await supabase.from('expenses').update(row).eq('id', edit.id));
      else ({ error } = await supabase.from('expenses').insert({ ...row, created_by: profile.id }));
      if (error) throw error;
      toast(edit ? t('expense_updated') : isAdmin ? t('expense_saved') : t('expense_saved_pending'), 'success', 4000);
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(errMsg(e, t));
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={edit ? `✏️ ${t('nav_expense')}` : `🧾 ${t('new_expense')}`}>
      <div className="stack">
        <div className="grid2">
          <Field label={t('date')}><input type="date" className="input" value={f.expense_date} onChange={(e) => set('expense_date', e.target.value)} /></Field>
          <Field label={`${t('amount')} *`}><input className="input big" inputMode="decimal" placeholder="₹" value={f.amount} onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
        </div>
        <Field label={t('category')}>
          <select className="input" value={f.cat} onChange={(e) => set('cat', e.target.value)}>
            <option value="">— {t('choose')} —</option>
            {cats.map((c, i) => <option key={i} value={String(i)}>{P(c)}</option>)}
          </select>
        </Field>
        <Field label={t('description')} optional><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label={t('paid_to')} optional><input className="input" value={f.paid_to} onChange={(e) => set('paid_to', e.target.value)} /></Field>
        <Field label={t('payment_mode')} hint={isAdmin && !f.paid_by ? t('mode_from_hint') : undefined}><Seg value={f.payment_mode} onChange={(v) => set('payment_mode', v)} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: '📱 UPI' }]} /></Field>
        {isAdmin && (
          <Field label={t('paid_from')}>
            <select className="input" value={f.paid_by} onChange={(e) => set('paid_by', e.target.value)}>
              <option value="">{t('committee_funds')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{t('member_cash_of', { name: personName(m, lang) })}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('bill_photo')} optional>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          {photo ? (
            <div className="stack tight">
              <img className="photo-prev" src={photoUrl} alt="" />
              <button type="button" className="btn ghost sm" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }}>{t('remove_photo')}</button>
            </div>
          ) : (
            <button type="button" className="btn ghost block" onClick={() => fileRef.current?.click()}>{edit?.bill_path ? '📷 ✓ ' : ''}{t('take_photo')}</button>
          )}
        </Field>
        {!isAdmin && <div className="alert info">ℹ️ {t('member_expense_note')}</div>}
        {err && <div className="alert err">{err}</div>}
        <button className="btn primary block" disabled={busy} onClick={save}>{busy ? (photo ? t('uploading_photo') : t('saving')) : t('save')}</button>
      </div>
    </Modal>
  );
}

// The member's cash right now, and what approving this expense does to it (shown to the admin).
function MemberCashBox({ cash, name, amount, effect }) {
  const { t } = useLang();
  if (!cash) return <div className="cash-box"><Spinner sm /></div>;
  if (cash.error) return <div className="cash-box neg"><div className="lbl">💵 {t('member_cash_title', { name })}</div><div className="hint">{t('member_cash_error')}</div></div>;
  const bal = Number(cash.balance || 0);
  const after = bal - Number(amount || 0);
  return (
    <div className={`cash-box ${bal < 0 ? 'neg' : ''}`} data-testid="member-cash">
      <div className="lbl">💵 {t('member_cash_title', { name })}</div>
      <div className="big num" data-testid="member-cash-amount">{bal < 0 ? `−${inr(-bal)}` : inr(bal)}</div>
      {bal < 0 && <div className="warn-t">{t('member_cash_owed', { name, amount: inr(-bal) })}</div>}
      <div className="hint num">{t('member_cash_calc', { c: inr(cash.cash_collected), s: inr(cash.expenses_approved), h: inr(cash.handed_over) })}</div>
      {effect === 'setoff' && (
        <>
          <div className="after num" data-testid="member-cash-after">{t('member_cash_after_setoff', { amount: after < 0 ? `−${inr(-after)}` : inr(after) })}</div>
          {after < 0 && <div className="warn-t">{t('member_cash_short', { name, amount: inr(-after) })}</div>}
        </>
      )}
      {effect && effect !== 'setoff' && <div className="after num" data-testid="member-cash-after">{t('member_cash_after_payback', { amount: bal < 0 ? `−${inr(-bal)}` : inr(bal) })}</div>}
    </div>
  );
}

function ExpenseDetail({ e, onClose, onChanged, onEdit }) {
  const { t, lang, P } = useLang();
  const { isAdmin, profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [billUrl, setBillUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const v7 = 'members_see_finance' in settings;   // database version 7: pay back member expenses
  const memberExp = v7 && !!e?.paid_by;
  const [settle, setSettle] = useState('setoff');   // pending: 'setoff' | 'cash' | 'upi'
  const [ref, setRef] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  // whose cash the admin should see: the member who paid, else the member who submitted it (never yourself)
  const cashOf = e?.paid_by || (e?.created_by && e.created_by !== profile?.id ? e.created_by : null);
  const cashFor = e?.paid_by ? e.payer : e?.creator;
  const cash = useMemberCash(cashOf, isAdmin && !!cashOf && cashOf !== profile?.id && e?.status !== 'rejected');
  const bal = memberExp && !e?.settled_mode && cash ? Number(cash.balance) : null;
  const payer = e ? personName(e.payer, lang) : '';
  useEffect(() => {
    setBillUrl('');
    if (e?.bill_path) supabase.storage.from('bills').createSignedUrl(e.bill_path, 3600).then(({ data }) => setBillUrl(data?.signedUrl || ''));
  }, [e]);
  if (!e) return null;
  const review = async (approve) => {
    setBusy(true);
    const { error } = await supabase.rpc('review_expense', { p_id: e.id, p_approve: approve, p_note: note });
    if (error) { setBusy(false); return toast(errMsg(error, t), 'error'); }
    if (approve && memberExp && settle !== 'setoff') {   // approve + pay back in one go
      const r2 = await supabase.rpc('settle_expense', { p_id: e.id, p_mode: settle, p_ref: ref });
      setBusy(false);
      if (r2.error) { toast(`${t('approved')} ✅ · ${errMsg(r2.error, t)}`, 'error', 7000); onChanged?.(); onClose(); return; }
      toast(t('approved_paid_back', { name: payer, mode: modeLabel(settle, t) }), 'success', 5000);
      onChanged?.(); onClose(); return;
    }
    setBusy(false);
    toast(approve ? t('approved') + ' ✅' : t('rejected'), 'success');
    onChanged?.(); onClose();
  };
  const undo = async () => {
    if (!window.confirm(t('payback_undo_confirm', { name: payer, amount: inr(e.amount) }))) return;
    setBusy(true);
    const { error } = await supabase.rpc('settle_expense', { p_id: e.id, p_mode: null, p_ref: null });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    toast(t('payback_undone'), 'success');
    onChanged?.(); onClose();
  };
  const mine = !isAdmin || e.paid_by === profile.id;
  return (
    <>
    <Modal open={!!e} onClose={onClose} title={`🧾 ${P({ te: e.category_te, en: e.category_en }) || t('nav_expense')}`}>
      <div className="stack">
        <div className="row between">
          <div className="num" style={{ fontSize: 26, fontWeight: 900, color: 'var(--kumkum)' }}>{inr(e.amount)}</div>
          <StatusBadge s={e.status} />
        </div>
        {isAdmin && cashOf && cashOf !== profile?.id && e.status !== 'rejected' && (
          <MemberCashBox cash={cash} name={personName(cashFor, lang)} amount={e.amount}
            effect={e.status === 'pending' && memberExp ? settle : null} />
        )}
        <dl className="kv">
          <dt>{t('date')}</dt><dd>{fmtDay(e.expense_date, lang, true)}</dd>
          {e.description && <><dt>{t('description')}</dt><dd>{e.description}</dd></>}
          {e.paid_to && <><dt>{t('paid_to')}</dt><dd>{e.paid_to}</dd></>}
          <dt>{t('payment_mode')}</dt><dd>{e.payment_mode === 'upi' ? 'UPI' : t('cash')}</dd>
          <dt>{t('paid_from')}</dt><dd>{e.payer ? t('member_cash_of', { name: personName(e.payer, lang) }) : e.payment_mode === 'upi' ? t('committee_bank') : t('committee_funds')}</dd>
          <dt>{t('submitted_by')}</dt><dd>{personName(e.creator, lang)} · {fmtDateTime(e.created_at, lang)}</dd>
          {e.review_note && <><dt>{t('note')}</dt><dd>{e.review_note}</dd></>}
          {memberExp && e.status === 'approved' && (
            <><dt>{t('settlement')}</dt><dd data-testid="settle-status">{settleStatus(e, t, lang, mine)}{e.settled_ref ? <><br /><span className="hint">📝 {e.settled_ref}</span></> : null}</dd></>
          )}
        </dl>
        {e.bill_path ? (billUrl ? <a href={billUrl} target="_blank" rel="noopener noreferrer"><img className="photo-prev" src={billUrl} alt="bill" /></a> : <Spinner sm />) : <div className="hint">{t('no_bill')}</div>}
        {isAdmin && e.status === 'pending' && (
          <div className="stack tight" style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
            {memberExp && (
              <div className="settle-box" data-testid="settle-choice">
                <div className="card-title" style={{ marginBottom: 6 }}>{t('settle_title', { name: payer })}</div>
                {cash && !cash.error && (
                  <div className={`settle-cash num ${Number(cash.balance) < 0 ? 'neg' : ''}`} data-testid="settle-cash">
                    💵 {t('settle_cash_line', { name: payer, amount: Number(cash.balance) < 0 ? `−${inr(-Number(cash.balance))}` : inr(cash.balance) })}
                  </div>
                )}
                <Seg value={settle === 'setoff' ? 'setoff' : 'payback'} onChange={(v) => setSettle(v === 'setoff' ? 'setoff' : 'cash')}
                  options={[{ value: 'setoff', label: t('settle_setoff') }, { value: 'payback', label: t('settle_payback') }]} />
                {settle === 'setoff' ? (
                  <p className="hint" data-testid="settle-hint">{t('settle_setoff_hint', { name: payer })}{bal != null ? ` ${t('balance_effect', { name: payer, from: balText(bal, t), to: balText(bal - Number(e.amount), t) })}` : ''}</p>
                ) : (
                  <>
                    <Seg value={settle} onChange={setSettle} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: `📱 ${t('temple_upi')}` }]} />
                    <input className="input" value={ref} placeholder={settle === 'upi' ? t('payback_ref_upi') : t('payback_ref_cash')} onChange={(ev) => setRef(ev.target.value)} data-testid="settle-ref" />
                    <p className="hint" data-testid="settle-hint">{t('settle_payback_hint', { name: payer })}{bal != null ? ` ${t('balance_stays', { name: payer, bal: balText(bal, t) })}` : ''}</p>
                  </>
                )}
              </div>
            )}
            <Field label={t('review_note')}><input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} /></Field>
            <div className="grid2">
              <button className="btn ghost danger-t" disabled={busy} onClick={() => review(false)}>{t('reject')}</button>
              <button className="btn ok" disabled={busy} onClick={() => review(true)}>{t('approve')}</button>
            </div>
          </div>
        )}
        {isAdmin && memberExp && e.status === 'approved' && !e.settled_mode && !e.handover_id && (
          <button className="btn ok block" disabled={busy} onClick={() => setPayOpen(true)} data-testid="payback-open">{t('payback_btn', { name: payer })}</button>
        )}
        {isAdmin && memberExp && e.settled_mode && (
          <button className="btn ghost sm" disabled={busy} onClick={undo} data-testid="payback-undo">{t('payback_undo')}</button>
        )}
        {isAdmin && e.status !== 'rejected' && !e.handover_id && !e.settled_mode && (
          <button className="btn ghost sm" onClick={() => onEdit(e)}>✏️ {t('edit')}</button>
        )}
      </div>
    </Modal>
    {payOpen && <PayBackModal expense={e} balance={bal} onClose={() => setPayOpen(false)} onDone={() => { onChanged?.(); onClose(); }} />}
    </>
  );
}

export default function Expenses() {
  const { t, lang, P } = useLang();
  const { isAdmin, profile } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(isAdmin ? 'pending' : 'all');
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);

  const { data, loading, reload } = useAsync(() => fetchAll(() => {
    let qb = supabase.from('expenses').select(EXPENSE_SELECT).order('expense_date', { ascending: false }).order('created_at', { ascending: false });
    if (!isAdmin) qb = qb.or(`created_by.eq.${profile.id},paid_by.eq.${profile.id}`);
    return qb;
  }), [isAdmin, profile.id]);

  useEffect(() => { if (isAdmin && data && tab === 'pending' && !data.some((e) => e.status === 'pending')) setTab('approved'); }, [data]); // eslint-disable-line
  // admin: each member's cash right now, shown on pending expenses (refreshed with the list)
  const { data: cashNow } = useAsync(async () => {
    if (!isAdmin) return {};
    const { data: rows, error } = await supabase.rpc('get_member_balances');
    if (error) return {};
    return Object.fromEntries((rows || []).map((m) => [m.member_id, Number(m.balance || 0)]));
  }, [isAdmin, data]);
  const counts = useMemo(() => ({ pending: (data || []).filter((e) => e.status === 'pending').length }), [data]);
  const list = useMemo(() => (data || []).filter((e) => tab === 'all' || e.status === tab), [data, tab]);
  const total = list.reduce((a, e) => a + Number(e.amount), 0);
  const closeForm = () => { setFormOpen(false); setEdit(null); if (params.get('new')) setParams({}, { replace: true }); };

  const doExport = async () => {
    try { await exportSheets(`expenses-${todayIST()}.xlsx`, [{ name: 'Expenses', rows: expenseRows(list) }]); }
    catch (e) { toast(String(e.message || e), 'error'); }
  };

  return (
    <Page title={isAdmin ? t('nav_expenses') : t('my_expenses')} wide
      right={<div className="row">{isAdmin && <button className="tb-btn" onClick={doExport}>{t('export_excel')}</button>}<button className="tb-btn" onClick={() => setFormOpen(true)}>➕</button></div>}>
      <button className="btn primary block" onClick={() => setFormOpen(true)}>{t('add_expense_btn')}</button>
      <div className="tabs">
        {(isAdmin ? ['pending', 'approved', 'rejected', 'all'] : ['all', 'pending', 'approved', 'rejected']).map((k) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {t(k)}{k === 'pending' && counts.pending > 0 && <span className="cnt">{counts.pending}</span>}
          </button>
        ))}
      </div>
      <div className="summary-bar num"><span>{t('bills_n', { n: list.length })}</span><span>{inr(total)}</span></div>
      <div className="card">
        {loading && !data ? <Spinner /> : list.length === 0 ? <Empty icon="🧾" text={t('nothing_here')} /> : (
          <div className="list">
            {list.map((e) => (
              <div key={e.id} className="li" onClick={() => setOpen(e)}>
                <div className="grow">
                  <div className="main-t">{P({ te: e.category_te, en: e.category_en }) || e.description || '—'}</div>
                  <div className="sub-t">{fmtDay(e.expense_date, lang)}{e.description && (e.category_te || e.category_en) ? ` · ${e.description}` : ''}{e.paid_to ? ` · ${e.paid_to}` : ''}</div>
                  <div style={{ marginTop: 3 }}>
                    <StatusBadge s={e.status} />
                    {isAdmin && <span className="badge grey">{personName(e.creator, lang)}</span>}
                    {e.payer && <span className="badge blue">💵 {personName(e.payer, lang)}{isAdmin && e.status === 'pending' && cashNow && cashNow[e.paid_by] !== undefined
                      ? ` · ${t('cash_now_x', { amount: cashNow[e.paid_by] < 0 ? `−${inr(-cashNow[e.paid_by])}` : inr(cashNow[e.paid_by]) })}` : ''}</span>}
                    <SettleBadge e={e} />
                    {e.bill_path && <span className="badge grey">📷</span>}
                  </div>
                </div>
                <div className="amt" style={{ color: 'var(--kumkum)' }}>{inr(e.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ExpenseForm open={formOpen || !!edit} edit={edit} onClose={closeForm} onSaved={() => reload(true)} />
      {open && <ExpenseDetail e={open} onClose={() => setOpen(null)} onChanged={() => reload(true)} onEdit={(e) => { setOpen(null); setEdit(e); }} />}
    </Page>
  );
}

import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, fmtDateTime, fmtTime, fmtDate, fmtDay, personName } from '../lib/format.js';
import { Page, Spinner, Empty, Modal, Field, useToast, Seg } from '../components/ui.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { PayBackModal } from '../components/Settle.jsx';

/** Version 7: a member's set-off expenses that are not in a cash handover yet – each can be paid back. */
function MemberExpenses({ member, onPay }) {
  const { t, lang, P } = useLang();
  const { data, loading } = useAsync(async () => {
    const { data: rows, error } = await supabase.from('expenses')
      .select('*, payer:profiles!expenses_paid_by_fkey(id,full_name,name_te)')
      .eq('paid_by', member.member_id).eq('status', 'approved').is('settled_mode', null).is('handover_id', null).order('expense_date');
    if (error) throw error;
    return rows;
  }, [member.member_id]);
  if (loading) return <Spinner sm />;
  return (
    <div className="list" style={{ marginTop: 6, background: '#f3f8f4', borderRadius: 10, padding: '0 8px' }} data-testid="member-expenses">
      {(data || []).map((e) => (
        <div key={e.id} className="li" style={{ cursor: 'default', padding: '7px 0' }}>
          <div className="grow"><div className="main-t" style={{ fontSize: 13 }}>{P({ te: e.category_te, en: e.category_en }) || e.description || '—'}</div><div className="sub-t">{fmtDay(e.expense_date, lang)}{e.description && (e.category_te || e.category_en) ? ` · ${e.description}` : ''}</div></div>
          <div className="amt" style={{ fontSize: 13, color: 'var(--kumkum)' }}>{inr(e.amount)}</div>
          <button className="btn ok xs" onClick={() => onPay(e)} data-testid="member-expense-payback">{t('payback_short')}</button>
        </div>
      ))}
    </div>
  );
}

function MemberReceipts({ memberId }) {
  const { lang } = useLang();
  const { data, loading } = useAsync(async () => {
    const { data: rows, error } = await supabase.from('donations').select('id,receipt_no,donor_name,amount,collected_at')
      .eq('collected_by', memberId).eq('status', 'active').eq('payment_mode', 'cash').is('handover_id', null).order('collected_at');
    if (error) throw error;
    return rows;
  }, [memberId]);
  if (loading) return <Spinner sm />;
  return (
    <div className="list" style={{ marginTop: 6, background: '#fbf7f1', borderRadius: 10, padding: '0 8px' }}>
      {(data || []).map((d) => (
        <div key={d.id} className="li" style={{ cursor: 'default', padding: '7px 0' }}>
          <div className="grow"><div className="main-t" style={{ fontSize: 13 }}>{d.donor_name}</div><div className="sub-t num">{d.receipt_no} · {fmtDate(d.collected_at, lang)} {fmtTime(d.collected_at)}</div></div>
          <div className="amt" style={{ fontSize: 13 }}>{inr(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Handover() {
  const { t, lang } = useLang();
  const { settings } = useSettings();
  const v7 = 'members_see_finance' in settings;
  const toast = useToast();
  const [expOpen, setExpOpen] = useState(null);
  const [pay, setPay] = useState(null);   // { expense, balance }
  const [confirm, setConfirm] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [mode, setMode] = useState('cash');   // version 14 – payment to a member: cash / temple UPI
  const [edit, setEdit] = useState(null);     // version 14 – edit an earlier entry

  const { data, loading, reload } = useAsync(async () => {
    const [b, h] = await Promise.all([
      supabase.rpc('get_member_balances'),
      supabase.from('handovers').select('*, member:profiles!handovers_member_id_fkey(full_name,name_te), receiver:profiles!handovers_received_by_fkey(full_name,name_te)').order('received_at', { ascending: false }).limit(60),
    ]);
    if (b.error) throw b.error;
    if (h.error) throw h.error;
    return { balances: b.data || [], history: h.data || [] };
  }, []);

  const balances = (data?.balances || []).filter((m) => m.role !== 'admin');
  const canPayBack = (m) => v7 && Number(m.setoff_open) > 0;
  const owing = balances.filter((m) => Number(m.balance) !== 0 || canPayBack(m));
  const settled = balances.filter((m) => Number(m.balance) === 0 && !canPayBack(m) && Number(m.cash_collected) > 0);
  const totalWith = balances.reduce((a, m) => a + Math.max(0, Number(m.balance)), 0);

  const open = (m) => { setConfirm(m); setAmount(String(Math.abs(Number(m.balance)))); setNote(''); setMode('cash'); };
  const due = confirm ? Number(confirm.balance) : 0;
  const entered = Number(amount || 0);
  const diff = Math.abs(due) - entered;

  const submit = async () => {
    if (!(entered > 0)) return toast(t('amount_invalid'), 'error');
    setBusy(true);
    const p_amount = due < 0 ? -entered : entered;
    const args = { p_member: confirm.member_id, p_amount, p_note: note };
    if (due < 0 && mode === 'upi') args.p_mode = 'upi';   // cash = as before (works on older databases too)
    const { error } = await supabase.rpc('confirm_handover', args);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 5000);
    toast(t('handover_done', { name: personName(confirm, lang), amount: inr(entered) }), 'success', 4500);
    setConfirm(null);
    reload(true);
  };

  // ---------- version 14: edit / delete an earlier entry (balances are worked out again) ----------
  const openEdit = (h) => setEdit({ row: h, out: Number(h.amount_received) < 0, amount: String(Math.abs(Number(h.amount_received))), mode: h.payment_mode === 'upi' ? 'upi' : 'cash', note: h.note || '' });
  const saveEdit = async () => {
    const v = Number(edit.amount || 0);
    if (!(v > 0)) return toast(t('amount_invalid'), 'error');
    setBusy(true);
    const { error } = await supabase.rpc('admin_update_handover', { p_id: edit.row.id, p_amount: edit.out ? -v : v, p_mode: edit.out ? edit.mode : null, p_note: edit.note });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    toast(t('handover_updated'), 'success');
    setEdit(null);
    reload(true);
  };
  const delHandover = async (h) => {
    const amt = inr(Math.abs(Number(h.amount_received)));
    const who = personName(h.member, lang);
    if (!window.confirm(Number(h.amount_received) < 0 ? t('handover_delete_confirm_out', { name: who, amount: amt }) : t('handover_delete_confirm_in', { name: who, amount: amt }))) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_delete_handover', { p_id: h.id });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    toast(t('fest_deleted'), 'success');
    setEdit(null);
    reload(true);
  };

  return (
    <Page title={`🤝 ${t('nav_handover')}`} back="/more" wide right={<button className="tb-btn" onClick={() => reload()}>{t('refresh')}</button>}>
      {loading && !data ? <Spinner /> : (
        <>
          <div className="card stat warn row between" style={{ display: 'flex' }}>
            <small style={{ fontSize: 13 }}>{t('total_cash_members')}</small><b style={{ fontSize: 24 }}>{inr(totalWith)}</b>
          </div>
          {owing.length === 0 && <div className="alert ok">{t('all_settled')}</div>}
          <div className="cols2">
            {owing.map((m) => {
              const bal = Number(m.balance);
              return (
                <div key={m.member_id} className="card">
                  <div className="row">
                    <div className="avatar sm">{(m.full_name || '?')[0].toUpperCase()}</div>
                    <div className="grow">
                      <div className="main-t" style={{ fontWeight: 800 }}>{personName(m, lang)}</div>
                      <div className="sub-t num" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.mobile} · {t('receipts_n', { n: m.unsettled_count })}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="num" style={{ fontSize: 19, fontWeight: 900, color: bal > 0 ? '#c2410c' : 'var(--green)' }}>{inr(Math.abs(bal))}</div>
                      {bal < 0 && <div className="badge green">{t('committee_owes')}</div>}
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 11.5, background: '#fbf5ec', borderRadius: 8, padding: '6px 8px', marginTop: 8, color: '#6b4f3a' }}>
                    {t('breakdown', { cash: inr(m.cash_collected), exp: inr(m.expenses_approved), ho: inr(m.handed_over) })}
                    {Number(m.paid_back) > 0 && <div data-testid="paid-back-line">{t('paid_back_line', { amount: inr(m.paid_back) })}</div>}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    {Number(m.unsettled_count) > 0 && (
                      <button className="btn ghost sm" onClick={() => setExpanded(expanded === m.member_id ? null : m.member_id)}>{expanded === m.member_id ? t('hide_receipts') : t('show_receipts')}</button>
                    )}
                    {v7 && Number(m.setoff_open) > 0 && (
                      <button className="btn ghost sm" onClick={() => setExpOpen(expOpen === m.member_id ? null : m.member_id)} data-testid="member-expenses-toggle">{t('expenses_n_btn', { n: m.setoff_open })}</button>
                    )}
                    {bal !== 0 && <button className={`btn ${bal > 0 ? 'ok' : 'ghost'} sm grow`} onClick={() => open(m)}>{bal > 0 ? t('confirm_received') : t('pay_member')}</button>}
                  </div>
                  {expanded === m.member_id && <MemberReceipts memberId={m.member_id} />}
                  {expOpen === m.member_id && <MemberExpenses member={m} onPay={(e) => setPay({ expense: e, balance: bal })} />}
                </div>
              );
            })}
          </div>
          {settled.length > 0 && (
            <div className="card">
              <div className="card-title">✅ {t('all_handed_over')}</div>
              <div className="chips">{settled.map((m) => <span key={m.member_id} className="chip tag">{personName(m, lang)}</span>)}</div>
            </div>
          )}
          <div className="section-title">{t('history')}</div>
          <div className="card">
            {!data?.history?.length ? <Empty icon="🤝" text={t('no_handovers')} /> : (
              <div className="list">
                {data.history.map((h) => {
                  const df = Number(h.expected_amount) - Number(h.amount_received);
                  return (
                    <div key={h.id} className="li" style={{ cursor: 'default' }}>
                      <div className="grow">
                        <div className="main-t">{personName(h.member, lang)}</div>
                        <div className="sub-t num">{fmtDateTime(h.received_at, lang)} · {t('received_by', { name: personName(h.receiver, lang) })}</div>
                        {h.note && <div className="sub-t">📝 {h.note}</div>}
                        {df !== 0 && <span className={`badge ${df > 0 ? 'orange' : 'blue'} num`}>{t('expected_x', { amount: inr(h.expected_amount) })}</span>}
                        {Number(h.amount_received) < 0 && <span className="badge blue" data-testid="handover-mode">{t('paid_to_member_badge', { mode: h.payment_mode === 'upi' ? `📱 ${t('temple_upi')}` : `💵 ${t('cash')}` })}</span>}
                        <div className="row" style={{ gap: 8, marginTop: 6 }}>
                          <button type="button" className="btn ghost xs" disabled={busy} onClick={() => openEdit(h)} data-testid="handover-edit">✏️ {t('edit')}</button>
                          <button type="button" className="btn ghost xs danger-t" disabled={busy} onClick={() => delHandover(h)} data-testid="handover-delete">🗑️ {t('delete')}</button>
                        </div>
                      </div>
                      <div className="amt" style={{ color: 'var(--green)' }}>{inr(h.amount_received)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `🤝 ${personName(confirm, lang)}` : ''}>
        {confirm && (
          <div className="stack">
            <div className="card stat warn"><small>{due < 0 ? t('committee_owes') : t('amount_due')}</small><b>{inr(Math.abs(due))}</b><em className="num">{t('breakdown', { cash: inr(confirm.cash_collected), exp: inr(confirm.expenses_approved), ho: inr(confirm.handed_over) })}</em></div>
            <Field label={due < 0 ? t('amount_paid_to', { name: personName(confirm, lang) }) : t('amount_received')}><input className="input big" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus /></Field>
            {due < 0 && <Field label={t('pay_mode_l')}><Seg value={mode} onChange={setMode} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: `📱 ${t('temple_upi')}` }]} /></Field>}
            {entered > 0 && diff > 0 && <div className="alert warn">{t('short_by', { amount: inr(diff) })}</div>}
            {entered > 0 && diff < 0 && <div className="alert info">{t('extra_by', { amount: inr(-diff) })}</div>}
            <Field label={t('note')} optional><input className="input" value={note} placeholder={t('handover_note_ph')} onChange={(e) => setNote(e.target.value)} /></Field>
            {due < 0 && v7 && Number(confirm.setoff_open) > 0 && <p className="hint">💡 {t('record_payment_hint')}</p>}
            <button className="btn ok block" style={{ padding: 14 }} disabled={busy} onClick={submit}>{busy ? t('saving') : due < 0 ? t('confirm_paid') : t('confirm_received')}</button>
          </div>
        )}
      </Modal>
      <Modal open={!!edit} onClose={() => !busy && setEdit(null)} title={edit ? `✏️ ${personName(edit.row.member, lang)}` : ''}>
        {edit && (
          <div className="stack" data-testid="handover-edit-form">
            <Field label={edit.out ? t('amount_paid_to', { name: personName(edit.row.member, lang) }) : t('amount_received')}>
              <input className="input big" inputMode="decimal" value={edit.amount} onChange={(e) => setEdit((x) => ({ ...x, amount: e.target.value.replace(/[^0-9.]/g, '') }))} data-testid="handover-edit-amount" />
            </Field>
            {edit.out && <Field label={t('pay_mode_l')}><Seg value={edit.mode} onChange={(v) => setEdit((x) => ({ ...x, mode: v }))} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: `📱 ${t('temple_upi')}` }]} /></Field>}
            <Field label={t('note')} optional><input className="input" value={edit.note} onChange={(e) => setEdit((x) => ({ ...x, note: e.target.value }))} /></Field>
            <p className="hint">{t('handover_edit_hint')}</p>
            <div className="grid2">
              <button className="btn ghost danger-t" disabled={busy} onClick={() => delHandover(edit.row)}>🗑️ {t('delete')}</button>
              <button className="btn primary" disabled={busy} onClick={saveEdit} data-testid="handover-save">{busy ? t('saving') : t('save')}</button>
            </div>
          </div>
        )}
      </Modal>
      {pay && <PayBackModal expense={pay.expense} balance={pay.balance} onClose={() => setPay(null)} onDone={() => { setExpOpen(null); reload(true); }} />}
    </Page>
  );
}

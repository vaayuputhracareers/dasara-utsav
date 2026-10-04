import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { errMsg } from '../lib/errors.js';
import { inr, fmtDay, fmtDateTime, personName } from '../lib/format.js';
import { Modal, Seg, useToast } from './ui.jsx';

// A member's expense is settled in one of 2 ways (database version 7):
//   set off  – deducted from the cash the member collects (now or later) – settled_mode empty
//   paid back – the admin paid the member in cash or through the temple UPI – settled_mode 'cash' / 'upi'

export const modeLabel = (mode, t) => (mode === 'upi' ? t('temple_upi') : t('cash'));

/** "hands over ₹500" / "committee owes ₹1,500" / "₹0 – settled" */
export function balText(v, t) {
  const n = Math.round(Number(v || 0) * 100) / 100;
  if (n > 0) return t('bal_hands_over', { amount: inr(n) });
  if (n < 0) return t('bal_owes', { amount: inr(-n) });
  return t('bal_zero');
}

/** The member's current balance (admin), or null while loading / unknown. */
export function useMemberBalance(memberId, enabled = true) {
  const [bal, setBal] = useState(null);
  useEffect(() => {
    let alive = true;
    setBal(null);
    if (!memberId || !enabled) return undefined;
    supabase.rpc('get_member_balances').then(({ data }) => {
      if (!alive) return;
      const m = (data || []).find((x) => x.member_id === memberId);
      setBal(m ? Number(m.balance) : 0);
    });
    return () => { alive = false; };
  }, [memberId, enabled]);
  return bal;
}

/** The full cash position of one person (cash collected, expenses set off, handed over, balance) – admin only. */
export function useMemberCash(memberId, enabled = true) {
  const [row, setRow] = useState(null);
  useEffect(() => {
    let alive = true;
    setRow(null);
    if (!memberId || !enabled) return undefined;
    supabase.rpc('get_member_balances').then(({ data, error }) => {
      if (!alive) return;
      if (error) { setRow({ member_id: memberId, error: true }); return; }
      const m = (data || []).find((x) => x.member_id === memberId);
      setRow(m || { member_id: memberId, balance: 0, cash_collected: 0, expenses_approved: 0, handed_over: 0 });
    });
    return () => { alive = false; };
  }, [memberId, enabled]);
  return row;
}

/** Small badge for lists: "↔️ Set off" / "💸 Paid back · UPI" (approved member expenses only). */
export function SettleBadge({ e }) {
  const { t } = useLang();
  if (!e?.paid_by || e.status !== 'approved' || !('settled_mode' in e)) return null;
  return e.settled_mode
    ? <span className="badge green" data-testid="settle-badge">{t('badge_paid_back', { mode: modeLabel(e.settled_mode, t) })}</span>
    : <span className="badge grey" data-testid="settle-badge">{t('badge_setoff')}</span>;
}

/** Text describing how an approved member expense was settled. */
export function settleStatus(e, t, lang, mine) {
  const name = personName(e.payer, lang);
  if (e.settled_mode) {
    return t(mine ? 'st_paid_back_you' : 'st_paid_back', { name, mode: modeLabel(e.settled_mode, t), date: fmtDateTime(e.settled_at, lang) });
  }
  if (e.handover_id) return t(mine ? 'st_setoff_done_you' : 'st_setoff_done', { name });
  return t(mine ? 'st_setoff_you' : 'st_setoff', { name });
}

/** Admin: pay a member back for one expense (cash or temple UPI). */
export function PayBackModal({ expense, balance, onClose, onDone }) {
  const { t, lang, P } = useLang();
  const toast = useToast();
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode('cash'); setRef(''); }, [expense?.id]);
  if (!expense) return null;
  const name = personName(expense.payer, lang);
  const amount = Number(expense.amount);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('settle_expense', { p_id: expense.id, p_mode: mode, p_ref: ref });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    toast(t('payback_done', { name, amount: inr(amount) }), 'success', 5000);
    onDone?.();
    onClose();
  };
  return (
    <Modal open={!!expense} onClose={onClose} title={t('payback_title', { name })}>
      <div className="stack" data-testid="payback-modal">
        <div className="card stat good">
          <small>{P({ te: expense.category_te, en: expense.category_en }) || expense.description || t('nav_expense')} · {fmtDay(expense.expense_date, lang)}</small>
          <b>{inr(amount)}</b>
          {expense.description && (expense.category_te || expense.category_en) && <em>{expense.description}</em>}
        </div>
        <Seg value={mode} onChange={setMode} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: `📱 ${t('temple_upi')}` }]} />
        <input className="input" value={ref} placeholder={mode === 'upi' ? t('payback_ref_upi') : t('payback_ref_cash')} onChange={(e) => setRef(e.target.value)} data-testid="payback-ref" />
        <p className="hint">{t('settle_payback_hint', { name })}</p>
        {balance != null && (
          <div className="alert info num" data-testid="payback-effect">{t('balance_effect', { name, from: balText(balance, t), to: balText(balance + amount, t) })}</div>
        )}
        <button className="btn ok block" style={{ padding: 14 }} disabled={busy} onClick={submit} data-testid="payback-confirm">{busy ? t('saving') : t('payback_confirm', { amount: inr(amount) })}</button>
      </div>
    </Modal>
  );
}

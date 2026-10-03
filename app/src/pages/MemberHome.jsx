import { Link } from 'react-router-dom';
import { hasCashBank, netOf, openingOf } from '../lib/cashbank.js';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { inr, inrSigned, fmtDateTime, personName } from '../lib/format.js';
import { Page, Spinner, Empty } from '../components/ui.jsx';
import { LangSwitch } from '../lib/i18n.jsx';

export default function MemberHome() {
  const { t, L, lang } = useLang();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { data: s, loading, reload } = useAsync(async () => {
    const { data, error } = await supabase.rpc('get_my_summary');
    if (error) throw error;
    return data;
  }, []);
  const bal = Number(s?.balance || 0);
  // Version 7: the committee's totals, when the admin allows it (Members page switch)
  const showFin = !!settings.members_see_finance;
  const { data: fin, reload: reloadFin } = useAsync(async () => {
    if (!showFin) return null;
    const { data, error } = await supabase.rpc('get_finance_summary');
    if (error) throw error;
    return data;
  }, [showFin]);
  const finNet = fin ? netOf(fin) : 0;   // version 9: includes the opening balance
  return (
    <Page title={L(settings, 'temple_name') || t('app_name')} sub={`${L(settings, 'event_title')} ${settings.event_year}`} right={<LangSwitch />}>
      <div className="row between">
        <h2 style={{ fontSize: 17, color: 'var(--maroon)' }}>{t('hello', { name: personName(profile, lang) })}</h2>
        <button className="btn ghost xs" onClick={() => { reload(); if (showFin) reloadFin(); }}>{t('refresh')}</button>
      </div>
      {loading && !s ? <Spinner /> : s && (
        <>
          <div className="grid2">
            <div className="card stat"><small>{t('today_collection')}</small><b>{inr(s.today_total)}</b><em>{t('receipts_n', { n: s.today_count })}</em></div>
            <div className="card stat"><small>{t('my_total')}</small><b>{inr(s.total)}</b><em>{t('receipts_n', { n: s.count })}</em></div>
          </div>
          <div className={`card stat ${bal > 0 ? 'warn' : 'good'}`}>
            <small>{bal < 0 ? t('committee_owes_you') : t('cash_with_me')}</small>
            <b>{inr(Math.abs(bal))}</b>
            <em>{bal > 0 ? t('cash_with_me_hint') : bal === 0 ? t('all_handed_over') : ''}</em>
            <em style={{ marginTop: 4 }} className="num">{t('balance_breakdown', { cash: inr(s.cash_total), exp: inr(s.expenses_approved), ho: inr(s.handed_over) })}</em>
            {Number(s.paid_back) > 0 && <em style={{ marginTop: 4 }} className="num" data-testid="paid-back-you">{t('paid_back_you', { amount: inr(s.paid_back) })}</em>}
          </div>
          {showFin && fin && (
            <div className="card fin-card" data-testid="finance-card">
              <div className="card-title">{t('finance_title')}</div>
              <div className="mini">
                <div><small>{t('total_donations')}</small><b data-testid="fin-donations">{inr(fin.donations_total)}</b></div>
                <div><small>{t('total_expenses')}</small><b style={{ color: 'var(--kumkum)' }} data-testid="fin-expenses">{inr(fin.expenses_total)}</b></div>
                <div><small>{t('finance_balance')}</small><b style={{ color: finNet >= 0 ? 'var(--green)' : 'var(--kumkum)' }} data-testid="fin-net">{inrSigned(finNet)}</b></div>
              </div>
              {hasCashBank(fin) && (
                <div className="fin-split" data-testid="fin-split">
                  <div><small>{t('cash_in_hand')}</small><b className="num" data-testid="fin-cash">{inr(fin.cash_in_hand)}</b>
                    <em className="num">{t('with_committee_x', { amount: inr(fin.cash_with_committee) })}</em>
                    <em className="num">{t('with_members_x', { amount: inr(fin.cash_with_members) })}</em></div>
                  <div><small>{t('cash_at_bank')}</small><b className="num" data-testid="fin-bank">{inr(fin.bank_balance)}</b></div>
                </div>
              )}
              {openingOf(fin) > 0 && <p className="hint" style={{ marginTop: 6 }}>{t('fin_opening_incl', { amount: inr(openingOf(fin)) })}</p>}
              {Number(fin.owed_to_members) > 0 && <p className="hint" style={{ marginTop: 6 }}>{t('net_owed_line', { amount: inr(fin.owed_to_members) })}</p>}
              <p className="hint" style={{ marginTop: 6 }}>{t('finance_hint')}</p>
            </div>
          )}
          {s.pending_expenses > 0 && <Link to="/expenses" className="alert warn">⏳ {t('pending_expenses_n', { n: s.pending_expenses })}</Link>}
        </>
      )}
      <Link to="/donate" className="btn primary block" style={{ padding: 16, fontSize: 16 }}>{t('new_donation_btn')}</Link>
      <div className="grid2">
        <Link to="/donations" className="btn ghost block">{t('my_receipts_btn')}</Link>
        <Link to="/expenses?new=1" className="btn ghost block">{t('add_expense_btn')}</Link>
      </div>
      <div className="section-title">{t('handover_history')}</div>
      <div className="card">
        {!s?.handovers?.length ? <Empty icon="🤝" text={t('no_handovers')} /> : (
          <div className="list">
            {s.handovers.map((h) => (
              <div key={h.id} className="li" style={{ cursor: 'default' }}>
                <div className="grow">
                  <div className="main-t">✅ {inr(h.amount_received)}</div>
                  <div className="sub-t">{fmtDateTime(h.received_at, lang)} · {t('received_by', { name: lang === 'te' ? h.receiver_te : h.receiver_en })}</div>
                  {h.note && <div className="sub-t">📝 {h.note}</div>}
                </div>
                {Number(h.expected_amount) !== Number(h.amount_received) && (
                  <span className="badge orange num">{t('expected_x', { amount: inr(h.expected_amount) })}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}

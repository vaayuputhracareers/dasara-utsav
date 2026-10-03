import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase, fetchAll } from '../lib/supabase.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { inr, inrSigned, fmtShortDay, fmtDateTime, todayIST, personName } from '../lib/format.js';
import { exportSheets } from '../lib/exportXlsx.js';
import { Page, Spinner, Empty, useToast } from '../components/ui.jsx';
import { DONATION_SELECT, donationRows } from './Donations.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DataTools.jsx';
import { EXPENSE_SELECT, expenseRows } from './Expenses.jsx';
import { TRANSFER_SELECT, hasCashBank, transferRows } from '../lib/cashbank.js';

const COLORS = ['#7a1d1d', '#ef7d1a', '#f6c344', '#c62828', '#16804a', '#9a3412', '#6d28d9', '#0e7490', '#a16207', '#be185d'];

export default function Dashboard() {
  const { t, lang, P, L } = useLang();
  const { settings } = useSettings();
  const toast = useToast();
  const [dbVersion, checkDb] = useDbVersion();
  const { data: d, loading, error, reload } = useAsync(async () => {
    const { data, error: e } = await supabase.rpc('get_dashboard');
    if (e) throw e;
    return data;
  }, []);

  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && reload(true);
    document.addEventListener('visibilitychange', onFocus);
    const iv = setInterval(onFocus, 60000);
    return () => { document.removeEventListener('visibilitychange', onFocus); clearInterval(iv); };
  }, [reload]);

  const fullReport = async () => {
    try {
      toast(t('loading'));
      const v8 = hasCashBank(d);
      const [dons, exps, hos, trs] = await Promise.all([
        fetchAll(() => supabase.from('donations').select(DONATION_SELECT).order('collected_at')),
        fetchAll(() => supabase.from('expenses').select(EXPENSE_SELECT).order('expense_date')),
        fetchAll(() => supabase.from('handovers').select('*, member:profiles!handovers_member_id_fkey(full_name), receiver:profiles!handovers_received_by_fkey(full_name)').order('received_at')),
        v8 ? fetchAll(() => supabase.from('cash_transfers').select(TRANSFER_SELECT).order('transfer_date').order('created_at')) : Promise.resolve([]),
      ]);
      const summary = [
        { Item: 'Total donations (valid)', Amount: Number(d.donations_total) },
        { Item: '  Cash', Amount: Number(d.cash_total) },
        { Item: '  UPI', Amount: Number(d.upi_total) },
        { Item: 'Total expenses (approved)', Amount: Number(d.expenses_total) },
        { Item: 'Net position', Amount: Number(d.donations_total) - Number(d.expenses_total) },
        ...(v8 ? [
          { Item: 'Cash in hand (with committee + with members)', Amount: Number(d.cash_in_hand) },
          { Item: '  With committee (admin)', Amount: Number(d.cash_with_committee) },
          { Item: 'Cash at bank', Amount: Number(d.bank_balance) },
          { Item: 'Cash deposited into bank', Amount: Number(d.deposits_total) },
          { Item: 'Cash withdrawn from bank', Amount: Number(d.withdrawals_total) },
        ] : []),
        { Item: 'Cash still with members', Amount: Number(d.cash_with_members) },
        ...(d.owed_to_members != null ? [
          { Item: 'Committee owes members', Amount: Number(d.owed_to_members) },
          { Item: 'Member expenses paid back – cash', Amount: Number(d.paid_back_cash) },
          { Item: 'Member expenses paid back – temple UPI', Amount: Number(d.paid_back_upi) },
        ] : []),
        { Item: 'Report time', Amount: fmtDateTime(new Date(), 'en') },
      ];
      await exportSheets(`dasara-report-${todayIST()}.xlsx`, [
        { name: 'Summary', rows: summary },
        { name: 'Donations', rows: donationRows(dons, lang) },
        { name: 'Expenses', rows: expenseRows(exps) },
        { name: 'Handovers', rows: hos.map((h) => ({ Date: fmtDateTime(h.received_at, 'en'), Member: h.member?.full_name, Due: Number(h.expected_amount), Received: Number(h.amount_received), Difference: Number(h.expected_amount) - Number(h.amount_received), 'Received By': h.receiver?.full_name, Note: h.note || '' })) },
        { name: 'By member', rows: (d.by_member || []).map((m) => ({ Member: m.full_name, Receipts: m.cnt, Cash: Number(m.cash), UPI: Number(m.upi), Total: Number(m.total) })) },
        ...(v8 ? [{ name: 'Cash & Bank', rows: transferRows(trs) }] : []),
      ]);
    } catch (e) { toast(String(e.message || e), 'error'); }
  };

  const net = d ? Number(d.donations_total) - Number(d.expenses_total) : 0;
  const split = hasCashBank(d);   // database version 8
  const owed = d ? Number(d.owed_to_members || 0) : 0;
  const maxCat = d ? Math.max(1, ...d.by_category.map((c) => Number(c.total))) : 1;
  const days = d ? d.by_day.slice(-14) : [];
  const maxDay = Math.max(1, ...days.map((x) => Number(x.total)));

  return (
    <Page title={`📊 ${t('nav_dashboard')}`} sub={`${L(settings, 'temple_name') || t('app_name')} · ${fmtShortDay(todayIST(), lang)}`} wide
      right={<LangSwitch />}>
      <DbUpdateNotice version={dbVersion} onCheck={checkDb} />
      {!settings.temple_name_te && !settings.temple_name_en && (
        <div className="alert info" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>🙏 {t('welcome_admin')}</span>
          <Link to="/settings" className="btn maroon sm">{t('go_settings')}</Link>
        </div>
      )}
      {loading && !d ? <Spinner /> : error && !d ? <div className="alert err">{t('network_error')} <button className="btn ghost xs" onClick={() => reload()}>{t('retry')}</button></div> : d && (
        <>
          <div className={`net net-col ${net >= 0 ? 'pos' : 'neg'}`}>
            <div className="net-top">
              <div><small>{t('net_position')}</small><div className="big">{inrSigned(net)}</div><small>{t('donations_minus_expenses')}</small></div>
              <span className="pill">{net >= 0 ? t('surplus') : t('deficit')}</span>
            </div>
            {split && (
              <>
                <div className="net-split" data-testid="net-split">
                  <Link to="/cash-bank" data-testid="dash-cash-in-hand">
                    <small>{t('cash_in_hand')}</small><b className="num">{inr(d.cash_in_hand)}</b>
                    <em className="num">{t('with_committee_x', { amount: inr(d.cash_with_committee) })}</em>
                    <em className="num">{t('with_members_x', { amount: inr(d.cash_with_members) })}</em>
                  </Link>
                  <span className="op">+</span>
                  <Link to="/cash-bank" data-testid="dash-bank">
                    <small>{t('cash_at_bank')}</small><b className="num">{inr(d.bank_balance)}</b>
                    {Number(d.transfers_count) > 0 && <em className="num">{t('bank_moves_x', { dep: inr(d.deposits_total), wd: inr(d.withdrawals_total) })}</em>}
                    {Number(d.upi_unverified_total) > 0 && <em className="num">{t('bank_unchecked_x', { amount: inr(d.upi_unverified_total) })}</em>}
                    {!(Number(d.transfers_count) > 0) && !(Number(d.upi_unverified_total) > 0) && <em>{t('cb_details')}</em>}
                  </Link>
                </div>
                {owed > 0 && <small className="net-owed" data-testid="net-owed">{t('net_owed_line', { amount: inr(owed) })}</small>}
              </>
            )}
          </div>
          {split && Number(d.cash_with_committee) < 0 && <Link to="/cash-bank" className="alert warn">{t('cb_committee_negative')}</Link>}
          {split && Number(d.bank_balance) < 0 && <Link to="/cash-bank" className="alert warn">{t('cb_bank_negative')}</Link>}
          <div className="grid2 grid-dash">
            <Link to="/donations" className="card stat link"><small>{t('total_donations')}</small><b>{inr(d.donations_total)}</b><em className="num">{t('cash_upi_split', { cash: inr(d.cash_total), upi: inr(d.upi_total) })}</em></Link>
            <Link to="/expenses" className="card stat bad link"><small>{t('total_expenses')}</small><b>{inr(d.expenses_total)}</b><em>{t('bills_n', { n: d.expenses_count })}</em></Link>
            <Link to="/handover" className={`card stat link ${Number(d.cash_with_members) > 0 ? 'warn' : 'good'}`}><small>{t('cash_with_members')}</small><b>{inr(d.cash_with_members)}</b><em>{t('with_n_members', { n: d.members_with_cash })} →</em>
              {Number(d.owed_to_members) > 0 && <em className="num" data-testid="dash-owed">{t('owed_to_members', { amount: inr(d.owed_to_members) })}</em>}
              {Number(d.paid_back_total) > 0 && <em className="num" data-testid="dash-paid-back">{t('paid_back_members', { amount: inr(d.paid_back_total), cash: inr(d.paid_back_cash), upi: inr(d.paid_back_upi) })}</em>}
            </Link>
            <div className="card stat"><small>{t('today_collection')}</small><b>{inr(d.today_total)}</b><em>{t('receipts_n', { n: d.today_count })}</em></div>
          </div>
          {(d.pending_expenses > 0 || d.pending_members > 0) && (
            <Link to={d.pending_expenses > 0 ? '/expenses' : '/members'} className="alert warn">{t('awaiting_approval', { e: d.pending_expenses, m: d.pending_members })}</Link>
          )}
          {d.upi_unverified_count > 0 && <Link to="/donations" className="alert info">{t('upi_to_verify', { n: d.upi_unverified_count, amount: inr(d.upi_unverified_total) })}</Link>}

          <div className="cols2">
            <div className="card">
              <div className="card-title">{t('expenses_by_category')}</div>
              {d.by_category.length === 0 ? <Empty icon="🧾" text={t('no_expenses_yet')} /> : (
                <div className="bars">
                  {d.by_category.map((c, i) => (
                    <div key={i} className="bar">
                      <div className="bl"><span>{P({ te: c.category_te, en: c.category_en }) || '—'}</span><b>{inr(c.total)}</b></div>
                      <div className="track"><div className="fill" style={{ width: `${(Number(c.total) / maxCat) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-title">{t('donations_by_day')}</div>
              {days.length === 0 ? <Empty icon="💰" text={t('no_donations_yet')} /> : (
                <div className="vbars">
                  {days.map((x) => (
                    <div key={x.day} className="vbar" title={`${x.day}: ${inr(x.total)}`}>
                      <b>{Number(x.total) >= 1000 ? `${Math.round(Number(x.total) / 100) / 10}k` : Number(x.total)}</b>
                      <div className="col" style={{ height: `${(Number(x.total) / maxDay) * 100}%` }} />
                      <small>{fmtShortDay(x.day, 'en')}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">{t('by_member')}<button className="btn ghost xs" onClick={fullReport}>{t('full_report')}</button></div>
            {d.by_member.length === 0 ? <Empty icon="👥" text={t('no_donations_yet')} /> : (
              <div className="list">
                {d.by_member.map((m) => (
                  <div key={m.id} className="li" style={{ cursor: 'default' }}>
                    <div className="avatar sm">{(m.full_name || '?')[0].toUpperCase()}</div>
                    <div className="grow">
                      <div className="main-t">{personName(m, lang)} {m.role === 'admin' && <span className="badge blue">{t('admin')}</span>}</div>
                      <div className="sub-t num">{t('receipts_n', { n: m.cnt })} · {t('cash_upi_split', { cash: inr(m.cash), upi: inr(m.upi) })}</div>
                    </div>
                    <div className="amt">{inr(m.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={() => reload()}>{t('refresh')}</button>
        </>
      )}
    </Page>
  );
}

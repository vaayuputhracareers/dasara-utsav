import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, fetchAll } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { inr, fmtTime, fmtDate, fmtDateTime, istDate, todayIST, personName, num } from '../lib/format.js';
import { exportSheets } from '../lib/exportXlsx.js';
import { Page, Spinner, Empty, useToast } from '../components/ui.jsx';
import DonationDetail, { DonationBadges } from '../components/DonationDetail.jsx';

export const DONATION_SELECT = '*, collector:profiles!donations_collected_by_fkey(id,full_name,name_te)';

export function donationRows(list, lang) {
  return list.map((d) => ({
    'Receipt No': d.receipt_no,
    Date: fmtDateTime(d.collected_at, 'en'),
    Donor: d.donor_name,
    Mobile: d.mobile || '',
    Amount: Number(d.amount),
    Mode: d.payment_mode === 'upi' ? 'UPI' : 'Cash',
    'UPI Ref': d.upi_ref || '',
    Village: d.village || '',
    Gotram: d.gotram || '',
    Purpose: (lang === 'te' ? d.purpose_te || d.purpose_en : d.purpose_en || d.purpose_te) || '',
    'Collected By': d.collector ? d.collector.full_name : '',
    Status: d.status === 'cancelled' ? `Cancelled (${d.cancel_reason || ''})` : 'Valid',
    'Handed Over': d.payment_mode === 'cash' ? (d.handover_id ? 'Yes' : 'No') : '',
    'UPI Verified': d.payment_mode === 'upi' ? (d.upi_verified ? 'Yes' : 'No') : '',
    'WhatsApp Sent': d.shared_at ? 'Yes' : 'No',
    Notes: d.notes || '',
  }));
}

export default function Donations() {
  const { t, lang } = useLang();
  const { isAdmin, profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [day, setDay] = useState('all'); // all | today | YYYY-MM-DD
  const [mode, setMode] = useState('all');
  const [who, setWho] = useState('all');
  const [status, setStatus] = useState('active');
  const [open, setOpen] = useState(null);

  const { data, loading, reload } = useAsync(() => fetchAll(() => {
    let qb = supabase.from('donations').select(DONATION_SELECT).order('collected_at', { ascending: false });
    if (!isAdmin) qb = qb.eq('collected_by', profile.id);
    return qb;
  }), [isAdmin, profile.id]);

  const collectors = useMemo(() => {
    const m = new Map();
    (data || []).forEach((d) => d.collector && m.set(d.collector.id, d.collector));
    return [...m.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [data]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const dayStr = day === 'today' ? todayIST() : day;
    return (data || []).filter((d) => {
      if (status !== 'all' && d.status !== status) return false;
      if (mode !== 'all' && d.payment_mode !== mode) return false;
      if (who !== 'all' && d.collected_by !== who) return false;
      if (dayStr !== 'all' && istDate(d.collected_at) !== dayStr) return false;
      if (s && !(`${d.donor_name} ${d.mobile || ''} ${d.receipt_no} ${d.village || ''}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [data, q, day, mode, who, status]);
  const total = filtered.reduce((a, d) => a + (d.status === 'active' ? Number(d.amount) : 0), 0);

  const doExport = async () => {
    try {
      await exportSheets(`donations-${todayIST()}.xlsx`, [{ name: 'Donations', rows: donationRows(filtered, lang) }]);
    } catch (e) { toast(String(e.message || e), 'error'); }
  };

  return (
    <Page title={isAdmin ? t('nav_donations') : t('my_receipts')} sub={isAdmin ? `${settings.receipt_prefix}` : t('only_mine_hint')} wide
      right={isAdmin ? <button className="tb-btn" onClick={doExport}>{t('export_excel')}</button> : <Link className="tb-btn" to="/donate">➕</Link>}>
      <div className="card stack tight">
        <input className="input" placeholder={`🔍 ${t('search_donations')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs">
          <button className={`tab ${day === 'all' ? 'on' : ''}`} onClick={() => setDay('all')}>{t('any_day')}</button>
          <button className={`tab ${day === 'today' ? 'on' : ''}`} onClick={() => setDay('today')}>{t('today')}</button>
          <input type="date" className="tab" style={{ minWidth: 140 }} value={day.length === 10 ? day : ''} onChange={(e) => setDay(e.target.value || 'all')} aria-label={t('pick_date')} />
        </div>
        <div className="tabs">
          {[['all', t('all')], ['cash', `💵 ${t('cash')}`], ['upi', '📱 UPI']].map(([v, l]) => <button key={v} className={`tab ${mode === v ? 'on' : ''}`} onClick={() => setMode(v)}>{l}</button>)}
          <span style={{ width: 8 }} />
          {[['active', t('active')], ['cancelled', t('cancelled')], ['all', t('all')]].map(([v, l]) => <button key={'s' + v} className={`tab ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}
        </div>
        {isAdmin && collectors.length > 1 && (
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">👥 {t('all_members')}</option>
            {collectors.map((c) => <option key={c.id} value={c.id}>{personName(c, lang)}</option>)}
          </select>
        )}
      </div>
      <div className="summary-bar num"><span>{t('count_total', { n: filtered.length, amount: '' }).replace(/·\s*$/, '')}</span><span>{inr(total)}</span></div>
      <div className="card">
        {loading && !data ? <Spinner /> : filtered.length === 0 ? <Empty icon="🧾" text={t('nothing_here')} /> : (
          <div className="list">
            {filtered.slice(0, 500).map((d) => (
              <div key={d.id} className={`li ${d.status === 'cancelled' ? 'dim' : ''}`} onClick={() => setOpen(d)}>
                <div className="grow">
                  <div className="main-t">{d.donor_name}</div>
                  <div className="sub-t num">{d.receipt_no} · {fmtDate(d.collected_at, lang)} {fmtTime(d.collected_at)}{isAdmin && d.collector ? ` · ${personName(d.collector, lang)}` : ''}</div>
                  <div style={{ marginTop: 3 }}><DonationBadges d={d} />{!d.shared_at && d.status === 'active' && <span className="badge grey">WhatsApp ✗</span>}</div>
                </div>
                <div className="amt">{inr(d.amount)}<div className="sub-t" style={{ fontWeight: 700 }}>{d.payment_mode === 'upi' ? 'UPI' : t('cash')}</div></div>
              </div>
            ))}
            {filtered.length > 500 && <div className="foot-note">+{num(filtered.length - 500)} … {t('export_excel')}</div>}
          </div>
        )}
      </div>
      {open && <DonationDetail d={open} onClose={() => setOpen(null)} onChanged={() => reload(true)} />}
    </Page>
  );
}

// Version 12 – team members tap "Total donations" / "Total expenses" on Home (financial position card)
// and see every receipt / every approved expense. Only while the admin allows the financial position.
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, fmtDate, fmtTime, fmtDay, istDate, todayIST, num } from '../lib/format.js';
import { isMissing } from '../lib/festival.js';
import { Page, Spinner, Empty } from '../components/ui.jsx';

const MAX = 1000;

export default function AllList() {
  const { t, P, lang } = useLang();
  const loc = useLocation();
  const kind = loc.pathname.startsWith('/all-expenses') ? 'expenses' : 'donations';
  const [q, setQ] = useState('');
  const [day, setDay] = useState('all');   // all | today | YYYY-MM-DD

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: e } = await supabase.rpc(kind === 'expenses' ? 'get_all_expenses' : 'get_all_donations');
    if (e) throw e;
    return Array.isArray(rows) ? rows : [];
  }, [kind]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const dayStr = day === 'today' ? todayIST() : day;
    return (data || []).filter((r) => {
      const d = kind === 'expenses' ? r.expense_date : istDate(r.collected_at);
      if (dayStr !== 'all' && d !== dayStr) return false;
      if (!s) return true;
      const hay = kind === 'expenses'
        ? `${r.category_te || ''} ${r.category_en || ''} ${r.description || ''} ${r.paid_to || ''} ${r.paid_by_en || ''} ${r.paid_by_te || ''}`
        : `${r.donor_name || ''} ${r.receipt_no || ''} ${r.village || ''} ${r.collector_en || ''} ${r.collector_te || ''} ${r.purpose_en || ''} ${r.purpose_te || ''}`;
      return hay.toLowerCase().includes(s);
    });
  }, [data, q, day, kind]);
  const total = filtered.reduce((a, r) => a + Number(r.amount || 0), 0);
  const errText = !error ? '' : String(error.message || '').includes('not_allowed') ? t('all_list_off')
    : isMissing(error) ? t('festival_needs_db_member') : errMsg(error, t);
  const who = (te, en) => (lang === 'te' ? te || en : en || te) || '';

  return (
    <Page title={t(kind === 'expenses' ? 'all_expenses_title' : 'all_donations_title')} sub={t(kind === 'expenses' ? 'all_exp_hint' : 'all_don_hint')} back="/" wide
      right={<button className="tb-btn" onClick={() => reload()}>🔄</button>}>
      {errText ? <div className="alert warn" data-testid="all-list-error">{errText}</div> : (
        <>
          <div className="card stack tight">
            <input className="input" placeholder={`🔍 ${t(kind === 'expenses' ? 'search_all_expenses' : 'search_all_donations')}`} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="tabs">
              <button className={`tab ${day === 'all' ? 'on' : ''}`} onClick={() => setDay('all')}>{t('any_day')}</button>
              <button className={`tab ${day === 'today' ? 'on' : ''}`} onClick={() => setDay('today')}>{t('today')}</button>
              <input type="date" className="tab" style={{ minWidth: 140 }} value={day.length === 10 ? day : ''} onChange={(e) => setDay(e.target.value || 'all')} aria-label={t('pick_date')} />
            </div>
          </div>
          <div className="summary-bar num" data-testid="all-list-summary">
            <span>{kind === 'expenses' ? t('entries_n', { n: filtered.length }) : t('receipts_n', { n: filtered.length })}</span><span>{inr(total)}</span>
          </div>
          <div className="card" data-testid={`all-${kind}`}>
            {loading && !data ? <Spinner /> : filtered.length === 0 ? <Empty icon={kind === 'expenses' ? '🧾' : '💰'} text={t('nothing_here')} /> : (
              <div className="list">
                {filtered.slice(0, MAX).map((r) => (kind === 'expenses' ? (
                  <div key={r.id} className="li" style={{ cursor: 'default' }}>
                    <div className="grow">
                      <div className="main-t">{P({ te: r.category_te, en: r.category_en }) || r.description || '—'}</div>
                      <div className="sub-t">{[fmtDay(r.expense_date, lang), r.description, r.paid_to && `→ ${r.paid_to}`].filter(Boolean).join(' · ')}</div>
                      <div className="sub-t">{r.paid_by_en || r.paid_by_te ? t('paid_by_x', { name: who(r.paid_by_te, r.paid_by_en) }) : t('from_committee_funds')}</div>
                    </div>
                    <div className="amt">{inr(r.amount)}<div className="sub-t" style={{ fontWeight: 700 }}>{r.payment_mode === 'upi' ? 'UPI' : t('cash')}</div></div>
                  </div>
                ) : (
                  <div key={r.id} className="li" style={{ cursor: 'default' }}>
                    <div className="grow">
                      <div className="main-t">{r.donor_name}</div>
                      <div className="sub-t num">{r.receipt_no} · {fmtDate(r.collected_at, lang)} {fmtTime(r.collected_at)}</div>
                      <div className="sub-t">{[r.village, P({ te: r.purpose_te, en: r.purpose_en }), who(r.collector_te, r.collector_en) && `👤 ${who(r.collector_te, r.collector_en)}`].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="amt">{inr(r.amount)}<div className="sub-t" style={{ fontWeight: 700 }}>{r.payment_mode === 'upi' ? 'UPI' : t('cash')}</div></div>
                  </div>
                )))}
                {filtered.length > MAX && <div className="foot-note">+{num(filtered.length - MAX)} …</div>}
              </div>
            )}
          </div>
        </>
      )}
    </Page>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { inr, inrSigned, fmtDay, num } from '../lib/format.js';
import { Spinner, Empty } from '../components/ui.jsx';
import Schedule from '../components/Schedule.jsx';
import PujaSchedule from '../components/PujaSchedule.jsx';

const COLORS = ['#7a1d1d', '#ef7d1a', '#f6c344', '#c62828', '#16804a', '#9a3412', '#6d28d9', '#0e7490', '#a16207', '#be185d'];

export default function PublicPage() {
  const { slug } = useParams();
  const { t, L, P, lang } = useLang();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState('programs');

  useEffect(() => {
    let alive = true;
    const load = () => supabase.rpc('get_public_page', { p_slug: slug }).then(({ data: d, error }) => {
      if (!alive) return;
      if (error) setErr(true); else { setData(d); setErr(false); }
    });
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [slug]);

  useEffect(() => {
    if (data?.branding) document.title = `${L(data.branding, 'temple_name') || ''} – ${L(data.branding, 'event_title') || ''}`;
  }, [data, L]);

  if (!data && !err) return <div className="splash"><div><div className="lamp">🪔</div><Spinner /></div></div>;
  if (err || !data?.enabled) {
    return (
      <div className="splash"><div><div className="lamp">🪔</div><p style={{ marginTop: 10, fontWeight: 700 }}>{t('page_unavailable')}</p><div style={{ marginTop: 12 }}><LangSwitch /></div></div></div>
    );
  }
  const b = data.branding || {};
  const s = data.sections || {};
  const hasAccounts = s.donation_total || s.net_position || s.expense_summary || s.expense_details || s.donor_list;
  const tabs = [s.programs && 'programs', s.pujas && data.pujas?.length > 0 && 'pujas', hasAccounts && 'accounts'].filter(Boolean);
  const showTabs = tabs.length > 1;
  const cur = tabs.includes(tab) ? tab : tabs[0];
  const maxCat = Math.max(1, ...(data.expense_summary || []).map((c) => Number(c.total)));
  const net = Number(data.net || 0);

  return (
    <div className="pub">
      <header className="pubhead">
        <LangSwitch />
        {b.logo_url ? <img className="logo" src={b.logo_url} alt="" /> : <div className="lamp">🪔</div>}
        <h1>{L(b, 'temple_name') || t('app_name')}</h1>
        <p>{L(b, 'event_title')} – {b.event_year}</p>
        {L(b, 'village') && <p style={{ fontSize: 12.5 }}>📍 {[L(b, 'address'), L(b, 'village')].filter(Boolean).join(', ')}</p>}
        {b.start_date && b.end_date && <span className="dates">{fmtDay(b.start_date, lang)} – {fmtDay(b.end_date, lang)}</span>}
      </header>
      <main className="page" style={{ paddingBottom: 30 }}>
        {showTabs && (
          <div className="seg" data-testid="public-tabs">
            {tabs.includes('programs') && <button className={cur === 'programs' ? 'on' : ''} onClick={() => setTab('programs')}>📅 {t('nav_programs')}</button>}
            {tabs.includes('pujas') && <button className={cur === 'pujas' ? 'on' : ''} onClick={() => setTab('pujas')} data-testid="public-tab-puja">🪔 {t('nav_puja')}</button>}
            {tabs.includes('accounts') && <button className={cur === 'accounts' ? 'on' : ''} onClick={() => setTab('accounts')}>📒 {t('accounts')}</button>}
          </div>
        )}
        {cur === 'programs' && s.programs && (
          (data.programs?.length || data.days?.length || (b.start_date && b.end_date))
            ? <Schedule start={b.start_date} end={b.end_date} days={data.days || []} programs={data.programs || []} />
            : <Empty icon="📅" text={t('nothing_here')} />
        )}
        {cur === 'pujas' && <PujaSchedule start={b.start_date} end={b.end_date} pujas={data.pujas || []} />}
        {cur === 'accounts' && (
          <>
            {s.net_position && (
              <div className={`net ${net >= 0 ? 'pos' : 'neg'}`}>
                <div><small>{t('net_position')}</small><div className="big">{inrSigned(net)}</div><small>{t('donations_minus_expenses')}</small></div>
                <span className="pill">{net >= 0 ? t('surplus') : t('deficit')}</span>
              </div>
            )}
            {(s.donation_total || s.net_position) && (
              <div className="mini">
                <div><small>{t('nav_donations')}</small><b>{inr(data.donations_total)}</b></div>
                {data.expenses_total != null && <div><small>{t('nav_expenses')}</small><b style={{ color: 'var(--kumkum)' }}>{inr(data.expenses_total)}</b></div>}
                {s.net_position ? <div><small>{t('balance')}</small><b style={{ color: net >= 0 ? 'var(--green)' : 'var(--kumkum)' }}>{inr(net)}</b></div>
                  : <div><small>{t('donors')}</small><b>{num(data.donations_count)}</b></div>}
              </div>
            )}
            {s.expense_summary && (
              <div className="card">
                <div className="card-title">{t('expense_summary')}</div>
                {(data.expense_summary || []).length === 0 ? <Empty icon="🧾" text={t('no_expenses_yet')} /> : (
                  <div className="bars">
                    {data.expense_summary.map((c, i) => (
                      <div key={i} className="bar">
                        <div className="bl"><span>{P({ te: c.category_te, en: c.category_en }) || '—'}</span><b>{inr(c.total)}</b></div>
                        <div className="track"><div className="fill" style={{ width: `${(Number(c.total) / maxCat) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {s.expense_details && (
              <div className="card">
                <div className="card-title">{t('expense_details')}</div>
                <div className="list">
                  {(data.expense_details || []).map((e, i) => (
                    <div key={i} className="li" style={{ cursor: 'default' }}>
                      <div className="grow"><div className="main-t">{P({ te: e.category_te, en: e.category_en }) || e.description}</div><div className="sub-t">{fmtDay(e.expense_date, lang)}{e.description ? ` · ${e.description}` : ''}{e.paid_to ? ` · ${e.paid_to}` : ''}</div></div>
                      <div className="amt">{inr(e.amount)}</div>
                    </div>
                  ))}
                  {!data.expense_details?.length && <Empty icon="🧾" text={t('no_expenses_yet')} />}
                </div>
              </div>
            )}
            {s.donor_list && (
              <div className="card">
                <div className="card-title">🙏 {t('donors')} <span className="badge orange">{t('donors_count', { n: (data.donors || []).length })}</span></div>
                <div className="list">
                  {(data.donors || []).map((d, i) => (
                    <div key={i} className="li" style={{ cursor: 'default' }}>
                      <div className="grow"><div className="main-t">{d.name}</div><div className="sub-t">{[d.village, fmtDay(d.day, lang)].filter(Boolean).join(' · ')}</div></div>
                      {d.amount != null && <div className="amt">{inr(d.amount)}</div>}
                    </div>
                  ))}
                  {!data.donors?.length && <Empty icon="🙏" text={t('no_donations_yet')} />}
                </div>
              </div>
            )}
            <p className="foot-note">🔄 {t('live_updates')}</p>
          </>
        )}
        {b.contact_phone && <a className="btn ghost block" href={`tel:${b.contact_phone}`}>📞 {t('contact')}: {b.contact_phone}</a>}
        <p className="foot-note">{t('powered_by')} · {L(b, 'committee_name')}</p>
      </main>
    </div>
  );
}

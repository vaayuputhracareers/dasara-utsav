import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { inr, fmtDateTime, fmtDay } from '../lib/format.js';
import { Spinner, Toran } from '../components/ui.jsx';

export default function ReceiptView() {
  const { token } = useParams();
  const { t, L, P, lang } = useLang();
  const [r, setR] = useState(undefined);
  useEffect(() => {
    supabase.rpc('get_receipt', { p_token: token }).then(({ data, error }) => setR(error ? null : data));
  }, [token]);
  if (r === undefined) return <div className="splash"><Spinner /></div>;
  if (!r) return <div className="splash"><div><div className="lamp">🧾</div><p style={{ fontWeight: 700, marginTop: 10 }}>{t('receipt_not_found')}</p></div></div>;
  const b = r.branding || {};
  const ok = r.status === 'active';
  return (
    <div className="pub">
      <Toran />
      <main className="page" style={{ paddingBottom: 30 }}>
        <div className="row between no-print"><span /><LangSwitch /></div>
        <div className="receipt-card">
          <div className="rc-head">
            {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--gold)' }} /> : <div style={{ fontSize: 36 }}>🪔</div>}
            <h1 style={{ fontSize: 19, marginTop: 4 }}>{L(b, 'temple_name')}</h1>
            <p style={{ fontSize: 13, opacity: 0.9 }}>{L(b, 'event_title')} – {b.event_year}</p>
            {L(b, 'village') && <p style={{ fontSize: 12, opacity: 0.85 }}>{[L(b, 'address'), L(b, 'village')].filter(Boolean).join(', ')}</p>}
          </div>
          <div className="stack" style={{ padding: 16 }}>
            <div className={`alert ${ok ? 'ok' : 'err'}`} style={{ justifyContent: 'center', fontSize: 14 }}>{ok ? t('receipt_valid') : t('receipt_cancelled')}</div>
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>{t('receipt_title')}</div>
            <div className="rc-amt" style={{ textDecoration: ok ? 'none' : 'line-through' }}>{inr(r.amount)}</div>
            <div style={{ textAlign: 'center', fontWeight: 700 }}>{t('received_with_thanks')} 🙏</div>
            <dl className="kv card">
              <dt>{t('receipt_no')}</dt><dd className="num">{r.receipt_no}</dd>
              <dt>{t('donor_name')}</dt><dd>{r.donor_name}</dd>
              {r.mobile_masked && <><dt>{t('mobile')}</dt><dd className="num">{r.mobile_masked}</dd></>}
              {r.village && <><dt>{t('village_street')}</dt><dd>{r.village}</dd></>}
              <dt>{t('payment_mode')}</dt><dd>{r.payment_mode === 'upi' ? 'UPI' : t('cash')}</dd>
              {(r.purpose_te || r.purpose_en) && <><dt>{t('purpose')}</dt><dd>{P({ te: r.purpose_te, en: r.purpose_en })}</dd></>}
              <dt>{t('date')}</dt><dd className="num">{fmtDateTime(r.collected_at, lang)}</dd>
              <dt>{t('collector')}</dt><dd>{lang === 'te' ? r.collector_te : r.collector_en}</dd>
            </dl>
            <p className="foot-note">– {L(b, 'committee_name')}{b.start_date ? ` · ${fmtDay(b.start_date, lang)} – ${fmtDay(b.end_date, lang)}` : ''}</p>
            <button className="btn ghost block no-print" onClick={() => window.print()}>{t('print')}</button>
          </div>
        </div>
      </main>
    </div>
  );
}

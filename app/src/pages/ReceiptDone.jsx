import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { inr, fmtTime } from '../lib/format.js';
import { buildReceiptMessage, waLink, smsLink, receiptLink } from '../lib/receipt.js';
import { Page, Spinner, useToast, copyText } from '../components/ui.jsx';

export default function ReceiptDone() {
  const { id } = useParams();
  const loc = useLocation();
  const { t } = useLang();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [d, setD] = useState(loc.state?.donation || null);
  const [collector, setCollector] = useState(null);

  useEffect(() => {
    supabase.from('donations').select('*, collector:profiles!donations_collected_by_fkey(full_name,name_te)').eq('id', id).single()
      .then(({ data }) => { if (data) { setD(data); setCollector(data.collector); } });
  }, [id]);

  if (!d) return <Page title={t('donation_recorded')} back="/donate"><Spinner /></Page>;
  const c = collector || profile;
  const msg = buildReceiptMessage(settings, d, c?.name_te || c?.full_name);
  const markShared = () => {
    supabase.rpc('mark_receipt_shared', { p_id: d.id }).then(() => setD((x) => ({ ...x, shared_at: new Date().toISOString() })));
  };

  return (
    <Page title={`🧾 ${d.receipt_no}`} sub={t('donation_recorded')} back="/donate">
      <div className="okcard">
        <div className="tick">✓</div>
        <div className="grow">
          <b>{t('donation_recorded')}</b>
          <small>{inr(d.amount)} · {d.payment_mode === 'upi' ? 'UPI' : t('cash')} · {d.donor_name}</small>
        </div>
      </div>
      <div className="lbl">{t('donor_gets_this')}</div>
      <div className="wall"><div className="bubble">{msg}<span className="tm">{fmtTime(d.collected_at)} ✓✓</span></div></div>
      {d.mobile && (
        <a className="btn wa block" style={{ padding: 15, fontSize: 16 }} href={waLink(d.mobile, msg)} target="_blank" rel="noopener noreferrer" onClick={markShared}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4 5.2 5.2 0 0 0 3.2.7 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>
          {t('send_whatsapp')}
        </a>
      )}
      <p className="hint" style={{ textAlign: 'center', fontSize: 12 }}>{d.shared_at ? t('shared_at', { time: fmtTime(d.shared_at) }) : t('one_tap_hint')}</p>
      <div className="grid2">
        {d.mobile && <a className="btn ghost" href={smsLink(d.mobile, msg)} onClick={markShared}>{t('send_sms')}</a>}
        <button className="btn ghost" onClick={async () => { if (await copyText(msg)) toast(t('copied'), 'success'); }}>{t('copy_message')}</button>
      </div>
      <a className="btn link" style={{ alignSelf: 'center' }} href={receiptLink(settings, d.verify_token)} target="_blank" rel="noopener noreferrer">{t('view_receipt_page')}</a>
      <Link to="/donate" className="btn primary block" style={{ padding: 15 }}>{t('next_donation')}</Link>
    </Page>
  );
}

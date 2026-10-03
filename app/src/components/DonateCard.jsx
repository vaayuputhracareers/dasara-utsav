import { useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { inr } from '../lib/format.js';
import { upiLink, donateNote } from '../lib/receipt.js';
import { copyText, useToast } from './ui.jsx';
import { QrImage, qrDataUrl } from './QrImage.jsx';

/**
 * Public page → "Donate": opens the visitor's UPI apps (GPay, PhonePe, Paytm, BHIM…) to pay the temple UPI ID.
 * Backups for phones where no app opens or the app refuses a payment that comes from a link:
 * copy the UPI ID, or the UPI QR (shown at once on laptops; "Save QR" → scan it from the gallery in any UPI app).
 * The QR never carries an amount (UPI apps refuse gallery scans with a fixed amount above ₹2000).
 */
export default function DonateCard({ donate, branding }) {
  const { t } = useLang();
  const toast = useToast();
  const ref = useRef(null);
  const [amt, setAmt] = useState('');
  const [other, setOther] = useState(false);
  const [wide] = useState(() => !!window.matchMedia?.('(min-width: 900px) and (pointer: fine)').matches);
  const [showQr, setShowQr] = useState(wide);
  const amounts = (Array.isArray(donate.amounts) ? donate.amounts : []).map(Number).filter((a) => a > 0).slice(0, 8);
  const note = donateNote(branding);
  const amount = Number(amt) || 0;
  const payLink = upiLink({ upiId: donate.upi_id, payee: donate.payee, amount, note });
  const qrText = upiLink({ upiId: donate.upi_id, payee: donate.payee, note });

  useEffect(() => {   // the "donation link" (…/p/<code>#donate) jumps here
    if (window.location.hash !== '#donate' || !ref.current) return;
    ref.current.scrollIntoView({ block: 'start' });
    ref.current.classList.add('flash');
  }, []);

  const pick = (a) => { setOther(false); setAmt(amount === a && !other ? '' : String(a)); };
  const saveQr = async () => {
    const url = await qrDataUrl(qrText, { color: { dark: '#561010', light: '#ffffff' } });
    const a = document.createElement('a'); a.href = url; a.download = 'temple-upi-qr.png'; document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <section className="card donate" id="donate" ref={ref} data-testid="donate">
      <div className="donate-title">{t('donate_title')}</div>
      <p className="donate-sub">{t('donate_sub')}</p>
      {amounts.length > 0 && (
        <div className="chips" data-testid="donate-amounts">
          {amounts.map((a) => (
            <button key={a} type="button" className={`chip ${!other && amount === a ? 'on' : ''}`} onClick={() => pick(a)}>{inr(a)}</button>
          ))}
          <button type="button" className={`chip ${other ? 'on' : ''}`} onClick={() => { setOther(true); setAmt(''); }} data-testid="donate-other">{t('other_amount')}</button>
        </div>
      )}
      {(other || amounts.length === 0) && (
        <input className="input num donate-input" inputMode="numeric" autoComplete="off" placeholder={`₹ ${t('donate_amount_ph')}`} value={amt}
          onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 7))} data-testid="donate-amount-input" />
      )}
      <a className="btn primary block donate-pay" href={payLink} data-testid="donate-pay">
        {amount > 0 ? t('donate_pay_amt', { amount: inr(amount) }) : t('donate_pay')}
      </a>
      <div className="donate-upi">
        <span>{t('upi_id_short')}: <b className="mono" data-testid="donate-upi-id">{donate.upi_id}</b></span>
        <button type="button" className="btn ghost xs" onClick={async () => { if (await copyText(donate.upi_id)) toast(t('donate_copied'), 'success', 4000); }} data-testid="donate-copy">{t('copy')}</button>
        <button type="button" className="btn ghost xs" onClick={() => setShowQr((v) => !v)} data-testid="donate-qr-toggle">{showQr ? t('donate_hide_qr') : t('donate_show_qr')}</button>
      </div>
      {showQr && (
        <div className="donate-qr" data-testid="donate-qr">
          <QrImage text={qrText} dark="#561010" alt="UPI QR" />
          <div className="donate-payee">{donate.payee}</div>
          <p className="hint">{t(wide ? 'donate_qr_hint_pc' : 'donate_qr_hint')}</p>
          <button type="button" className="btn ghost sm" onClick={saveQr} data-testid="donate-save-qr">{t('donate_save_qr')}</button>
        </div>
      )}
      <p className="hint donate-help">{t('donate_help')}</p>
    </section>
  );
}

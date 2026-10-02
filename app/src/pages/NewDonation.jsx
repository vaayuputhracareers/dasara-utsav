import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, cleanMobile, isValidMobile } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { num, inr, personName } from '../lib/format.js';
import { upiLink } from '../lib/receipt.js';
import { Page, Field, Seg, Modal, useToast } from '../components/ui.jsx';
import { QrImage } from '../components/QrImage.jsx';

const LAST_VILLAGE = 'utsav.lastVillage';
const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (window.crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

export default function NewDonation() {
  const { t, P, L, lang } = useLang();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const nav = useNavigate();
  const toast = useToast();
  const purposes = Array.isArray(settings.purposes) ? settings.purposes : [];
  const quick = Array.isArray(settings.quick_amounts) ? settings.quick_amounts : [];
  const blank = useMemo(() => ({ donor_name: '', mobile: '', amount: '', payment_mode: 'cash', village: localStorage.getItem(LAST_VILLAGE) || '', gotram: '', purpose: purposes.length ? '0' : '', notes: '', upi_ref: '' }), [purposes.length]);
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [upiOpen, setUpiOpen] = useState(false);
  const [clientId] = useState(newId); // same id on retry → never a duplicate receipt
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const validate = () => {
    const er = {};
    if (!f.donor_name.trim()) er.donor_name = t('err_donor_name_required');
    if (!isValidMobile(f.mobile)) er.mobile = t('mobile_invalid');
    if (!(Number(f.amount) > 0)) er.amount = t('amount_invalid');
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !validate()) return;
    const amount = Math.round(Number(f.amount) * 100) / 100;
    if (amount >= 50000 && !window.confirm(t('confirm_big_amount', { amount: num(amount) }))) return;
    setBusy(true);
    const p = f.purpose !== '' ? purposes[Number(f.purpose)] : null;
    const row = {
      id: clientId,
      donor_name: f.donor_name.trim(), mobile: cleanMobile(f.mobile), amount, payment_mode: f.payment_mode,
      village: f.village.trim() || null, gotram: f.gotram.trim() || null,
      purpose_te: p?.te || null, purpose_en: p?.en || null, notes: f.notes.trim() || null,
      upi_ref: f.payment_mode === 'upi' ? (f.upi_ref.trim() || null) : null, collected_by: profile.id,
    };
    let { data, error } = await supabase.from('donations').insert(row).select().single();
    if (error && (error.code === '23505' || /donations_pkey|duplicate key/i.test(error.message || ''))) {
      // first attempt actually reached the server (weak network) → show that receipt
      const again = await supabase.from('donations').select('*').eq('id', clientId).maybeSingle();
      if (again.data) { data = again.data; error = null; }
    }
    setBusy(false);
    if (error) { toast(errMsg(error, t), 'error', 5000); return; }
    if (row.village) localStorage.setItem(LAST_VILLAGE, row.village);
    nav(`/donate/done/${data.id}`, { state: { donation: data } });
  };

  const upiText = settings.upi_id ? upiLink({ upiId: settings.upi_id, payee: settings.upi_payee_name || L(settings, 'temple_name'), amount: f.amount, note: `${settings.receipt_prefix || ''} ${f.donor_name}`.trim() }) : '';

  return (
    <Page title={t('nav_new_donation')} sub={t('collecting_as', { name: personName(profile, lang) })}>
      <form className="card pad-lg stack" onSubmit={submit} noValidate>
        <Field label={`${t('donor_name')} *`} error={errors.donor_name}>
          <input className={`input ${errors.donor_name ? 'bad' : ''}`} value={f.donor_name} onChange={(e) => set('donor_name', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={`${t('donor_mobile')} *`} error={errors.mobile}>
          <input className={`input num ${errors.mobile ? 'bad' : ''}`} inputMode="tel" placeholder="98765 43210" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} autoComplete="off" />
        </Field>
        <Field label={`${t('amount')} *`} error={errors.amount}>
          {quick.length > 0 && (
            <div className="chips" style={{ marginBottom: 6 }}>
              {quick.map((q) => (
                <button type="button" key={q} className={`chip ${Number(f.amount) === Number(q) ? 'on' : ''}`} onClick={() => set('amount', String(q))}>₹{num(q)}</button>
              ))}
            </div>
          )}
          <input className={`input big ${errors.amount ? 'bad' : ''}`} inputMode="decimal" placeholder={`₹ ${t('other_amount')}`} value={f.amount} onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
        <Field label={`${t('payment_mode')} *`}>
          <Seg value={f.payment_mode} onChange={(v) => set('payment_mode', v)} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: '📱 UPI' }]} />
        </Field>
        {f.payment_mode === 'upi' && (
          <div className="stack tight" style={{ background: 'var(--orange-l)', borderRadius: 12, padding: 10 }}>
            <button type="button" className="btn maroon block" onClick={() => setUpiOpen(true)}>{t('show_upi_qr')}</button>
            <Field label={t('upi_ref')} optional>
              <input className="input num" value={f.upi_ref} onChange={(e) => set('upi_ref', e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        )}
        <div className="grid2">
          <Field label={t('village_street')} optional><input className="input" value={f.village} onChange={(e) => set('village', e.target.value)} /></Field>
          <Field label={t('gotram')} optional><input className="input" value={f.gotram} onChange={(e) => set('gotram', e.target.value)} /></Field>
        </div>
        {purposes.length > 0 && (
          <Field label={t('purpose')}>
            <select className="input" value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
              {purposes.map((p, i) => <option key={i} value={String(i)}>{P(p)}</option>)}
            </select>
          </Field>
        )}
        {showNotes ? (
          <Field label={t('notes')} optional><textarea className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        ) : (
          <button type="button" className="btn link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowNotes(true)}>{t('more_fields')}</button>
        )}
        <button className="btn primary block" style={{ padding: 15, fontSize: 15.5 }} disabled={busy}>{busy ? t('saving') : t('save_send')}</button>
      </form>

      <Modal open={upiOpen} onClose={() => setUpiOpen(false)} title="📱 UPI">
        {settings.upi_id ? (
          <div className="stack" style={{ textAlign: 'center' }}>
            <QrImage text={upiText} />
            <div className="num" style={{ fontSize: 24, fontWeight: 900, color: 'var(--maroon)' }}>{Number(f.amount) > 0 ? inr(f.amount) : ''}</div>
            <div style={{ fontWeight: 700 }}>{settings.upi_payee_name || L(settings, 'temple_name')}</div>
            <div className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{settings.upi_id}</div>
            <p className="hint" style={{ fontSize: 13 }}>{t('upi_scan_hint')}</p>
            <div className="alert info">{t('upi_after_pay')}</div>
            <button className="btn primary block" onClick={() => setUpiOpen(false)}>✓ OK</button>
          </div>
        ) : <div className="alert warn">{t('upi_not_set')}</div>}
      </Modal>
    </Page>
  );
}

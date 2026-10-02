import { useState } from 'react';
import { supabase, cleanMobile, isValidMobile } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { inr, fmtDateTime, personName } from '../lib/format.js';
import { buildReceiptMessage, waLink, smsLink, receiptLink } from '../lib/receipt.js';
import { Modal, Field, Seg, Badge, useToast, copyText } from './ui.jsx';

export function DonationBadges({ d }) {
  const { t } = useLang();
  return (
    <>
      {d.status === 'cancelled' && <Badge tone="red">{t('cancelled')}</Badge>}
      {d.status === 'active' && d.payment_mode === 'cash' && (d.handover_id ? <Badge tone="green">{t('handed_over')}</Badge> : <Badge tone="orange">{t('with_member')}</Badge>)}
      {d.status === 'active' && d.payment_mode === 'upi' && (d.upi_verified ? <Badge tone="green">{t('upi_verified')}</Badge> : <Badge tone="blue">{t('upi_unverified')}</Badge>)}
    </>
  );
}

export default function DonationDetail({ d, onClose, onChanged }) {
  const { t, lang, P } = useLang();
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [mode, setMode] = useState('view'); // view | edit | cancel
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(null);
  if (!d) return null;
  const collectorName = d.collector ? (d.collector.name_te || d.collector.full_name) : '';
  const msg = buildReceiptMessage(settings, d, collectorName);
  const purposes = Array.isArray(settings.purposes) ? settings.purposes : [];

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg, 'success'); onChanged?.(); onClose(); } catch (e) { toast(errMsg(e, t), 'error', 5000); }
    setBusy(false);
  };
  const doCancel = () => {
    if (!reason.trim()) { toast(t('err_reason_required'), 'error'); return; }
    run(async () => { const { error } = await supabase.rpc('cancel_donation', { p_id: d.id, p_reason: reason.trim() }); if (error) throw error; }, t('donation_cancelled'));
  };
  const toggleUpi = () => run(async () => { const { error } = await supabase.rpc('set_upi_verified', { p_id: d.id, p_value: !d.upi_verified }); if (error) throw error; }, t('saved'));
  const startEdit = () => {
    const pi = purposes.findIndex((p) => p.te === d.purpose_te && p.en === d.purpose_en);
    setF({ donor_name: d.donor_name, mobile: d.mobile || '', amount: String(d.amount), payment_mode: d.payment_mode, village: d.village || '', gotram: d.gotram || '', purpose: pi >= 0 ? String(pi) : '', notes: d.notes || '', upi_ref: d.upi_ref || '' });
    setMode('edit');
  };
  const saveEdit = () => {
    if (!f.donor_name.trim()) return toast(t('err_donor_name_required'), 'error');
    if (!isValidMobile(f.mobile)) return toast(t('mobile_invalid'), 'error');
    if (!(Number(f.amount) > 0)) return toast(t('amount_invalid'), 'error');
    const p = f.purpose !== '' ? purposes[Number(f.purpose)] : null;
    run(async () => {
      const patch = { donor_name: f.donor_name.trim(), mobile: cleanMobile(f.mobile), amount: Number(f.amount), payment_mode: f.payment_mode, village: f.village.trim() || null, gotram: f.gotram.trim() || null, notes: f.notes.trim() || null, upi_ref: f.upi_ref.trim() || null };
      if (p) { patch.purpose_te = p.te; patch.purpose_en = p.en; }
      const { error } = await supabase.from('donations').update(patch).eq('id', d.id);
      if (error) throw error;
    }, t('donation_updated'));
  };

  return (
    <Modal open={!!d} onClose={onClose} title={`🧾 ${d.receipt_no}`}>
      {mode === 'view' && (
        <div className="stack">
          <div className="row between">
            <div className="num" style={{ fontSize: 26, fontWeight: 900, color: d.status === 'cancelled' ? 'var(--muted)' : 'var(--maroon)', textDecoration: d.status === 'cancelled' ? 'line-through' : 'none' }}>{inr(d.amount)}</div>
            <div><DonationBadges d={d} /></div>
          </div>
          <dl className="kv">
            <dt>{t('donor_name')}</dt><dd>{d.donor_name}</dd>
            <dt>{t('mobile')}</dt><dd className="num">{d.mobile || '—'}</dd>
            <dt>{t('payment_mode')}</dt><dd>{d.payment_mode === 'upi' ? 'UPI' : t('cash')}{d.upi_ref ? ` · ${d.upi_ref}` : ''}</dd>
            {d.village && <><dt>{t('village_street')}</dt><dd>{d.village}</dd></>}
            {d.gotram && <><dt>{t('gotram')}</dt><dd>{d.gotram}</dd></>}
            {(d.purpose_te || d.purpose_en) && <><dt>{t('purpose')}</dt><dd>{P({ te: d.purpose_te, en: d.purpose_en })}</dd></>}
            {d.notes && <><dt>{t('notes')}</dt><dd>{d.notes}</dd></>}
            <dt>{t('date')}</dt><dd className="num">{fmtDateTime(d.collected_at, lang)}</dd>
            {d.collector && <><dt>{t('collector')}</dt><dd>{personName(d.collector, lang)}</dd></>}
            <dt>WhatsApp</dt><dd>{d.shared_at ? t('shared_at', { time: fmtDateTime(d.shared_at, lang) }) : t('not_shared')}</dd>
            {d.status === 'cancelled' && <><dt>{t('cancelled')}</dt><dd>{t('reason_x', { reason: d.cancel_reason })} · {fmtDateTime(d.cancelled_at, lang)}</dd></>}
          </dl>
          {d.status === 'active' && d.mobile && (
            <div className="grid2">
              <a className="btn wa sm" href={waLink(d.mobile, msg)} target="_blank" rel="noopener noreferrer" onClick={() => supabase.rpc('mark_receipt_shared', { p_id: d.id })}>WhatsApp</a>
              <a className="btn ghost sm" href={smsLink(d.mobile, msg)}>{t('send_sms')}</a>
            </div>
          )}
          <div className="grid2">
            <button className="btn ghost sm" onClick={async () => { if (await copyText(msg)) toast(t('copied'), 'success'); }}>{t('copy_message')}</button>
            <a className="btn ghost sm" href={receiptLink(settings, d.verify_token)} target="_blank" rel="noopener noreferrer">{t('view_receipt_page')}</a>
          </div>
          {isAdmin && d.status === 'active' && (
            <div className="stack tight" style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
              {d.payment_mode === 'upi' && (
                <button className={`btn ${d.upi_verified ? 'ghost' : 'ok'} sm`} disabled={busy} onClick={toggleUpi}>{d.upi_verified ? t('unmark_upi') : t('mark_upi_verified')}</button>
              )}
              <div className="grid2">
                <button className="btn ghost sm" onClick={startEdit}>✏️ {t('edit')}</button>
                <button className="btn ghost danger-t sm" onClick={() => setMode('cancel')}>{t('cancel_donation')}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {mode === 'cancel' && (
        <div className="stack">
          <div className="alert err">{d.receipt_no} · {d.donor_name} · {inr(d.amount)}</div>
          <Field label={`${t('cancel_reason')} *`}><textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          <div className="grid2">
            <button className="btn ghost" onClick={() => setMode('view')}>{t('cancel')}</button>
            <button className="btn danger" disabled={busy} onClick={doCancel}>{t('cancel_confirm_btn')}</button>
          </div>
        </div>
      )}
      {mode === 'edit' && f && (
        <div className="stack">
          <Field label={t('donor_name')}><input className="input" value={f.donor_name} onChange={(e) => setF({ ...f, donor_name: e.target.value })} /></Field>
          <Field label={t('mobile')}><input className="input num" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label={t('amount')}><input className="input big" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
          <Field label={t('payment_mode')}><Seg value={f.payment_mode} onChange={(v) => setF({ ...f, payment_mode: v })} options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: '📱 UPI' }]} /></Field>
          {f.payment_mode === 'upi' && <Field label={t('upi_ref')} optional><input className="input num" value={f.upi_ref} onChange={(e) => setF({ ...f, upi_ref: e.target.value })} /></Field>}
          <div className="grid2">
            <Field label={t('village_street')}><input className="input" value={f.village} onChange={(e) => setF({ ...f, village: e.target.value })} /></Field>
            <Field label={t('gotram')}><input className="input" value={f.gotram} onChange={(e) => setF({ ...f, gotram: e.target.value })} /></Field>
          </div>
          {purposes.length > 0 && (
            <Field label={t('purpose')}>
              <select className="input" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
                <option value="">—</option>
                {purposes.map((p, i) => <option key={i} value={String(i)}>{P(p)}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('notes')}><textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div className="grid2">
            <button className="btn ghost" onClick={() => setMode('view')}>{t('cancel')}</button>
            <button className="btn primary" disabled={busy} onClick={saveEdit}>{busy ? t('saving') : t('save')}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

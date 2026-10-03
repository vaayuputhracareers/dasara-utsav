import { useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { compressImage } from '../lib/image.js';
import { DEFAULT_TEMPLATE, TEMPLATE_TAGS, appBaseUrl, buildReceiptMessage } from '../lib/receipt.js';
import { Page, Field, Switch, useToast } from '../components/ui.jsx';
import { ExportCard, DeleteCard, useDbVersion } from '../components/DataTools.jsx';

const FIELDS = ['temple_name_te', 'temple_name_en', 'committee_name_te', 'committee_name_en', 'village_te', 'village_en',
  'address_te', 'address_en', 'contact_phone', 'logo_url', 'event_title_te', 'event_title_en', 'event_year', 'start_date',
  'end_date', 'receipt_prefix', 'upi_id', 'upi_payee_name', 'receipt_template', 'allow_self_signup', 'public_base_url'];

function Pair({ label, k, f, set }) {
  const { t } = useLang();
  return (
    <Field label={label}>
      <div className="stack tight">
        <input className="input" placeholder={t('te')} value={f[`${k}_te`] || ''} onChange={(e) => set(`${k}_te`, e.target.value)} />
        <input className="input" placeholder="English" value={f[`${k}_en`] || ''} onChange={(e) => set(`${k}_en`, e.target.value)} />
      </div>
    </Field>
  );
}

function ListEditor({ items, onChange }) {
  const { t } = useLang();
  const upd = (i, k, v) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <div className="stack tight">
      {items.map((it, i) => (
        <div key={i} className="row" style={{ alignItems: 'stretch' }}>
          <div className="grow stack tight">
            <input className="input" placeholder={t('te')} value={it.te || ''} onChange={(e) => upd(i, 'te', e.target.value)} />
            <input className="input" placeholder="English" value={it.en || ''} onChange={(e) => upd(i, 'en', e.target.value)} />
          </div>
          <div className="stack tight" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn ghost xs" onClick={() => move(i, -1)} aria-label="up">▲</button>
            <button type="button" className="btn ghost danger-t xs" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="remove">✕</button>
            <button type="button" className="btn ghost xs" onClick={() => move(i, 1)} aria-label="down">▼</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...items, { te: '', en: '' }])}>{t('add_item')}</button>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useLang();
  const { profile } = useAuth();
  const { settings, save } = useSettings();
  const toast = useToast();
  const init = useMemo(() => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, settings[k] ?? ''])),
    quick_amounts_text: (settings.quick_amounts || []).join(', '),
    purposes: Array.isArray(settings.purposes) ? settings.purposes : [],
    expense_categories: Array.isArray(settings.expense_categories) ? settings.expense_categories : [],
  }), [settings]);
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dbVersion, checkDb] = useDbVersion();
  const [dataKey, setDataKey] = useState(0);
  const tplRef = useRef(null);
  const logoRef = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);

  const insertTag = (tag) => {
    const el = tplRef.current;
    const ins = `{${tag}}`;
    if (!el) return set('receipt_template', f.receipt_template + ins);
    const s = el.selectionStart ?? f.receipt_template.length, e = el.selectionEnd ?? s;
    const v = f.receipt_template.slice(0, s) + ins + f.receipt_template.slice(e);
    set('receipt_template', v);
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = s + ins.length; }, 0);
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file, 600, 0.85);
      const path = `logo-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('assets').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('assets').getPublicUrl(path);
      set('logo_url', data.publicUrl);
      toast(t('logo_uploaded'), 'success');
    } catch (e) { toast(errMsg(e, t), 'error', 5000); }
    setUploading(false);
  };

  const submit = async () => {
    const amounts = f.quick_amounts_text.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0).slice(0, 12);
    const clean = (arr) => arr.map((x) => ({ te: (x.te || '').trim(), en: (x.en || '').trim() })).filter((x) => x.te || x.en);
    const patch = Object.fromEntries(FIELDS.map((k) => [k, typeof f[k] === 'string' ? f[k].trim() : f[k]]));
    patch.event_year = parseInt(f.event_year, 10) || new Date().getFullYear();
    patch.start_date = f.start_date || null;
    patch.end_date = f.end_date || null;
    patch.receipt_prefix = (f.receipt_prefix || '').trim().toUpperCase().replace(/\s+/g, '') || 'RCPT';
    patch.receipt_template = f.receipt_template?.trim() ? f.receipt_template : DEFAULT_TEMPLATE;
    patch.quick_amounts = amounts;
    patch.purposes = clean(f.purposes);
    patch.expense_categories = clean(f.expense_categories);
    patch.allow_self_signup = !!f.allow_self_signup;
    setBusy(true);
    try { await save(patch); toast(t('settings_saved'), 'success'); } catch (e) { toast(errMsg(e, t), 'error', 5000); }
    setBusy(false);
  };

  const preview = buildReceiptMessage(
    { ...settings, ...f, purposes: f.purposes },
    { donor_name: 'కొండా వెంకట రమణ', amount: 1116, receipt_no: `${(f.receipt_prefix || 'RCPT').toUpperCase()}-0001`, payment_mode: 'cash', purpose_te: f.purposes[0]?.te, purpose_en: f.purposes[0]?.en, collected_at: new Date().toISOString(), verify_token: 'a1b2c3d4e5f6' },
    profile.name_te || profile.full_name,
  );

  return (
    <Page title={`⚙️ ${t('nav_settings')}`} back="/more">
      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_temple')}</div>
        <Pair label={t('temple_name')} k="temple_name" f={f} set={set} />
        <Pair label={t('committee_name')} k="committee_name" f={f} set={set} />
        <Pair label={t('village')} k="village" f={f} set={set} />
        <Pair label={t('address')} k="address" f={f} set={set} />
        <Field label={t('contact_phone')} optional><input className="input num" inputMode="tel" value={f.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} /></Field>
        <Field label={t('logo')} optional>
          <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <div className="row">
            {f.logo_url ? <img src={f.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--line)' }} /> : <div style={{ fontSize: 40 }}>🪔</div>}
            <button type="button" className="btn ghost sm" disabled={uploading} onClick={() => logoRef.current?.click()}>{uploading ? t('uploading_photo') : t('upload_logo')}</button>
            {f.logo_url && <button type="button" className="btn ghost danger-t sm" onClick={() => set('logo_url', '')}>{t('remove_logo')}</button>}
          </div>
        </Field>
      </div>

      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_festival')}</div>
        <Pair label={t('event_title')} k="event_title" f={f} set={set} />
        <div className="grid2">
          <Field label={t('year')}><input className="input num" inputMode="numeric" value={f.event_year} onChange={(e) => set('event_year', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label={t('receipt_prefix')} hint={t('receipt_prefix_hint')}><input className="input mono" value={f.receipt_prefix} onChange={(e) => set('receipt_prefix', e.target.value.toUpperCase())} maxLength={12} /></Field>
        </div>
        <div className="grid2">
          <Field label={t('start_date')}><input type="date" className="input" value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label={t('end_date')}><input type="date" className="input" value={f.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
      </div>

      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_donations')}</div>
        <div className="grid2">
          <Field label={t('upi_id')} optional><input className="input mono" placeholder="temple@sbi" value={f.upi_id} onChange={(e) => set('upi_id', e.target.value.trim())} /></Field>
          <Field label={t('upi_payee')} optional><input className="input" value={f.upi_payee_name} onChange={(e) => set('upi_payee_name', e.target.value)} /></Field>
        </div>
        <Field label={t('quick_amounts')}><input className="input num" value={f.quick_amounts_text} onChange={(e) => set('quick_amounts_text', e.target.value)} placeholder="116, 216, 516, 1116" /></Field>
        <Field label={t('purposes')}><ListEditor items={f.purposes} onChange={(v) => set('purposes', v)} /></Field>
      </div>

      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_expenses')}</div>
        <ListEditor items={f.expense_categories} onChange={(v) => set('expense_categories', v)} />
      </div>

      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_receipt')}<button type="button" className="btn ghost xs" onClick={() => set('receipt_template', DEFAULT_TEMPLATE)}>{t('reset_default')}</button></div>
        <p className="hint" style={{ fontSize: 12 }}>{t('receipt_tpl_hint')}</p>
        <div className="chips">{TEMPLATE_TAGS.map((tag) => <button type="button" key={tag} className="chip tag" onClick={() => insertTag(tag)}>{`{${tag}}`}</button>)}</div>
        <textarea ref={tplRef} className="input" style={{ minHeight: 260, fontSize: 14, fontWeight: 500 }} value={f.receipt_template} onChange={(e) => set('receipt_template', e.target.value)} />
        <div className="lbl">👁️ {t('preview')} ({t('sample_values')})</div>
        <div className="wall"><div className="bubble">{preview}</div></div>
      </div>

      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_signup')}</div>
        <div className="toggle-row"><span>{t('allow_signup')}</span><Switch checked={f.allow_self_signup} onChange={(v) => set('allow_self_signup', v)} /></div>
      </div>

      <div className="card pad-lg stack">
        <div className="card-title">{t('sec_link')}</div>
        <Field label={t('public_base_url')} hint={t('public_base_url_hint', { url: appBaseUrl(null) })}>
          <input className="input mono" placeholder="https://your-name.github.io/dasara-utsav" value={f.public_base_url} onChange={(e) => set('public_base_url', e.target.value.trim())} />
        </Field>
      </div>

      <div style={{ position: 'sticky', bottom: 'calc(78px + env(safe-area-inset-bottom))', zIndex: 5 }}>
        {dirty && <div className="alert warn" style={{ marginBottom: 6 }}>✏️ {t('unsaved')}</div>}
        <button className="btn primary block" style={{ padding: 15 }} disabled={busy || !dirty} onClick={submit}>{busy ? t('saving') : t('save_settings')}</button>
      </div>

      {/* Admin-only data tools (this whole page is admin-only; the server checks again) */}
      <div id="data" className="sec-head">{t('data_sec_title')}</div>
      <ExportCard key={`export-${dataKey}`} />
      <DeleteCard dbVersion={dbVersion} onCheckDb={checkDb} onDeleted={() => setDataKey((k) => k + 1)} />
    </Page>
  );
}

// Hundi cash collections (version 16) – admin only. Every entry is also saved as a cash donation (receipt) with the
// SAME id, so it counts in the donations, the dashboard and cash in hand. Edit → its receipt changes too;
// delete → the entry is removed and its receipt is cancelled (receipts are never deleted).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, fmtDay, todayIST } from '../lib/format.js';
import { isMissing, toAmount } from '../lib/festival.js';
import { Page, Spinner, Modal, Field, useToast, Empty } from '../components/ui.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';

const blank = () => ({ collected_on: todayIST(), amount: '', hundi_name: '', counted_by: '', note: '' });

function HundiDbUpdate() {
  const { t } = useLang();
  const [v, check] = useDbVersion();
  return (
    <div className="stack">
      <div className="alert warn">{t('hundi_needs_db')}</div>
      <DbUpdateNotice version={v} onCheck={check} />
    </div>
  );
}

export default function Hundi() {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');

  const { data, loading, error, reload } = useAsync(async () => {
    const h = await supabase.from('hundi_collections').select('*').order('collected_on', { ascending: false }).order('created_at', { ascending: false });
    if (h.error && isMissing(h.error)) return { missing: true };
    if (h.error) throw h.error;
    const rows = h.data || [];
    const receipts = {};   // entry id → its donation receipt (same id)
    const ids = rows.map((x) => x.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rs } = await supabase.from('donations').select('id, receipt_no, status').in('id', ids.slice(i, i + 100));
      (rs || []).forEach((r) => { receipts[r.id] = r; });
    }
    return { rows, receipts };
  }, []);

  // purpose = the Settings purpose that mentions hundi, else "Hundi"
  const purposes = Array.isArray(settings.purposes) ? settings.purposes : [];
  const hp = purposes.find((x) => /hundi|హుండీ/i.test(`${x?.te || ''} ${x?.en || ''}`)) || { te: 'హుండీ', en: 'Hundi' };
  const donorName = (h) => [t('hundi_donor'), String(h.hundi_name || '').trim()].filter(Boolean).join(' – ');
  const donationNote = (h) => [
    `${t('hundi_donor')} ${fmtDay(h.collected_on, lang)}`,
    String(h.counted_by || '').trim() ? `${t('counted_by')}: ${String(h.counted_by).trim()}` : '',
    String(h.note || '').trim(),
  ].filter(Boolean).join(' · ');

  /** Same steps as a normal donation (receipt number, History); same id as the entry → never added twice. */
  const addDonation = async (h) => {
    const row = {
      id: h.id, donor_name: donorName(h), mobile: null, amount: Number(h.amount), payment_mode: 'cash', village: null, gotram: null,
      purpose_te: hp.te || null, purpose_en: hp.en || null, notes: donationNote(h) || null, upi_ref: null, collected_by: profile.id,
    };
    let { data: dn, error: de } = await supabase.from('donations').insert(row).select('id, receipt_no, status').single();
    if (de && (de.code === '23505' || /donations_pkey|duplicate key/i.test(de.message || ''))) {
      const again = await supabase.from('donations').select('id, receipt_no, status').eq('id', h.id).maybeSingle();
      if (again.data) { dn = again.data; de = null; }
    }
    return de ? { error: de } : dn;
  };

  const save = async () => {
    const f = form;
    const amount = toAmount(f.amount);
    if (!(amount > 0)) { toast(t('err_invalid_amount'), 'error'); return; }
    setBusy(t('saving'));
    const row = { collected_on: f.collected_on || todayIST(), amount, hundi_name: (f.hundi_name || '').trim(), counted_by: (f.counted_by || '').trim(), note: (f.note || '').trim() };
    const { data: done, error: e } = f.id
      ? await supabase.from('hundi_collections').update(row).eq('id', f.id).select('id')
      : await supabase.from('hundi_collections').insert({ ...row, created_by: profile.id }).select('id');
    if (e) { setBusy(''); toast(errMsg(e, t), 'error'); return; }
    if (!done?.length) { setBusy(''); toast(t('hundi_not_changed'), 'error'); return; }
    const full = { ...row, id: done[0].id };
    const linked = data?.receipts?.[full.id];
    let okMsg = t('hundi_saved'); let bad = '';
    if (linked && linked.status === 'active') {   // keep its receipt the same as the entry
      const { error: de } = await supabase.from('donations').update({ donor_name: donorName(full), amount, notes: donationNote(full) || null }).eq('id', full.id);
      if (de) bad = t('hundi_receipt_not_updated', { no: linked.receipt_no, err: errMsg(de, t) });
    } else if (!linked) {
      const r = await addDonation(full);
      if (r.error) bad = t('hundi_not_in_donations', { err: errMsg(r.error, t) });
      else okMsg = t('hundi_saved_receipt', { no: r.receipt_no });
    }
    setBusy('');
    if (bad) toast(bad, 'error', 7000); else toast(okMsg, 'success');
    setForm(null);
    reload(true);
  };

  const remove = async (h) => {
    const rc = data?.receipts?.[h.id];
    const live = rc && rc.status === 'active';
    if (!window.confirm(live ? t('hundi_delete_confirm_rc', { amount: inr(h.amount), no: rc.receipt_no }) : t('hundi_delete_confirm', { amount: inr(h.amount) }))) return;
    setBusy(t('saving'));
    const { data: gone, error: e } = await supabase.from('hundi_collections').delete().eq('id', h.id).select('id');
    if (e) { setBusy(''); toast(errMsg(e, t), 'error'); return; }
    if (!gone?.length) { setBusy(''); toast(t('hundi_not_changed'), 'error'); reload(true); return; }
    let bad = '';
    if (live) {   // its receipt is cancelled too, so the donations stay right
      const { error: ce } = await supabase.rpc('cancel_donation', { p_id: h.id, p_reason: t('hundi_deleted_reason') });
      if (ce) bad = t('hundi_receipt_not_cancelled', { no: rc.receipt_no, err: errMsg(ce, t) });
    }
    setBusy('');
    if (bad) toast(bad, 'error', 7000); else toast(t('fest_deleted'), 'success');
    setForm(null);
    reload(true);
  };

  const toDonation = async (h) => {   // ➕ Add to donations – if saving the receipt failed earlier
    setBusy(t('saving'));
    const r = await addDonation(h);
    setBusy('');
    if (r.error) { toast(errMsg(r.error, t), 'error', 6000); return; }
    toast(t('added_to_donations', { no: r.receipt_no }), 'success');
    reload(true);
  };

  const ok = data && !data.missing;
  const rows = ok ? data.rows : [];
  const total = rows.reduce((s, x) => s + Number(x.amount || 0), 0);
  const set = (k) => (e) => { const v = e.target.value; setForm((x) => ({ ...x, [k]: v })); };
  const formRc = form?.id ? data?.receipts?.[form.id] : null;

  return (
    <Page title={`🪙 ${t('nav_hundi')}`} back="/more">
      {loading && !data ? <Spinner /> : error ? <div className="alert warn">{errMsg(error, t)}</div> : data?.missing ? <HundiDbUpdate /> : (
        <>
          <div className="card" data-testid="hundi-totals">
            <div className="mini">
              <div><small>{t('hundi_total')}</small><b className="num" data-testid="hundi-total">{inr(total)}</b></div>
              <div><small>{t('hundi_count')}</small><b className="num">{rows.length}</b></div>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>{t('hundi_hint')}</p>
          </div>
          <button type="button" className="btn primary block" onClick={() => setForm(blank())} data-testid="hundi-add">➕ {t('hundi_add')}</button>
          <div className="card" data-testid="hundi-list">
            {!rows.length ? <Empty icon="🪙" text={t('hundi_none')} /> : (
              <div className="list">
                {rows.map((h) => {
                  const rc = data.receipts[h.id];
                  return (
                    <div key={h.id} className="li" style={{ cursor: 'default' }} data-testid="hundi-row">
                      <div className="grow">
                        <div className="main-t">{fmtDay(h.collected_on, lang)}{h.hundi_name ? ` · ${h.hundi_name}` : ''}</div>
                        {h.counted_by && <div className="sub-t">👥 {t('counted_by')}: {h.counted_by}</div>}
                        {h.note && <div className="sub-t">📝 {h.note}</div>}
                        {rc && (
                          <Link to={`/donate/done/${h.id}`} className={`badge ${rc.status === 'active' ? 'green' : 'red'}`} style={{ display: 'inline-block', marginTop: 4 }} data-testid="hundi-receipt">
                            🧾 {rc.receipt_no} · {rc.status === 'active' ? t('in_donations') : t('cancelled')}
                          </Link>
                        )}
                        <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => setForm({ ...h, amount: String(Number(h.amount)) })} data-testid="hundi-edit">✏️ {t('edit')}</button>
                          <button type="button" className="btn ghost xs danger-t" disabled={!!busy} onClick={() => remove(h)} data-testid="hundi-delete">🗑️ {t('delete')}</button>
                          {!rc && <button type="button" className="btn ghost xs" disabled={!!busy} onClick={() => toDonation(h)} data-testid="hundi-to-donation">➕ {t('add_to_donations_btn')}</button>}
                        </div>
                      </div>
                      <div className="amt">{inr(h.amount)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={!!form} onClose={() => !busy && setForm(null)} title={form?.id ? t('hundi_edit') : t('hundi_add')}>
        {form && (
          <div className="stack" data-testid="hundi-form">
            <div className="grid2">
              <Field label={t('date')}><input type="date" className="input" value={form.collected_on} onChange={set('collected_on')} data-testid="hundi-date" /></Field>
              <Field label={`${t('amount')} *`}><input className="input num big" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="₹" data-testid="hundi-amount" /></Field>
            </div>
            <Field label={t('hundi_name_l')} optional><input className="input" value={form.hundi_name} onChange={set('hundi_name')} placeholder={t('hundi_name_ph')} data-testid="hundi-name" /></Field>
            <Field label={t('counted_by')} optional><input className="input" value={form.counted_by} onChange={set('counted_by')} placeholder={t('counted_by_ph')} data-testid="hundi-counted" /></Field>
            <Field label={t('note')} optional><input className="input" value={form.note} onChange={set('note')} data-testid="hundi-note" /></Field>
            {formRc ? (
              <div className={`alert ${formRc.status === 'active' ? 'info' : 'warn'}`} data-testid="hundi-linked">
                {formRc.status === 'active' ? t('pay_in_donations', { no: formRc.receipt_no }) : t('pay_receipt_cancelled', { no: formRc.receipt_no })}
              </div>
            ) : <p className="hint">🧾 {t('hundi_form_hint')}</p>}
            <div className="grid2">
              {form.id ? <button type="button" className="btn ghost danger-t" disabled={!!busy} onClick={() => remove(form)} data-testid="hundi-form-delete">🗑️ {t('delete')}</button> : <span />}
              <button type="button" className="btn primary" disabled={!!busy} onClick={save} data-testid="hundi-save">{busy || t('save')}</button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

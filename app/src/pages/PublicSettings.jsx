import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { publicPageLink, upiLink, donateNote, UPI_ID_RE } from '../lib/receipt.js';
import { Page, Switch, useToast, copyText, Modal, Field } from '../components/ui.jsx';
import { QrImage } from '../components/QrImage.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';
import { POSTER_ITEMS, resolvePoster, posterToSave, drawPoster, posterFile } from '../lib/poster.js';

const SECTIONS = ['show_programs', 'show_pujas', 'show_photos', 'show_saree_donors', 'show_auction', 'show_donation_total', 'show_donor_list', 'show_donor_amounts', 'show_expense_summary', 'show_expense_details', 'show_net_position'];

const canShareFiles = (() => {
  try { return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] }); } catch { return false; }
})();

async function downloadPoster(settings, link, cfg) {
  const file = await posterFile(settings, link, cfg);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function sharePoster(settings, link, cfg) {
  const file = await posterFile(settings, link, cfg);
  try { await navigator.share({ files: [file], title: 'QR poster' }); } catch (e) { if (e?.name !== 'AbortError') throw e; }
}

/** Poster preview: drawn off-screen, then copied in one go (no half-drawn frames while typing). */
function PosterCanvas({ settings, link, cfg, testid, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      drawPoster(document.createElement('canvas'), settings, link, cfg).then((off) => {
        const c = ref.current;
        if (!alive || !c) return;
        c.width = off.width; c.height = off.height;
        c.getContext('2d').drawImage(off, 0, 0);
        c.dataset.rendered = String(Number(c.dataset.rendered || 0) + 1);
      }).catch(() => {});
    }, 120);
    return () => { alive = false; clearTimeout(timer); };
  }, [settings, link, cfg]);
  return <canvas ref={ref} className={`poster-canvas ${onClick ? 'tap' : ''}`} data-testid={testid} width={1240} height={1754} onClick={onClick} />;
}

function PosterEditor({ open, onClose, settings, link, canSave }) {
  const { t } = useLang();
  const { save } = useSettings();
  const toast = useToast();
  const [cfg, setCfg] = useState(() => resolvePoster(settings, settings.qr_poster));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setCfg(resolvePoster(settings, settings.qr_poster)); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setItem = (k, patch) => setCfg((c) => ({ ...c, [k]: { ...c[k], ...patch } }));
  const doSave = async () => {
    setBusy(true);
    try { await save({ qr_poster: posterToSave(settings, cfg) }); toast(t('poster_saved'), 'success'); onClose(); } catch (e) { toast(errMsg(e, t), 'error'); }
    setBusy(false);
  };
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(String(e?.message || e), 'error'); } setBusy(false); };

  return (
    <Modal open={open} onClose={onClose} title={t('poster_edit_title')} wide>
      <div className="stack" data-testid="poster-editor">
        <div className="poster-live-wrap"><div className="poster-live"><PosterCanvas settings={settings} link={link} cfg={cfg} testid="poster-live" /></div></div>
        <p className="hint">{t('poster_hint')}</p>
        <div className="card" style={{ padding: '2px 12px' }}>
          {POSTER_ITEMS.map((it) => {
            const c = cfg[it.key];
            const noLogo = it.key === 'logo' && !settings.logo_url;
            return (
              <div key={it.key} className="poster-item" data-testid={`pi-${it.key}`}>
                <div className="toggle-row">
                  <span>{t(`pi_${it.key}`)}{noLogo && <small className="hint" style={{ display: 'block', fontWeight: 500 }}>{t('poster_no_logo')}</small>}</span>
                  <Switch checked={c.on && !noLogo} disabled={noLogo} onChange={(v) => setItem(it.key, { on: v })} />
                </div>
                {it.text && c.on && (
                  <input className="input" value={c.text} placeholder={t('poster_empty_ph')} onChange={(e) => setItem(it.key, { text: e.target.value, custom: true })} data-testid={`pi-${it.key}-text`} />
                )}
              </div>
            );
          })}
        </div>
        {!canSave && <div className="alert warn">{t('poster_needs_db')}</div>}
        <div className="grid2">
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setCfg(resolvePoster(settings, {}))} data-testid="poster-reset">{t('poster_reset')}</button>
          <button type="button" className="btn primary" disabled={busy || !canSave} onClick={doSave} data-testid="poster-save">{busy ? t('saving') : t('save')}</button>
        </div>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => downloadPoster(settings, link, cfg))} data-testid="poster-download-edit">{t('qr_poster')}</button>
      </div>
    </Modal>
  );
}

/** Donation link: a "Donate" button on the public page that opens the visitor's UPI apps to pay the temple UPI ID. */
function DonateSettings({ settings, link, toggle }) {
  const { t } = useLang();
  const { save } = useSettings();
  const toast = useToast();
  const initial = () => ({ upi_id: settings.upi_id || '', upi_payee_name: settings.upi_payee_name || '', amounts: (settings.quick_amounts || []).join(', ') });
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial());
  const donateLink = `${link}#donate`;
  const payee = settings.upi_payee_name || settings.temple_name_en || settings.temple_name_te || settings.committee_name_en;
  const testLink = settings.upi_id ? upiLink({ upiId: settings.upi_id, payee, note: donateNote(settings) }) : '';

  const saveUpi = async () => {
    const upi = f.upi_id.trim();
    if (upi && !UPI_ID_RE.test(upi)) return toast(t('upi_invalid'), 'error', 5000);
    const amounts = f.amounts.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0).slice(0, 12);
    setBusy(true);
    try {
      const d = await save({ upi_id: upi, upi_payee_name: f.upi_payee_name.trim(), ...(amounts.length ? { quick_amounts: amounts } : {}) });
      setF({ upi_id: d.upi_id || '', upi_payee_name: d.upi_payee_name || '', amounts: (d.quick_amounts || []).join(', ') });
      toast(t('saved'), 'success');
    } catch (e) { toast(errMsg(e, t), 'error'); }
    setBusy(false);
  };
  const status = !settings.upi_id ? ['warn', t('donate_need_upi')]
    : !settings.show_donate ? ['info', t('donate_off')]
      : !settings.public_enabled ? ['warn', t('donate_page_off')] : ['ok', t('donate_live')];

  return (
    <div className="card pad-lg stack" data-testid="donate-settings">
      <div className="toggle-row" data-testid="toggle-show_donate">
        <span>{t('donate_show')}</span><Switch checked={settings.show_donate} onChange={(v) => toggle('show_donate', v)} />
      </div>
      <Field label={t('upi_id')} hint={t('donate_upi_hint')}>
        <input className="input mono" value={f.upi_id} onChange={(e) => set('upi_id', e.target.value.replace(/\s/g, ''))} autoCapitalize="none" autoCorrect="off" spellCheck={false} data-testid="donate-upi" />
      </Field>
      <Field label={t('donate_payee')} hint={t('donate_payee_hint')} optional>
        <input className="input" value={f.upi_payee_name} onChange={(e) => set('upi_payee_name', e.target.value)} data-testid="donate-payee" />
      </Field>
      <Field label={t('donate_amounts')} hint={t('donate_amounts_hint')}>
        <input className="input num" value={f.amounts} onChange={(e) => set('amounts', e.target.value)} inputMode="numeric" data-testid="donate-amounts-input" />
      </Field>
      <button type="button" className="btn primary block" disabled={busy || !dirty} onClick={saveUpi} data-testid="donate-save">{busy ? t('saving') : t('save')}</button>
      <div className={`alert ${status[0]}`} data-testid="donate-status">{status[1]}</div>
      {settings.upi_id && (
        <>
          <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--muted)' }} data-testid="donate-link">🔗 {donateLink}</div>
          <div className="grid2">
            <button type="button" className="btn ghost sm" onClick={async () => { if (await copyText(donateLink)) toast(t('copied'), 'success'); }} data-testid="donate-link-copy">{t('copy')}</button>
            <a className="btn ghost sm" href={donateLink} target="_blank" rel="noopener noreferrer">{t('open_page')}</a>
          </div>
          <a className="btn ghost sm block" href={testLink} data-testid="donate-test">{t('donate_test')}</a>
        </>
      )}
      <p className="hint">💡 {t('donate_tip')}</p>
    </div>
  );
}

/** Before the version 6 database update: the "Copy SQL" steps instead of the new parts. */
function NeedsUpdate() {
  const { t } = useLang();
  const [version, check] = useDbVersion();
  return (
    <div className="stack" data-testid="v6-db-update">
      <div className="alert warn">{t('v6_needs_db')}</div>
      <DbUpdateNotice version={version} onCheck={async () => { await check(); window.location.reload(); }} />
    </div>
  );
}

export default function PublicSettings() {
  const { t } = useLang();
  const { settings, save, reload } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const link = publicPageLink(settings);
  const v6 = 'show_donate' in settings;   // database version 6: donation link + saved poster
  const cfg = useMemo(() => resolvePoster(settings, settings.qr_poster), [settings]);

  const toggle = async (k, v) => {
    const patch = { [k]: v };
    if (k === 'show_donor_list' && !v) patch.show_donor_amounts = false;
    try { await save(patch); } catch (e) { toast(errMsg(e, t), 'error'); }
  };
  const changeLink = async () => {
    if (!window.confirm(t('change_link_confirm'))) return;
    setBusy(true);
    const { error } = await supabase.rpc('regenerate_public_slug');
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    await reload();
    toast(t('link_changed'), 'success', 4000);
  };
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(String(e?.message || e), 'error'); } setBusy(false); };

  return (
    <Page title={`📱 ${t('nav_public')}`} back="/more">
      <div className="card pad-lg">
        <div className="toggle-row" style={{ fontSize: 15.5, color: 'var(--maroon)' }}>
          <span>{t('public_on')}</span><Switch checked={settings.public_enabled} onChange={(v) => toggle('public_enabled', v)} />
        </div>
        {!settings.public_enabled && <div className="alert warn" style={{ marginTop: 8 }}>{t('public_off_note')}</div>}
      </div>
      <div className="section-title">{t('what_visitors_see')}</div>
      <div className="card" style={{ padding: '2px 14px' }}>
        {SECTIONS.filter((k) => k in settings).map((k) => (
          <div key={k} className={`toggle-row ${k === 'show_donor_amounts' ? 'sub' : ''}`} data-testid={`toggle-${k}`}>
            <span>{t(k)}{k === 'show_pujas' && <small className="hint" style={{ display: 'block', fontWeight: 500 }}>{t('show_pujas_hint')}</small>}{(k === 'show_saree_donors' || k === 'show_auction') && <small className="hint" style={{ display: 'block', fontWeight: 500 }}>{t('fest_public_hint')}</small>}</span>
            <Switch checked={settings[k]} disabled={k === 'show_donor_amounts' && !settings.show_donor_list} onChange={(v) => toggle(k, v)} />
          </div>
        ))}
      </div>
      <div className="alert ok">{t('never_mobile')}</div>

      <div className="section-title">{t('donate_section')}</div>
      {v6 ? <DonateSettings settings={settings} link={link} toggle={toggle} /> : <NeedsUpdate />}

      <div className="section-title">{t('qr_section')}</div>
      <div className="card pad-lg stack" style={{ textAlign: 'center', opacity: settings.public_enabled ? 1 : 0.55 }}>
        <QrImage text={link} dark="#561010" />
        <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--muted)' }}>{link}</div>
        <div className="grid2">
          <button className="btn ghost sm" onClick={async () => { if (await copyText(link)) toast(t('copied'), 'success'); }}>{t('copy')}</button>
          <a className="btn ghost sm" href={link} target="_blank" rel="noopener noreferrer">{t('open_page')}</a>
        </div>
        <button className="btn ghost danger-t sm" disabled={busy} onClick={changeLink}>{t('change_link')}</button>
        <p className="hint">{t('qr_old_stops')}</p>
      </div>

      <div className="section-title">{t('poster_title')}</div>
      <div className="card pad-lg stack" data-testid="poster-card">
        <div className="poster-row">
          <PosterCanvas settings={settings} link={link} cfg={cfg} testid="poster-preview" onClick={() => setEditing(true)} />
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <p className="hint" style={{ margin: 0 }}>{t('poster_card_hint')}</p>
            <button type="button" className="btn maroon block" onClick={() => setEditing(true)} data-testid="poster-edit">{t('poster_edit')}</button>
            <button type="button" className="btn ghost block" disabled={busy} onClick={() => run(() => downloadPoster(settings, link, cfg))} data-testid="poster-download">{t('qr_poster')}</button>
            {canShareFiles && <button type="button" className="btn ghost block" disabled={busy} onClick={() => run(() => sharePoster(settings, link, cfg))} data-testid="poster-share">{t('poster_share')}</button>}
          </div>
        </div>
      </div>
      <PosterEditor open={editing} onClose={() => setEditing(false)} settings={settings} link={link} canSave={v6} />
    </Page>
  );
}

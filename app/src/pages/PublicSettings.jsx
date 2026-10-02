import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { publicPageLink } from '../lib/receipt.js';
import { fmtDay } from '../lib/format.js';
import { Page, Switch, useToast, copyText } from '../components/ui.jsx';
import { QrImage, qrDataUrl } from '../components/QrImage.jsx';

const SECTIONS = ['show_programs', 'show_donation_total', 'show_donor_list', 'show_donor_amounts', 'show_expense_summary', 'show_expense_details', 'show_net_position'];

function loadImg(src, cors) {
  return new Promise((res, rej) => { const i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const test = cur ? `${cur} ${w}` : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur);
  return lines;
}

async function makePoster(settings, link) {
  const W = 1240, H = 1754, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px "Noto Sans Telugu","Nirmala UI","Gautami",system-ui,sans-serif`;
  x.fillStyle = '#fffaf2'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, 520); g.addColorStop(0, '#561010'); g.addColorStop(1, '#a3361c');
  x.fillStyle = g; x.fillRect(0, 0, W, 520);
  // toran
  for (let i = 0; i < W; i += 62) {
    x.fillStyle = '#2e7d32'; x.beginPath(); x.ellipse(i + 31, 40, 14, 30, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f9a825'; x.beginPath(); x.arc(i, 12, 12, 0, Math.PI * 2); x.fill();
  }
  x.textAlign = 'center'; x.fillStyle = '#fff';
  let y = 130;
  if (settings.logo_url) {
    try { const img = await loadImg(settings.logo_url, true); x.save(); x.beginPath(); x.arc(W / 2, y + 60, 70, 0, Math.PI * 2); x.clip(); x.drawImage(img, W / 2 - 70, y - 10, 140, 140); x.restore(); y += 170; } catch { y += 10; }
  } else { x.font = font(400, 90); x.fillText('🪔', W / 2, y + 70); y += 130; }
  x.font = font(800, 64);
  wrap(x, settings.temple_name_te || settings.temple_name_en || '', W - 160).forEach((l) => { x.fillText(l, W / 2, y + 40); y += 78; });
  x.font = font(600, 40);
  x.fillText(`${settings.event_title_te || settings.event_title_en || ''} – ${settings.event_year || ''}`, W / 2, y + 30);
  if (settings.start_date && settings.end_date) { x.font = font(700, 34); x.fillStyle = '#f6c344'; x.fillText(`${fmtDay(settings.start_date, 'te')} – ${fmtDay(settings.end_date, 'te')}`, W / 2, y + 85); }
  const q = await loadImg(await qrDataUrl(link, { color: { dark: '#561010', light: '#ffffff' } }));
  const qs = 700, qy = 600;
  x.fillStyle = '#fff'; x.strokeStyle = '#f0e1cc'; x.lineWidth = 6;
  x.beginPath(); x.roundRect((W - qs) / 2 - 30, qy - 30, qs + 60, qs + 60, 40); x.fill(); x.stroke();
  x.drawImage(q, (W - qs) / 2, qy, qs, qs);
  x.fillStyle = '#7a1d1d'; x.font = font(800, 50);
  x.fillText('📱 కార్యక్రమాలు & లెక్కల కోసం స్కాన్ చేయండి', W / 2, qy + qs + 120);
  x.fillStyle = '#857266'; x.font = font(600, 38);
  x.fillText('Scan to see programs & accounts', W / 2, qy + qs + 180);
  x.font = font(500, 28); x.fillText(link, W / 2, qy + qs + 235);
  x.fillStyle = '#7a1d1d'; x.font = font(700, 40);
  x.fillText(`– ${settings.committee_name_te || settings.committee_name_en || ''}${settings.village_te ? ', ' + settings.village_te : ''}`, W / 2, H - 80);
  return c.toDataURL('image/png');
}

export default function PublicSettings() {
  const { t } = useLang();
  const { settings, save, reload } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = publicPageLink(settings);

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
  const poster = async () => {
    setBusy(true);
    try {
      const url = await makePoster(settings, link);
      const a = document.createElement('a'); a.href = url; a.download = 'utsav-qr-poster.png'; a.click();
    } catch (e) { toast(String(e.message || e), 'error'); }
    setBusy(false);
  };

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
        {SECTIONS.map((k) => (
          <div key={k} className={`toggle-row ${k === 'show_donor_amounts' ? 'sub' : ''}`}>
            <span>{t(k)}</span>
            <Switch checked={settings[k]} disabled={k === 'show_donor_amounts' && !settings.show_donor_list} onChange={(v) => toggle(k, v)} />
          </div>
        ))}
      </div>
      <div className="alert ok">{t('never_mobile')}</div>
      <div className="card pad-lg stack" style={{ textAlign: 'center', opacity: settings.public_enabled ? 1 : 0.55 }}>
        <QrImage text={link} dark="#561010" />
        <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--muted)' }}>{link}</div>
        <div className="grid2">
          <button className="btn ghost sm" onClick={async () => { if (await copyText(link)) toast(t('copied'), 'success'); }}>{t('copy')}</button>
          <a className="btn ghost sm" href={link} target="_blank" rel="noopener noreferrer">{t('open_page')}</a>
        </div>
        <button className="btn maroon block" disabled={busy} onClick={poster}>{t('qr_poster')}</button>
        <button className="btn ghost danger-t sm" disabled={busy} onClick={changeLink}>{t('change_link')}</button>
        <p className="hint">{t('qr_old_stops')}</p>
      </div>
    </Page>
  );
}

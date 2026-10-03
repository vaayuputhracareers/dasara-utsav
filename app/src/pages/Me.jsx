import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPin } from '../lib/supabase.js';
import { savePin } from '../lib/pin.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { Page, Field, useToast, Badge, PinInput } from '../components/ui.jsx';

export default function Me() {
  const { t, L } = useLang();
  const { profile, isAdmin, signOut } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const nav = useNavigate();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const change = async () => {
    if (!isPin(p1)) return toast(t('pin_invalid'), 'error');
    if (p1 !== p2) return toast(t('pin_mismatch'), 'error');
    setBusy(true);
    const error = await savePin(p1);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    setP1(''); setP2('');
    toast(t('pin_changed'), 'success');
  };
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;

  return (
    <Page title={`👤 ${t('nav_me')}`} sub={L(settings, 'temple_name')} back={isAdmin ? '/more' : undefined}>
      <div className="card pad-lg stack">
        <div className="row">
          <div className="avatar" style={{ width: 52, height: 52, fontSize: 22 }}>{(profile.full_name || '?')[0].toUpperCase()}</div>
          <div className="grow">
            <b style={{ fontSize: 17 }}>{profile.full_name}</b>
            {profile.name_te && <div>{profile.name_te}</div>}
            <div className="num" style={{ color: 'var(--muted)' }}>{profile.mobile}</div>
          </div>
          <Badge tone={isAdmin ? 'blue' : 'grey'}>{isAdmin ? t('admin') : t('member')}</Badge>
        </div>
      </div>
      <div className="card pad-lg row between"><b>{t('language')}</b><LangSwitch /></div>
      {!standalone && (
        <div className="card pad-lg stack">
          <div className="card-title" style={{ marginBottom: 0 }}>{t('install_app')}</div>
          {installEvt ? <button className="btn maroon block" onClick={async () => { installEvt.prompt(); setInstallEvt(null); }}>{t('install_now')}</button> : <p className="hint" style={{ fontSize: 13 }}>{t('install_hint')}</p>}
        </div>
      )}
      <div className="card pad-lg stack">
        <div className="card-title" style={{ marginBottom: 0 }}>{t('change_pin')}</div>
        <Field label={t('new_pin')}><PinInput value={p1} onChange={setP1} autoComplete="new-password" data-testid="me-pin-1" /></Field>
        <Field label={t('confirm_pin')}><PinInput value={p2} onChange={setP2} autoComplete="new-password" data-testid="me-pin-2" /></Field>
        <button className="btn ghost block" disabled={busy} onClick={change} data-testid="me-pin-save">{busy ? t('saving') : t('change_pin')}</button>
      </div>
      <button className="btn ghost danger-t block" onClick={async () => { if (window.confirm(t('logout_confirm'))) { nav('/', { replace: true }); await signOut(); } }}>🚪 {t('logout')}</button>
      <p className="foot-note">{t('app_name')} · v1.2</p>
    </Page>
  );
}

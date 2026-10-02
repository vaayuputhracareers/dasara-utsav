import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { errMsg } from '../lib/errors.js';
import { Page, Field, useToast, Badge } from '../components/ui.jsx';

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
    if (p1.length < 6) return toast(t('password_min'), 'error');
    if (p1 !== p2) return toast(t('password_mismatch'), 'error');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    setP1(''); setP2('');
    toast(t('password_changed'), 'success');
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
        <div className="card-title" style={{ marginBottom: 0 }}>{t('change_password')}</div>
        <Field label={t('new_password')}><input className="input" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></Field>
        <Field label={t('confirm_password')}><input className="input" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn ghost block" disabled={busy} onClick={change}>{busy ? t('saving') : t('change_password')}</button>
      </div>
      <button className="btn ghost danger-t block" onClick={async () => { if (window.confirm(t('logout_confirm'))) { nav('/', { replace: true }); await signOut(); } }}>🚪 {t('logout')}</button>
      <p className="foot-note">{t('app_name')} · v1.0</p>
    </Page>
  );
}

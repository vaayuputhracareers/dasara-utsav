import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, cleanMobile, isValidMobile, mobileToEmail } from '../lib/supabase.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { errMsg } from '../lib/errors.js';
import { Field, Toran, useToast } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function useBranding() {
  const [b, setB] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc('get_branding').then(({ data }) => alive && setB(data || {}));
    return () => { alive = false; };
  }, []);
  return b;
}

function AuthHead({ b }) {
  const { t, L } = useLang();
  const temple = b && L(b, 'temple_name');
  return (
    <div className="auth-head">
      {b?.logo_url ? <img className="logo" src={b.logo_url} alt="" /> : <div className="lamp">🪔</div>}
      <h1>{temple || t('app_name')}</h1>
      <p>{b ? `${L(b, 'event_title')} ${b.event_year || ''}` : ''}</p>
    </div>
  );
}

export function Login() {
  const { t } = useLang();
  const b = useBranding();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const m = cleanMobile(mobile);
    if (m.length !== 10) { setErr(t('mobile_invalid')); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: mobileToEmail(m), password });
    setBusy(false);
    if (error) setErr(errMsg(error, t));
  };
  return (
    <div className="auth">
      <Toran />
      <div style={{ alignSelf: 'flex-end', marginTop: 10 }}><LangSwitch /></div>
      <div className="auth-card">
        <AuthHead b={b} />
        <form className="card pad-lg stack" onSubmit={submit}>
          <Field label={t('mobile')}>
            <input className="input big" inputMode="numeric" autoComplete="username" placeholder="98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </Field>
          <Field label={t('password')}>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <div className="alert err">{err}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? t('logging_in') : t('login_btn')}</button>
          {b?.allow_self_signup !== false && (
            <p className="foot-note">{t('no_account')} <Link to="/signup" className="btn link">{t('create_account')}</Link></p>
          )}
        </form>
      </div>
    </div>
  );
}

export function Signup() {
  const { t } = useLang();
  const b = useBranding();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', name_te: '', mobile: '', password: '', password2: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.full_name.trim()) return setErr(t('required') + ': ' + t('full_name'));
    if (!isValidMobile(f.mobile)) return setErr(t('mobile_invalid'));
    if (f.password.length < 6) return setErr(t('password_min'));
    if (f.password !== f.password2) return setErr(t('password_mismatch'));
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: mobileToEmail(f.mobile), password: f.password,
      options: { data: { full_name: f.full_name.trim(), name_te: f.name_te.trim() } },
    });
    setBusy(false);
    if (error) {
      const em = errMsg(error, t);
      if (em === t('err_email_confirm')) setErr(em);
      else if (error.status === 500 || /Database error/i.test(error.message || '')) setErr(t('signup_closed'));
      else setErr(em);
      return;
    }
    toast(t('signed_up'), 'success');
    nav('/');
  };
  return (
    <div className="auth">
      <Toran />
      <div style={{ alignSelf: 'flex-end', marginTop: 10 }}><LangSwitch /></div>
      <div className="auth-card">
        <AuthHead b={b} />
        <form className="card pad-lg stack" onSubmit={submit}>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('signup_title')}</div>
          <Field label={t('full_name')}><input className="input" value={f.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
          <Field label={t('name_te_label')} optional><input className="input" value={f.name_te} onChange={set('name_te')} /></Field>
          <Field label={t('mobile')}><input className="input big" inputMode="numeric" value={f.mobile} onChange={set('mobile')} autoComplete="username" placeholder="98765 43210" /></Field>
          <Field label={t('password')} hint={t('password_min')}><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
          <Field label={t('confirm_password')}><input className="input" type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" /></Field>
          {err && <div className="alert err">{err}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? t('saving') : t('signup_btn')}</button>
          <p className="foot-note">{t('have_account')} <Link to="/" className="btn link">{t('login_btn')}</Link></p>
          <p className="foot-note">{t('first_admin_hint')}</p>
        </form>
      </div>
    </div>
  );
}

export function Waiting() {
  const { t } = useLang();
  const nav = useNavigate();
  const { profile, refreshProfile, signOut } = useAuth();
  const blocked = profile?.status === 'blocked';
  const closed = profile?.status === 'closed';
  return (
    <div className="auth">
      <Toran />
      <div style={{ alignSelf: 'flex-end', marginTop: 10 }}><LangSwitch /></div>
      <div className="auth-card">
        <div className="card pad-lg stack" style={{ textAlign: 'center', marginTop: 30 }}>
          <div style={{ fontSize: 46 }}>{blocked || closed ? '🚫' : '⏳'}</div>
          <h2 style={{ color: 'var(--maroon)', fontSize: 18 }}>{blocked ? t('blocked_title') : closed ? t('signup_title') : t('waiting_title')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{blocked ? t('blocked_text') : closed ? t('signup_closed') : t('waiting_text')}</p>
          {profile && <p className="num" style={{ fontWeight: 700 }}>{profile.full_name} · {profile.mobile}</p>}
          <button className="btn maroon block" onClick={refreshProfile}>{t('check_again')}</button>
          <button className="btn ghost block" onClick={async () => { nav('/', { replace: true }); await signOut(); }}>{t('logout')}</button>
        </div>
      </div>
    </div>
  );
}

export function SetupNeeded() {
  const { t } = useLang();
  return (
    <div className="auth">
      <Toran />
      <div className="auth-card">
        <div className="card pad-lg stack" style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 46 }}>🛠️</div>
          <h2 style={{ color: 'var(--maroon)', fontSize: 18 }}>{t('setup_title')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('setup_text')}</p>
          <pre className="mono" style={{ textAlign: 'left', background: '#fbf5ec', padding: 10, borderRadius: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>{`window.APP_CONFIG = {\n  supabaseUrl: "https://xxxx.supabase.co",\n  supabaseKey: "sb_publishable_..."\n};`}</pre>
          <LangSwitch />
        </div>
      </div>
    </div>
  );
}

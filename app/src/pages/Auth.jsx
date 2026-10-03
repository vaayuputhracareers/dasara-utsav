import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, isValidMobile, isPin, mobileToEmail } from '../lib/supabase.js';
import { savePin } from '../lib/pin.js';
import { rememberSplash } from '../lib/splash.js';
import { useLang, LangSwitch } from '../lib/i18n.jsx';
import { errMsg } from '../lib/errors.js';
import { Field, Toran, useToast, MobileInput, PinInput } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function useBranding() {
  const [b, setB] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc('get_branding').then(({ data }) => { rememberSplash(data); if (alive) setB(data || {}); });
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
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!isValidMobile(mobile)) { setErr(t('mobile_invalid')); return; }
    if (!isPin(pin)) { setErr(t('pin_invalid')); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: mobileToEmail(mobile), password: pin });
    setBusy(false);
    if (error) setErr(errMsg(error, t));
  };
  return (
    <div className="auth">
      <Toran />
      <div style={{ alignSelf: 'flex-end', marginTop: 10 }}><LangSwitch /></div>
      <div className="auth-card">
        <AuthHead b={b} />
        <form className="card pad-lg stack" onSubmit={submit} noValidate>
          <Field label={t('mobile')}>
            <MobileInput value={mobile} onChange={setMobile} autoComplete="username" data-testid="login-mobile" />
          </Field>
          <Field label={t('pin')}>
            <PinInput value={pin} onChange={setPin} data-testid="login-pin" />
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
  const [f, setF] = useState({ full_name: '', name_te: '', mobile: '', pin: '', pin2: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setV = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.full_name.trim()) return setErr(t('required') + ': ' + t('full_name'));
    if (!isValidMobile(f.mobile)) return setErr(t('mobile_invalid'));
    if (!isPin(f.pin)) return setErr(t('pin_invalid'));
    if (f.pin !== f.pin2) return setErr(t('pin_mismatch'));
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: mobileToEmail(f.mobile), password: f.pin,
      options: { data: { full_name: f.full_name.trim(), name_te: f.name_te.trim(), pin_set: true } },
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
        <form className="card pad-lg stack" onSubmit={submit} noValidate>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('signup_title')}</div>
          <Field label={t('full_name')}><input className="input" value={f.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
          <Field label={t('name_te_label')} optional><input className="input" value={f.name_te} onChange={set('name_te')} /></Field>
          <Field label={t('mobile')}><MobileInput value={f.mobile} onChange={setV('mobile')} autoComplete="username" data-testid="signup-mobile" /></Field>
          <Field label={t('pin')}><PinInput value={f.pin} onChange={setV('pin')} autoComplete="new-password" data-testid="signup-pin" /></Field>
          <Field label={t('confirm_pin')}><PinInput value={f.pin2} onChange={setV('pin2')} autoComplete="new-password" data-testid="signup-pin2" /></Field>
          {err && <div className="alert err">{err}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? t('saving') : t('signup_btn')}</button>
          <p className="foot-note">{t('have_account')} <Link to="/" className="btn link">{t('login_btn')}</Link></p>
        </form>
      </div>
    </div>
  );
}

/** Shown once to accounts that still log in with an old password: choose a 6-digit PIN. */
export function SetPin() {
  const { t } = useLang();
  const nav = useNavigate();
  const toast = useToast();
  const { profile, signOut } = useAuth();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!isPin(p1)) return setErr(t('pin_invalid'));
    if (p1 !== p2) return setErr(t('pin_mismatch'));
    setBusy(true);
    const error = await savePin(p1);
    setBusy(false);
    if (error) return setErr(errMsg(error, t));
    toast(t('pin_changed'), 'success');
  };
  return (
    <div className="auth">
      <Toran />
      <div style={{ alignSelf: 'flex-end', marginTop: 10 }}><LangSwitch /></div>
      <div className="auth-card">
        <form className="card pad-lg stack" onSubmit={submit} noValidate style={{ marginTop: 30 }} data-testid="set-pin">
          <div style={{ fontSize: 42, textAlign: 'center' }}>🔢</div>
          <h2 style={{ color: 'var(--maroon)', fontSize: 18, textAlign: 'center' }}>{t('set_pin_title')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center' }}>{t('set_pin_text')}</p>
          {profile && <p className="num" style={{ fontWeight: 700, textAlign: 'center' }}>{profile.full_name} · {profile.mobile}</p>}
          <Field label={t('new_pin')}><PinInput value={p1} onChange={setP1} autoComplete="new-password" data-testid="set-pin-1" /></Field>
          <Field label={t('confirm_pin')}><PinInput value={p2} onChange={setP2} autoComplete="new-password" data-testid="set-pin-2" /></Field>
          {err && <div className="alert err">{err}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? t('saving') : t('set_pin_btn')}</button>
          <button type="button" className="btn ghost block" onClick={async () => { nav('/', { replace: true }); await signOut(); }}>{t('logout')}</button>
        </form>
      </div>
    </div>
  );
}

export function Waiting() {
  const { t } = useLang();
  const nav = useNavigate();
  const { profile, refreshProfile, signOut } = useAuth();
  const blocked = profile?.status === 'blocked' || profile?.status === 'deleted';
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

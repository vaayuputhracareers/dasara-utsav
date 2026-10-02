import { useMemo, useState } from 'react';
import { supabase, makeTempClient, cleanMobile, isValidMobile, mobileToEmail } from '../lib/supabase.js';
import { useLang, DICT } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, personName, fmtDate } from '../lib/format.js';
import { appBaseUrl, waLink } from '../lib/receipt.js';
import { Page, Spinner, Empty, Modal, Field, Seg, Badge, useToast, copyText } from '../components/ui.jsx';

const WORDS = ['durga', 'utsav', 'deepa', 'ganga', 'laxmi', 'pooja', 'kalasa', 'jyothi', 'mangala', 'vijaya'];
const genPassword = () => WORDS[Math.floor(Math.random() * WORDS.length)] + String(Math.floor(1000 + Math.random() * 9000));

function loginMessage(settings, m, password) {
  return DICT.login_message[0]
    .replace('{name}', m.name_te || m.full_name)
    .replace('{event}', settings.event_title_te || settings.event_title_en || '')
    .replace('{url}', appBaseUrl(settings))
    .replace('{mobile}', m.mobile)
    .replace('{password}', password);
}

function CredentialsCard({ m, password, settings }) {
  const { t } = useLang();
  const toast = useToast();
  const msg = loginMessage(settings, m, password);
  return (
    <div className="stack">
      <div className="alert ok">{t('give_these')}</div>
      <dl className="kv card">
        <dt>{t('name')}</dt><dd>{m.full_name}</dd>
        <dt>{t('mobile')}</dt><dd className="num" style={{ fontSize: 17 }}>{m.mobile}</dd>
        <dt>{t('password')}</dt><dd className="mono" style={{ fontSize: 17 }}>{password}</dd>
        <dt>🔗</dt><dd className="num" style={{ fontSize: 12 }}>{appBaseUrl(settings)}</dd>
      </dl>
      <a className="btn wa block" href={waLink(m.mobile, msg)} target="_blank" rel="noopener noreferrer">{t('share_login')}</a>
      <button className="btn ghost block" onClick={async () => { if (await copyText(msg)) toast(t('copied'), 'success'); }}>{t('copy_message')}</button>
    </div>
  );
}

export default function Members() {
  const { t, lang } = useLang();
  const { profile: me } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [nf, setNf] = useState(null);
  const [created, setCreated] = useState(null);
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [resetDone, setResetDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const [p, dsh] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.rpc('get_dashboard'),
    ]);
    if (p.error) throw p.error;
    const totals = Object.fromEntries(((dsh.data && dsh.data.by_member) || []).map((m) => [m.id, m]));
    return { people: p.data || [], totals };
  }, []);
  const people = data?.people || [];
  const pending = people.filter((p) => p.status === 'pending');
  const others = useMemo(() => people.filter((p) => p.status !== 'pending').sort((a, b) => (a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === 'admin' ? -1 : 1)), [people]);

  const openAdd = () => { setNf({ full_name: '', name_te: '', mobile: '', password: genPassword(), role: 'member' }); setCreated(null); setAddOpen(true); };
  const createMember = async () => {
    if (!nf.full_name.trim()) return toast(t('required') + ': ' + t('full_name'), 'error');
    if (!isValidMobile(nf.mobile)) return toast(t('mobile_invalid'), 'error');
    if (nf.password.length < 6) return toast(t('password_min'), 'error');
    setBusy(true);
    const mobile = cleanMobile(nf.mobile);
    try {
      const { error: invErr } = await supabase.rpc('create_member_invite', { p_mobile: mobile, p_full_name: nf.full_name.trim(), p_name_te: nf.name_te.trim(), p_role: nf.role });
      if (invErr) throw invErr;
      const tmp = makeTempClient();
      const { error: suErr } = await tmp.auth.signUp({ email: mobileToEmail(mobile), password: nf.password, options: { data: { full_name: nf.full_name.trim() } } });
      if (suErr) { await supabase.from('member_invites').delete().eq('mobile', mobile); throw suErr; }
      await tmp.rpc('ensure_my_profile'); // creates the profile now (no-op if the trigger already did); returns {error}, never throws
      await tmp.auth.signOut().catch(() => {});
      setCreated({ m: { full_name: nf.full_name.trim(), name_te: nf.name_te.trim(), mobile }, password: nf.password });
      toast(t('member_created'), 'success');
      reload(true);
    } catch (e) { toast(errMsg(e, t), 'error', 6000); }
    setBusy(false);
  };

  const update = async (id, patch, okMsg) => {
    setBusy(true);
    const { error } = await supabase.from('profiles').update(patch).eq('id', id);
    setBusy(false);
    if (error) { toast(errMsg(error, t), 'error', 5000); return false; }
    toast(okMsg || t('member_saved'), 'success');
    reload(true);
    return true;
  };
  const doReset = async () => {
    if (newPass.length < 6) return toast(t('password_min'), 'error');
    setBusy(true);
    const { error } = await supabase.rpc('admin_reset_password', { p_user: sel.id, p_password: newPass });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    toast(t('password_reset_done'), 'success');
    setResetDone({ m: sel, password: newPass });
  };
  const openSel = (p) => { setSel(p); setEdit({ full_name: p.full_name, name_te: p.name_te || '' }); setNewPass(genPassword()); setResetDone(null); };
  const isMe = sel && sel.id === me.id;

  return (
    <Page title={`👥 ${t('nav_members')}`} back="/more" wide right={<button className="tb-btn" onClick={openAdd}>➕</button>}>
      <button className="btn primary block" onClick={openAdd}>{t('add_member')}</button>
      {loading && !data ? <Spinner /> : (
        <>
          {pending.length > 0 && (
            <>
              <div className="section-title">⏳ {t('pending_approvals')} ({pending.length})</div>
              <div className="card">
                <div className="list">
                  {pending.map((p) => (
                    <div key={p.id} className="li" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                      <div className="grow"><div className="main-t">{p.full_name}</div><div className="sub-t num">{p.mobile} · {fmtDate(p.created_at, lang)}</div></div>
                      <div className="row">
                        <button className="btn ghost danger-t xs" disabled={busy} onClick={() => update(p.id, { status: 'blocked' })}>{t('reject')}</button>
                        <button className="btn ok xs" disabled={busy} onClick={() => update(p.id, { status: 'active' }, t('approved_member', { name: p.full_name }))}>{t('approve')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="section-title">{t('members')} ({others.length})</div>
          <div className="card">
            {others.length === 0 ? <Empty icon="👥" text={t('nothing_here')} /> : (
              <div className="list">
                {others.map((p) => {
                  const tot = data.totals[p.id];
                  return (
                    <div key={p.id} className={`li ${p.status === 'blocked' ? 'dim' : ''}`} onClick={() => openSel(p)}>
                      <div className="avatar sm">{(p.full_name || '?')[0].toUpperCase()}</div>
                      <div className="grow">
                        <div className="main-t">{personName(p, lang)} {p.id === me.id && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{t('you')}</span>}</div>
                        <div className="sub-t num">{p.mobile}{tot ? ` · ${t('collected_x', { amount: inr(tot.total) })}` : ''}</div>
                      </div>
                      <div>
                        {p.role === 'admin' && <Badge tone="blue">{t('admin')}</Badge>}
                        {p.status === 'blocked' && <Badge tone="red">{t('status_blocked')}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('add_member')}>
        {created ? <CredentialsCard m={created.m} password={created.password} settings={settings} /> : nf && (
          <div className="stack">
            <Field label={`${t('full_name')} *`}><input className="input" value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} /></Field>
            <Field label={t('name_te_label')} optional><input className="input" value={nf.name_te} onChange={(e) => setNf({ ...nf, name_te: e.target.value })} /></Field>
            <Field label={`${t('mobile')} *`}><input className="input big" inputMode="numeric" placeholder="98765 43210" value={nf.mobile} onChange={(e) => setNf({ ...nf, mobile: e.target.value })} /></Field>
            <Field label={t('password')} hint={t('password_min')}>
              <div className="row"><input className="input mono grow" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} /><button type="button" className="btn ghost sm" onClick={() => setNf({ ...nf, password: genPassword() })}>{t('generate')}</button></div>
            </Field>
            <Field label={t('role')} hint={nf.role === 'admin' ? t('role_admin_hint') : t('role_member_hint')}>
              <Seg value={nf.role} onChange={(v) => setNf({ ...nf, role: v })} options={[{ value: 'member', label: t('member') }, { value: 'admin', label: t('admin') }]} />
            </Field>
            <button className="btn primary block" disabled={busy} onClick={createMember}>{busy ? t('creating') : t('create_account_btn')}</button>
          </div>
        )}
      </Modal>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${t('member_details')}` : ''}>
        {sel && edit && (resetDone ? <CredentialsCard m={resetDone.m} password={resetDone.password} settings={settings} /> : (
          <div className="stack">
            <div className="row">
              <div className="avatar">{(sel.full_name || '?')[0].toUpperCase()}</div>
              <div className="grow"><b>{sel.full_name}</b><div className="num" style={{ color: 'var(--muted)', fontSize: 13 }}>{sel.mobile}</div></div>
              {sel.role === 'admin' ? <Badge tone="blue">{t('admin')}</Badge> : <Badge>{t('member')}</Badge>}
              <Badge tone={sel.status === 'active' ? 'green' : 'red'}>{t('status_' + sel.status)}</Badge>
            </div>
            <Field label={t('full_name')}><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
            <Field label={t('name_te_label')}><input className="input" value={edit.name_te} onChange={(e) => setEdit({ ...edit, name_te: e.target.value })} /></Field>
            <button className="btn maroon block" disabled={busy} onClick={async () => { if (await update(sel.id, { full_name: edit.full_name.trim(), name_te: edit.name_te.trim() })) setSel(null); }}>{t('save')}</button>
            {!isMe && (
              <div className="grid2">
                {sel.role === 'admin'
                  ? <button className="btn ghost sm" disabled={busy} onClick={async () => { if (await update(sel.id, { role: 'member' })) setSel(null); }}>{t('make_member')}</button>
                  : <button className="btn ghost sm" disabled={busy} onClick={async () => { if (await update(sel.id, { role: 'admin' })) setSel(null); }}>{t('make_admin')}</button>}
                {sel.status === 'blocked'
                  ? <button className="btn ok sm" disabled={busy} onClick={async () => { if (await update(sel.id, { status: 'active' })) setSel(null); }}>{t('unblock')}</button>
                  : <button className="btn ghost danger-t sm" disabled={busy} onClick={async () => { if (await update(sel.id, { status: 'blocked' })) setSel(null); }}>{t('block')}</button>}
              </div>
            )}
            <div className="card stack tight" style={{ background: '#fbf7f1' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>{t('reset_password')}</div>
              <div className="row"><input className="input mono grow" value={newPass} onChange={(e) => setNewPass(e.target.value)} /><button className="btn ghost sm" onClick={() => setNewPass(genPassword())}>{t('generate')}</button></div>
              <button className="btn ghost block" disabled={busy} onClick={doReset}>{t('reset_password')}</button>
            </div>
          </div>
        ))}
      </Modal>
    </Page>
  );
}

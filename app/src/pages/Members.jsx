import { useMemo, useState } from 'react';
import { supabase, makeTempClient, cleanMobile, isValidMobile, isPin, mobileToEmail } from '../lib/supabase.js';
import { genPin } from '../lib/pin.js';
import { useLang, DICT } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, personName, fmtDate } from '../lib/format.js';
import { appBaseUrl, waLink } from '../lib/receipt.js';
import { Page, Spinner, Empty, Modal, Field, Seg, Badge, useToast, copyText, MobileInput, Switch } from '../components/ui.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';

/** Version 7 switch: team members see the committee's financial position (total donations + total expenses). */
function FinanceNeedsUpdate() {
  const { t } = useLang();
  const [version, check] = useDbVersion();
  return (
    <div className="stack" data-testid="finance-db-update">
      <div className="alert warn">{t('finance_needs_db')}</div>
      <DbUpdateNotice version={version} onCheck={async () => { await check(); window.location.reload(); }} />
    </div>
  );
}

function FinanceSwitch() {
  const { t } = useLang();
  const { settings, save } = useSettings();
  const toast = useToast();
  if (!('members_see_finance' in settings)) return <FinanceNeedsUpdate />;
  const on = !!settings.members_see_finance;
  const toggle = async (v) => {
    try { await save({ members_see_finance: v }); toast(v ? t('finance_on_done') : t('finance_off_done'), 'success', 4000); }
    catch (e) { toast(errMsg(e, t), 'error'); }
  };
  return (
    <div className="card" style={{ padding: '2px 14px' }} data-testid="finance-toggle">
      <div className="toggle-row">
        <span>{t('finance_toggle')}<small className="hint" style={{ display: 'block', fontWeight: 500 }}>{t('finance_toggle_hint')}</small></span>
        <Switch checked={on} onChange={toggle} />
      </div>
    </div>
  );
}

const digits6 = (v) => String(v || '').replace(/\D/g, '').slice(0, 6);

function loginMessage(settings, m, pin) {
  return DICT.login_message[0]
    .replace('{name}', m.name_te || m.full_name)
    .replace('{event}', settings.event_title_te || settings.event_title_en || '')
    .replace('{url}', appBaseUrl(settings))
    .replace('{mobile}', m.mobile)
    .replace('{pin}', pin);
}

function CredentialsCard({ m, pin, settings }) {
  const { t } = useLang();
  const toast = useToast();
  const msg = loginMessage(settings, m, pin);
  return (
    <div className="stack">
      <div className="alert ok">{t('give_these')}</div>
      <dl className="kv card">
        <dt>{t('name')}</dt><dd>{m.full_name}</dd>
        <dt>{t('mobile')}</dt><dd className="num" style={{ fontSize: 17 }}>{m.mobile}</dd>
        <dt>{t('pin_short')}</dt><dd className="mono" style={{ fontSize: 19, letterSpacing: '.12em' }} data-testid="cred-pin">{pin}</dd>
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
  const [newPin, setNewPin] = useState('');
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

  const openAdd = () => { setNf({ full_name: '', name_te: '', mobile: '', pin: genPin(), role: 'member' }); setCreated(null); setAddOpen(true); };
  const createMember = async () => {
    if (!nf.full_name.trim()) return toast(t('required') + ': ' + t('full_name'), 'error');
    if (!isValidMobile(nf.mobile)) return toast(t('mobile_invalid'), 'error');
    if (!isPin(nf.pin)) return toast(t('pin_invalid'), 'error');
    setBusy(true);
    const mobile = cleanMobile(nf.mobile);
    try {
      const { error: invErr } = await supabase.rpc('create_member_invite', { p_mobile: mobile, p_full_name: nf.full_name.trim(), p_name_te: nf.name_te.trim(), p_role: nf.role });
      if (invErr) throw invErr;
      const tmp = makeTempClient();
      const { error: suErr } = await tmp.auth.signUp({ email: mobileToEmail(mobile), password: nf.pin, options: { data: { full_name: nf.full_name.trim(), pin_set: true } } });
      if (suErr) { await supabase.from('member_invites').delete().eq('mobile', mobile); throw suErr; }
      await tmp.rpc('ensure_my_profile'); // creates the profile now (no-op if the trigger already did); returns {error}, never throws
      await tmp.auth.signOut().catch(() => {});
      setCreated({ m: { full_name: nf.full_name.trim(), name_te: nf.name_te.trim(), mobile }, pin: nf.pin });
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
    if (!isPin(newPin)) return toast(t('pin_invalid'), 'error');
    setBusy(true);
    const { error } = await supabase.rpc('admin_reset_password', { p_user: sel.id, p_password: newPin });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error', 6000);
    toast(t('pin_reset_done'), 'success');
    setResetDone({ m: sel, pin: newPin });
  };
  const openSel = (p) => { setSel(p); setEdit({ full_name: p.full_name, name_te: p.name_te || '' }); setNewPin(genPin()); setResetDone(null); };
  const isMe = sel && sel.id === me.id;

  return (
    <Page title={`👥 ${t('nav_members')}`} back="/more" wide right={<button className="tb-btn" onClick={openAdd}>➕</button>}>
      <button className="btn primary block" onClick={openAdd}>{t('add_member')}</button>
      <FinanceSwitch />
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
        {created ? <CredentialsCard m={created.m} pin={created.pin} settings={settings} /> : nf && (
          <div className="stack">
            <Field label={`${t('full_name')} *`}><input className="input" value={nf.full_name} onChange={(e) => setNf({ ...nf, full_name: e.target.value })} /></Field>
            <Field label={t('name_te_label')} optional><input className="input" value={nf.name_te} onChange={(e) => setNf({ ...nf, name_te: e.target.value })} /></Field>
            <Field label={`${t('mobile')} *`}><MobileInput value={nf.mobile} onChange={(v) => setNf({ ...nf, mobile: v })} autoComplete="off" data-testid="member-mobile" /></Field>
            <Field label={t('pin')} hint={t('pin_member_hint')}>
              <div className="row"><input className="input mono grow pin-plain" inputMode="numeric" autoComplete="off" value={nf.pin} onChange={(e) => setNf({ ...nf, pin: digits6(e.target.value) })} data-testid="member-pin" /><button type="button" className="btn ghost sm" onClick={() => setNf({ ...nf, pin: genPin() })}>{t('generate')}</button></div>
            </Field>
            <Field label={t('role')} hint={nf.role === 'admin' ? t('role_admin_hint') : t('role_member_hint')}>
              <Seg value={nf.role} onChange={(v) => setNf({ ...nf, role: v })} options={[{ value: 'member', label: t('member') }, { value: 'admin', label: t('admin') }]} />
            </Field>
            <button className="btn primary block" disabled={busy} onClick={createMember}>{busy ? t('creating') : t('create_account_btn')}</button>
          </div>
        )}
      </Modal>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${t('member_details')}` : ''}>
        {sel && edit && (resetDone ? <CredentialsCard m={resetDone.m} pin={resetDone.pin} settings={settings} /> : (
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
              <div className="card-title" style={{ marginBottom: 0 }}>{t('reset_pin')}</div>
              <div className="row"><input className="input mono grow pin-plain" inputMode="numeric" autoComplete="off" value={newPin} onChange={(e) => setNewPin(digits6(e.target.value))} data-testid="reset-pin" /><button className="btn ghost sm" onClick={() => setNewPin(genPin())}>{t('generate')}</button></div>
              <span className="hint">{t('pin_member_hint')}</span>
              <button className="btn ghost block" disabled={busy} onClick={doReset} data-testid="reset-pin-btn">{t('reset_pin')}</button>
            </div>
          </div>
        ))}
      </Modal>
    </Page>
  );
}

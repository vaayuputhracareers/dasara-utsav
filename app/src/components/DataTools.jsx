// Settings → Data (admin only): yearly Excel export + bill-photo ZIP, and "Delete data" with two confirmations.
import { useCallback, useEffect, useState } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { inr, fmtDateTime } from '../lib/format.js';
import { errMsg } from '../lib/errors.js';
import { REQUIRED_DB_VERSION, getDbVersion, setupSqlText } from '../lib/dbVersion.js';
import * as DT from '../lib/dataTools.js';
import { Field, Modal, Seg, Spinner, Switch, useToast, copyText, PinInput } from './ui.jsx';
import { isPin } from '../lib/supabase.js';

/** undefined = checking, null = unknown (offline), number = version */
export function useDbVersion() {
  const [v, setV] = useState(undefined);
  const check = useCallback(async () => { setV(undefined); setV(await getDbVersion()); }, []);
  useEffect(() => { check(); }, [check]);
  return [v, check];
}

export function DbUpdateNotice({ version, onCheck }) {
  const { t } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (version === undefined || version === null || version >= REQUIRED_DB_VERSION) return null;
  const copy = async () => {
    setBusy(true);
    try {
      const sql = await setupSqlText();
      if (await copyText(sql)) toast(t('db_sql_copied'), 'success', 7000);
      else toast(t('error_generic'), 'error');
    } catch (e) { toast(errMsg(e, t), 'error'); }
    setBusy(false);
  };
  return (
    <div className="alert warn db-update" data-testid="db-update">
      <b>{t('db_update_title')}</b>
      <ol>
        <li>{t('db_update_1')}</li>
        <li>{t('db_update_2')}</li>
        <li>{t('db_update_3')}</li>
      </ol>
      <span className="hint">{t('db_update_safe')}</span>
      <div className="row wrap">
        <button type="button" className="btn maroon sm" disabled={busy} onClick={copy}>{t('db_copy_sql')}</button>
        <button type="button" className="btn ghost sm" onClick={onCheck}>{t('db_check_again')}</button>
      </div>
    </div>
  );
}

function useExportCtx() {
  const { lang } = useLang();
  const { profile } = useAuth();
  const { settings } = useSettings();
  return { settings, lang, exportedBy: profile?.full_name || profile?.name_te || profile?.mobile || '' };
}

function LastExport({ last }) {
  const { t, lang } = useLang();
  if (last === undefined) return null;
  if (!last) return <p className="hint">{t('export_never')}</p>;
  return (
    <p className="hint num">
      ✅ {t('export_last', { when: fmtDateTime(last.at, lang), year: last.entity_id === 'all' ? t('all_years') : last.entity_id })}
    </p>
  );
}

/* ------------------------------------------------------------------ Export */
export function ExportCard() {
  const { t } = useLang();
  const toast = useToast();
  const ctx = useExportCtx();
  const [years, setYears] = useState(null);
  const [year, setYear] = useState(null);       // number | 'all'
  const [counts, setCounts] = useState(null);   // null = loading, false = error
  const [busy, setBusy] = useState('');         // '' | 'xlsx' | 'zip'
  const [progress, setProgress] = useState('');
  const [last, setLast] = useState(undefined);

  useEffect(() => {
    let alive = true;
    DT.listDataYears().then((ys) => {
      if (!alive) return;
      setYears(ys);
      setYear(ys.length ? ys[0] : 'all');
    }).catch(() => { if (alive) { setYears([]); setYear('all'); } });
    DT.lastExport().then((l) => alive && setLast(l || null), () => alive && setLast(null));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (year === null) return undefined;
    let alive = true;
    setCounts(null);
    DT.countYear(year === 'all' ? null : year).then((c) => alive && setCounts(c), () => alive && setCounts(false));
    return () => { alive = false; };
  }, [year]);

  const y = year === 'all' ? null : year;
  const doExcel = async () => {
    setBusy('xlsx');
    setProgress(t('export_working'));
    try {
      await DT.exportYear(y, ctx);
      toast(t('export_done'), 'success', 5000);
      setLast(await DT.lastExport());
    } catch (e) { toast(errMsg(e, t), 'error', 6000); }
    setBusy('');
    setProgress('');
  };
  const doZip = async () => {
    setBusy('zip');
    setProgress(t('export_working'));
    try {
      const r = await DT.downloadBillsZip(y, ctx.settings, (i, n) => setProgress(t('export_bills_progress', { i, n })));
      if (r.count) toast(t('export_bills_done', { n: r.count }) + (r.missing ? ` · ${t('export_bills_missing', { n: r.missing })}` : ''), r.missing ? 'error' : 'success', 6000);
      else toast(t('export_bills_none'), 'error');
    } catch (e) { toast(errMsg(e, t), 'error', 6000); }
    setBusy('');
    setProgress('');
  };

  const options = [...(years || []).map((v) => ({ value: v, label: String(v) })), { value: 'all', label: t('all_years') }];
  const empty = counts && counts.total === 0;
  return (
    <div className="card pad-lg stack" data-testid="export-card">
      <div className="card-title">{t('export_title')}</div>
      <p className="small-text">{t('export_desc')}</p>
      {years === null ? <Spinner sm /> : (
        <>
          <Field label={t('export_year')}>
            <Seg options={options} value={year} onChange={setYear} />
          </Field>
          <div className="export-counts num" data-testid="export-counts">
            {counts === null ? <Spinner sm /> : counts === false ? t('network_error') : empty ? t('export_none')
              : t('export_counts', { d: counts.donations, e: counts.expenses, h: counts.handovers, p: counts.programs })}
          </div>
          <div className="grid2">
            <button type="button" className="btn primary" disabled={!!busy || !counts || empty} onClick={doExcel}>
              {busy === 'xlsx' ? t('export_working') : t('export_btn')}
            </button>
            <button type="button" className="btn ghost" disabled={!!busy || !counts || !counts.bills} onClick={doZip}>
              {busy === 'zip' ? progress : t('export_bills_btn', { n: counts ? counts.bills : 0 })}
            </button>
          </div>
          {busy === 'xlsx' && <p className="hint">{progress}</p>}
          <LastExport last={last} />
          <p className="hint">{t('export_keep_safe')}</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Delete */
export function DeleteCard({ dbVersion, onCheckDb, onDeleted }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const needsUpdate = typeof dbVersion === 'number' && dbVersion < REQUIRED_DB_VERSION;
  return (
    <div className="card pad-lg stack danger-card" data-testid="delete-card">
      <div className="card-title danger-title">{t('delete_title')}</div>
      <p className="small-text">{t('delete_desc')}</p>
      <p className="small-text"><b>{t('delete_keeps')}</b></p>
      <div className="alert warn backup-note">{t('delete_backup_note')}</div>
      {needsUpdate ? <DbUpdateNotice version={dbVersion} onCheck={onCheckDb} /> : (
        <button type="button" className="btn ghost danger-t block" disabled={dbVersion === undefined} onClick={() => setOpen(true)}>
          {t('delete_btn')}
        </button>
      )}
      {open && <DeleteFlow onClose={() => setOpen(false)} onDeleted={onDeleted} />}
    </div>
  );
}

function DeleteFlow({ onClose, onDeleted }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const ctx = useExportCtx();
  const [step, setStep] = useState(1);
  const [info, setInfo] = useState(null);
  const [ackBackup, setAckBackup] = useState(false);
  const [removeMembers, setRemoveMembers] = useState(false);
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setInfo(null);
    try { setInfo(await DT.deletePreview()); } catch (e) { setInfo({ error: errMsg(e, t) }); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const close = () => { if (!busy) { onClose(); if (result) onDeleted?.(); } };

  const exportNow = async (y) => {
    setExporting(y);
    try { await DT.exportYear(y, ctx); toast(t('export_done'), 'success'); await load(); } catch (e) { toast(errMsg(e, t), 'error', 6000); }
    setExporting(null);
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await DT.deleteAllData(password, word.trim(), removeMembers);
      if (!r.ok) {
        setErr(r.error === 'confirm_word' ? t('delete_wrong_word')
          : r.error === 'wrong_password' ? t('delete_wrong_password', { n: r.attempts_left ?? 0 })
            : r.error === 'too_many_attempts' ? t('delete_locked') : t('error_generic'));
        setPassword('');
      } else {
        setResult(r);
        setStep(3);
      }
    } catch (e) { setErr(errMsg(e, t)); }
    setBusy(false);
  };

  const retryBills = async () => {
    setRetrying(true);
    const bills = await DT.removeBillFiles([]);
    setResult((r) => ({ ...r, bills: { removed: (r.bills?.removed || 0) + bills.removed, failed: bills.failed, total: r.bills?.total || 0 } }));
    setRetrying(false);
  };

  const c = info?.counts;
  const title = step === 1 ? t('delete_step1') : step === 2 ? t('delete_step2') : t('delete_done_title');
  const wordOk = word.trim() === 'DELETE';

  return (
    <Modal open onClose={close} title={title}>
      {step === 1 && (
        !info ? <Spinner /> : info.error ? <div className="alert err">{info.error}</div> : (
          <div className="stack" data-testid="delete-step1">
            <div>
              <div className="lbl">{t('delete_will_remove')}</div>
              <ul className="del-list num">
                <li><span>{t('del_donations')}</span><b>{c.donations}{info.donationsTotal ? ` · ${inr(info.donationsTotal)}` : ''}</b></li>
                <li><span>{t('del_expenses')}</span><b>{c.expenses}{info.expensesTotal ? ` · ${inr(info.expensesTotal)}` : ''}</b></li>
                <li><span>{t('del_bills')}</span><b>{c.bills}</b></li>
                <li><span>{t('del_handovers')}</span><b>{c.handovers}</b></li>
                <li><span>{t('del_programs')}</span><b>{c.programs + c.festival_days}</b></li>
                <li><span>{t('del_history')}</span><b>{info.history}</b></li>
                {removeMembers && <li className="bad"><span>{t('del_members')}</span><b>{info.members}</b></li>}
              </ul>
              <p className="hint">{t('delete_receipts_restart')}</p>
            </div>

            {info.cash.length > 0 && (
              <div className="alert err" style={{ display: 'block' }}>
                💰 {t('delete_cash_warn')}
                <ul className="plain num">{info.cash.map((m) => <li key={m.member_id}>{m.full_name || m.name_te}: <b>{inr(m.balance)}</b></li>)}</ul>
              </div>
            )}
            {info.pending > 0 && <div className="alert warn">🧾 {t('delete_pending_warn', { n: info.pending })}</div>}

            <div>
              <div className="lbl">{t('delete_backup_status')}</div>
              {info.status.length === 0 ? <p className="hint">{t('export_none')}</p> : (
                <ul className="del-list">
                  {info.status.map((s) => (
                    <li key={s.year} className={s.ok ? 'ok' : 'bad'} data-testid={`backup-${s.year}`}>
                      <span>
                        {s.ok ? '✅' : '⚠️'} <b>{s.year}</b>{' '}
                        <small>{s.ok ? t('backup_ok', { when: fmtDateTime(s.last.at, lang) })
                          : s.last ? t('backup_old', { when: fmtDateTime(s.last.at, lang) }) : t('backup_missing')}</small>
                      </span>
                      {!s.ok && (
                        <button type="button" className="btn maroon xs" disabled={exporting !== null} onClick={() => exportNow(s.year)}>
                          {exporting === s.year ? t('export_working') : t('export_now')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">{t('delete_bills_hint')}</p>
            </div>

            <label className="ack">
              <input type="checkbox" checked={ackBackup} onChange={(e) => setAckBackup(e.target.checked)} data-testid="ack-backup" />
              <span>{t('delete_ack_backup')}</span>
            </label>
            <div className="toggle-row">
              <span>{t('delete_ack_members')}<br /><small className="hint">{t('delete_members_hint')}</small></span>
              <Switch checked={removeMembers} onChange={setRemoveMembers} />
            </div>
            <div className="grid2">
              <button type="button" className="btn ghost" onClick={close}>{t('cancel')}</button>
              <button type="button" className="btn danger" disabled={!ackBackup} onClick={() => { setStep(2); setErr(''); }}>{t('continue')}</button>
            </div>
          </div>
        )
      )}

      {step === 2 && c && (
        <form className="stack" data-testid="delete-step2" onSubmit={(e) => { e.preventDefault(); if (wordOk && isPin(password) && !busy) submit(); }} noValidate>
          <div className="alert err" style={{ display: 'block' }}>
            {t('delete_final_warn', { d: c.donations, e: c.expenses, b: c.bills, h: c.handovers })}
            {removeMembers && <><br />{t('delete_final_members', { n: info.members })}</>}
          </div>
          <Field label={t('delete_type_word')}>
            <input className="input mono" value={word} onChange={(e) => setWord(e.target.value.toUpperCase())} placeholder="DELETE"
              autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} data-testid="delete-word" />
          </Field>
          <Field label={t('delete_password')}>
            <PinInput value={password} onChange={setPassword} autoComplete="current-password" data-testid="delete-password" />
          </Field>
          {err && <div className="alert err" data-testid="delete-error">{err}</div>}
          <div className="grid2">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep(1)}>{t('back')}</button>
            <button type="submit" className="btn danger" disabled={!wordOk || !isPin(password) || busy} data-testid="delete-final">
              {busy ? t('deleting') : t('delete_final_btn')}
            </button>
          </div>
        </form>
      )}

      {step === 3 && result && (
        <div className="stack" data-testid="delete-done">
          <div className="alert ok" style={{ display: 'block' }}>
            {t('delete_done_text', { d: result.donations, e: result.expenses, h: result.handovers, p: (result.programs || 0) + (result.festival_days || 0), b: result.bills?.removed || 0 })}
            {result.members_removed > 0 && <><br />{t('delete_done_members', { n: result.members_removed })}</>}
            {result.members_blocked > 0 && <><br />{t('delete_done_blocked', { n: result.members_blocked })}</>}
          </div>
          {result.bills?.failed > 0 && (
            <div className="alert warn" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {t('delete_bills_failed', { n: result.bills.failed })}
              <button type="button" className="btn ghost sm" disabled={retrying} onClick={retryBills}>{t('retry')}</button>
            </div>
          )}
          <p className="hint">{t('delete_done_next')}</p>
          <button type="button" className="btn primary block" onClick={close}>{t('close')}</button>
        </div>
      )}
    </Modal>
  );
}

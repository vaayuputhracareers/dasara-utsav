// "Database update needed" notice (Copy SQL → Supabase → Run → Check again) + the database version check.
// Kept small and separate so pages can show it without loading the Settings → Data code.
import { useCallback, useEffect, useState } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { errMsg } from '../lib/errors.js';
import { REQUIRED_DB_VERSION, getDbVersion, setupSqlText } from '../lib/dbVersion.js';
import { useToast, copyText } from './ui.jsx';

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


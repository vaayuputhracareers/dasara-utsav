import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { fmtDateTime } from '../lib/format.js';
import { hardUpdate, latestBuild } from '../lib/updateCheck.js';

/** Bottom of ☰ More: the version on this phone, whether it is the newest, and "Update app now". */
export default function VersionInfo() {
  const { t, lang } = useLang();
  const [latest, setLatest] = useState(null);   // null = checking, '' = unknown
  useEffect(() => { let alive = true; latestBuild().then((v) => alive && setLatest(v)); return () => { alive = false; }; }, []);
  const mine = __BUILD_TIME__;
  const behind = !!latest && latest > mine;
  return (
    <div className="stack tight" style={{ marginTop: 14 }}>
      <p className="hint" style={{ textAlign: 'center' }} data-testid="app-version">{t('app_version', { when: fmtDateTime(mine, lang) })}</p>
      {latest !== null && !behind && latest && <p className="hint" style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 800 }} data-testid="is-latest">✅ {t('is_latest')}</p>}
      {behind && <div className="alert warn" data-testid="newer-version">⚠️ {t('newer_version', { when: fmtDateTime(latest, lang) })}</div>}
      <button type="button" className={`btn ${behind ? 'primary' : 'ghost'} block`} onClick={hardUpdate} data-testid="update-now">{t('update_now')}</button>
      <p className="hint" style={{ textAlign: 'center' }}>{t('update_now_hint')}</p>
    </div>
  );
}

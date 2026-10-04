import { Link } from 'react-router-dom';
import { useLang } from '../lib/i18n.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Page } from '../components/ui.jsx';
import { fmtDateTime } from '../lib/format.js';
import { hardUpdate } from '../lib/updateCheck.js';

export default function More() {
  const { t, L, lang } = useLang();
  const { settings } = useSettings();
  const items = [
    ['/handover', '🤝', 'nav_handover', 'more_handover_sub'],
    ['/cash-bank', '🏦', 'nav_cash_bank', 'more_cash_bank_sub'],
    ['/members', '👥', 'nav_members', 'more_members_sub'],
    ['/programs', '📅', 'nav_programs', 'more_programs_sub'],
    ['/puja', '🪔', 'nav_puja', 'more_puja_sub'],
    ['/public-page', '📱', 'nav_public', 'more_public_sub'],
    ['/settings', '⚙️', 'nav_settings', 'more_settings_sub'],
    ['/history', '📜', 'nav_history', 'more_history_sub'],
    ['/me', '👤', 'nav_me', 'more_me_sub'],
  ];
  return (
    <Page title={t('nav_more')} sub={L(settings, 'temple_name')}>
      <div className="more-grid">
        {items.map(([to, icon, label, sub]) => (
          <Link key={to} to={to}><i>{icon}</i>{t(label)}<small>{t(sub)}</small></Link>
        ))}
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 14 }} data-testid="app-version">{t('app_version', { when: fmtDateTime(__BUILD_TIME__, lang) })}</p>
      <button type="button" className="btn ghost block" style={{ marginTop: 6 }} onClick={hardUpdate} data-testid="update-now">{t('update_now')}</button>
      <p className="hint" style={{ textAlign: 'center', marginTop: 4 }}>{t('update_now_hint')}</p>
    </Page>
  );
}

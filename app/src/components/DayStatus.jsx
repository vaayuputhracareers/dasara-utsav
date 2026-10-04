import { useLang } from '../lib/i18n.jsx';

/** Completed / Today / Upcoming tag for a schedule date ('YYYY-MM-DD', India time). */
export default function DayStatus({ date, today }) {
  const { t } = useLang();
  if (date < today) return <span className="day-tag done" data-testid="day-status">✓ {t('day_completed')}</span>;
  if (date === today) return <span className="day-tag now" data-testid="day-status">● {t('day_today')}</span>;
  return <span className="day-tag soon" data-testid="day-status">{t('day_upcoming')}</span>;
}

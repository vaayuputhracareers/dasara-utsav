import { useMemo } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { dateRange, fmtDay, fmtClock, todayIST } from '../lib/format.js';

/** The table is missing until the admin runs the version 5 database update. */
export const isMissingTable = (e) =>
  !!e && (['PGRST205', '42P01'].includes(e.code) || /schema cache|does not exist/i.test(String(e.message || '')));

/** Days to show: every festival day for the team (so empty days can be filled) + every date that has an entry. */
export function buildPujaDays(start, end, pujas = [], withEmptyDays = true) {
  const range = dateRange(start, end);
  const set = new Set(withEmptyDays ? range : []);
  pujas.forEach((p) => set.add(p.puja_date));
  return [...set].sort().map((date) => ({
    date,
    n: range.indexOf(date) >= 0 ? range.indexOf(date) + 1 : null,
    pujas: pujas.filter((p) => p.puja_date === date).sort((a, b) =>
      String(a.puja_time || '99').localeCompare(String(b.puja_time || '99')) || String(a.created_at || '').localeCompare(String(b.created_at || ''))),
  }));
}

/**
 * Puja schedule: which family does the puja on which day.
 *  team     – team members: every festival day, plus village, gotram, mobile and note
 *  public   – (team = false) only dates with an entry; date, puja, family and village – never mobile, gotram or note
 *  editable – admin: tap an entry to change it, "➕ Puja" under each day
 */
export default function PujaSchedule({ start, end, pujas = [], team = false, editable = false, onEdit, onAdd }) {
  const { t, lang } = useLang();
  const today = todayIST();
  const days = useMemo(() => buildPujaDays(start, end, pujas, team), [start, end, pujas, team]);
  const reserved = pujas.filter((p) => String(p.family_name || '').trim()).length;

  return (
    <div className="stack" data-testid="puja-schedule">
      {pujas.length > 0 && (
        <div className="puja-summary" data-testid="puja-summary">🪔 {t('puja_reserved_n', { r: reserved, n: pujas.length })}</div>
      )}
      {days.map((d) => {
        const past = d.date < today, isToday = d.date === today;
        return (
          <div key={d.date} className={`day ${isToday ? 'today' : ''} ${past ? 'past' : ''}`} data-testid="puja-day" data-date={d.date}>
            <div className="dayhead" style={{ cursor: 'default' }}>
              <span>{d.n ? `${t('day_n', { n: d.n })} · ` : ''}{fmtDay(d.date, lang)}{isToday ? ` · ${t('today')}` : ''}</span>
            </div>
            <div className="tl">
              {d.pujas.length === 0 && <div className="hint" style={{ padding: '6px 0' }}>{t('puja_none_day')}</div>}
              {d.pujas.map((p) => {
                const family = String(p.family_name || '').trim();
                const extra = team ? [p.gotram && `${t('gotram')}: ${p.gotram}`, p.village].filter(Boolean) : [p.village].filter(Boolean);
                return (
                  <div key={p.id} className={`ti puja ${family ? '' : 'free'}`} data-testid="puja-entry"
                    onClick={editable ? () => onEdit(p) : undefined} style={editable ? { cursor: 'pointer' } : undefined}>
                    <time>{p.puja_time ? fmtClock(p.puja_time) : '🪔'}</time>
                    <div className="grow">
                      {p.puja_name && <div className="puja-name">{p.puja_name}</div>}
                      {family
                        ? <div className="tt" data-testid="puja-family">{family}</div>
                        : <div className="tt"><span className="badge green" data-testid="puja-free">{t('puja_free')}</span></div>}
                      {!family && !team && <div className="ts">{t('puja_free_public')}</div>}
                      {extra.length > 0 && <div className="ts">{extra.join(' · ')}</div>}
                      {team && p.mobile && (
                        <div className="ts"><a href={`tel:${p.mobile}`} className="num" onClick={(e) => e.stopPropagation()} data-testid="puja-mobile">📞 {p.mobile}</a></div>
                      )}
                      {team && p.note && <div className="ts" data-testid="puja-note">📝 {p.note}</div>}
                    </div>
                    {editable && <span style={{ color: 'var(--muted)' }}>✏️</span>}
                  </div>
                );
              })}
              {editable && <button type="button" className="btn ghost xs" style={{ marginTop: 6 }} onClick={() => onAdd(d.date)} data-testid="puja-add-day">{t('add_puja')}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

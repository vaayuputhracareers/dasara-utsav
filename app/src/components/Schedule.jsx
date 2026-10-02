import { useMemo, useState } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { dateRange, fmtDay, fmtClock, todayIST } from '../lib/format.js';

export function buildDays(start, end, days = [], programs = []) {
  const range = dateRange(start, end);
  const set = new Set(range);
  days.forEach((d) => (d.alankaram_te || d.alankaram_en || d.note_te || d.note_en) && set.add(d.day_date));
  programs.forEach((p) => set.add(p.program_date));
  const all = [...set].sort();
  const dayMap = Object.fromEntries(days.map((d) => [d.day_date, d]));
  return all.map((date) => ({
    date,
    n: range.indexOf(date) >= 0 ? range.indexOf(date) + 1 : null,
    day: dayMap[date] || null,
    programs: programs.filter((p) => p.program_date === date).sort((a, b) => String(a.start_time || '99').localeCompare(String(b.start_time || '99'))),
  }));
}

export default function Schedule({ start, end, days, programs, editable, onEditDay, onAddProgram, onEditProgram }) {
  const { t, L, lang } = useLang();
  const today = todayIST();
  const list = useMemo(() => buildDays(start, end, days, programs), [start, end, days, programs]);
  const [openSet, setOpenSet] = useState(() => new Set(list.filter((d) => d.date >= today).map((d) => d.date)));
  const isOpen = (d) => openSet.has(d.date) || list.every((x) => x.date < today);
  const toggle = (date) => setOpenSet((s) => { const n = new Set(s); n.has(date) ? n.delete(date) : n.add(date); return n; });

  return (
    <div className="stack">
      {list.map((d) => {
        const past = d.date < today, isToday = d.date === today;
        const open = isOpen(d);
        const alank = L(d.day, 'alankaram'), note = L(d.day, 'note');
        return (
          <div key={d.date} className={`day ${isToday ? 'today' : ''} ${past ? 'past' : ''}`}>
            <div className="dayhead" onClick={() => toggle(d.date)}>
              <span>{d.n ? `${t('day_n', { n: d.n })} · ` : ''}{fmtDay(d.date, lang)}{isToday ? ` · ${t('today')}` : ''}</span>
              <span className="row" style={{ gap: 6 }}>
                {editable && <button className="btn ghost xs" onClick={(e) => { e.stopPropagation(); onEditDay(d); }}>{t('edit_day')}</button>}
                <span>{open ? '▴' : '▾'}</span>
              </span>
            </div>
            {open && (
              <>
                {alank && <div className="alank">✨ {alank} {lang === 'te' ? 'అలంకారం' : 'Alankaram'}</div>}
                {note && <div className="daynote">{note}</div>}
                <div className="tl">
                  {d.programs.length === 0 && <div className="hint" style={{ padding: '6px 0' }}>{t('no_programs_day')}</div>}
                  {d.programs.map((p) => (
                    <div key={p.id} className="ti" onClick={editable ? () => onEditProgram(p) : undefined} style={editable ? { cursor: 'pointer' } : undefined}>
                      <time>{fmtClock(p.start_time)}{p.end_time ? <><br /><span style={{ color: 'var(--muted)', fontWeight: 600 }}>– {fmtClock(p.end_time)}</span></> : null}</time>
                      <div className="grow">
                        <div className="tt">{L(p, 'title')}</div>
                        {(p.place || p.details) && <div className="ts">{p.place ? `📍 ${p.place}` : ''}{p.place && p.details ? ' · ' : ''}{p.details}</div>}
                      </div>
                      {editable && <span style={{ color: 'var(--muted)' }}>✏️</span>}
                    </div>
                  ))}
                  {editable && <button className="btn ghost xs" style={{ marginTop: 6 }} onClick={() => onAddProgram(d.date)}>{t('add_program')}</button>}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

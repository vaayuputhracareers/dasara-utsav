import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { dateRange, fmtDay } from '../lib/format.js';
import { Page, Spinner, Modal, Field, useToast, Empty } from '../components/ui.jsx';
import Schedule from '../components/Schedule.jsx';

export const SAMPLE_ALANKARAMS = [
  { te: 'శ్రీ స్వర్ణ కవచాలంకృత దుర్గా దేవి', en: 'Sri Swarna Kavachalankrita Durga Devi' },
  { te: 'శ్రీ బాలా త్రిపుర సుందరీ దేవి', en: 'Sri Bala Tripura Sundari Devi' },
  { te: 'శ్రీ గాయత్రీ దేవి', en: 'Sri Gayatri Devi' },
  { te: 'శ్రీ అన్నపూర్ణా దేవి', en: 'Sri Annapurna Devi' },
  { te: 'శ్రీ లలితా త్రిపుర సుందరీ దేవి', en: 'Sri Lalita Tripura Sundari Devi' },
  { te: 'శ్రీ మహాలక్ష్మీ దేవి', en: 'Sri Mahalakshmi Devi' },
  { te: 'శ్రీ సరస్వతీ దేవి', en: 'Sri Saraswati Devi' },
  { te: 'శ్రీ దుర్గా దేవి', en: 'Sri Durga Devi' },
  { te: 'శ్రీ మహిషాసుర మర్దినీ దేవి', en: 'Sri Mahishasura Mardini Devi' },
  { te: 'శ్రీ రాజరాజేశ్వరీ దేవి', en: 'Sri Rajarajeswari Devi' },
];

export default function Programs() {
  const { t, L, lang } = useLang();
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const [dayEdit, setDayEdit] = useState(null);
  const [prog, setProg] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const [d, p] = await Promise.all([
      supabase.from('festival_days').select('*').order('day_date'),
      supabase.from('programs').select('*').order('program_date').order('start_time'),
    ]);
    if (d.error) throw d.error;
    if (p.error) throw p.error;
    return { days: d.data, programs: p.data };
  }, []);

  const range = dateRange(settings.start_date, settings.end_date);
  const hasAlank = (data?.days || []).some((d) => d.alankaram_te || d.alankaram_en);

  const fillSample = async () => {
    if (!range.length) return toast(t('set_dates_first'), 'error');
    if (!window.confirm(t('fill_standard_confirm'))) return;
    setBusy(true);
    const rows = range.map((date, i) => {
      const s = SAMPLE_ALANKARAMS[i] || { te: '', en: '' };
      const ex = (data?.days || []).find((x) => x.day_date === date);
      return { day_date: date, alankaram_te: s.te, alankaram_en: s.en, note_te: ex?.note_te || '', note_en: ex?.note_en || '' };
    });
    const { error } = await supabase.from('festival_days').upsert(rows);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    toast(t('saved'), 'success');
    reload(true);
  };

  const saveDay = async () => {
    setBusy(true);
    const { error } = await supabase.from('festival_days').upsert({ day_date: dayEdit.day_date, alankaram_te: dayEdit.alankaram_te.trim(), alankaram_en: dayEdit.alankaram_en.trim(), note_te: dayEdit.note_te.trim(), note_en: dayEdit.note_en.trim() });
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    setDayEdit(null); toast(t('saved'), 'success'); reload(true);
  };
  const saveProg = async () => {
    if (!prog.title_te.trim() && !prog.title_en.trim()) return toast(t('title_required'), 'error');
    setBusy(true);
    const row = { program_date: prog.program_date, start_time: prog.start_time || null, end_time: prog.end_time || null, title_te: prog.title_te.trim(), title_en: prog.title_en.trim(), place: prog.place.trim(), details: prog.details.trim() };
    const { error } = prog.id ? await supabase.from('programs').update(row).eq('id', prog.id) : await supabase.from('programs').insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    setProg(null); toast(t('saved'), 'success'); reload(true);
  };
  const delProg = async () => {
    if (!window.confirm(t('delete_program_confirm'))) return;
    setBusy(true);
    const { error } = await supabase.from('programs').delete().eq('id', prog.id);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    setProg(null); reload(true);
  };

  const openDay = (d) => setDayEdit({ day_date: d.date, alankaram_te: d.day?.alankaram_te || '', alankaram_en: d.day?.alankaram_en || '', note_te: d.day?.note_te || '', note_en: d.day?.note_en || '' });
  const newProg = (date) => setProg({ program_date: date || range[0] || '', start_time: '', end_time: '', title_te: '', title_en: '', place: '', details: '' });
  const editProg = (p) => setProg({ ...p, start_time: (p.start_time || '').slice(0, 5), end_time: (p.end_time || '').slice(0, 5) });

  return (
    <Page title={t('nav_programs')} sub={`${L(settings, 'event_title')} ${settings.event_year}`} right={isAdmin ? <button className="tb-btn" onClick={() => newProg()}>{t('add_program')}</button> : null}>
      {isAdmin && !range.length && <Link to="/settings" className="alert warn">⚙️ {t('set_dates_first')}</Link>}
      {isAdmin && range.length > 0 && !hasAlank && !loading && (
        <button className="btn ghost block" disabled={busy} onClick={fillSample}>{t('fill_standard')}</button>
      )}
      {loading && !data ? <Spinner /> : data && (range.length || data.programs.length) ? (
        <Schedule start={settings.start_date} end={settings.end_date} days={data.days} programs={data.programs}
          editable={isAdmin} onEditDay={openDay} onAddProgram={newProg} onEditProgram={editProg} />
      ) : <Empty icon="📅" text={t('nothing_here')} />}

      <Modal open={!!dayEdit} onClose={() => setDayEdit(null)} title={dayEdit ? `${t('edit_day_title')} · ${fmtDay(dayEdit.day_date, lang)}` : ''}>
        {dayEdit && (
          <div className="stack">
            <Field label={t('alankaram_te')}><input className="input" value={dayEdit.alankaram_te} onChange={(e) => setDayEdit({ ...dayEdit, alankaram_te: e.target.value })} /></Field>
            <Field label={t('alankaram_en')}><input className="input" value={dayEdit.alankaram_en} onChange={(e) => setDayEdit({ ...dayEdit, alankaram_en: e.target.value })} /></Field>
            <Field label={t('day_note_te')} optional><input className="input" value={dayEdit.note_te} onChange={(e) => setDayEdit({ ...dayEdit, note_te: e.target.value })} /></Field>
            <Field label={t('day_note_en')} optional><input className="input" value={dayEdit.note_en} onChange={(e) => setDayEdit({ ...dayEdit, note_en: e.target.value })} /></Field>
            <button className="btn primary block" disabled={busy} onClick={saveDay}>{busy ? t('saving') : t('save')}</button>
          </div>
        )}
      </Modal>

      <Modal open={!!prog} onClose={() => setProg(null)} title={prog?.id ? t('edit_program') : t('new_program')}>
        {prog && (
          <div className="stack">
            <Field label={t('date')}>
              {range.length ? (
                <select className="input" value={prog.program_date} onChange={(e) => setProg({ ...prog, program_date: e.target.value })}>
                  {[...new Set([...range, prog.program_date].filter(Boolean))].sort().map((d) => (
                    <option key={d} value={d}>{range.indexOf(d) >= 0 ? `${t('day_n', { n: range.indexOf(d) + 1 })} · ` : ''}{fmtDay(d, lang)}</option>
                  ))}
                </select>
              ) : <input type="date" className="input" value={prog.program_date} onChange={(e) => setProg({ ...prog, program_date: e.target.value })} />}
            </Field>
            <div className="grid2">
              <Field label={t('start_time')}><input type="time" className="input" value={prog.start_time} onChange={(e) => setProg({ ...prog, start_time: e.target.value })} /></Field>
              <Field label={t('end_time')} optional><input type="time" className="input" value={prog.end_time} onChange={(e) => setProg({ ...prog, end_time: e.target.value })} /></Field>
            </div>
            <Field label={t('program_title_te')}><input className="input" value={prog.title_te} onChange={(e) => setProg({ ...prog, title_te: e.target.value })} /></Field>
            <Field label={t('program_title_en')}><input className="input" value={prog.title_en} onChange={(e) => setProg({ ...prog, title_en: e.target.value })} /></Field>
            <Field label={t('place')} optional><input className="input" value={prog.place} onChange={(e) => setProg({ ...prog, place: e.target.value })} /></Field>
            <Field label={t('program_details')} optional><textarea className="input" value={prog.details} onChange={(e) => setProg({ ...prog, details: e.target.value })} /></Field>
            <div className="grid2">
              {prog.id ? <button className="btn ghost danger-t" disabled={busy} onClick={delProg}>🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={busy} onClick={saveProg}>{busy ? t('saving') : t('save')}</button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

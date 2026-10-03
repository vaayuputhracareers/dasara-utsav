import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang, DICT } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { dateRange, fmtDay } from '../lib/format.js';
import { Page, Spinner, Modal, Field, useToast, Empty, MobileInput } from '../components/ui.jsx';
import Schedule from '../components/Schedule.jsx';
import PujaSchedule, { isMissingTable, hasFamily } from '../components/PujaSchedule.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';

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
  const loc = useLocation();
  const nav = useNavigate();
  const tab = loc.pathname.startsWith('/puja') ? 'puja' : 'programs';
  const [dayEdit, setDayEdit] = useState(null);
  const [prog, setProg] = useState(null);
  const [puja, setPuja] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const [d, p, u] = await Promise.all([
      supabase.from('festival_days').select('*').order('day_date'),
      supabase.from('programs').select('*').order('program_date').order('start_time'),
      supabase.from('pujas').select('*').order('puja_date').order('puja_time', { nullsFirst: false }).order('created_at'),
    ]);
    if (d.error) throw d.error;
    if (p.error) throw p.error;
    if (u.error && !isMissingTable(u.error)) throw u.error;
    return { days: d.data, programs: p.data, pujas: u.error ? null : u.data };   // pujas null → database before version 5
  }, []);

  const range = dateRange(settings.start_date, settings.end_date);
  const v6 = 'show_donate' in settings;   // database version 6: Telugu names for place / details and in the puja schedule
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
    if (v6) { row.place_te = prog.place_te.trim(); row.details_te = prog.details_te.trim(); }
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

  // ---- puja schedule (admin) ----
  const pujas = data?.pujas || [];
  const freeDays = range.filter((date) => !pujas.some((x) => x.puja_date === date));                 // no entry at all
  const openDays = range.filter((date) => !pujas.some((x) => x.puja_date === date && hasFamily(x)));  // no family yet
  const addFestivalDays = async () => {
    setBusy(true);
    const { error } = await supabase.from('pujas').insert(freeDays.map((date) => ({   // full rows (same keys in every row)
      puja_date: date, puja_time: null, puja_name: '', family_name: '', village: '', gotram: '', mobile: null, note: '',
      ...(v6 ? { puja_name_te: '', family_name_te: '', village_te: '', gotram_te: '' } : {}) })));
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    toast(t('puja_add_days_done', { n: freeDays.length }), 'success', 6000);
    reload(true);
  };
  const TE_KEYS = ['puja_name_te', 'family_name_te', 'village_te', 'gotram_te'];
  const newPuja = (date) => setPuja({ puja_date: date || openDays[0] || range[0] || '', puja_time: '', puja_name: '', family_name: '', village: '', gotram: '', mobile: '', note: '',
    ...Object.fromEntries(TE_KEYS.map((k) => [k, ''])) });
  const editPuja = (x) => setPuja({ ...x, puja_time: (x.puja_time || '').slice(0, 5), mobile: x.mobile || '', ...Object.fromEntries(TE_KEYS.map((k) => [k, x[k] || ''])) });
  const savePuja = async () => {
    if (!puja.puja_date) return toast(t('date'), 'error');
    if (puja.mobile && puja.mobile.length !== 10) return toast(t('mobile_invalid'), 'error');
    setBusy(true);
    const row = {
      puja_date: puja.puja_date, puja_time: puja.puja_time || null, puja_name: puja.puja_name.trim(), family_name: puja.family_name.trim(),
      village: puja.village.trim(), gotram: puja.gotram.trim(), mobile: puja.mobile || null, note: puja.note.trim(),
    };
    if (v6) TE_KEYS.forEach((k) => { row[k] = String(puja[k] || '').trim(); });
    // A new family on a day that still has an "Available" entry fills that entry (no "Available" left next to the family).
    const slot = !puja.id && hasFamily(row) ? pujas.find((x) => x.puja_date === row.puja_date && !hasFamily(x)) : null;
    if (slot) {
      row.puja_time = row.puja_time || slot.puja_time || null;
      row.puja_name = row.puja_name || slot.puja_name || '';
      if (v6) row.puja_name_te = row.puja_name_te || slot.puja_name_te || '';
    }
    const id = puja.id || slot?.id;
    const { error } = id ? await supabase.from('pujas').update(row).eq('id', id) : await supabase.from('pujas').insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    setPuja(null); toast(t('saved'), 'success'); reload(true);
  };
  const delPuja = async () => {
    if (!window.confirm(t('delete_puja_confirm'))) return;
    setBusy(true);
    const { error } = await supabase.from('pujas').delete().eq('id', puja.id);
    setBusy(false);
    if (error) return toast(errMsg(error, t), 'error');
    setPuja(null); reload(true);
  };
  const pujaMissing = !!data && data.pujas === null;

  const openDay = (d) => setDayEdit({ day_date: d.date, alankaram_te: d.day?.alankaram_te || '', alankaram_en: d.day?.alankaram_en || '', note_te: d.day?.note_te || '', note_en: d.day?.note_en || '' });
  const newProg = (date) => setProg({ program_date: date || range[0] || '', start_time: '', end_time: '', title_te: '', title_en: '', place: '', details: '', place_te: '', details_te: '' });
  const editProg = (p) => setProg({ ...p, start_time: (p.start_time || '').slice(0, 5), end_time: (p.end_time || '').slice(0, 5), place: p.place || '', details: p.details || '', place_te: p.place_te || '', details_te: p.details_te || '' });

  return (
    <Page title={tab === 'puja' ? t('nav_puja') : t('nav_programs')} sub={`${L(settings, 'event_title')} ${settings.event_year}`}
      right={!isAdmin ? null : tab === 'puja'
        ? (pujaMissing ? null : <button className="tb-btn" onClick={() => newPuja()} data-testid="puja-add">{t('add_puja')}</button>)
        : <button className="tb-btn" onClick={() => newProg()}>{t('add_program')}</button>}>
      <div className="seg" data-testid="schedule-tabs">
        <button type="button" className={tab === 'programs' ? 'on' : ''} onClick={() => nav('/programs', { replace: true })}>{t('tab_programs')}</button>
        <button type="button" className={tab === 'puja' ? 'on' : ''} onClick={() => nav('/puja', { replace: true })} data-testid="tab-puja">{t('tab_puja')}</button>
      </div>
      {isAdmin && !range.length && <Link to="/settings" className="alert warn">⚙️ {t('set_dates_first')}</Link>}

      {tab === 'programs' && (
        <>
          {isAdmin && range.length > 0 && !hasAlank && !loading && (
            <button className="btn ghost block" disabled={busy} onClick={fillSample}>{t('fill_standard')}</button>
          )}
          {loading && !data ? <Spinner /> : data && (range.length || data.programs.length) ? (
            <Schedule start={settings.start_date} end={settings.end_date} days={data.days} programs={data.programs}
              editable={isAdmin} onEditDay={openDay} onAddProgram={newProg} onEditProgram={editProg} />
          ) : <Empty icon="📅" text={t('nothing_here')} />}
        </>
      )}

      {tab === 'puja' && (
        loading && !data ? <Spinner /> : pujaMissing ? (
          isAdmin ? <PujaDbUpdate /> : <div className="alert warn" data-testid="puja-db-update">{t('puja_needs_db_member')}</div>
        ) : data && (
          <>
            {isAdmin && range.length > 0 && freeDays.length > 0 && (
              <button className="btn ghost block" disabled={busy} onClick={addFestivalDays} data-testid="puja-add-days">{t('puja_add_days', { n: freeDays.length })}</button>
            )}
            {range.length || pujas.length ? (
              <PujaSchedule start={settings.start_date} end={settings.end_date} pujas={pujas} team editable={isAdmin} onEdit={editPuja} onAdd={newPuja} />
            ) : <Empty icon="🪔" text={t('puja_empty')} />}
          </>
        )
      )}

      <Modal open={!!puja} onClose={() => setPuja(null)} title={puja?.id ? t('edit_puja') : t('new_puja')}>
        {puja && (
          <div className="stack" data-testid="puja-form">
            <Field label={t('date')}>
              {range.length ? (
                <select className="input" value={puja.puja_date} onChange={(e) => setPuja({ ...puja, puja_date: e.target.value })} data-testid="puja-date">
                  {[...new Set([...range, puja.puja_date].filter(Boolean))].sort().map((d) => (
                    <option key={d} value={d}>{range.indexOf(d) >= 0 ? `${t('day_n', { n: range.indexOf(d) + 1 })} · ` : ''}{fmtDay(d, lang)}</option>
                  ))}
                </select>
              ) : <input type="date" className="input" value={puja.puja_date} onChange={(e) => setPuja({ ...puja, puja_date: e.target.value })} data-testid="puja-date" />}
            </Field>
            {v6 ? (
              <>
                <Field label={t('family_te')}>
                  <input className="input" value={puja.family_name_te} placeholder={DICT.family_name_ph[0]} onChange={(e) => setPuja({ ...puja, family_name_te: e.target.value })} data-testid="puja-family-te" />
                </Field>
                <Field label={t('family_en')} hint={t('family_hint')}>
                  <input className="input" value={puja.family_name} placeholder={DICT.family_name_ph[1]} onChange={(e) => setPuja({ ...puja, family_name: e.target.value })} data-testid="puja-family-input" />
                </Field>
                <div className="grid2">
                  <Field label={t('puja_name_te_l')} optional>
                    <input className="input" value={puja.puja_name_te} placeholder={DICT.puja_name_ph[0]} onChange={(e) => setPuja({ ...puja, puja_name_te: e.target.value })} data-testid="puja-name-te" />
                  </Field>
                  <Field label={t('puja_name_en_l')} optional>
                    <input className="input" value={puja.puja_name} placeholder={DICT.puja_name_ph[1]} onChange={(e) => setPuja({ ...puja, puja_name: e.target.value })} data-testid="puja-name-input" />
                  </Field>
                </div>
                <div className="grid2">
                  <Field label={t('village_te_l')} optional><input className="input" value={puja.village_te} onChange={(e) => setPuja({ ...puja, village_te: e.target.value })} data-testid="puja-village-te" /></Field>
                  <Field label={t('village_en_l')} optional><input className="input" value={puja.village} onChange={(e) => setPuja({ ...puja, village: e.target.value })} data-testid="puja-village" /></Field>
                </div>
                <div className="grid2">
                  <Field label={t('gotram_te_l')} optional><input className="input" value={puja.gotram_te} onChange={(e) => setPuja({ ...puja, gotram_te: e.target.value })} data-testid="puja-gotram-te" /></Field>
                  <Field label={t('gotram_en_l')} optional><input className="input" value={puja.gotram} onChange={(e) => setPuja({ ...puja, gotram: e.target.value })} data-testid="puja-gotram" /></Field>
                </div>
                <div className="grid2">
                  <Field label={t('time')} optional><input type="time" className="input" value={puja.puja_time} onChange={(e) => setPuja({ ...puja, puja_time: e.target.value })} data-testid="puja-time" /></Field>
                  <Field label={t('mobile')} optional><MobileInput className="input num" value={puja.mobile} onChange={(v) => setPuja({ ...puja, mobile: v })} autoComplete="off" data-testid="puja-mobile-input" /></Field>
                </div>
              </>
            ) : (
              <>
                <Field label={t('family_name')} hint={t('family_hint')}>
                  <input className="input" value={puja.family_name} placeholder={t('family_name_ph')} onChange={(e) => setPuja({ ...puja, family_name: e.target.value })} data-testid="puja-family-input" />
                </Field>
                <div className="grid2">
                  <Field label={t('puja_name')} optional>
                    <input className="input" value={puja.puja_name} placeholder={t('puja_name_ph')} onChange={(e) => setPuja({ ...puja, puja_name: e.target.value })} data-testid="puja-name-input" />
                  </Field>
                  <Field label={t('time')} optional><input type="time" className="input" value={puja.puja_time} onChange={(e) => setPuja({ ...puja, puja_time: e.target.value })} data-testid="puja-time" /></Field>
                </div>
                <Field label={t('village')} optional><input className="input" value={puja.village} onChange={(e) => setPuja({ ...puja, village: e.target.value })} data-testid="puja-village" /></Field>
                <div className="grid2">
                  <Field label={t('gotram')} optional><input className="input" value={puja.gotram} onChange={(e) => setPuja({ ...puja, gotram: e.target.value })} data-testid="puja-gotram" /></Field>
                  <Field label={t('mobile')} optional><MobileInput className="input num" value={puja.mobile} onChange={(v) => setPuja({ ...puja, mobile: v })} autoComplete="off" data-testid="puja-mobile-input" /></Field>
                </div>
              </>
            )}
            <Field label={t('note')} optional><input className="input" value={puja.note} onChange={(e) => setPuja({ ...puja, note: e.target.value })} data-testid="puja-note-input" /></Field>
            <p className="hint">🔒 {t('puja_private_hint')}</p>
            <p className="hint" data-testid="te-names-hint">{v6 ? `🌐 ${t('te_names_hint')}` : `🛠️ ${t('te_names_needs_db')}`}</p>
            <div className="grid2">
              {puja.id ? <button className="btn ghost danger-t" disabled={busy} onClick={delPuja} data-testid="puja-delete">🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={busy} onClick={savePuja} data-testid="puja-save">{busy ? t('saving') : t('save')}</button>
            </div>
          </div>
        )}
      </Modal>

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
          <div className="stack" data-testid="prog-form">
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
            <Field label={t('program_title_te')}><input className="input" value={prog.title_te} onChange={(e) => setProg({ ...prog, title_te: e.target.value })} data-testid="prog-title-te" /></Field>
            <Field label={t('program_title_en')}><input className="input" value={prog.title_en} onChange={(e) => setProg({ ...prog, title_en: e.target.value })} data-testid="prog-title-en" /></Field>
            {v6 ? (
              <>
                <div className="grid2">
                  <Field label={t('place_te')} optional><input className="input" value={prog.place_te} onChange={(e) => setProg({ ...prog, place_te: e.target.value })} data-testid="prog-place-te" /></Field>
                  <Field label={t('place_en')} optional><input className="input" value={prog.place} onChange={(e) => setProg({ ...prog, place: e.target.value })} data-testid="prog-place" /></Field>
                </div>
                <Field label={t('details_te')} optional><textarea className="input" value={prog.details_te} onChange={(e) => setProg({ ...prog, details_te: e.target.value })} data-testid="prog-details-te" /></Field>
                <Field label={t('details_en')} optional><textarea className="input" value={prog.details} onChange={(e) => setProg({ ...prog, details: e.target.value })} data-testid="prog-details" /></Field>
              </>
            ) : (
              <>
                <Field label={t('place')} optional><input className="input" value={prog.place} onChange={(e) => setProg({ ...prog, place: e.target.value })} data-testid="prog-place" /></Field>
                <Field label={t('program_details')} optional><textarea className="input" value={prog.details} onChange={(e) => setProg({ ...prog, details: e.target.value })} data-testid="prog-details" /></Field>
              </>
            )}
            <p className="hint" data-testid="te-names-hint">{v6 ? `🌐 ${t('te_names_hint')}` : `🛠️ ${t('te_names_needs_db')}`}</p>
            <div className="grid2">
              {prog.id ? <button className="btn ghost danger-t" disabled={busy} onClick={delProg}>🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={busy} onClick={saveProg} data-testid="prog-save">{busy ? t('saving') : t('save')}</button>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

/** Admin: the puja schedule needs the version 5 database update (Copy SQL → Supabase → Run → Check again). */
function PujaDbUpdate() {
  const { t } = useLang();
  const [version, check] = useDbVersion();
  return (
    <div className="stack" data-testid="puja-db-update">
      <div className="alert warn">{t('puja_needs_db')}</div>
      <DbUpdateNotice version={version} onCheck={async () => { await check(); window.location.reload(); }} />
    </div>
  );
}


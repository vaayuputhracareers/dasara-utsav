// Version 12 – 📷 Photos (day-wise) · 🥻 Saree donors · 🔨 Saree auction.
// The admin adds / changes / deletes; team members only look (visitors see them on the public page).
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { todayIST } from '../lib/format.js';
import { imageUrl, uploadPicture, removePictures, isMissing, toAmount } from '../lib/festival.js';
import { Page, Spinner, Modal, Field, useToast, MobileInput, Switch } from '../components/ui.jsx';
import { PhotoDays, SareeDonorList, AuctionList, PictureViewer, auctionView, picturesOf, photoItem, donorItem, lotItem } from '../components/Festival.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';

const TABS = [
  { key: 'photos', path: '/photos', icon: '📷', label: 'nav_photos', add: 'add_photos' },
  { key: 'sarees', path: '/sarees', icon: '🥻', label: 'nav_sarees', add: 'add_saree_donor' },
  { key: 'auction', path: '/auction', icon: '🔨', label: 'nav_auction', add: 'add_auction' },
];

const newDonor = () => ({ donor_name: '', village: '', mobile: '', given_date: todayIST(), saree_details: '', note: '', image_path: '', file: null, preview: '', removeImage: false });
const newLot = () => ({ saree_no: '', saree_donor_id: '', saree_details: '', base_rate: '', bidder_name: '', bidder_village: '', bidder_mobile: '', bid_amount: '', auction_date: todayIST(), paid: false, note: '', image_path: '', file: null, preview: '', removeImage: false });

/** Picture of a form: choose / change / remove (fallback = the donated saree's picture). */
function PicturePick({ form, setForm, fallback, testid }) {
  const { t } = useLang();
  const ref = useRef(null);
  const own = form.preview || (!form.removeImage ? imageUrl(form.image_path) : '');
  const shown = own || fallback || '';
  return (
    <div className="photo-pick">
      {shown && <img src={shown} alt="" />}
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} data-testid={testid}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setForm((x) => ({ ...x, file: f, preview: URL.createObjectURL(f), removeImage: false })); }} />
      <button type="button" className="btn ghost sm" onClick={() => ref.current?.click()}>{own ? t('change_photo') : t('take_photo')}</button>
      {own && <button type="button" className="btn ghost sm danger-t" onClick={() => setForm((x) => ({ ...x, file: null, preview: '', removeImage: true }))}>{t('remove_photo')}</button>}
      {!own && fallback && <span className="hint">{t('picture_from_donor')}</span>}
    </div>
  );
}

function FestivalDbUpdate() {
  const { t } = useLang();
  const [version, check] = useDbVersion();
  return (
    <>
      <DbUpdateNotice version={version} onCheck={async () => { await check(); window.location.reload(); }} />
      {version !== undefined && <p className="hint">{t('festival_needs_db')}</p>}
    </>
  );
}

export default function Festival() {
  const { t, L, lang } = useLang();
  const { isAdmin, profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const loc = useLocation();
  const nav = useNavigate();
  const cur = TABS.find((x) => loc.pathname.startsWith(x.path)) || TABS[0];
  const tab = cur.key;
  const filesRef = useRef(null);
  const [viewer, setViewer] = useState(null);       // { items, index, kind }
  const [photoAdd, setPhotoAdd] = useState(null);
  const [photoEdit, setPhotoEdit] = useState(null);
  const [donor, setDonor] = useState(null);
  const [lot, setLot] = useState(null);
  const [busy, setBusy] = useState('');

  const { data, loading, error, reload } = useAsync(async () => {
    const [p, d, a] = await Promise.all([
      supabase.from('photos').select('*').order('photo_date', { ascending: false }).order('created_at'),
      supabase.from('saree_donors').select('*').order('given_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('saree_auction').select('*, donor:saree_donors(id,donor_name,village,image_path,saree_details)').order('auction_date').order('created_at'),
    ]);
    for (const r of [p, d, a]) {
      if (r.error && isMissing(r.error)) return { missing: true };
      if (r.error) throw r.error;
    }
    return { photos: p.data || [], donors: d.data || [], auction: (a.data || []).map(auctionView) };
  }, []);
  const ok = data && !data.missing;

  // ---------- photos ----------
  const savePhotos = async () => {
    const f = photoAdd;
    if (!f?.files.length) return;
    const date = f.photo_date || todayIST();
    const rows = [];
    let firstErr = null;
    for (let i = 0; i < f.files.length; i++) {
      setBusy(t('uploading_n', { i: i + 1, n: f.files.length }));
      try {
        const path = await uploadPicture(f.files[i], `photos/${date}`);
        rows.push({ photo_date: date, caption: f.caption.trim(), image_path: path, created_by: profile.id });
      } catch (e) { firstErr = firstErr || e; }
    }
    if (rows.length) {
      const { error: e } = await supabase.from('photos').insert(rows);
      if (e) { setBusy(''); removePictures(rows.map((r) => r.image_path)); toast(errMsg(e, t), 'error'); return; }
    }
    setBusy('');
    if (!rows.length) { toast(errMsg(firstErr, t), 'error'); return; }
    toast(firstErr ? t('photos_partly', { n: rows.length, m: f.files.length - rows.length }) : t('photos_added', { n: rows.length }), firstErr ? 'error' : 'success');
    setPhotoAdd(null);
    reload(true);
  };
  const savePhotoEdit = async () => {
    setBusy(t('saving'));
    const { error: e } = await supabase.from('photos').update({ photo_date: photoEdit.photo_date || todayIST(), caption: photoEdit.caption.trim() }).eq('id', photoEdit.id);
    setBusy('');
    if (e) { toast(errMsg(e, t), 'error'); return; }
    toast(t('saved'), 'success');
    setPhotoEdit(null);
    reload(true);
  };
  const delPhoto = async (p) => {
    if (!window.confirm(t('delete_photo_confirm'))) return;
    setBusy(t('saving'));
    const { error: e } = await supabase.from('photos').delete().eq('id', p.id);
    setBusy('');
    if (e) { toast(errMsg(e, t), 'error'); return; }
    removePictures([p.image_path]);
    setViewer(null);
    setPhotoEdit(null);
    toast(t('fest_deleted'), 'success');
    reload(true);
  };

  // ---------- saving a donor / auction entry with its picture ----------
  const savePictureRow = async (table, form, row, folder) => {
    let image_path = form.removeImage ? '' : form.image_path || '';
    const old = form.id ? form.orig_image || '' : '';
    let uploaded = '';
    try {
      if (form.file) { setBusy(t('uploading_photo')); uploaded = await uploadPicture(form.file, folder); image_path = uploaded; }
      setBusy(t('saving'));
      const payload = { ...row, image_path };
      const { error: e } = form.id
        ? await supabase.from(table).update(payload).eq('id', form.id)
        : await supabase.from(table).insert({ ...payload, created_by: profile.id });
      if (e) throw e;
      if (old && old !== image_path) removePictures([old]);
      setBusy('');
      toast(t('saved'), 'success');
      reload(true);
      return true;
    } catch (e) {
      if (uploaded) removePictures([uploaded]);
      setBusy('');
      toast(errMsg(e, t), 'error');
      return false;
    }
  };

  // ---------- saree donors ----------
  const editDonor = (d) => setDonor({ ...newDonor(), ...d, mobile: d.mobile || '', orig_image: d.image_path || '', file: null, preview: '', removeImage: false });
  const saveDonor = async () => {
    const f = donor;
    if (!f.donor_name.trim()) { toast(t('err_donor_name_required'), 'error'); return; }
    if (f.mobile && f.mobile.length !== 10) { toast(t('err_invalid_mobile'), 'error'); return; }
    const row = { donor_name: f.donor_name.trim(), village: f.village.trim(), mobile: f.mobile || null, given_date: f.given_date || todayIST(), saree_details: f.saree_details.trim(), note: f.note.trim() };
    if (await savePictureRow('saree_donors', f, row, 'sarees')) setDonor(null);
  };
  const delDonor = async () => {
    const d = donor;
    if (!window.confirm(t('delete_saree_donor_confirm', { name: d.donor_name }))) return;
    setBusy(t('saving'));
    // auction entries of this saree keep its picture / details
    const linked = (data?.auction || []).filter((a) => a.saree_donor_id === d.id);
    for (const a of linked) {
      await supabase.from('saree_auction').update({ image_path: a.image_path || d.orig_image || '', saree_details: a.saree_details || d.saree_details || '' }).eq('id', a.id);
    }
    const { error: e } = await supabase.from('saree_donors').delete().eq('id', d.id);
    setBusy('');
    if (e) { toast(errMsg(e, t), 'error'); return; }
    if (d.orig_image && !linked.some((a) => !a.image_path)) removePictures([d.orig_image]);
    setDonor(null);
    toast(t('fest_deleted'), 'success');
    reload(true);
  };

  // ---------- saree auction ----------
  const editLot = (a) => setLot({
    ...newLot(), ...a, saree_donor_id: a.saree_donor_id || '', base_rate: a.base_rate == null ? '' : String(Number(a.base_rate)),
    bid_amount: a.bid_amount == null ? '' : String(Number(a.bid_amount)), bidder_mobile: a.bidder_mobile || '',
    orig_image: a.image_path || '', file: null, preview: '', removeImage: false,
  });
  const lotDonor = lot ? (data?.donors || []).find((d) => d.id === lot.saree_donor_id) : null;
  const saveLot = async () => {
    const f = lot;
    if (!f.saree_no.trim() && !f.saree_details.trim() && !f.saree_donor_id && !f.file && !(f.image_path && !f.removeImage)) { toast(t('need_saree_info'), 'error'); return; }
    if (f.bidder_mobile && f.bidder_mobile.length !== 10) { toast(t('err_invalid_mobile'), 'error'); return; }
    const row = {
      saree_no: f.saree_no.trim(), saree_details: f.saree_details.trim(), saree_donor_id: f.saree_donor_id || null,
      base_rate: toAmount(f.base_rate), bidder_name: f.bidder_name.trim(), bidder_village: f.bidder_village.trim(),
      bidder_mobile: f.bidder_mobile || null, bid_amount: toAmount(f.bid_amount), auction_date: f.auction_date || todayIST(),
      paid: !!f.paid, note: f.note.trim(),
    };
    if (await savePictureRow('saree_auction', f, row, 'auction')) setLot(null);
  };
  const delLot = async () => {
    if (!window.confirm(t('delete_auction_confirm'))) return;
    setBusy(t('saving'));
    const { error: e } = await supabase.from('saree_auction').delete().eq('id', lot.id);
    setBusy('');
    if (e) { toast(errMsg(e, t), 'error'); return; }
    if (lot.orig_image) removePictures([lot.orig_image]);   // only its own picture, never the donor's
    setLot(null);
    toast(t('fest_deleted'), 'success');
    reload(true);
  };

  const onAdd = () => {
    if (tab === 'photos') setPhotoAdd({ photo_date: todayIST(), caption: '', files: [], previews: [] });
    else if (tab === 'sarees') setDonor(newDonor());
    else setLot(newLot());
  };
  const openPhotos = (list, i) => setViewer({ kind: 'photo', items: list.map((p) => photoItem(p, lang)), index: i });
  const openDonor = (d) => setViewer({ kind: 'donor', ...picturesOf(data.donors, d, (x) => donorItem(x, lang)) });
  const openLot = (a) => setViewer({ kind: 'lot', ...picturesOf(data.auction, a, (x) => lotItem(x, lang, t)) });
  const set = (setter, k) => (e) => { const v = e.target.value; setter((x) => ({ ...x, [k]: v })); };

  return (
    <Page title={t(cur.label)} sub={`${L(settings, 'event_title')} ${settings.event_year}`}
      right={isAdmin && ok ? <button className="tb-btn" onClick={onAdd} data-testid="fest-add">{t(cur.add)}</button> : null}>
      <div className="seg" data-testid="festival-tabs">
        {TABS.map((x) => (
          <button key={x.key} type="button" className={tab === x.key ? 'on' : ''} onClick={() => nav(x.path, { replace: true })} data-testid={`tab-${x.key}`}>{x.icon} {t(x.label)}</button>
        ))}
      </div>

      {loading && !data ? <Spinner /> : data?.missing ? (
        isAdmin ? <FestivalDbUpdate /> : <div className="alert warn" data-testid="fest-db-update">{t('festival_needs_db_member')}</div>
      ) : error && !data ? <div className="alert warn">{errMsg(error, t)}</div> : ok && (
        <>
          {tab === 'photos' && <PhotoDays photos={data.photos} onOpen={openPhotos} />}
          {tab === 'sarees' && <SareeDonorList items={data.donors} team onEdit={isAdmin ? editDonor : null} onPicture={openDonor} />}
          {tab === 'auction' && (
            <>
              {isAdmin && <p className="hint">{t('auction_hint')}</p>}
              <AuctionList items={data.auction} team onEdit={isAdmin ? editLot : null} onPicture={openLot} />
              {isAdmin && data.auction.length > 0 && <p className="hint">{t('auction_not_in_accounts')}</p>}
            </>
          )}
        </>
      )}

      {/* ---------- add photos ---------- */}
      <Modal open={!!photoAdd} onClose={() => !busy && setPhotoAdd(null)} title={t('photos_title_add')}>
        {photoAdd && (
          <div className="stack" data-testid="photo-form">
            <Field label={t('date')}><input type="date" className="input" value={photoAdd.photo_date} onChange={set(setPhotoAdd, 'photo_date')} data-testid="photo-date" /></Field>
            <Field label={t('caption')} optional><input className="input" value={photoAdd.caption} onChange={set(setPhotoAdd, 'caption')} placeholder={t('caption_ph')} data-testid="photo-caption" /></Field>
            <input ref={filesRef} type="file" accept="image/*" multiple style={{ display: 'none' }} data-testid="photo-files"
              onChange={(e) => {
                const fs = [...(e.target.files || [])];
                e.target.value = '';
                if (fs.length) setPhotoAdd((x) => ({ ...x, files: [...x.files, ...fs], previews: [...x.previews, ...fs.map((f) => URL.createObjectURL(f))] }));
              }} />
            <button type="button" className="btn ghost block" disabled={!!busy} onClick={() => filesRef.current?.click()}>{t('choose_photos')}</button>
            {photoAdd.previews.length > 0 && (
              <>
                <div className="photo-grid">{photoAdd.previews.map((src, i) => <button key={src} type="button" disabled><img src={src} alt={String(i + 1)} /></button>)}</div>
                <p className="hint">{t('photos_chosen', { n: photoAdd.files.length })}</p>
              </>
            )}
            <button className="btn primary block" disabled={!!busy || !photoAdd.files.length} onClick={savePhotos} data-testid="photo-save">{busy || t('save')}</button>
          </div>
        )}
      </Modal>

      {/* ---------- photo details (admin) ---------- */}
      <Modal open={!!photoEdit} onClose={() => !busy && setPhotoEdit(null)} title={t('photo_edit')}>
        {photoEdit && (
          <div className="stack" data-testid="photo-edit">
            <img src={imageUrl(photoEdit.image_path)} alt="" className="photo-edit-img" />
            <Field label={t('date')}><input type="date" className="input" value={photoEdit.photo_date} onChange={set(setPhotoEdit, 'photo_date')} /></Field>
            <Field label={t('caption')} optional><input className="input" value={photoEdit.caption} onChange={set(setPhotoEdit, 'caption')} placeholder={t('caption_ph')} /></Field>
            <div className="grid2">
              <button className="btn ghost danger-t" disabled={!!busy} onClick={() => delPhoto(photoEdit)} data-testid="photo-delete">🗑️ {t('delete')}</button>
              <button className="btn primary" disabled={!!busy} onClick={savePhotoEdit}>{busy || t('save')}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- saree donor ---------- */}
      <Modal open={!!donor} onClose={() => !busy && setDonor(null)} title={donor?.id ? t('saree_donor_edit') : t('saree_donor_new')}>
        {donor && (
          <div className="stack" data-testid="saree-donor-form">
            <Field label={t('donor_name')}><input className="input" value={donor.donor_name} onChange={set(setDonor, 'donor_name')} data-testid="sd-name" /></Field>
            <div className="grid2">
              <Field label={t('village')} optional><input className="input" value={donor.village} onChange={set(setDonor, 'village')} data-testid="sd-village" /></Field>
              <Field label={t('date')}><input type="date" className="input" value={donor.given_date} onChange={set(setDonor, 'given_date')} /></Field>
            </div>
            <Field label={t('saree_details')} optional><input className="input" value={donor.saree_details} onChange={set(setDonor, 'saree_details')} placeholder={t('saree_details_ph')} data-testid="sd-details" /></Field>
            <Field label={t('saree_photo')} optional><PicturePick form={donor} setForm={setDonor} testid="sd-photo" /></Field>
            <Field label={t('mobile')} optional><MobileInput className="input num" value={donor.mobile} onChange={(v) => setDonor((x) => ({ ...x, mobile: v }))} autoComplete="off" /></Field>
            <Field label={t('note')} optional><input className="input" value={donor.note} onChange={set(setDonor, 'note')} /></Field>
            <p className="hint">{t('team_only_hint')}</p>
            <div className="grid2">
              {donor.id ? <button className="btn ghost danger-t" disabled={!!busy} onClick={delDonor} data-testid="sd-delete">🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={!!busy} onClick={saveDonor} data-testid="sd-save">{busy || t('save')}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- saree auction entry ---------- */}
      <Modal open={!!lot} onClose={() => !busy && setLot(null)} title={lot?.id ? t('auction_edit') : t('auction_new')}>
        {lot && (
          <div className="stack" data-testid="auction-form">
            <div className="grid2">
              <Field label={t('saree_no')} optional><input className="input" value={lot.saree_no} onChange={set(setLot, 'saree_no')} data-testid="au-no" /></Field>
              <Field label={t('date')}><input type="date" className="input" value={lot.auction_date} onChange={set(setLot, 'auction_date')} /></Field>
            </div>
            <Field label={t('donated_saree')} optional>
              <select className="input" value={lot.saree_donor_id} onChange={set(setLot, 'saree_donor_id')} data-testid="au-donor">
                <option value="">{t('donated_saree_none')}</option>
                {(data?.donors || []).map((d) => <option key={d.id} value={d.id}>{[d.donor_name, d.saree_details].filter(Boolean).join(' – ')}</option>)}
              </select>
            </Field>
            <Field label={t('saree_details')} optional><input className="input" value={lot.saree_details} onChange={set(setLot, 'saree_details')} placeholder={lotDonor?.saree_details || t('saree_details_ph')} data-testid="au-details" /></Field>
            <Field label={t('saree_photo')} optional><PicturePick form={lot} setForm={setLot} fallback={imageUrl(lotDonor?.image_path)} testid="au-photo" /></Field>
            <Field label={t('base_rate')} optional><input className="input num" inputMode="decimal" value={lot.base_rate} onChange={set(setLot, 'base_rate')} placeholder="₹" data-testid="au-base" /></Field>
            <div className="grid2">
              <Field label={t('bidder_name')} optional><input className="input" value={lot.bidder_name} onChange={set(setLot, 'bidder_name')} data-testid="au-bidder" /></Field>
              <Field label={t('bidder_village')} optional><input className="input" value={lot.bidder_village} onChange={set(setLot, 'bidder_village')} /></Field>
            </div>
            <Field label={t('bid_amount')} optional><input className="input num big" inputMode="decimal" value={lot.bid_amount} onChange={set(setLot, 'bid_amount')} placeholder="₹" data-testid="au-amount" /></Field>
            <Field label={t('bidder_mobile')} optional><MobileInput className="input num" value={lot.bidder_mobile} onChange={(v) => setLot((x) => ({ ...x, bidder_mobile: v }))} autoComplete="off" /></Field>
            <div className="toggle-row"><span>{t('auction_paid')}</span><Switch checked={lot.paid} onChange={(v) => setLot((x) => ({ ...x, paid: v }))} /></div>
            <Field label={t('note')} optional><input className="input" value={lot.note} onChange={set(setLot, 'note')} /></Field>
            <p className="hint">{t('team_only_hint_auction')}</p>
            <div className="grid2">
              {lot.id ? <button className="btn ghost danger-t" disabled={!!busy} onClick={delLot} data-testid="au-delete">🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={!!busy} onClick={saveLot} data-testid="au-save">{busy || t('save')}</button>
            </div>
          </div>
        )}
      </Modal>

      {viewer && (
        <PictureViewer items={viewer.items} index={viewer.index} onIndex={(i) => setViewer((v) => ({ ...v, index: i }))} onClose={() => setViewer(null)}
          actions={isAdmin && viewer.kind === 'photo' ? (it) => (
            <>
              <button type="button" className="btn ghost sm" onClick={() => { setViewer(null); setPhotoEdit({ ...it.row, caption: it.row.caption || '' }); }} data-testid="viewer-edit">✏️ {t('edit')}</button>
              <button type="button" className="btn ghost sm danger-t" disabled={!!busy} onClick={() => delPhoto(it.row)} data-testid="viewer-delete">🗑️ {t('delete')}</button>
            </>
          ) : null} />
      )}
    </Page>
  );
}

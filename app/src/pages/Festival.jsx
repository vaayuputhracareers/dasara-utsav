// Version 12 – 📷 Photos (day-wise) · 🥻 Saree donors · 🔨 Saree auction.
// The admin adds / changes / deletes; team members only look (visitors see them on the public page).
import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, fmtDay, todayIST } from '../lib/format.js';
import { imageUrl, uploadPicture, removePictures, isMissing, toAmount } from '../lib/festival.js';
import { Page, Spinner, Modal, Field, useToast, MobileInput, Seg, Empty } from '../components/ui.jsx';
import { PhotoDays, SareeDonorList, AuctionList, PictureViewer, auctionView, picturesOf, photoItem, donorItem, lotItem, bidderKey, bidderGroups } from '../components/Festival.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';

const TABS = [
  { key: 'photos', path: '/photos', icon: '📷', label: 'nav_photos', add: 'add_photos' },
  { key: 'sarees', path: '/sarees', icon: '🥻', label: 'nav_sarees', add: 'add_saree_donor' },
  { key: 'auction', path: '/auction', icon: '🔨', label: 'nav_auction', add: 'add_auction' },
];

const newDonor = () => ({ donor_name: '', village: '', mobile: '', given_date: todayIST(), saree_details: '', note: '', image_path: '', file: null, preview: '', removeImage: false });
const newLot = () => ({ saree_no: '', saree_donor_id: '', saree_details: '', base_rate: '', bidder_name: '', bidder_village: '', bidder_mobile: '', bid_amount: '', auction_date: todayIST(), note: '', image_path: '', file: null, preview: '', removeImage: false, _newBidder: false });

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

/** Saree auction totals (team): total bid amount, payment received, outstanding. */
function AuctionTotals({ lots, payments }) {
  const { t } = useLang();
  const bid = lots.reduce((s, a) => s + Number(a.bid_amount || 0), 0);
  const got = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const due = Math.round((bid - got) * 100) / 100;
  const bidders = new Set(lots.map((a) => bidderKey(a.bidder_name)).filter(Boolean)).size;
  return (
    <div className="card" data-testid="auction-totals">
      <div className="mini">
        <div><small>{t('total_bid_amount')}</small><b className="num" data-testid="au-total-bid">{inr(bid)}</b></div>
        <div><small>{t('payment_received')}</small><b className="num" style={{ color: 'var(--green)' }} data-testid="au-total-paid">{inr(got)}</b></div>
        <div><small>{t('outstanding')}</small><b className="num" style={{ color: due > 0 ? 'var(--kumkum)' : 'var(--green)' }} data-testid="au-total-due">{inr(due)}</b></div>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>{t('auction_counts', { n: lots.length, m: bidders })}</p>
    </div>
  );
}

/** Bidder-wise view: pick a bidder → all his sarees, his totals and his payments. */
function BidderView({ groups, sel, onSel, canPay, onPay, onEditPay, onDelPay, onEditLot, onPicture }) {
  const { t, lang } = useLang();
  const g = groups.find((x) => x.key === sel);
  const status = (x) => (x.due > 0 ? <span className="badge orange num">{t('due_x', { amount: inr(x.due) })}</span>
    : x.due < 0 ? <span className="badge green num">{t('extra_x', { amount: inr(-x.due) })}</span>
      : <span className="badge green">{t('fully_paid')}</span>);
  return (
    <div className="stack" data-testid="bidder-view">
      <select className="input" value={g ? sel : ''} onChange={(e) => onSel(e.target.value)} data-testid="bidder-select">
        <option value="">{t('select_bidder')}</option>
        {groups.map((x) => <option key={x.key} value={x.key}>{x.name}{x.village ? ` (${x.village})` : ''} – {inr(x.bid)}</option>)}
      </select>
      {!groups.length && <Empty icon="👤" text={t('no_bidders')} />}
      {!g && groups.length > 0 && (
        <div className="card" data-testid="bidder-list">
          <div className="list">
            {groups.map((x) => (
              <div key={x.key} className="li" onClick={() => onSel(x.key)} data-testid="bidder-row">
                <div className="grow">
                  <div className="main-t">👤 {x.name}</div>
                  <div className="sub-t">{[x.village, t('sarees_n', { n: x.lots.length })].filter(Boolean).join(' · ')}</div>
                  <div className="sub-t num">{t('bid_paid_line', { bid: inr(x.bid), paid: inr(x.paid) })}</div>
                </div>
                <div className="amt">{status(x)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {g && (
        <>
          <div className="card" data-testid="bidder-detail">
            <div className="row between">
              <div>
                <div className="main-t" style={{ fontSize: 16 }}>👤 {g.name}</div>
                {(g.village || g.mobile) && <div className="sub-t">{g.village}{g.village && g.mobile ? ' · ' : ''}{g.mobile && <a className="num" href={`tel:${g.mobile}`}>📞 {g.mobile}</a>}</div>}
              </div>
              <button type="button" className="btn ghost xs" onClick={() => onSel('')}>✕ {t('all_bidders')}</button>
            </div>
            <div className="mini" style={{ marginTop: 10 }}>
              <div><small>{t('total_bid_amount')}</small><b className="num" data-testid="bd-bid">{inr(g.bid)}</b></div>
              <div><small>{t('payment_received')}</small><b className="num" style={{ color: 'var(--green)' }} data-testid="bd-paid">{inr(g.paid)}</b></div>
              <div><small>{g.due < 0 ? t('extra_paid') : t('outstanding')}</small><b className="num" style={{ color: g.due > 0 ? 'var(--kumkum)' : 'var(--green)' }} data-testid="bd-due">{inr(Math.abs(g.due))}</b></div>
            </div>
            {canPay && <button type="button" className="btn primary block" style={{ marginTop: 10 }} onClick={() => onPay(g)} data-testid="bd-pay">{t('record_payment')}</button>}
          </div>
          <div className="section-title">🥻 {t('sarees_n', { n: g.lots.length })}</div>
          {g.lots.length ? <AuctionList items={g.lots} team hideSummary onEdit={onEditLot} onPicture={onPicture} /> : <p className="hint">{t('bidder_no_sarees')}</p>}
          <div className="section-title">💵 {t('payments_title')}</div>
          <div className="card" data-testid="bidder-payments">
            {!g.payments.length ? <Empty icon="💵" text={t('no_payments')} /> : (
              <div className="list">
                {g.payments.map((p) => (
                  <div key={p.id} className="li" data-testid="payment-row">
                    <div className="grow">
                      <div className="main-t">{fmtDay(p.paid_on, lang)}</div>
                      <div className="sub-t">{p.payment_mode === 'upi' ? 'UPI' : t('cash')}{p.note ? ` · ${p.note}` : ''}</div>
                      {canPay && (
                        <div className="row" style={{ gap: 8, marginTop: 6 }}>
                          <button type="button" className="btn ghost xs" onClick={() => onEditPay(p)} data-testid="pay-edit-btn">✏️ {t('edit')}</button>
                          <button type="button" className="btn ghost xs danger-t" onClick={() => onDelPay(p)} data-testid="pay-del-btn">🗑️ {t('delete')}</button>
                        </div>
                      )}
                    </div>
                    <div className="amt">{inr(p.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
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
  const [aview, setAview] = useState('sarees');   // auction: saree-wise | bidder-wise
  const [bidSel, setBidSel] = useState('');
  const [pay, setPay] = useState(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [p, d, a, pay] = await Promise.all([
      supabase.from('photos').select('*').order('photo_date', { ascending: false }).order('created_at'),
      supabase.from('saree_donors').select('*').order('given_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('saree_auction').select('*, donor:saree_donors(id,donor_name,village,image_path,saree_details)').order('auction_date').order('created_at'),
      supabase.from('saree_auction_payments').select('*').order('paid_on').order('created_at'),   // version 13
    ]);
    for (const r of [p, d, a]) {
      if (r.error && isMissing(r.error)) return { missing: true };
      if (r.error) throw r.error;
    }
    const payMissing = !!pay.error && isMissing(pay.error);   // database before version 13
    if (pay.error && !payMissing) throw pay.error;
    return { photos: p.data || [], donors: d.data || [], auction: (a.data || []).map(auctionView), payments: payMissing ? [] : pay.data || [], payMissing };
  }, []);
  const ok = data && !data.missing;
  const groups = useMemo(() => (ok ? bidderGroups(data.auction, data.payments) : []), [ok, data]);
  const payGroup = pay ? groups.find((x) => x.key === bidderKey(pay.bidder_name)) : null;
  const bidders = useMemo(() => groups.filter((g) => g.lots.length > 0), [groups]);   // people who bid for earlier sarees
  const lotKey = lot ? bidderKey(lot.bidder_name) : '';
  const lotSel = !lot ? '' : (lot._newBidder || !bidders.length) ? '__new__' : (bidders.some((b) => b.key === lotKey) ? lotKey : '');

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
  // bidder dropdown: an earlier bidder (his village / mobile filled in) or ➕ New bidder
  const pickBidder = (v) => setLot((x) => {
    if (v === '__new__') {
      const was = bidders.find((b) => b.key === bidderKey(x.bidder_name));
      return { ...x, _newBidder: true, bidder_name: '', bidder_village: was ? '' : x.bidder_village, bidder_mobile: was ? '' : x.bidder_mobile };
    }
    const g = bidders.find((b) => b.key === v);
    return { ...x, _newBidder: false, bidder_name: g ? g.name : '', bidder_village: g ? g.village : '', bidder_mobile: g ? g.mobile : '' };
  });
  const saveLot = async () => {
    const f = lot;
    if (!f.saree_no.trim()) { toast(t('need_saree_no'), 'error'); return; }
    if (!bidderKey(f.bidder_name)) { toast(t('need_bidder_pick'), 'error'); return; }
    if (!(toAmount(f.bid_amount) > 0)) { toast(t('need_final_bid'), 'error'); return; }
    if (!f.saree_no.trim() && !f.saree_details.trim() && !f.saree_donor_id && !f.file && !(f.image_path && !f.removeImage)) { toast(t('need_saree_info'), 'error'); return; }
    if (f.bidder_mobile && f.bidder_mobile.length !== 10) { toast(t('err_invalid_mobile'), 'error'); return; }
    const row = {
      saree_no: f.saree_no.trim(), saree_details: f.saree_details.trim(), saree_donor_id: f.saree_donor_id || null,
      base_rate: toAmount(f.base_rate), bidder_name: f.bidder_name.trim().replace(/\s+/g, ' '), bidder_village: f.bidder_village.trim(),
      bidder_mobile: f.bidder_mobile || null, bid_amount: toAmount(f.bid_amount), auction_date: f.auction_date || todayIST(),
      note: f.note.trim(),
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

  // ---------- auction payments (version 13): a bidder may pay in parts ----------
  const newPay = (g) => setPay({ bidder_name: g?.name || '', amount: g && g.due > 0 ? String(g.due) : '', paid_on: todayIST(), payment_mode: 'cash', note: '' });
  const editPay = (p) => setPay({ ...p, amount: String(Number(p.amount)), note: p.note || '' });
  const savePay = async () => {
    const f = pay;
    const amount = toAmount(f.amount);
    if (!bidderKey(f.bidder_name)) { toast(t('need_bidder'), 'error'); return; }
    if (!amount || amount <= 0) { toast(t('err_invalid_amount'), 'error'); return; }
    setBusy(t('saving'));
    const row = { bidder_name: f.bidder_name.trim().replace(/\s+/g, ' '), amount, paid_on: f.paid_on || todayIST(), payment_mode: f.payment_mode === 'upi' ? 'upi' : 'cash', note: (f.note || '').trim() };
    const { data: done, error: e } = f.id
      ? await supabase.from('saree_auction_payments').update(row).eq('id', f.id).select('id')
      : await supabase.from('saree_auction_payments').insert({ ...row, created_by: profile.id }).select('id');
    setBusy('');
    if (e) { toast(errMsg(e, t), 'error'); return; }
    if (!done?.length) { toast(t('pay_not_changed'), 'error'); return; }
    toast(t('payment_saved'), 'success');
    setBidSel(bidderKey(row.bidder_name));
    setPay(null);
    reload(true);
  };
  const removePay = async (p) => {   // from the 🗑️ button on the payment, or Delete inside its edit window
    if (!p?.id || !window.confirm(t('delete_payment_confirm_x', { amount: inr(p.amount) }))) return false;
    setBusy(t('saving'));
    const { data: gone, error: e } = await supabase.from('saree_auction_payments').delete().eq('id', p.id).select('id');
    setBusy('');
    if (e) { toast(errMsg(e, t), 'error'); return false; }
    if (!gone?.length) { toast(t('pay_not_changed'), 'error'); reload(true); return false; }
    toast(t('fest_deleted'), 'success');
    reload(true);
    return true;
  };
  const delPay = async () => { if (await removePay(pay)) setPay(null); };

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
              <AuctionTotals lots={data.auction} payments={data.payments} />
              {data.payMissing && (isAdmin ? <FestivalDbUpdate /> : <div className="alert warn">{t('festival_needs_db_member')}</div>)}
              <div className="seg" data-testid="auction-views">
                <button type="button" className={aview === 'sarees' ? 'on' : ''} onClick={() => setAview('sarees')} data-testid="view-sarees">🥻 {t('view_sarees')}</button>
                <button type="button" className={aview === 'bidders' ? 'on' : ''} onClick={() => setAview('bidders')} data-testid="view-bidders">👤 {t('view_bidders')}</button>
              </div>
              {aview === 'sarees' ? (
                <>
                  {isAdmin && <p className="hint">{t('auction_hint')}</p>}
                  <AuctionList items={data.auction} team hideSummary onEdit={isAdmin ? editLot : null} onPicture={openLot}
                    onBidder={(name) => { setBidSel(bidderKey(name)); setAview('bidders'); }} />
                </>
              ) : (
                <BidderView groups={groups} sel={bidSel} onSel={setBidSel} canPay={isAdmin && !data.payMissing}
                  onPay={newPay} onEditPay={editPay} onDelPay={removePay} onEditLot={isAdmin ? editLot : null} onPicture={openLot} />
              )}
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
              <Field label={`${t('saree_no')} *`}><input className="input" value={lot.saree_no} onChange={set(setLot, 'saree_no')} data-testid="au-no" /></Field>
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
            <Field label={`${t('bidder_name')} *`}>
              {bidders.length > 0 && (
                <select className="input" value={lotSel} onChange={(e) => pickBidder(e.target.value)} data-testid="au-bidder-select">
                  <option value="">{t('select_bidder')}</option>
                  {bidders.map((b) => <option key={b.key} value={b.key}>{b.name}{b.village ? ` (${b.village})` : ''}</option>)}
                  <option value="__new__">{t('new_bidder_opt')}</option>
                </select>
              )}
              {lotSel === '__new__' && <input className="input" style={bidders.length ? { marginTop: 8 } : undefined} value={lot.bidder_name} onChange={set(setLot, 'bidder_name')} placeholder={t('new_bidder_ph')} autoFocus={bidders.length > 0} data-testid="au-bidder" />}
            </Field>
            {lotSel === '__new__' && <p className="hint">{t('same_bidder_hint')}</p>}
            <Field label={t('bidder_village')} optional><input className="input" value={lot.bidder_village} onChange={set(setLot, 'bidder_village')} /></Field>
            <Field label={`${t('bid_amount')} *`}><input className="input num big" inputMode="decimal" value={lot.bid_amount} onChange={set(setLot, 'bid_amount')} placeholder="₹" data-testid="au-amount" /></Field>
            <Field label={t('bidder_mobile')} optional><MobileInput className="input num" value={lot.bidder_mobile} onChange={(v) => setLot((x) => ({ ...x, bidder_mobile: v }))} autoComplete="off" /></Field>
            <Field label={t('note')} optional><input className="input" value={lot.note} onChange={set(setLot, 'note')} /></Field>
            <p className="hint">{t('team_only_hint_auction')}</p>
            <div className="grid2">
              {lot.id ? <button className="btn ghost danger-t" disabled={!!busy} onClick={delLot} data-testid="au-delete">🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={!!busy} onClick={saveLot} data-testid="au-save">{busy || t('save')}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- auction payment (version 13) ---------- */}
      <Modal open={!!pay} onClose={() => !busy && setPay(null)} title={pay?.id ? t('edit_payment') : t('record_payment')}>
        {pay && (
          <div className="stack" data-testid="payment-form">
            <Field label={t('bidder_name')}><input className="input" list="bidder-names" value={pay.bidder_name} onChange={set(setPay, 'bidder_name')} data-testid="pay-bidder" /></Field>
            {payGroup && <p className="hint num" data-testid="pay-bidder-line">{t('bid_paid_due_line', { bid: inr(payGroup.bid), paid: inr(payGroup.paid), due: inr(payGroup.due) })}</p>}
            <Field label={t('amount_paid_now')}><input className="input num big" inputMode="decimal" value={pay.amount} onChange={set(setPay, 'amount')} placeholder="₹" data-testid="pay-amount" /></Field>
            <div className="grid2">
              <Field label={t('date')}><input type="date" className="input" value={pay.paid_on} onChange={set(setPay, 'paid_on')} data-testid="pay-date" /></Field>
              <Field label={t('pay_mode_l')}><Seg options={[{ value: 'cash', label: `💵 ${t('cash')}` }, { value: 'upi', label: '📱 UPI' }]} value={pay.payment_mode} onChange={(v) => setPay((x) => ({ ...x, payment_mode: v }))} /></Field>
            </div>
            <Field label={t('note')} optional><input className="input" value={pay.note} onChange={set(setPay, 'note')} data-testid="pay-note" /></Field>
            <p className="hint">{t('partial_hint')}</p>
            <div className="grid2">
              {pay.id ? <button className="btn ghost danger-t" disabled={!!busy} onClick={delPay} data-testid="pay-delete">🗑️ {t('delete')}</button> : <span />}
              <button className="btn primary" disabled={!!busy} onClick={savePay} data-testid="pay-save">{busy || t('save')}</button>
            </div>
          </div>
        )}
      </Modal>
      <datalist id="bidder-names">{groups.map((g) => <option key={g.key} value={g.name} />)}</datalist>

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

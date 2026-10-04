// Version 12 – day-wise photos, saree donors and the saree auction: the lists (app + public page) and the
// full-screen picture viewer. Mobile numbers, notes and "paid" appear only with team (never on the public page).
import { useEffect, useMemo, useRef } from 'react';
import { useLang } from '../lib/i18n.jsx';
import { inr, fmtDay } from '../lib/format.js';
import { imageUrl } from '../lib/festival.js';
import { Empty } from './ui.jsx';

/** An auction entry with the donated saree's picture / details when it has none of its own. */
export const auctionView = (a) => ({
  ...a,
  picture: a.image_path || a.donor?.image_path || '',
  details: a.saree_details || a.donor?.saree_details || '',
  donor_name: a.donor_name || a.donor?.donor_name || '',
});

/** Viewer items for the rows that have a picture + the position of the tapped row. */
export function picturesOf(rows, row, toItem) {
  const withPic = (rows || []).filter((r) => toItem(r).src);
  return { items: withPic.map(toItem), index: Math.max(0, withPic.indexOf(row)) };
}
export const photoItem = (p, lang) => ({ src: imageUrl(p.image_path), title: p.caption || '', sub: fmtDay(p.photo_date, lang), row: p });
export const donorItem = (d, lang) => ({
  src: imageUrl(d.image_path), title: [d.donor_name, d.saree_details].filter(Boolean).join(' – '),
  sub: [d.village, fmtDay(d.given_date, lang)].filter(Boolean).join(' · '), row: d,
});
export const lotItem = (a, lang, t) => ({
  src: imageUrl(a.picture), title: [a.saree_no && `#${a.saree_no}`, a.details].filter(Boolean).join(' · '),
  sub: [a.bidder_name && t('bidder_x', { name: a.bidder_name }), a.bid_amount != null && inr(a.bid_amount)].filter(Boolean).join(' · '), row: a,
});

function Thumb({ path, icon, onClick }) {
  const src = imageUrl(path);
  return src
    ? <button type="button" className="fest-thumb" onClick={onClick}><img src={src} alt="" loading="lazy" /></button>
    : <div className="fest-thumb">{icon}</div>;
}

/** Photos grouped by day, newest day first. onOpen(list, index) opens the viewer. */
export function PhotoDays({ photos, onOpen }) {
  const { t, lang } = useLang();
  const days = useMemo(() => {
    const m = new Map();
    (photos || []).forEach((p) => { if (!m.has(p.photo_date)) m.set(p.photo_date, []); m.get(p.photo_date).push(p); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  }, [photos]);
  if (!days.length) return <Empty icon="📷" text={t('no_photos')} />;
  return (
    <div className="stack" data-testid="photo-days">
      {days.map(([day, list]) => (
        <div key={day} className="card photo-day">
          <div className="photo-day-h"><span>📅 {fmtDay(day, lang)}</span><small>{t('photos_n', { n: list.length })}</small></div>
          <div className="photo-grid">
            {list.map((p, i) => (
              <button key={p.id} type="button" onClick={() => onOpen(list, i)} aria-label={p.caption || t('nav_photos')} data-testid="photo-thumb">
                <img src={imageUrl(p.image_path)} alt={p.caption || ''} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Saree donors: picture, name, village, date, saree details (+ mobile and note for the team). */
export function SareeDonorList({ items, team, onEdit, onPicture }) {
  const { t, lang } = useLang();
  if (!items?.length) return <Empty icon="🥻" text={t('no_saree_donors')} />;
  return (
    <div className="card" data-testid="saree-donors">
      <div className="card-title">🥻 {t('nav_sarees')} <span className="badge orange">{t('sarees_n', { n: items.length })}</span></div>
      {items.map((d) => (
        <div key={d.id} className="fest-card" data-testid="saree-donor-row">
          <Thumb path={d.image_path} icon="🥻" onClick={() => onPicture?.(d)} />
          <div className="fest-body">
            <div className="main-t">{d.donor_name}</div>
            <div className="sub-t">{[d.village, fmtDay(d.given_date, lang)].filter(Boolean).join(' · ')}</div>
            {d.saree_details && <div className="sub-t">🥻 {d.saree_details}</div>}
            {team && d.mobile && <div className="sub-t num">📞 <a href={`tel:${d.mobile}`}>{d.mobile}</a></div>}
            {team && d.note && <div className="sub-t">📝 {d.note}</div>}
          </div>
          {onEdit && <button type="button" className="btn ghost xs" onClick={() => onEdit(d)} data-testid="saree-donor-edit">✏️</button>}
        </div>
      ))}
    </div>
  );
}

/** Saree auction: one entry per saree – picture, saree, donor, starting rate, bidder, final rate. */
export function AuctionList({ items, team, onEdit, onPicture }) {
  const { t, lang } = useLang();
  if (!items?.length) return <Empty icon="🔨" text={t('no_auction')} />;
  const total = items.reduce((s, x) => s + Number(x.bid_amount || 0), 0);
  const paid = items.reduce((s, x) => s + (x.paid ? Number(x.bid_amount || 0) : 0), 0);
  return (
    <>
      <div className="summary-bar num" data-testid="auction-summary"><span>🔨 {t('sarees_n', { n: items.length })}</span><span>{t('auction_total')}: {inr(total)}</span></div>
      {team && <p className="hint" data-testid="auction-paid-line">{t('auction_paid_total', { a: inr(paid), b: inr(total - paid) })}</p>}
      <div className="card" data-testid="auction-list">
        {items.map((a) => (
          <div key={a.id} className="fest-card" data-testid="auction-row">
            <Thumb path={a.picture} icon="🥻" onClick={() => onPicture?.(a)} />
            <div className="fest-body">
              <div className="main-t">{a.saree_no ? `#${a.saree_no}` : ''}{a.saree_no && a.details ? ' · ' : ''}{a.details || (a.saree_no ? '' : t('nav_auction'))}</div>
              {a.donor_name && <div className="sub-t">🙏 {t('donated_by_x', { name: a.donor_name })}</div>}
              {a.base_rate != null && <div className="sub-t num">{t('start_rate_x', { amount: inr(a.base_rate) })}</div>}
              {a.bidder_name && <div className="sub-t">👤 {t('bidder_x', { name: [a.bidder_name, a.bidder_village].filter(Boolean).join(', ') })}</div>}
              {team && a.bidder_mobile && <div className="sub-t num">📞 <a href={`tel:${a.bidder_mobile}`}>{a.bidder_mobile}</a></div>}
              <div className="sub-t">{fmtDay(a.auction_date, lang)}</div>
              {team && a.note && <div className="sub-t">📝 {a.note}</div>}
            </div>
            <div className="fest-side">
              {a.bid_amount != null && <div className="fest-rate num">{inr(a.bid_amount)}</div>}
              {team && a.bid_amount != null && <span className={`badge ${a.paid ? 'green' : 'orange'}`}>{a.paid ? t('paid_badge') : t('unpaid_badge')}</span>}
              {onEdit && <button type="button" className="btn ghost xs" onClick={() => onEdit(a)} data-testid="auction-edit">✏️</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Full-screen picture with its caption; ‹ › or swipe for the next one. items: [{ src, title, sub }] */
export function PictureViewer({ items, index, onIndex, onClose, actions }) {
  const touch = useRef(null);
  const it = items?.[index];
  const count = items?.length || 0;
  useEffect(() => {
    if (!it) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < count - 1) onIndex(index + 1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [it, index, count, onIndex, onClose]);
  if (!it) return null;
  const onTouchEnd = (e) => {
    const x0 = touch.current;
    touch.current = null;
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (dx > 50 && index > 0) onIndex(index - 1);
    else if (dx < -50 && index < count - 1) onIndex(index + 1);
  };
  return (
    <div className="viewer" role="dialog" aria-modal="true" data-testid="picture-viewer">
      <div className="viewer-top">
        <b className="num">{count > 1 ? `${index + 1} / ${count}` : ''}</b>
        <button type="button" className="viewer-x" onClick={onClose} aria-label="close">✕</button>
      </div>
      <div className="viewer-img" onTouchStart={(e) => { touch.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
        <img src={it.src} alt={it.title || ''} />
        {index > 0 && <button type="button" className="viewer-nav prev" onClick={() => onIndex(index - 1)} aria-label="previous">‹</button>}
        {index < count - 1 && <button type="button" className="viewer-nav next" onClick={() => onIndex(index + 1)} aria-label="next">›</button>}
      </div>
      {(it.title || it.sub || actions) && (
        <div className="viewer-cap">
          {it.title && <div>{it.title}</div>}
          {it.sub && <small>{it.sub}</small>}
          {actions && <div className="viewer-actions">{actions(it)}</div>}
        </div>
      )}
    </div>
  );
}

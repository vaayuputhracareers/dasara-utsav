// Cash in hand – denominations (change 27, no database change) – admin only. Count the notes and coins, see the total
// and check it against the cash in hand worked out by the app. The counts stay on this device (localStorage) until
// "Clear" – nothing is saved to the accounts and no amount changes.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAsync } from '../lib/useAsync.js';
import { inr, inrSigned } from '../lib/format.js';
import { Page, Spinner, Seg } from '../components/ui.jsx';

const NOTES = [500, 200, 100, 50, 20, 10];
const COINS = [20, 10, 5, 2, 1];
const KEY = 'utsav.cashCount';
const n = (v) => Number(v || 0);

function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

// Enter / "next" on the phone keyboard jumps to the next count box
function nextInput(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const all = [...document.querySelectorAll('.cc-row input')];
  const next = all[all.indexOf(e.target) + 1];
  if (next) next.focus(); else e.target.blur();
}

function Row({ id, d, value, onChange }) {
  const c = n(value);
  return (
    <div className="cc-row">
      <span className="cc-d num">₹{d}</span>
      <i>×</i>
      <input className="input num" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" placeholder="0" maxLength={6}
        value={value || ''} aria-label={`₹${d}`} data-testid={`cc-${id}`}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
        onKeyDown={nextInput} />
      <b className="num">{c ? inr(c * d) : '–'}</b>
    </div>
  );
}

export default function CashCount() {
  const { t } = useLang();
  const [saved] = useState(loadSaved);
  const [counts, setCounts] = useState(() => (saved.counts && typeof saved.counts === 'object' ? saved.counts : {}));
  const [cmp, setCmp] = useState(saved.cmp === 'committee' ? 'committee' : 'hand');
  const { data: d, loading, error, reload } = useAsync(async () => {
    const r = await supabase.rpc('get_dashboard');
    if (r.error) throw r.error;
    return r.data;
  }, []);

  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && reload(true);
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [reload]);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ counts, cmp })); } catch { /* private mode / storage full */ }
  }, [counts, cmp]);

  const set = (k, v) => setCounts((c) => ({ ...c, [k]: v }));
  const sum = (p, list) => list.reduce((a, x) => ({ pcs: a.pcs + n(counts[p + x]), amt: a.amt + n(counts[p + x]) * x }), { pcs: 0, amt: 0 });
  const notes = sum('n', NOTES);
  const coins = sum('c', COINS);
  const counted = notes.amt + coins.amt;
  const any = notes.pcs + coins.pcs > 0;

  const hasFig = !!d && d.cash_in_hand != null;
  const members = n(d?.cash_with_members);
  const mode = members !== 0 ? cmp : 'hand';
  const app = hasFig ? n(mode === 'committee' ? d.cash_with_committee : d.cash_in_hand) : null;
  const diff = app == null ? null : Math.round((counted - app) * 100) / 100;

  const clear = () => { if (window.confirm(t('cc_clear_confirm'))) setCounts({}); };

  return (
    <Page title={t('cc_title')} back>
      <div className="card cb-card" data-testid="cc-app">
        <div className="cb-head"><span>{t('cc_as_per_app')}</span>
          {loading && !d ? <Spinner sm /> : hasFig ? <b className="num" data-testid="cc-app-total">{inr(d.cash_in_hand)}</b> : null}
        </div>
        {error && !d && (
          <div className="alert err">{t('network_error')} <button type="button" className="btn ghost xs" onClick={() => reload()}>{t('retry')}</button></div>
        )}
        {hasFig && members !== 0 && (
          <>
            <div className="cb-where">
              <div><small>{t('cb_with_committee')}</small><b className="num">{inr(d.cash_with_committee)}</b></div>
              <Link to="/handover"><small>{t('cb_with_members')} →</small><b className="num">{inr(members)}</b></Link>
            </div>
            <div className="stack tight">
              <small className="hint">{t('cc_compare_with')}</small>
              <Seg value={cmp} onChange={setCmp} options={[{ value: 'hand', label: t('cc_cmp_hand') }, { value: 'committee', label: t('cc_cmp_committee') }]} />
            </div>
          </>
        )}
      </div>

      <div className="card" data-testid="cc-table">
        <div className="card-title">{t('cc_notes')}<span className="hint">{t('cc_notes_n', { n: notes.pcs })} · <b className="num">{inr(notes.amt)}</b></span></div>
        <div className="cc-table">
          {NOTES.map((x) => <Row key={`n${x}`} id={`n${x}`} d={x} value={counts[`n${x}`]} onChange={(v) => set(`n${x}`, v)} />)}
        </div>
        <div className="card-title cc-coins">{t('cc_coins')}<span className="hint">{t('cc_coins_n', { n: coins.pcs })} · <b className="num">{inr(coins.amt)}</b></span></div>
        <div className="cc-table">
          {COINS.map((x) => <Row key={`c${x}`} id={`c${x}`} d={x} value={counts[`c${x}`]} onChange={(v) => set(`c${x}`, v)} />)}
        </div>
        <div className="cc-total"><span>{t('cc_total_counted')}</span><b className="num" data-testid="cc-counted">{inr(counted)}</b></div>
      </div>

      {any && app != null && (
        <div className="card cc-result" data-testid="cc-result">
          <div className="cb-calc">
            <div className="cb-line"><i /><span>{t('cc_counted')}</span><b className="num">{inr(counted)}</b></div>
            <div className="cb-line"><i>−</i><span>{mode === 'committee' ? t('cb_with_committee') : t('cc_as_per_app')}</span><b className="num">{inr(app)}</b></div>
            <div className="cb-line total"><i>=</i><span>{t('cc_difference')}</span><b className="num" data-testid="cc-diff">{inrSigned(diff)}</b></div>
          </div>
          {diff === 0 ? <div className="alert ok" data-testid="cc-match">{t('cc_match')}</div>
            : diff < 0 ? <div className="alert err" data-testid="cc-short">{t('cc_short', { amount: inr(-diff) })}</div>
            : <div className="alert warn" data-testid="cc-excess">{t('cc_excess', { amount: inr(diff) })}</div>}
        </div>
      )}

      <button type="button" className="btn ghost danger-t block" disabled={!any} onClick={clear} data-testid="cc-clear">🧹 {t('cc_clear')}</button>
      <p className="hint">{t('cc_saved_hint')}</p>
    </Page>
  );
}

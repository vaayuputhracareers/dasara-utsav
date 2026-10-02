import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang, LangSwitch } from '../lib/i18n.jsx';

/* ---------- toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, type = 'info', ms = 3200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, text, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => <div key={i.id} className={`toast ${i.type}`}>{i.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- page frame ---------- */
export function Page({ title, sub, right, back, wide, children }) {
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        {back && <button className="back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} aria-label="back">‹</button>}
        <div className="tb-text"><h1>{title}</h1>{sub && <small>{sub}</small>}</div>
        {right}
      </header>
      <main className={`page ${wide ? 'wide' : ''}`}>{children}</main>
    </>
  );
}

export function Splash({ error, onRetry }) {
  const { t } = useLang();
  return (
    <div className="splash">
      <div>
        <div className="lamp">🪔</div>
        {error ? (
          <>
            <p style={{ margin: '10px 0' }}>{t('network_error')}</p>
            {onRetry && <button className="btn maroon sm" onClick={onRetry}>{t('retry')}</button>}
          </>
        ) : <div className="spinner" />}
      </div>
    </div>
  );
}

export const Spinner = ({ sm }) => <div className={`spinner ${sm ? 'sm' : ''}`} />;

export function Empty({ icon = '🪷', text }) {
  return <div className="empty"><i>{icon}</i>{text}</div>;
}

export function Field({ label, hint, error, children, optional }) {
  const { t } = useLang();
  return (
    <div className="field">
      {label && <label>{label}{optional && <span style={{ fontWeight: 500 }}> ({t('optional')})</span>}</label>}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button type="button" key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, disabled }) {
  return (
    <label className="sw">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><button className="modal-x" onClick={onClose} aria-label="close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Badge({ tone = 'grey', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function TopLang() {
  return <LangSwitch />;
}

export function Toran() {
  return (
    <svg className="toran" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="toranP" width="38" height="34" patternUnits="userSpaceOnUse">
          <path d="M19 5 C 11 13, 11 24, 19 32 C 27 24, 27 13, 19 5 Z" fill="#2e7d32" />
          <path d="M19 7 L19 29" stroke="#9ccc65" strokeWidth="1" />
          <circle cx="0" cy="5" r="5.5" fill="#f9a825" /><circle cx="38" cy="5" r="5.5" fill="#f9a825" />
          <circle cx="0" cy="5" r="2.4" fill="#e65100" /><circle cx="38" cy="5" r="2.4" fill="#e65100" />
        </pattern>
      </defs>
      <rect width="100%" height="34" fill="url(#toranP)" />
      <rect width="100%" height="3" fill="#c62828" />
    </svg>
  );
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}

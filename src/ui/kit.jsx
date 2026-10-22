import { useEffect, useRef, useState } from 'react';
import { Icon, IconSquare } from './icons.jsx';
import { tg, mainButtonSupported, haptic } from '../lib/tg.js';
import { t } from '../lib/i18n.js';

// ── Grouped lists ────────────────────────────────────────────────────────────

export function Section({ title, action, footer, children }) {
  return (
    <section className="section">
      {(title || action) && <div className="section-title"><span>{title}</span>{action}</div>}
      {children}
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  );
}

export function List({ children }) {
  return <div className="list">{children}</div>;
}

export function Row({ icon, iconColor, title, sub, value, chevron, onClick, children, danger, className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`row${icon ? ' with-icon' : ''} ${className}`} onClick={onClick}>
      {icon && <IconSquare name={icon} color={iconColor} />}
      <span className="grow">
        <span className={`row-title${danger ? ' danger' : ''}`}>{title}</span>
        {sub && <span className="sub">{sub}</span>}
      </span>
      {value !== undefined && value !== null && <span className="value">{value}</span>}
      {children}
      {chevron && <Icon name="chevronRight" size={14} stroke={2.6} style={{ color: 'var(--hint)', opacity: 0.6 }} />}
    </Tag>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value}
          onClick={() => { haptic.select(); onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={o.value === value}
          onClick={() => { haptic.select(); onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} className="switch"
      onClick={() => { haptic.select(); onChange(!checked); }} />
  );
}

// Text input for numbers that keeps what the user types ("82," "0.") until blur.
// `live`: also report each valid number while typing (for forms, not per-set saves).
export function NumberInput({ value, onCommit, decimals = 1, className = 'input', placeholder, label, min, max, autoFocus, live = false }) {
  const show = (v) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(Math.round(v * 10 ** decimals) / 10 ** decimals));
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(show(value)); }, [value]);
  const commit = () => {
    focused.current = false;
    const t = text.trim().replace(',', '.');
    if (t === '') { onCommit(null); return; }
    let n = Number(t);
    if (!Number.isFinite(n)) { setText(show(value)); return; }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(show(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input className={className} inputMode={decimals ? 'decimal' : 'numeric'} value={text} placeholder={placeholder}
      aria-label={label} autoFocus={autoFocus}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => {
        setText(e.target.value);
        if (!live) return;
        const t = e.target.value.trim().replace(',', '.');
        const n = Number(t);
        if (t === '') onCommit(null);
        else if (Number.isFinite(n) && !t.endsWith('.')) onCommit(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

export function Stepper({ value, step, decimals = 1, unit, onChange, label }) {
  const r = (v) => Math.round(v * 10 ** decimals) / 10 ** decimals;
  return (
    <div className="stepper">
      <button type="button" aria-label={t('Decrease {label}', { label })} onClick={() => { haptic.select(); onChange(r(value - step)); }}>−</button>
      <div className="val">{value.toFixed(decimals)}<span className="unit"> {unit}</span></div>
      <button type="button" aria-label={t('Increase {label}', { label })} onClick={() => { haptic.select(); onChange(r(value + step)); }}>+</button>
    </div>
  );
}

export function Bar({ pct, color, thick }) {
  return <div className={`bar${thick ? ' thick' : ''}`}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>;
}

// ── States ───────────────────────────────────────────────────────────────────

export function Spinner() {
  return <div className="spinner" role="status" aria-label={t('Loading')} />;
}

export function Empty({ children, action }) {
  return <div className="empty"><div>{children}</div>{action}</div>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="error-box row-between">
      <span>{t(error?.message || 'Something went wrong')}</span>
      {onRetry && <button type="button" className="btn ghost" onClick={onRetry}>{t('Retry')}</button>}
    </div>
  );
}

// Loading → error → content, for one useApi() result.
export function Loader({ q, children }) {
  if (q.data !== undefined) return children(q.data);
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  return <Spinner />;
}

// ── Toasts ───────────────────────────────────────────────────────────────────

let pushToast = () => {};
export function toast(text, kind = '') {
  pushToast({ text, kind, id: Math.random() });
}
export function toastError(e) {
  haptic.error();
  toast(t(e?.message || 'Something went wrong'));
}

export function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => {
    pushToast = (next) => setT(next);
    return () => { pushToast = () => {}; };
  }, []);
  useEffect(() => {
    if (!t) return undefined;
    const h = setTimeout(() => setT(null), t.kind === 'gold' ? 3500 : 2500);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div className={`toast ${t.kind}`} role="status" onClick={() => setT(null)}>
      {t.kind === 'gold' && <Icon name="trophy" size={18} stroke={2.2} />}
      <span>{t.text}</span>
    </div>
  );
}

// ── Bottom sheet ─────────────────────────────────────────────────────────────

export function Sheet({ open, onClose, title, children, right, gray }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${gray ? ' gray' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        {(title || right) && (
          <div className="sheet-head">
            <h2>{title}</h2>
            {right ?? <button type="button" className="btn ghost" onClick={onClose}>{t('Close')}</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Telegram MainButton (with an in-page fallback outside Telegram) ──────────

export function MainButton({ text, onClick, disabled = false, busy = false }) {
  const handler = useRef(onClick);
  handler.current = onClick;
  const blocked = useRef(disabled || busy);
  blocked.current = disabled || busy;

  useEffect(() => {
    if (!mainButtonSupported) return undefined;
    const b = tg.MainButton;
    // Telegram's native button lives outside the page, so tapping it doesn't blur the
    // focused input (whose value commits on blur). Blur first, let React re-render
    // with the committed value, then act — and never while disabled: some clients
    // deliver clicks even when the button is inactive.
    const fire = () => {
      const el = document.activeElement;
      if (el && el !== document.body && el.blur) el.blur();
      setTimeout(() => { if (!blocked.current && handler.current) handler.current(); }, 50);
    };
    b.onClick(fire);
    return () => { b.offClick(fire); b.hideProgress(); b.hide(); };
  }, []);

  useEffect(() => {
    if (!mainButtonSupported) return;
    const b = tg.MainButton;
    b.setParams({ text, is_active: !disabled && !busy, is_visible: true });
    if (busy) b.showProgress(false); else b.hideProgress();
  }, [text, disabled, busy]);

  if (mainButtonSupported) return null;
  return (
    <div className="mainbtn-wrap">
      <button type="button" className="btn lg" disabled={disabled || busy} onClick={onClick}>{busy ? t('Saving…') : text}</button>
    </div>
  );
}

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ACC, ACC_RGB, Button, CheckboxField, Field, Input, Textarea, inputStyle,
} from '../admin/ui';

export { ACC, ACC_RGB, Button, CheckboxField, Field, Input, Textarea, inputStyle };

export const card = {
  background: 'rgba(14,9,28,0.72)',
  border: '1px solid rgba(80,50,130,0.24)',
  borderRadius: 12,
  padding: 20,
};

export const muted = { color: 'rgba(180,170,200,0.55)', fontFamily: "'Inter',sans-serif" };

export function Section({ title, actions, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>
          {title}
        </h2>
        {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return (
    <p style={{
      ...muted, fontSize: 13, padding: '20px 0', textAlign: 'center',
    }}>
      {children}
    </p>
  );
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div style={{
      background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
      borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
      fontFamily: "'Inter',sans-serif", fontSize: 13,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span>{error}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', color: '#ff8a9b',
          cursor: 'pointer', fontSize: 16,
        }}>×</button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 640 }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', fn);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Rendered via portal so it escapes any ancestor that creates a containing
  // block (e.g. headers with `backdrop-filter`/`transform`) and would otherwise
  // clip a position:fixed modal inside that ancestor.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2,1,10,0.82)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '60px 20px 20px', overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: width, background: '#0b0620',
          border: '1px solid rgba(80,50,130,0.3)', borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 22px', borderBottom: '1px solid rgba(60,40,100,0.18)',
        }}>
          <h3 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700,
            color: '#ede8f8', letterSpacing: '-0.3px',
          }}>
            {title}
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'rgba(180,170,200,0.6)',
            cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4,
          }}>×</button>
        </header>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDate(unixSeconds, { withTime = true } = {}) {
  if (!unixSeconds) return '—';
  const d = new Date(unixSeconds * 1000);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!withTime) return date;
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function toLocalDatetimeInput(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeDate(unixSeconds) {
  if (!unixSeconds) return '';
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`;
  return formatDate(unixSeconds, { withTime: false });
}

/**
 * Returns the due-date status for a feature:
 *   null          no due date
 *   'done'        task is done (no more deadline pressure)
 *   'overdue'     due in the past and not done
 *   'today'       due today
 *   'soon'        due within 3 days
 *   'upcoming'    later
 */
export function dueStatus(unixSeconds, featureStatus) {
  if (!unixSeconds) return null;
  if (featureStatus === 'done') return 'done';
  const now = Date.now() / 1000;
  const startOfToday = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const startOfTomorrow = startOfToday + 86400;
  if (unixSeconds < now) return 'overdue';
  if (unixSeconds < startOfTomorrow) return 'today';
  if (unixSeconds < startOfToday + 86400 * 4) return 'soon';
  return 'upcoming';
}

export const DUE_STYLES = {
  overdue:  { color: '#ff8a9b', bg: 'rgba(255,138,155,0.14)', label: 'En retard' },
  today:    { color: '#e8a87c', bg: 'rgba(232,168,124,0.16)', label: "Aujourd'hui" },
  soon:     { color: '#e8d27c', bg: 'rgba(232,210,124,0.14)', label: 'Bientôt' },
  upcoming: { color: 'rgba(180,170,200,0.75)', bg: 'rgba(80,50,130,0.18)', label: 'Planifié' },
  done:     { color: '#9ad4ae', bg: 'rgba(154,212,174,0.14)', label: 'OK' },
};

/** Deterministic tag color from its name hash. */
const TAG_PALETTE = [
  { hex: '#c9a8e8', rgb: '201,168,232' },
  { hex: '#e8a87c', rgb: '232,168,124' },
  { hex: '#9ad4ae', rgb: '154,212,174' },
  { hex: '#80c8e8', rgb: '128,200,232' },
  { hex: '#e88cb8', rgb: '232,140,184' },
  { hex: '#e8d27c', rgb: '232,210,124' },
];

export function tagColor(name) {
  let h = 0;
  const s = String(name || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

export function Tag({ name, onRemove }) {
  const c = tagColor(name);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: `rgba(${c.rgb},0.12)`,
      border: `1px solid rgba(${c.rgb},0.32)`,
      color: c.hex, fontSize: 10.5, fontWeight: 600,
      fontFamily: "'Inter',sans-serif",
      letterSpacing: '0.2px',
    }}>
      #{name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: c.hex, padding: 0, marginLeft: 2, fontSize: 13, lineHeight: 1,
          }}
        >×</button>
      )}
    </span>
  );
}

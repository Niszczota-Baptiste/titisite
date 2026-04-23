import { useEffect } from 'react';
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

  return (
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
    </div>
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

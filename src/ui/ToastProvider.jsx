import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(null);

/**
 * Lightweight toast (snackbar) system. 3 levels: success, error, info.
 *
 *   const toast = useToast();
 *   toast.success('Carte enregistrée');
 *   toast.error('Échec : ' + err.message);
 *
 * Pass a string for the default 4 s duration, or an object for control:
 *   toast.success({ message: '...', duration: 6000 });
 */
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const LEVELS = {
  success: { color: '#9ad4ae', rgb: '154,212,174', icon: '✓' },
  error:   { color: '#ff8a9b', rgb: '255,138,155', icon: '!' },
  info:    { color: '#c9a8e8', rgb: '201,168,232', icon: 'i' },
};

let counter = 0;
const nextId = () => ++counter;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((arr) => arr.filter((t) => t.id !== id));
    const tid = timers.current.get(id);
    if (tid) { clearTimeout(tid); timers.current.delete(id); }
  }, []);

  const push = useCallback((level, arg) => {
    const opts = typeof arg === 'string' ? { message: arg } : (arg || {});
    const id = nextId();
    const duration = opts.duration ?? (level === 'error' ? 6000 : 4000);
    setItems((arr) => [...arr, { id, level, message: opts.message || '' }]);
    if (duration > 0) {
      const tid = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, tid);
    }
    return id;
  }, [dismiss]);

  const api = useRef({
    success: (m) => push('success', m),
    error:   (m) => push('error', m),
    info:    (m) => push('info', m),
    dismiss,
  }).current;
  // Re-bind callbacks to keep closures fresh on `push` identity changes
  api.success = (m) => push('success', m);
  api.error = (m) => push('error', m);
  api.info = (m) => push('info', m);
  api.dismiss = dismiss;

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

function Toaster({ items, onDismiss }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 11000,
        display: 'flex', flexDirection: 'column', gap: 10,
        maxWidth: 'calc(100vw - 40px)', width: 360,
        pointerEvents: 'none',
      }}
    >
      <style>{`@keyframes tslIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}`}</style>
      {items.map((t) => {
        const lv = LEVELS[t.level];
        return (
          <div
            key={t.id}
            role={t.level === 'error' ? 'alert' : 'status'}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(11,6,32,0.95)',
              border: `1px solid rgba(${lv.rgb},0.35)`,
              borderLeft: `3px solid ${lv.color}`,
              borderRadius: 10,
              padding: '12px 14px',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'flex-start', gap: 11,
              animation: 'tslIn 0.22s cubic-bezier(.22,1,.36,1) both',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: `rgba(${lv.rgb},0.18)`,
                color: lv.color, fontWeight: 700, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}
            >
              {lv.icon}
            </span>
            <span style={{
              flex: 1, fontSize: 13.5, color: '#ede8f8', lineHeight: 1.4,
              wordBreak: 'break-word',
            }}>
              {t.message}
            </span>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Fermer la notification"
              style={{
                background: 'none', border: 'none',
                color: 'rgba(180,170,200,0.55)', cursor: 'pointer',
                fontSize: 16, lineHeight: 1, padding: 0, marginLeft: 4,
              }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

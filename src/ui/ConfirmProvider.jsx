import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmCtx = createContext(null);

/**
 * Promise-based replacement for window.confirm:
 *
 *   const confirm = useConfirm();
 *   if (await confirm('Supprimer ?')) { ... }
 *
 * Pass an object for full control:
 *   await confirm({
 *     title: 'Supprimer la carte',
 *     message: 'Cette action est irréversible.',
 *     confirmLabel: 'Supprimer',
 *     danger: true,
 *   });
 */
export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((arg) => {
    const opts = typeof arg === 'string' ? { message: arg } : (arg || {});
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        title: opts.title || 'Confirmer',
        message: opts.message || 'Confirmer cette action ?',
        confirmLabel: opts.confirmLabel || 'Confirmer',
        cancelLabel: opts.cancelLabel || 'Annuler',
        danger: !!opts.danger,
      });
    });
  }, []);

  const close = useCallback((value) => {
    setState(null);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <ConfirmDialog state={state} onAnswer={close} />
    </ConfirmCtx.Provider>
  );
}

function ConfirmDialog({ state, onAnswer }) {
  const okRef = useRef(null);

  useEffect(() => {
    if (!state) return;
    okRef.current?.focus();
    const fn = (e) => {
      if (e.key === 'Escape') onAnswer(false);
      if (e.key === 'Enter') onAnswer(true);
    };
    window.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', fn);
      document.body.style.overflow = prev;
    };
  }, [state, onAnswer]);

  if (!state) return null;

  const accent = state.danger ? '#ff8a9b' : '#c9a8e8';
  const accentRgb = state.danger ? '255,138,155' : '201,168,232';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={() => onAnswer(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(2,1,10,0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'cfFade 0.15s ease',
      }}
    >
      <style>{`@keyframes cfFade{from{opacity:0}to{opacity:1}}@keyframes cfPop{from{opacity:0;transform:translateY(8px) scale(0.97)}to{opacity:1;transform:none}}`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, background: '#0b0620',
          border: `1px solid rgba(${accentRgb},0.35)`,
          borderRadius: 14, padding: '22px 24px',
          boxShadow: `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(${accentRgb},0.08)`,
          fontFamily: "'Inter',sans-serif",
          animation: 'cfPop 0.18s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <h3
          id="confirm-title"
          style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700,
            color: '#ede8f8', letterSpacing: '-0.2px', marginBottom: 8,
          }}
        >
          {state.title}
        </h3>
        <p style={{
          fontSize: 13.5, color: 'rgba(220,212,238,0.78)', lineHeight: 1.5,
          marginBottom: 22,
        }}>
          {state.message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={() => onAnswer(false)}
            style={{
              background: 'none', border: '1px solid rgba(80,50,130,0.3)',
              color: 'rgba(220,212,238,0.85)', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, cursor: 'pointer',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            {state.cancelLabel}
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={() => onAnswer(true)}
            style={{
              background: accent, border: 'none',
              color: '#08051a', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Inter',sans-serif",
              boxShadow: `0 4px 14px rgba(${accentRgb},0.35)`,
            }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ACC } from './admin/ui';

const ConfirmCtx = createContext(null);

export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, message: '' });
  const resolveRef = useRef(null);

  const confirm = useCallback((message) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setState({ open: true, message });
  }), []);

  const close = (value) => {
    setState({ open: false, message: '' });
    resolveRef.current?.(value);
    resolveRef.current = null;
  };

  useEffect(() => {
    if (!state.open) return;
    const fn = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [state.open]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state.open && (
        <div
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(2,1,10,0.82)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 400,
              background: '#0b0620',
              border: '1px solid rgba(80,50,130,0.3)',
              borderRadius: 14,
              boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
              padding: '24px 24px 20px',
              display: 'flex', flexDirection: 'column', gap: 20,
            }}
          >
            <p style={{
              fontFamily: "'Inter',sans-serif", fontSize: 14,
              color: '#ede8f8', lineHeight: 1.55, margin: 0,
            }}>
              {state.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                autoFocus
                onClick={() => close(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(80,50,130,0.32)',
                  borderRadius: 8, padding: '8px 16px',
                  color: 'rgba(232,228,248,0.75)',
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => close(true)}
                style={{
                  background: 'rgba(255,80,100,0.12)',
                  border: '1px solid rgba(255,100,120,0.35)',
                  borderRadius: 8, padding: '8px 16px',
                  color: '#ff8a9b',
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

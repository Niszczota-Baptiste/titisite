import { useState } from 'react';

// Reading preferences for the writing-space reader: font size, column width
// and theme, persisted in localStorage and applied through CSS variables on
// the <article> (see Reader.jsx — text blocks consume var(--reader-*)).

const PREFS_KEY = 'titisite-reader-prefs';
const DEFAULTS = { size: 'M', width: 'M', theme: 'sombre' };

const FONT_SIZES = { S: '15.5px', M: '17.5px', L: '20px' };
const WIDTHS = { S: '560px', M: '680px', L: '840px' };
const THEMES = {
  sombre: {
    '--reader-text': 'rgba(216,208,232,0.92)',
    '--reader-heading': '#ede8f8',
    '--reader-bg': 'transparent',
    '--reader-pad': '0px',
  },
  sepia: {
    '--reader-text': '#46351f',
    '--reader-heading': '#2e2114',
    '--reader-bg': '#f1e7d0',
    '--reader-pad': '24px',
  },
};

export function useReaderPrefs() {
  const [prefs, setPrefs] = useState(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  });
  const update = (patch) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  return [prefs, update];
}

// CSS custom properties derived from the prefs — spread into the article's
// `style` so every text block can consume them with sensible fallbacks.
export function readerVars(prefs) {
  return {
    '--reader-fs': FONT_SIZES[prefs.size] || FONT_SIZES.M,
    '--reader-maxw': WIDTHS[prefs.width] || WIDTHS.M,
    ...(THEMES[prefs.theme] || THEMES.sombre),
  };
}

function Row({ label, options, value, onPick, rgb }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.75)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(([key, lbl]) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-pressed={active}
              style={{
                background: active ? `rgba(${rgb},0.18)` : 'transparent',
                border: `1px solid ${active ? `rgba(${rgb},0.55)` : 'rgba(120,100,160,0.3)'}`,
                color: active ? `rgb(${rgb})` : 'rgba(180,170,200,0.7)',
                borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 12,
                fontWeight: active ? 700 : 500, transition: 'all 0.15s',
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Gear toggle (for the ReaderNav `right` slot) + the floating panel.
export function ReaderSettings({ prefs, onChange, rgb }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Réglages de lecture"
        aria-expanded={open}
        title="Réglages de lecture"
        style={{
          background: open ? `rgba(${rgb},0.14)` : 'none',
          border: `1px solid ${open ? `rgba(${rgb},0.4)` : 'rgba(120,100,160,0.3)'}`,
          color: open ? `rgb(${rgb})` : 'rgba(180,170,200,0.75)',
          borderRadius: 8, padding: '6px 9px', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', transition: 'all 0.2s',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Réglages de lecture"
          style={{
            position: 'fixed', top: 60, right: 'clamp(12px,4vw,48px)', zIndex: 80,
            width: 280, background: '#0b0620',
            border: `1px solid rgba(${rgb},0.3)`, borderRadius: 14,
            boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
            padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: `rgba(${rgb},0.8)`, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Réglages de lecture
          </p>
          <Row
            label="Taille du texte"
            options={[['S', 'S'], ['M', 'M'], ['L', 'L']]}
            value={prefs.size}
            onPick={(size) => onChange({ size })}
            rgb={rgb}
          />
          <Row
            label="Largeur"
            options={[['S', 'Étroite'], ['M', 'Normale'], ['L', 'Large']]}
            value={prefs.width}
            onPick={(width) => onChange({ width })}
            rgb={rgb}
          />
          <Row
            label="Thème"
            options={[['sombre', 'Sombre'], ['sepia', 'Sépia']]}
            value={prefs.theme}
            onPick={(theme) => onChange({ theme })}
            rgb={rgb}
          />
        </div>
      )}
    </>
  );
}

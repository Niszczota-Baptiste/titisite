import { useState } from 'react';
import { ACCENTS } from '../../data/constants';

export function FloatingPauseButton({ accent }) {
  const [paused, setPaused] = useState(false);
  const acc = ACCENTS[accent] || ACCENTS.violet;

  const toggle = () => {
    const n = !paused;
    setPaused(n);
    window.__animPaused = n;
  };

  return (
    <button
      data-interactive
      onClick={toggle}
      title={paused ? 'Reprendre' : 'Suspendre animations'}
      aria-label={paused ? 'Reprendre les animations' : 'Suspendre les animations'}
      aria-pressed={paused}
      style={{
        position: 'fixed', bottom: 28, left: 28, zIndex: 1000, width: 40, height: 40,
        borderRadius: '50%',
        background: paused ? `rgba(${acc.rgb},0.18)` : 'rgba(12,8,28,0.85)',
        border: `1px solid ${paused ? acc.hex : 'rgba(80,50,130,0.28)'}`,
        color: paused ? acc.hex : 'var(--text-faint)',
        cursor: 'pointer', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.25s',
        boxShadow: paused ? `0 0 14px rgba(${acc.rgb},0.3)` : 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = acc.hex;
        e.currentTarget.style.color = acc.hex;
      }}
      onMouseLeave={(e) => {
        if (!paused) {
          e.currentTarget.style.borderColor = 'rgba(80,50,130,0.28)';
          e.currentTarget.style.color = 'var(--text-faint)';
        }
      }}
    >
      {paused ? (
        <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
          <path d="M0 0 L12 7 L0 14 Z" />
        </svg>
      ) : (
        <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
          <rect x="0" y="0" width="3.5" height="13" rx="1" />
          <rect x="7.5" y="0" width="3.5" height="13" rx="1" />
        </svg>
      )}
    </button>
  );
}

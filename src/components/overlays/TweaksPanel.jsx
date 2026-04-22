import { ACCENTS } from '../../data/constants';

export function TweaksPanel({ tweaks, setTweaks, visible }) {
  if (!visible) return null;

  const set = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
    } catch {
      /* ignore cross-origin */
    }
    try {
      localStorage.setItem('portfolio_tweaks', JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  };

  return (
    <div
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
        background: 'var(--surface-solid)',
        border: '1px solid var(--border)',
        borderRadius: 16, padding: 22, width: 240,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <p
        style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
          fontWeight: 700, color: 'var(--text)', marginBottom: 22,
        }}
      >
        Tweaks
      </p>
      <div style={{ marginBottom: 20 }}>
        <p
          style={{
            fontFamily: "'Inter',sans-serif", fontSize: 10.5,
            color: 'var(--text-faint)', letterSpacing: '1.5px',
            textTransform: 'uppercase', marginBottom: 10,
          }}
        >
          Accent
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          {Object.entries(ACCENTS).map(([k, a]) => (
            <button
              key={k}
              onClick={() => set('accent', k)}
              title={k}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: a.hex, cursor: 'pointer',
                border: `2px solid ${tweaks.accent === k ? '#fff' : 'transparent'}`,
                boxShadow: tweaks.accent === k ? `0 0 10px rgba(${a.rgb},0.5)` : 'none',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <p
          style={{
            fontFamily: "'Inter',sans-serif", fontSize: 10.5,
            color: 'var(--text-faint)', letterSpacing: '1.5px',
            textTransform: 'uppercase', marginBottom: 10,
          }}
        >
          Police
        </p>
        {[
          ['geometric', 'Géométrique'],
          ['humanist', 'Humaniste'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => set('fontStyle', v)}
            style={{
              display: 'block', width: '100%',
              background: tweaks.fontStyle === v ? 'var(--filter-bg)' : 'none',
              border: `1px solid ${tweaks.fontStyle === v ? 'var(--border)' : 'var(--border-dim)'}`,
              color: tweaks.fontStyle === v ? 'var(--text)' : 'var(--text-faint)',
              borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
              textAlign: 'left', marginBottom: 5,
              fontFamily: "'Inter',sans-serif", fontSize: 12,
              transition: 'all 0.2s',
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

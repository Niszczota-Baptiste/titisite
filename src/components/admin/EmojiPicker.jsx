import { useEffect, useRef, useState } from 'react';
import { ACC, ACC_RGB, inputStyle } from './ui';

const CATEGORIES = [
  { name: 'Jeux',       items: ['🎮', '🕹️', '🎲', '🎯', '🎳', '🎱', '♟️', '⚔️', '🛡️', '🏹', '👾', '🃏', '🎰'] },
  { name: 'Créatif',    items: ['🎨', '🖌️', '🖼️', '🎬', '📷', '🎵', '🎶', '🎼', '🎸', '🥁', '🎹', '🎺', '🎭', '📝', '✏️'] },
  { name: 'Tech',       items: ['💻', '🖥️', '⌨️', '📱', '🤖', '⚙️', '🔧', '🛠️', '🔌', '🗄️', '💾', '📡'] },
  { name: 'Idées',      items: ['🚀', '💡', '💎', '🔮', '🧠', '⚡', '✨', '🎁', '🔥', '🌟'] },
  { name: 'Nature',     items: ['🌱', '🌿', '🌳', '🌲', '🍄', '⛰️', '🏔️', '🌊', '🌙', '⭐', '☄️', '❄️', '💧', '🌋', '🌌'] },
  { name: 'Créatures',  items: ['🦊', '🐺', '🐉', '🦄', '🐙', '🦋', '👻', '🛸', '😈', '🧚', '🧙'] },
  { name: 'Lieux',      items: ['🏰', '🏯', '🗺️', '🧭', '🌍', '🏖️', '🌆', '🚩'] },
  { name: 'Objets',     items: ['📦', '🗝️', '🏆', '🏅', '🎖️', '📚', '📖', '🎫', '🎀', '📌'] },
];

export function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...inputStyle,
          padding: 0,
          height: 40,
          width: '100%',
          fontSize: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
        onFocus={(e) => (e.target.style.borderColor = ACC)}
        onBlur={(e) => (e.target.style.borderColor = 'rgba(80,50,130,0.24)')}
      >
        {value || '🎮'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          zIndex: 50,
          background: '#0b0620',
          border: `1px solid rgba(${ACC_RGB},0.3)`,
          borderRadius: 10, padding: 12,
          boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
          minWidth: 320, maxWidth: 360,
          maxHeight: 360, overflowY: 'auto',
        }}>
          {CATEGORIES.map((cat) => (
            <div key={cat.name} style={{ marginBottom: 10 }}>
              <div style={{
                fontFamily: "'Inter',sans-serif", fontSize: 10,
                color: 'rgba(180,170,200,0.55)',
                letterSpacing: '1px', textTransform: 'uppercase',
                fontWeight: 700, marginBottom: 6,
              }}>
                {cat.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {cat.items.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onChange(e); setOpen(false); }}
                    style={{
                      width: 32, height: 32,
                      background: value === e ? `rgba(${ACC_RGB},0.18)` : 'transparent',
                      border: 'none', borderRadius: 6,
                      cursor: 'pointer', fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = `rgba(${ACC_RGB},0.12)`)}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = value === e ? `rgba(${ACC_RGB},0.18)` : 'transparent')}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Interactive inline tokens used inside reading-mode Markdown:
//   [[perso:slug|Label]]  → CharacterLink (hover/tap card + link to the sheet)
//   {{kr:호수 신념}}       → KoreanTerm (romanization + meaning tooltip)
//
// Both are pure React (no innerHTML), so nothing here can inject markup. Unknown
// references degrade gracefully to plain styled text.

const ACC = '#c9a8e8';
const ACC_RGB = '201,168,232';

export function CharacterLink({ slug, label, character, accent = ACC }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const closeTimer = useRef(null);
  const rgb = hexToRgb(accent) || ACC_RGB;

  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { closeTimer.current = setTimeout(() => setOpen(false), 120); };

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        data-interactive
        onClick={() => (character ? navigate(`/projets/ecriture/personnages/${slug}`) : setOpen((o) => !o))}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: accent, fontWeight: 600, fontFamily: 'inherit', fontSize: 'inherit',
          borderBottom: `1px dotted rgba(${rgb},0.6)`, lineHeight: 'inherit',
        }}
      >
        {label}
      </button>

      {open && character && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', bottom: '140%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, width: 260, background: '#0b0620',
            border: `1px solid rgba(${rgb},0.35)`, borderRadius: 12,
            boxShadow: '0 18px 48px rgba(0,0,0,0.6)', padding: 14,
            display: 'block', textAlign: 'left', cursor: 'default',
            fontFamily: "'Inter',sans-serif",
          }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <span style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: character.bio ? 10 : 0 }}>
            <Avatar character={character} rgb={rgb} />
            <span style={{ display: 'block', minWidth: 0 }}>
              <span style={{
                display: 'block', fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 15, fontWeight: 700, color: '#ede8f8',
              }}>
                {character.name}
                {character.nameKr && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: `rgba(${rgb},0.7)` }}>{character.nameKr}</span>
                )}
              </span>
              {character.role && (
                <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(180,170,200,0.7)' }}>{character.role}</span>
              )}
            </span>
          </span>
          {character.bio && (
            <span style={{
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', fontSize: 12.5, lineHeight: 1.55,
              color: 'rgba(200,192,216,0.85)', marginBottom: 10,
            }}>
              {firstLine(character.bio)}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate(`/projets/ecriture/personnages/${slug}`)}
            style={{
              background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)`,
              color: accent, borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
              fontSize: 11.5, fontWeight: 600, fontFamily: "'Inter',sans-serif",
            }}
          >Voir la fiche →</button>
        </span>
      )}
    </span>
  );
}

export function Avatar({ character, rgb = ACC_RGB, size = 40 }) {
  if (character.avatarImage) {
    return (
      <img
        src={character.avatarImage}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid rgba(${rgb},0.4)` }}
      />
    );
  }
  const initial = (character.name || '?').trim().charAt(0).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `rgba(${rgb},0.14)`, border: `1px solid rgba(${rgb},0.4)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: `rgb(${rgb})`,
      fontSize: size * 0.42,
    }}>{initial}</span>
  );
}

export function KoreanTerm({ term, entry, accent = ACC }) {
  const [open, setOpen] = useState(false);
  const rgb = hexToRgb(accent) || ACC_RGB;
  if (!entry) {
    // Unknown term — still display it, styled, but without a tooltip.
    return <span style={{ color: `rgba(${rgb},0.85)`, fontWeight: 500 }}>{term}</span>;
  }
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      <span
        tabIndex={0}
        role="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          color: `rgb(${rgb})`, fontWeight: 600, cursor: 'help',
          borderBottom: `1px dashed rgba(${rgb},0.55)`,
        }}
      >{term}</span>
      {open && (
        <span style={{
          position: 'absolute', bottom: '150%', left: '50%', transform: 'translateX(-50%)',
          zIndex: 60, whiteSpace: 'nowrap', background: '#0b0620',
          border: `1px solid rgba(${rgb},0.35)`, borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)', padding: '8px 12px',
          fontFamily: "'Inter',sans-serif", textAlign: 'center',
        }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#ede8f8', fontStyle: 'italic' }}>
            {entry.romanization || term}
          </span>
          {entry.meaning && (
            <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(200,192,216,0.8)', marginTop: 2 }}>
              {entry.meaning}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function firstLine(s) {
  const line = String(s || '').split('\n').find((l) => l.trim()) || '';
  // Strip token/markdown syntax so the card preview reads cleanly.
  return line
    .replace(/\[\[perso:([^\]]*)\]\]/g, (_, inner) => inner.split('|').pop())
    .replace(/\{\{kr:([^}]*)\}\}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
}

export function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

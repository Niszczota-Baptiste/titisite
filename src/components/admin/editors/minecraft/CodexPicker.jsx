import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCatalog } from '../../../../data/minefieldCatalog';
import { useBlockThumbnail } from '../../../../hooks/useBlockThumbnail';
import { ACC, inputStyle } from '../../ui';

// Affiche un item du codex (vignette 3D si le bloc a un modèle, sinon icône
// plate) à partir de son id. Repli discret si l'id est inconnu du codex.
export function CodexItem({ byId, id, size = 22, showName = true }) {
  const e = byId?.get(id);
  const thumb = useBlockThumbnail(id);
  const src = thumb || e?.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      {src ? (
        <img
          src={src} alt="" width={size} height={size} loading="lazy" draggable={false}
          style={{ imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }}
        />
      ) : (
        <span style={{ fontSize: size, lineHeight: 1, flexShrink: 0 }}>📦</span>
      )}
      {showName && (
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: e ? '#ede8f8' : 'rgba(180,170,200,0.6)',
        }}>
          {e?.nomFr || id || '—'}
        </span>
      )}
    </span>
  );
}

// Champ d'autocomplétion sur le codex. `value` = id de codex (ou ''). Appelle
// onChange(id, entry). Navigation clavier (↑/↓/Entrée/Échap), focus géré.
export function CodexPicker({ catalog, byId, value, onChange, placeholder = 'Rechercher un item…', autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  const selected = value ? byId?.get(value) : null;

  const results = useMemo(() => {
    if (!open) return [];
    return searchCatalog(catalog, query, 30);
  }, [catalog, query, open]);

  useEffect(() => { setHi(0); }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const pick = (entry) => {
    onChange(entry.id, entry);
    setQuery('');
    setOpen(false);
  };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) pick(results[hi]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {selected && !open ? (
        <button type="button"
          onClick={() => { setOpen(true); }}
          style={{
            ...inputStyle, display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <CodexItem byId={byId} id={value} size={20} />
        </button>
      ) : (
        <input
          autoFocus={autoFocus}
          value={query}
          placeholder={selected ? selected.nomFr : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          style={inputStyle}
        />
      )}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
          background: '#0f0a24', border: '1px solid rgba(80,50,130,0.35)',
          borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
          padding: 5, maxHeight: 230, overflowY: 'auto',
        }}>
          {results.map((e, i) => (
            <button type="button"
              key={`${e.source}:${e.id}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(e)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 10px', borderRadius: 7, border: 'none', textAlign: 'left',
                background: i === hi ? `rgba(${'201,168,232'},0.18)` : 'transparent',
                color: i === hi ? ACC : '#ede8f8', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 13,
              }}
            >
              <CodexItem byId={byId} id={e.id} size={20} />
              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>
                {e.source === 'custom' ? '★' : e.source === 'minefield' ? 'MF' : 'MC'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

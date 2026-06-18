import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCatalog } from '../../../../data/minefieldCatalog';
import { ACC, inputStyle } from '../../ui';
import { CodexItem } from './CodexPicker';

// Grille d'établi 3×3. En lecture seule : visualise le placement des items.
// En édition : clic sur une case → mini-recherche codex pour y poser un item
// (clic droit ou × pour vider). `grid` = tableau de 9 ids ('' = vide).
export function CraftGrid({ grid, byId, catalog, editable = false, onChange, cell = 52 }) {
  const cells = useMemo(() => Array.from({ length: 9 }, (_, i) => grid?.[i] || ''), [grid]);
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  const results = useMemo(
    () => (active != null ? searchCatalog(catalog, query, 24) : []),
    [active, query, catalog],
  );

  useEffect(() => {
    if (active == null) return undefined;
    const fn = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setActive(null); setQuery(''); } };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [active]);

  const setCell = (i, id) => { const next = cells.slice(); next[i] = id; onChange?.(next); };
  const place = (id) => { if (active != null) { setCell(active, id); setActive(null); setQuery(''); } };

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(3, ${cell}px)`, gap: 4,
        background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.3)',
        borderRadius: 10, padding: 6,
      }}>
        {cells.map((id, i) => (
          <button
            type="button"
            key={i}
            disabled={!editable}
            onClick={() => editable && setActive(active === i ? null : i)}
            onContextMenu={editable ? (e) => { e.preventDefault(); setCell(i, ''); } : undefined}
            title={editable ? (id ? 'Clic : remplacer · clic droit : vider' : 'Clic : poser un item') : (byId?.get(id)?.nomFr || '')}
            style={{
              width: cell, height: cell, borderRadius: 8, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: active === i ? `rgba(${'201,168,232'},0.22)` : 'rgba(20,10,42,0.7)',
              border: `1px solid ${active === i ? ACC : 'rgba(80,50,130,0.28)'}`,
              cursor: editable ? 'pointer' : 'default',
            }}
          >
            {id
              ? <CodexItem byId={byId} id={id} size={cell - 16} showName={false} />
              : (editable ? <span style={{ color: 'rgba(180,170,200,0.35)', fontSize: 18 }}>+</span> : null)}
          </button>
        ))}
      </div>

      {editable && active != null && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 400, width: 260,
          background: '#0f0a24', border: '1px solid rgba(80,50,130,0.4)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)', padding: 6,
        }}>
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Case ${active + 1} — rechercher…`}
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          {cells[active] && (
            <button type="button" onClick={() => place('')}
              style={{ ...rowBtn, color: '#f87171' }}>✕ Vider la case</button>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {results.map((e) => (
              <button type="button" key={`${e.source}:${e.id}`} onClick={() => place(e.id)} style={rowBtn}>
                <CodexItem byId={byId} id={e.id} size={20} />
                <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>{e.source === 'minefield' ? 'MF' : 'MC'}</span>
              </button>
            ))}
            {results.length === 0 && <div style={{ color: 'rgba(180,170,200,0.5)', fontSize: 12, padding: 8 }}>Tape pour rechercher…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const rowBtn = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '6px 8px', borderRadius: 7, border: 'none', textAlign: 'left',
  background: 'transparent', color: '#ede8f8', cursor: 'pointer',
  fontFamily: "'Inter',sans-serif", fontSize: 13,
};

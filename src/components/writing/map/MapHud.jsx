import { hexToRgb } from '../tokens';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Does a zone match the current search/category filters?
export function zoneMatches(zone, search, category) {
  if (category && zone.category !== category) return false;
  if (!search.trim()) return true;
  const hay = norm([zone.title, zone.subtitle, zone.description, zone.category, ...(zone.tags || [])].join(' '));
  return norm(search).split(/\s+/).every((w) => hay.includes(w));
}

// Search + category filters + view toggles (2D/3D, day/night) + contextual
// stats, overlaid on the canvas.
export function MapHud({
  zones, matching, search, setSearch, category, setCategory, accent, compact,
  mode, setMode, dayMode, setDayMode,
}) {
  const rgb = hexToRgb(accent) || '201,168,232';
  const categories = [...new Set(zones.map((z) => z.category).filter(Boolean))];
  const totalMin = zones.reduce((n, z) => n + (z.stats?.readingMin || 0), 0);
  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  return (
    <>
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'calc(100% - 28px)',
      }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une zone…"
          aria-label="Rechercher une zone sur la carte"
          style={{
            ...mono, width: compact ? 180 : 230, fontSize: 12,
            background: 'rgba(9,5,22,0.82)', backdropFilter: 'blur(8px)',
            border: `1px solid rgba(${rgb},0.3)`, borderRadius: 10,
            padding: '9px 12px', color: '#ede8f8', outline: 'none',
          }}
          onFocus={(e) => { e.target.style.borderColor = accent; }}
          onBlur={(e) => { e.target.style.borderColor = `rgba(${rgb},0.3)`; }}
        />
        {categories.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 360 }}>
            {categories.map((c) => {
              const on = category === c;
              return (
                <button type="button"
                  key={c}
                  onClick={() => setCategory(on ? '' : c)}
                  aria-pressed={on}
                  style={{
                    ...mono, fontSize: 10, letterSpacing: '0.5px', cursor: 'pointer',
                    background: on ? `rgba(${rgb},0.25)` : 'rgba(9,5,22,0.75)',
                    border: `1px solid rgba(${rgb},${on ? 0.7 : 0.25})`,
                    color: on ? accent : 'rgba(200,192,216,0.8)',
                    borderRadius: 14, padding: '4px 10px',
                  }}
                >{c}</button>
              );
            })}
          </div>
        )}
        {(search || category) && (
          <p style={{ ...mono, fontSize: 10, color: 'rgba(200,192,216,0.75)', background: 'rgba(9,5,22,0.7)', borderRadius: 8, padding: '4px 8px', width: 'fit-content' }}>
            {matching} / {zones.length} zone{zones.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 20, display: 'flex', gap: 6 }}>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(${rgb},0.3)` }}>
          {[['3d', '3D'], ['2d', 'Carte']].map(([m, label]) => (
            <button type="button"
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              style={{
                ...mono, fontSize: 10.5, letterSpacing: '0.5px', cursor: 'pointer', border: 'none',
                background: mode === m ? `rgba(${rgb},0.28)` : 'rgba(9,5,22,0.82)',
                color: mode === m ? accent : 'rgba(200,192,216,0.8)',
                padding: '7px 12px',
              }}
            >{label}</button>
          ))}
        </div>
        {mode === '3d' && (
          <button type="button"
            onClick={() => setDayMode(!dayMode)}
            aria-pressed={dayMode}
            aria-label={dayMode ? 'Passer en mode nuit' : 'Passer en mode jour'}
            title={dayMode ? 'Mode nuit' : 'Mode jour'}
            style={{
              ...mono, fontSize: 13, cursor: 'pointer', width: 33,
              background: 'rgba(9,5,22,0.82)', border: `1px solid rgba(${rgb},0.3)`,
              borderRadius: 10, color: dayMode ? '#ffd98a' : accent, padding: 0,
            }}
          >{dayMode ? '☀' : '☾'}</button>
        )}
      </div>

      {!compact && (
        <div style={{
          position: 'absolute', bottom: 14, left: 14, zIndex: 20, pointerEvents: 'none',
          ...mono, fontSize: 10, color: 'rgba(180,170,200,0.7)',
          background: 'rgba(9,5,22,0.7)', borderRadius: 8, padding: '5px 10px',
        }}>
          {zones.length} zone{zones.length > 1 ? 's' : ''}{totalMin > 0 ? ` · ≈ ${totalMin} min de lecture` : ''}
        </div>
      )}

      {mode === '3d' && (
        <div style={{
          position: 'absolute', bottom: 14, right: 14, zIndex: 20, pointerEvents: 'none',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: 'rgba(180,170,200,0.55)',
          background: 'rgba(9,5,22,0.7)', borderRadius: 8, padding: '5px 10px', textAlign: 'right',
        }}>
          {compact ? 'glisser · pincer pour zoomer' : 'glisser pour pivoter · molette pour zoomer'}
        </div>
      )}
    </>
  );
}

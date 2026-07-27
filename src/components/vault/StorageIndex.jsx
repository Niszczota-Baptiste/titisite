import { useMemo, useState } from 'react';
import { useCodex } from '../../hooks/useCodex';
import { storageIndex } from './capacity';
import { toWorldCoords } from './planGeometry';
import { GOLD, INK, MUTED, body, mono, panel, title } from './theme';

// L'annuaire de rangement : la sortie utile du plan.
//
// « Où va la poudre de redstone ? » → zone, étage, coordonnées exactes du
// coffre. Et l'inverse : ce qui reste à affecter. C'est ce qu'on garde ouvert
// sur un second écran pendant qu'on range en jeu.

export function StorageIndex({ doc, worldOrigin, categories, onFocusChest, onFocusZone }) {
  const { byId } = useCodex();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('items'); // items | libres | zones

  const rows = useMemo(
    () => storageIndex(doc, { itemName: (id) => byId.get(id)?.nomFr || id }),
    [doc, byId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q)
      || r.item.toLowerCase().includes(q)
      || (r.zone?.name || '').toLowerCase().includes(q));
  }, [rows, query]);

  const freeChests = useMemo(() => doc.chests
    .filter((c) => (c.items?.length ?? 0) === 0)
    .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x), [doc.chests]);

  const zoneRows = useMemo(() => {
    const byZone = new Map();
    for (const r of rows) {
      const key = r.zone?.id || 'none';
      if (!byZone.has(key)) {
        byZone.set(key, { zone: r.zone, floor: r.floor, items: [] });
      }
      byZone.get(key).items.push(r);
    }
    return [...byZone.values()].sort((a, b) => (b.items.length - a.items.length));
  }, [rows]);

  const exportCsv = () => {
    const head = 'item;zone;etage;x;y;z;libelle';
    const lines = filtered.map((r) => [
      r.name, r.zone?.name || '', r.floor?.name || '', r.x, r.y, r.z, r.label,
    ].map((v) => String(v).replace(/;/g, ',')).join(';'));
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annuaire-salle-des-coffres.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ ...panel, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ ...title, fontSize: 14 }}>📒 Annuaire de rangement</h3>
        <span style={{ ...body, fontSize: 11.5, color: MUTED }}>
          {rows.length} affectation(s) · {freeChests.length} coffre(s) libre(s)
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={exportCsv} style={btn}>Export CSV</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['items', 'Par item'], ['zones', 'Par zone'], ['libres', 'Coffres libres']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} style={pill(mode === k)}>{l}</button>
        ))}
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un item, une zone…"
          style={{ ...input, flex: 1, minWidth: 180 }}
        />
      </div>

      {mode === 'items' && (
        filtered.length === 0 ? (
          <Empty>
            Aucun item affecté pour l’instant. Sélectionne un coffre pour lui donner son
            contenu, ou remplis une zone d’un coup depuis sa fiche (« Répartir une catégorie »).
          </Empty>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '52vh', overflowY: 'auto' }}>
            <table style={table}>
              <thead>
                <tr style={{ color: MUTED, textAlign: 'left' }}>
                  {['Item', 'Zone', 'Étage', 'Coordonnées', ''].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 800).map((r) => {
                  const entry = byId.get(r.item);
                  const world = toWorldCoords(worldOrigin, r.x, r.y, r.z);
                  return (
                    <tr key={`${r.chestId}:${r.item}`} style={{ borderTop: '1px solid rgba(80,50,130,0.18)' }}>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: INK }}>
                          {entry?.icon
                            ? <img src={entry.icon} alt="" width={15} height={15} style={{ imageRendering: 'pixelated' }} />
                            : <span style={{ width: 15, height: 15, borderRadius: 3, background: 'rgba(120,100,170,0.35)' }} />}
                          {r.name}
                        </span>
                      </td>
                      <td style={td}>
                        {r.zone ? (
                          <button type="button" onClick={() => onFocusZone(r.zone.id, r.zone.floorId)}
                            style={{ ...linkBtn, color: r.zone.color }}>{r.zone.name || r.zone.id}</button>
                        ) : <span style={{ color: '#e8c86a' }}>hors zone</span>}
                      </td>
                      <td style={{ ...td, color: MUTED }}>{r.floor?.name || '—'}</td>
                      <td style={{ ...td, ...mono, color: GOLD }}>
                        {r.x}, {r.y}, {r.z}
                        {world && <span style={{ color: MUTED }}> · monde {world.x}, {world.y}, {world.z}</span>}
                      </td>
                      <td style={td}>
                        <button type="button" onClick={() => onFocusChest(r.chestId)} style={linkBtn}>voir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 800 && (
              <div style={{ ...body, fontSize: 11, color: MUTED, padding: 8 }}>
                … {filtered.length - 800} lignes de plus (affine la recherche ou exporte en CSV).
              </div>
            )}
          </div>
        )
      )}

      {mode === 'zones' && (
        zoneRows.length === 0 ? <Empty>Rien de rangé pour l’instant.</Empty> : (
          <div style={{ display: 'grid', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
            {zoneRows.map(({ zone, floor, items }) => (
              <div key={zone?.id || 'none'} style={{
                border: `1px solid ${zone ? `${zone.color}66` : 'rgba(232,200,106,0.4)'}`,
                borderRadius: 9, padding: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                  <strong style={{ ...body, fontSize: 12.5, color: zone?.color || '#e8c86a' }}>
                    {zone?.name || 'Hors zone'}
                  </strong>
                  <span style={{ ...mono, fontSize: 10.5, color: MUTED }}>
                    {floor?.name || ''} {zone ? `· Y ${zone.yMin}–${zone.yMax}` : ''} · {items.length} items
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {items.slice(0, 120).map((r) => {
                    const entry = byId.get(r.item);
                    return (
                      <button key={`${r.chestId}:${r.item}`} type="button"
                        onClick={() => onFocusChest(r.chestId)}
                        title={`${r.name} — ${r.x}, ${r.y}, ${r.z}`}
                        style={chip}>
                        {entry?.icon
                          ? <img src={entry.icon} alt="" width={13} height={13} style={{ imageRendering: 'pixelated' }} />
                          : null}
                        {r.name}
                      </button>
                    );
                  })}
                  {items.length > 120 && <span style={{ ...body, fontSize: 11, color: MUTED }}>+{items.length - 120}</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {mode === 'libres' && (
        freeChests.length === 0 ? <Empty>Tous les coffres sont affectés.</Empty> : (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ ...body, fontSize: 11.5, color: MUTED }}>
              Coffres posés mais sans item — la place qu’il te reste.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: '46vh', overflowY: 'auto' }}>
              {freeChests.slice(0, 400).map((c) => {
                const zone = doc.zones.find((z) => z.id === c.zoneId);
                return (
                  <button key={c.id} type="button" onClick={() => onFocusChest(c.id)}
                    title={zone ? zone.name : 'hors zone'}
                    style={{ ...chip, ...mono, fontSize: 10.5 }}>
                    {c.x}, {c.y}, {c.z}
                  </button>
                );
              })}
              {freeChests.length > 400 && (
                <span style={{ ...body, fontSize: 11, color: MUTED }}>+{freeChests.length - 400} autres</span>
              )}
            </div>
          </div>
        )
      )}

      {categories.length > 0 && mode === 'items' && (
        <div style={{ ...body, fontSize: 11, color: MUTED }}>
          Astuce : dans la fiche d’une zone, « Répartir une catégorie » affecte d’un coup
          tous les items d’une catégorie aux coffres libres de la zone.
        </div>
      )}
    </div>
  );
}

function Empty({ children }) {
  return <p style={{ ...body, fontSize: 12, color: MUTED, margin: '6px 0', lineHeight: 1.5 }}>{children}</p>;
}

const table = { width: '100%', borderCollapse: 'collapse', ...body, fontSize: 12 };
const th = { padding: '7px 10px', fontWeight: 600, fontSize: 11, position: 'sticky', top: 0, background: '#0e0a1c' };
const td = { padding: '6px 10px', verticalAlign: 'middle' };

const input = {
  padding: '6px 9px', borderRadius: 8, background: 'rgba(8,5,20,0.7)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 12,
};

const btn = {
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11,
  background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.4)', color: GOLD,
};

const pill = (on) => ({
  padding: '5px 11px', borderRadius: 999, cursor: 'pointer', ...body, fontSize: 11.5,
  background: on ? 'rgba(232,200,106,0.16)' : 'rgba(20,14,38,0.6)',
  border: `1px solid ${on ? 'rgba(232,200,106,0.45)' : 'rgba(80,50,130,0.28)'}`,
  color: on ? GOLD : MUTED,
});

const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 6,
  cursor: 'pointer', ...body, fontSize: 11, color: INK,
  background: 'rgba(20,14,38,0.6)', border: '1px solid rgba(80,50,130,0.3)',
};

const linkBtn = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  ...body, fontSize: 11.5, color: '#c9a8e8', textDecoration: 'underline',
};

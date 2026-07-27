import { useMemo, useState } from 'react';
import { useCodex } from '../../hooks/useCodex';
import { searchCatalog } from '../../data/minefieldCatalog';
import { useConfirm } from '../../ui/ConfirmProvider';
import { CHEST_SLOTS, WARNING_LABELS, zoneStats } from './capacity';
import { buildChests, rectArea, rectCells, zoneLevelRange } from './planGeometry';
import {
  GOLD, INK, LEVELS, MUTED, ZONE_PALETTE, body, mono, panel, title,
} from './theme';

// Fiche de l'élément sélectionné.
//
// Une zone porte le sens (nom, catégories, hauteur, réserve) et les outils de
// remplissage ; un coffre porte sa position et **les items qui lui sont
// destinés** — le « plan dans le plan ». Aucune quantité : on désigne ce qui se
// range où, pas ce qui s'y trouve.

export function Inspector({
  doc, floors, selection, categories, onEdit, onSelect, dims,
}) {
  const confirm = useConfirm();
  const { byId, catalog } = useCodex();

  if (selection?.type === 'zone') {
    const zone = doc.zones.find((z) => z.id === selection.ids[0]);
    const floor = floors.find((f) => f.id === zone?.floorId);
    if (zone && floor) {
      return (
        <ZoneCard
          zone={zone} floor={floor} doc={doc} dims={dims} categories={categories}
          catalog={catalog} byId={byId}
          onEdit={onEdit} onSelect={onSelect} confirm={confirm}
        />
      );
    }
  }
  if (selection?.type === 'chest' && selection.ids.length > 0) {
    const chests = doc.chests.filter((c) => selection.ids.includes(c.id));
    if (chests.length > 0) {
      return (
        <ChestCard
          chests={chests} doc={doc} catalog={catalog} byId={byId}
          onEdit={onEdit} onSelect={onSelect}
        />
      );
    }
  }
  return (
    <div style={panel}>
      <h3 style={{ ...title, fontSize: 13, marginBottom: 6 }}>Fiche</h3>
      <p style={{ ...body, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
        Sélectionne une zone pour régler sa hauteur et la remplir de coffres, ou
        un coffre pour lui affecter les items qu’il accueillera.
      </p>
    </div>
  );
}

function ZoneCard({ zone, floor, doc, dims, categories, catalog, byId, onEdit, onSelect, confirm }) {
  const stats = zoneStats(zone, doc.chests);
  const [perChest, setPerChest] = useState(1);
  const [report, setReport] = useState(null);

  const patch = (p) => onEdit((d) => ({
    ...d, zones: d.zones.map((z) => (z.id === zone.id ? { ...z, ...p } : z)),
  }));

  // Remplissage : tout le volume de la zone en coffres sans fond, en sautant
  // les cases déjà occupées (un second passage complète au lieu de doubler).
  const fill = async () => {
    const levels = zoneLevelRange(zone, floor);
    const cells = rectCells(zone.rect);
    const total = cells.length * levels.length;
    const existing = doc.chests.filter((c) => c.zoneId === zone.id).length;
    const ok = await confirm({
      title: `Remplir « ${zone.name || zone.id} » ?`,
      message: `${rectArea(zone.rect)} cases × ${levels.length} niveau(x) = jusqu’à ${total} coffres`
        + `${existing ? ` (${existing} déjà posés seront conservés)` : ''}.`,
      confirmLabel: 'Remplir',
    });
    if (!ok) return;
    onEdit((d) => {
      const occupied = new Set(d.chests.map((c) => `${c.y}:${c.x},${c.z}`));
      const added = buildChests(cells, levels, { dims, occupied, zoneFor: () => zone.id });
      return added.length === 0 ? d : { ...d, chests: [...d.chests, ...added] };
    });
    setReport(null);
  };

  // Distribution : les items d'une catégorie répartis sur les coffres libres de
  // la zone, dans l'ordre de lecture (niveau par niveau, de gauche à droite).
  const distribute = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    const per = Math.max(1, Math.min(24, perChest));
    onEdit((d) => {
      const own = d.chests
        .filter((c) => c.zoneId === zone.id && (c.items?.length ?? 0) === 0)
        .sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
      const items = cat.itemIds.filter((id) => byId.has(id) || true);
      if (own.length === 0 || items.length === 0) {
        setReport({ placed: 0, left: items.length, chests: 0 });
        return d;
      }
      const assign = new Map();
      let cursor = 0;
      for (const chest of own) {
        if (cursor >= items.length) break;
        assign.set(chest.id, items.slice(cursor, cursor + per));
        cursor += per;
      }
      setReport({ placed: cursor, left: Math.max(0, items.length - cursor), chests: assign.size });
      return {
        ...d,
        chests: d.chests.map((c) => (assign.has(c.id) ? { ...c, items: assign.get(c.id) } : c)),
      };
    });
  };

  const clearItems = () => onEdit((d) => ({
    ...d,
    chests: d.chests.map((c) => (c.zoneId === zone.id ? { ...c, items: [] } : c)),
  }));

  const remove = async () => {
    const own = doc.chests.filter((c) => c.zoneId === zone.id).length;
    const ok = await confirm({
      title: `Supprimer « ${zone.name || zone.id} » ?`,
      message: own > 0
        ? `Les ${own} coffre(s) de la zone restent en place mais deviennent « hors zone ».`
        : 'La zone sera retirée du plan.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    onEdit((d) => ({
      ...d,
      zones: d.zones.filter((z) => z.id !== zone.id),
      chests: d.chests.map((c) => (c.zoneId === zone.id ? { ...c, zoneId: null } : c)),
    }));
    onSelect({ type: null, ids: [] });
  };

  const toggleCat = (id) => patch({
    categoryIds: zone.categoryIds?.includes(id)
      ? zone.categoryIds.filter((c) => c !== id)
      : [...(zone.categoryIds || []), id],
  });

  const setY = (which, value) => {
    const v = Math.min(Math.max(value, floor.yMin), floor.yMax);
    if (which === 'min') patch({ yMin: Math.min(v, zone.yMax) });
    else patch({ yMax: Math.max(v, zone.yMin) });
  };

  return (
    <div style={{ ...panel, display: 'grid', gap: 9 }}>
      <h3 style={{ ...title, fontSize: 13 }}>Zone</h3>
      <input value={zone.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Nom" style={input} />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ZONE_PALETTE.map((c) => (
          <button key={c} type="button" onClick={() => patch({ color: c })}
            style={{
              width: 17, height: 17, borderRadius: 4, background: c, cursor: 'pointer',
              border: zone.color === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
            }} />
        ))}
      </div>

      <div>
        <div style={label}>Niveaux de rangement (dans l’étage {floor.yMin}–{floor.yMax})</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <NumField value={zone.yMin} min={floor.yMin} max={floor.yMax} onChange={(v) => setY('min', v)} />
          <span style={{ ...mono, color: MUTED, fontSize: 11 }}>→</span>
          <NumField value={zone.yMax} min={floor.yMin} max={floor.yMax} onChange={(v) => setY('max', v)} />
          <span style={{ ...mono, color: GOLD, fontSize: 11, whiteSpace: 'nowrap' }}>
            {stats.levels} niv.
          </span>
        </div>
        <div style={{ ...mono, fontSize: 10.5, color: MUTED, marginTop: 3 }}>
          {rectArea(zone.rect)} cases au sol · volume {stats.volume} · {zone.rect.x0},{zone.rect.z0} → {zone.rect.x1},{zone.rect.z1}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={fill} style={primaryBtn}>⣿ Remplir de coffres</button>
        {stats.assigned > 0 && (
          <button type="button" onClick={clearItems} style={ghostBtn}>Vider les affectations</button>
        )}
      </div>

      <div>
        <div style={label}>Catégories</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {categories.length === 0 && <span style={{ ...body, fontSize: 11, color: MUTED }}>Aucune catégorie définie.</span>}
          {categories.map((c) => {
            const on = zone.categoryIds?.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => toggleCat(c.id)}
                style={{
                  padding: '3px 8px', borderRadius: 999, cursor: 'pointer', ...body, fontSize: 11,
                  background: on ? `${c.color}22` : 'transparent',
                  border: `1px solid ${on ? c.color : 'rgba(120,100,170,0.35)'}`,
                  color: on ? c.color : MUTED,
                }}
              >{c.name}</button>
            );
          })}
        </div>
      </div>

      {(zone.categoryIds || []).length > 0 && stats.chests > 0 && (
        <div style={{ display: 'grid', gap: 5 }}>
          <div style={label}>Répartir une catégorie sur les coffres libres</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...body, fontSize: 11, color: MUTED }}>items / coffre</span>
            <NumField value={perChest} min={1} max={24} onChange={setPerChest} />
            {zone.categoryIds.map((id) => {
              const cat = categories.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <button key={id} type="button" onClick={() => distribute(id)} style={primaryBtn}>
                  → {cat.name} ({cat.itemIds.length})
                </button>
              );
            })}
          </div>
          {report && (
            <div style={{ ...body, fontSize: 11, color: report.left > 0 ? '#e8c86a' : '#9ad4ae' }}>
              {report.placed} item(s) placés sur {report.chests} coffres
              {report.left > 0 && ` — ${report.left} sans place, ajoute des coffres ou des niveaux.`}
            </div>
          )}
        </div>
      )}

      <label style={{ ...body, fontSize: 11.5, color: MUTED }}>
        Réserve manuelle (slots)
        <input
          type="number" min={0} value={zone.reservedSlots || 0}
          disabled={zone.reserved}
          onChange={(e) => patch({ reservedSlots: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          style={{ ...input, marginTop: 3 }}
        />
      </label>

      <label style={{ ...body, fontSize: 11.5, color: INK, display: 'flex', gap: 7, alignItems: 'center' }}>
        <input type="checkbox" checked={!!zone.reserved} onChange={(e) => patch({ reserved: e.target.checked })}
          style={{ accentColor: GOLD }} />
        Zone réservée pour une future MàJ
      </label>

      <textarea
        value={zone.notes} onChange={(e) => patch({ notes: e.target.value })}
        placeholder="Notes" rows={2} style={{ ...input, resize: 'vertical' }}
      />

      <Gauge stats={stats} reserved={zone.reserved} />
      <button type="button" onClick={remove} style={dangerBtn}>Supprimer la zone</button>
    </div>
  );
}

function ChestCard({ chests, doc, catalog, byId, onEdit, onSelect }) {
  const ids = new Set(chests.map((c) => c.id));
  const one = chests.length === 1 ? chests[0] : null;
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => (query.trim().length < 2 ? [] : searchCatalog(catalog, query, 14)),
    [catalog, query],
  );

  const patchAll = (fn) => onEdit((d) => ({
    ...d, chests: d.chests.map((c) => (ids.has(c.id) ? fn(c) : c)),
  }));

  const addItem = (itemId) => {
    patchAll((c) => (c.items?.includes(itemId) ? c : { ...c, items: [...(c.items || []), itemId] }));
    setQuery('');
  };
  const removeItem = (itemId) => patchAll((c) => ({ ...c, items: (c.items || []).filter((i) => i !== itemId) }));

  const remove = () => {
    onEdit((d) => ({ ...d, chests: d.chests.filter((c) => !ids.has(c.id)) }));
    onSelect({ type: null, ids: [] });
  };

  const zone = one?.zoneId ? doc.zones.find((z) => z.id === one.zoneId) : null;
  const shownItems = one ? (one.items || []) : [...new Set(chests.flatMap((c) => c.items || []))];

  return (
    <div style={{ ...panel, display: 'grid', gap: 9 }}>
      <h3 style={{ ...title, fontSize: 13 }}>
        {chests.length === 1 ? 'Coffre sans fond' : `${chests.length} coffres sans fond`}
      </h3>
      <div style={{ ...mono, fontSize: 11, color: GOLD }}>
        {chests.length * CHEST_SLOTS} slots ({chests.length} × {CHEST_SLOTS})
      </div>

      <div>
        <div style={label}>
          Items rangés ici {chests.length > 1 && <span style={{ color: MUTED }}>· appliqué aux {chests.length}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {shownItems.length === 0 && (
            <span style={{ ...body, fontSize: 11, color: MUTED }}>Coffre libre — aucun item affecté.</span>
          )}
          {shownItems.map((id) => {
            const entry = byId.get(id);
            return (
              <button key={id} type="button" onClick={() => removeItem(id)} title="Retirer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px',
                  borderRadius: 6, cursor: 'pointer', ...body, fontSize: 11,
                  background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.4)', color: INK,
                }}>
                {entry?.icon
                  ? <img src={entry.icon} alt="" width={13} height={13} style={{ imageRendering: 'pixelated' }} />
                  : <span style={{ width: 13, height: 13, borderRadius: 3, background: 'rgba(120,100,170,0.35)' }} />}
                {entry?.nomFr || id} ×
              </button>
            );
          })}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Ajouter un item du codex…" style={input} />
        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 2, maxHeight: 180, overflow: 'auto', marginTop: 4 }}>
            {results.map((e) => (
              <button key={`${e.source}:${e.id}`} type="button" onClick={() => addItem(e.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
                  cursor: 'pointer', ...body, fontSize: 11.5, color: INK,
                  background: 'transparent', border: '1px solid transparent',
                }}>
                {e.icon
                  ? <img src={e.icon} alt="" width={14} height={14} style={{ imageRendering: 'pixelated' }} />
                  : <span style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(120,100,170,0.35)' }} />}
                <span style={{ flex: 1, textAlign: 'left' }}>{e.nomFr}</span>
                <span style={{ ...mono, fontSize: 9.5, color: MUTED }}>{e.source}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {one && (
        <>
          <label style={{ ...body, fontSize: 11.5, color: MUTED }}>
            Libellé (rôle du coffre)
            <input value={one.label || ''} onChange={(e) => patchAll((c) => ({ ...c, label: e.target.value }))}
              placeholder="ex. overflow redstone" style={{ ...input, marginTop: 3 }} />
          </label>
          <div style={{ ...mono, fontSize: 10.5, color: MUTED }}>
            position {one.x}, {one.y}, {one.z}
            {zone ? <> · zone « {zone.name || zone.id} »</> : <> · <span style={{ color: '#e8c86a' }}>hors zone</span></>}
          </div>
        </>
      )}

      <button type="button" onClick={remove} style={dangerBtn}>
        Supprimer {chests.length > 1 ? `les ${chests.length} coffres` : 'le coffre'}
      </button>
    </div>
  );
}

function NumField({ value, onChange, min, max }) {
  return (
    <input
      type="number" value={value} min={min} max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.trunc(v))));
      }}
      style={{ ...input, width: 72 }}
    />
  );
}

export function Gauge({ stats, reserved }) {
  if (reserved) {
    return (
      <div style={{ ...body, fontSize: 11.5, color: GOLD }}>
        Zone réservée — exclue des calculs de capacité.
      </div>
    );
  }
  const pct = stats.slots > 0 ? Math.min(150, (stats.needed / stats.slots) * 100) : (stats.needed > 0 ? 150 : 0);
  const level = LEVELS[stats.level];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...body, fontSize: 11, color: MUTED }}>
        <span>{stats.needed} slots réservés</span>
        <span style={{ color: level.color }}>{stats.slots} disponibles</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'rgba(120,100,170,0.18)', overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: level.color }} />
      </div>
      <div style={{ ...mono, fontSize: 10, color: level.color, marginTop: 3 }}>
        {stats.chests} coffres · {stats.assigned} affectés · {stats.free} libres
      </div>
    </div>
  );
}

export function WarningsPanel({ warnings, floors, onFocus }) {
  const floorName = (id) => floors.find((f) => f.id === id)?.name || '';
  return (
    <div style={{ ...panel, display: 'grid', gap: 7 }}>
      <h3 style={{ ...title, fontSize: 13 }}>
        Vérifications {warnings.length > 0 && <span style={{ color: '#e8c86a' }}>({warnings.length})</span>}
      </h3>
      {warnings.length === 0 && (
        <p style={{ ...body, fontSize: 12, color: '#9ad4ae' }}>Aucun problème détecté.</p>
      )}
      <div style={{ display: 'grid', gap: 5, maxHeight: 260, overflow: 'auto' }}>
        {warnings.slice(0, 120).map((w) => (
          <button key={w.id} type="button" onClick={() => onFocus(w)}
            style={{
              textAlign: 'left', padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
              background: 'rgba(232,200,106,0.07)', border: '1px solid rgba(232,200,106,0.22)',
            }}>
            <div style={{ ...body, fontSize: 11, fontWeight: 700, color: '#e8c86a' }}>
              {WARNING_LABELS[w.kind] || w.kind}
              {floorName(w.floorId) && <span style={{ color: MUTED, fontWeight: 400 }}> · {floorName(w.floorId)}</span>}
            </div>
            <div style={{ ...body, fontSize: 11, color: 'rgba(214,206,232,0.8)' }}>{w.message}</div>
          </button>
        ))}
        {warnings.length > 120 && (
          <div style={{ ...body, fontSize: 11, color: MUTED }}>… et {warnings.length - 120} autres.</div>
        )}
      </div>
    </div>
  );
}

const label = { ...body, fontSize: 10.5, color: MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' };

const input = {
  width: '100%', padding: '6px 8px', borderRadius: 7, background: 'rgba(8,5,20,0.7)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 12,
};

const primaryBtn = {
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11.5,
  background: 'rgba(232,200,106,0.14)', border: '1px solid rgba(232,200,106,0.45)', color: GOLD,
};

const ghostBtn = {
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11.5,
  background: 'transparent', border: '1px solid rgba(120,100,170,0.35)', color: INK,
};

const dangerBtn = {
  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', ...body, fontSize: 11.5,
  background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.35)', color: '#ff8a9b',
};

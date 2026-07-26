import { useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider';
import { newId } from './PlanCanvas';
import { floorsByHeight } from './planGeometry';
import { FLOOR_PALETTE, GOLD, INK, MUTED, body, mono, panel, title } from './theme';

// Étages : tranches Y libres et non chevauchantes. Un étage peut faire 3 blocs
// comme 40 — d'où le sélecteur de niveau Y à l'intérieur de l'étage, qui permet
// d'empiler plusieurs rangées de coffres au même endroit.

export function FloorsPanel({ doc, dims, floorId, setFloorId, currentY, setCurrentY, onEdit }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const floors = floorsByHeight(doc.floors);

  const addFloor = () => {
    const top = doc.floors.reduce((m, f) => Math.max(m, f.yMax), -1);
    const yMin = top + 1;
    if (yMin >= dims.y) return;
    const floor = {
      id: newId('f'),
      name: `Étage ${doc.floors.length + 1}`,
      yMin,
      yMax: Math.min(dims.y - 1, yMin + 5),
      color: FLOOR_PALETTE[doc.floors.length % FLOOR_PALETTE.length],
    };
    onEdit((d) => ({ ...d, floors: [...d.floors, floor] }));
    setFloorId(floor.id);
    setCurrentY(floor.yMin);
  };

  const removeFloor = async (floor) => {
    const zones = doc.zones.filter((z) => z.floorId === floor.id);
    const chests = doc.chests.filter((c) => c.y >= floor.yMin && c.y <= floor.yMax);
    const ok = await confirm({
      title: `Supprimer « ${floor.name || floor.id} » ?`,
      message: `${zones.length} zone(s), ${chests.length} coffre(s) et la circulation de cet étage seront supprimés.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    onEdit((d) => ({
      floors: d.floors.filter((f) => f.id !== floor.id),
      zones: d.zones.filter((z) => z.floorId !== floor.id),
      chests: d.chests.filter((c) => c.y < floor.yMin || c.y > floor.yMax),
      circulation: d.circulation.filter((p) => p.floorId !== floor.id
        && p.fromFloorId !== floor.id && p.toFloorId !== floor.id),
    }));
    const next = doc.floors.find((f) => f.id !== floor.id);
    if (next) { setFloorId(next.id); setCurrentY(next.yMin); }
  };

  const patchFloor = (id, patch) => onEdit((d) => ({
    ...d, floors: d.floors.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }));

  const active = doc.floors.find((f) => f.id === floorId);

  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ ...title, fontSize: 13 }}>Étages</h3>
        <button type="button" onClick={addFloor} style={addBtn}>+ Ajouter</button>
      </div>

      {floors.length === 0 && (
        <p style={{ ...body, fontSize: 12, color: MUTED }}>
          Aucun étage. Commence par en créer un : c’est la tranche Y dans laquelle tu dessines.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {floors.map((f) => {
          const on = f.id === floorId;
          const zones = doc.zones.filter((z) => z.floorId === f.id).length;
          const chests = doc.chests.filter((c) => c.y >= f.yMin && c.y <= f.yMax).length;
          return (
            <div key={f.id}>
              <button
                type="button"
                onClick={() => { setFloorId(f.id); setCurrentY((y) => (y >= f.yMin && y <= f.yMax ? y : f.yMin)); }}
                onDoubleClick={() => setEditing(editing === f.id ? null : f.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                  background: on ? 'rgba(232,200,106,0.14)' : 'rgba(20,14,38,0.55)',
                  border: `1px solid ${on ? 'rgba(232,200,106,0.5)' : 'rgba(80,50,130,0.25)'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ width: 8, height: 22, borderRadius: 3, background: f.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...body, fontSize: 12.5, fontWeight: 600, color: INK, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name || f.id}
                  </span>
                  <span style={{ ...mono, fontSize: 10.5, color: MUTED }}>
                    Y {f.yMin}–{f.yMax} · {zones} zones · {chests} coffres
                  </span>
                </span>
                <span
                  role="button" tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); setEditing(editing === f.id ? null : f.id); }}
                  style={{ color: MUTED, fontSize: 12, cursor: 'pointer' }}
                >✎</span>
              </button>

              {editing === f.id && (
                <div style={{ padding: '8px 4px 4px', display: 'grid', gap: 6 }}>
                  <input
                    value={f.name} onChange={(e) => patchFloor(f.id, { name: e.target.value })}
                    placeholder="Nom de l’étage" style={input}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <NumField label="Y min" value={f.yMin} min={0} max={dims.y - 1}
                      onChange={(v) => patchFloor(f.id, { yMin: Math.min(v, f.yMax) })} />
                    <NumField label="Y max" value={f.yMax} min={0} max={dims.y - 1}
                      onChange={(v) => patchFloor(f.id, { yMax: Math.max(v, f.yMin) })} />
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {FLOOR_PALETTE.map((c) => (
                      <button key={c} type="button" onClick={() => patchFloor(f.id, { color: c })}
                        style={{
                          width: 16, height: 16, borderRadius: 4, background: c, cursor: 'pointer',
                          border: f.color === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
                        }} />
                    ))}
                    <div style={{ flex: 1 }} />
                    <button type="button" onClick={() => removeFloor(f)} style={dangerBtn}>Supprimer</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {active && (
        <div style={{ borderTop: '1px solid rgba(80,50,130,0.25)', paddingTop: 8 }}>
          <div style={{ ...body, fontSize: 11.5, color: MUTED, marginBottom: 4 }}>
            Niveau de pose — <strong style={{ ...mono, color: GOLD }}>Y {currentY}</strong>
          </div>
          <input
            type="range" min={active.yMin} max={active.yMax} value={currentY}
            onChange={(e) => setCurrentY(Number(e.target.value))}
            style={{ width: '100%', accentColor: GOLD }}
          />
          <div style={{ ...mono, fontSize: 10, color: MUTED, display: 'flex', justifyContent: 'space-between' }}>
            <span>{active.yMin}</span>
            <span>{active.yMax}</span>
          </div>
          <div style={{ ...body, fontSize: 10.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
            Les coffres des autres niveaux de l’étage restent affichés en repère.
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, min, max }) {
  return (
    <label style={{ flex: 1, ...body, fontSize: 10.5, color: MUTED }}>
      {label}
      <input
        type="number" value={value} min={min} max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, Math.trunc(v))));
        }}
        style={{ ...input, marginTop: 2 }}
      />
    </label>
  );
}

const input = {
  width: '100%', padding: '6px 8px', borderRadius: 7, background: 'rgba(8,5,20,0.7)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 12,
};

const addBtn = {
  padding: '4px 8px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11.5,
  background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.4)', color: GOLD,
};

const dangerBtn = {
  padding: '4px 8px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11,
  background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.35)', color: '#ff8a9b',
};

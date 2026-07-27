import { ACC, GOLD, INK, MUTED, ZONE_PALETTE, body } from './theme';

// Palette d'outils — strictement fonctionnelle : coffres, zones, circulation.
// Aucun bloc de décoration n'existe ici, c'est un schéma d'organisation.

export const TOOLS = [
  { id: 'select',   icon: '⬚', label: 'Sélection', hint: 'Rectangle, déplacement, Suppr' },
  { id: 'zone',     icon: '▦', label: 'Zone', hint: 'Tracer un rectangle (hauteur ajustable ensuite)' },
  { id: 'wall',     icon: '⣿', label: 'Mur', hint: 'Glisser : monte le mur sur tous les niveaux de la zone (Maj = niveau courant)' },
  { id: 'chest',    icon: '▪', label: 'Coffre', hint: 'Poser un coffre sans fond (72 slots)' },
  { id: 'corridor', icon: '⌁', label: 'Couloir', hint: 'Pinceau de circulation' },
  { id: 'stair',    icon: '↕', label: 'Escalier', hint: 'Relier deux étages' },
  { id: 'entry',    icon: '⌂', label: 'Entrée', hint: 'Marquer une entrée' },
  { id: 'erase',    icon: '⌫', label: 'Gomme', hint: 'Coffres et circulation' },
];

const LEVEL_CHOICES = [[0, 'toute la zone'], [1, '1 niveau'], [2, '2'], [3, '3'], [5, '5'], [10, '10']];

export function Toolbar({
  tool, setTool, options, setOptions, overlays, setOverlays, floors, floor,
  onUndo, onRedo, canUndo, canRedo,
}) {
  const set = (patch) => setOptions((o) => ({ ...o, ...patch }));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
      <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(80,50,130,0.3)' }}>
        {TOOLS.map((t) => (
          <button
            key={t.id} type="button" title={`${t.label} — ${t.hint}`}
            onClick={() => setTool(t.id)}
            style={{
              padding: '7px 11px', border: 'none', cursor: 'pointer', ...body, fontSize: 13,
              background: tool === t.id ? GOLD : 'rgba(20,14,38,0.7)',
              color: tool === t.id ? '#1a1206' : INK,
              fontWeight: tool === t.id ? 700 : 500,
            }}
          >{t.icon} <span style={{ fontSize: 12 }}>{t.label}</span></button>
        ))}
      </div>

      {tool === 'wall' && (
        <label style={{ ...chk, gap: 6 }}>
          hauteur du mur
          <select
            value={options.maxLevels ?? 0}
            onChange={(e) => set({ maxLevels: Number(e.target.value) })}
            style={select}
          >
            {LEVEL_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}

      {tool === 'zone' && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {ZONE_PALETTE.map((c) => (
            <button
              key={c} type="button" onClick={() => set({ zoneColor: c })}
              title={c}
              style={{
                width: 18, height: 18, borderRadius: 5, background: c, cursor: 'pointer',
                border: options.zoneColor === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
              }}
            />
          ))}
        </div>
      )}

      {tool === 'stair' && (
        <select
          value={options.stairTarget || ''} onChange={(e) => set({ stairTarget: e.target.value })}
          style={select}
        >
          <option value="">Vers quel étage ?</option>
          {floors.filter((f) => f.id !== floor?.id).map((f) => (
            <option key={f.id} value={f.id}>{f.name || f.id}</option>
          ))}
        </select>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 6 }}>
        <IconButton onClick={onUndo} disabled={!canUndo} title="Annuler (Ctrl+Z)">↶</IconButton>
        <IconButton onClick={onRedo} disabled={!canRedo} title="Rétablir (Ctrl+Maj+Z)">↷</IconButton>
      </div>

      <div style={{ display: 'flex', gap: 8, ...body, fontSize: 11.5, color: MUTED }}>
        {[['chunks', 'chunks 16×16'], ['labels', 'noms'], ['heatmap', 'charge'], ['items', 'items']].map(([k, l]) => (
          <label key={k} style={chk}>
            <input
              type="checkbox" checked={!!overlays[k]}
              onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))}
              style={{ accentColor: ACC }}
            />
            {l}
          </label>
        ))}
      </div>
    </div>
  );
}

function IconButton({ children, ...rest }) {
  return (
    <button
      type="button" {...rest}
      style={{
        width: 30, height: 30, borderRadius: 8, cursor: rest.disabled ? 'default' : 'pointer',
        background: 'rgba(20,14,38,0.7)', border: '1px solid rgba(80,50,130,0.3)',
        color: rest.disabled ? 'rgba(180,170,200,0.3)' : INK, fontSize: 15,
      }}
    >{children}</button>
  );
}

const chk = {
  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
  ...body, fontSize: 12, color: MUTED,
};

const select = {
  padding: '6px 9px', borderRadius: 8, background: 'rgba(20,14,38,0.8)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 12,
};

import { useConfirm } from '../../ui/ConfirmProvider';
import { WARNING_LABELS, zoneStats } from './capacity';
import { rectArea } from './planGeometry';
import {
  GOLD, INK, LEVELS, MUTED, ZONE_PALETTE, body, mono, panel, title,
} from './theme';

// Fiche de l'élément sélectionné. Une zone porte le sens (nom, catégories,
// réserve) ; un coffre ne porte que sa géométrie — pas de contenu, jamais.

export function Inspector({ doc, selection, categories, onEdit, onSelect }) {
  const confirm = useConfirm();

  if (selection?.type === 'zone') {
    const zone = doc.zones.find((z) => z.id === selection.ids[0]);
    if (zone) {
      return <ZoneCard zone={zone} doc={doc} categories={categories} onEdit={onEdit} onSelect={onSelect} confirm={confirm} />;
    }
  }
  if (selection?.type === 'chest' && selection.ids.length > 0) {
    const chests = doc.chests.filter((c) => selection.ids.includes(c.id));
    if (chests.length > 0) {
      return <ChestCard chests={chests} doc={doc} onEdit={onEdit} onSelect={onSelect} />;
    }
  }
  return (
    <div style={panel}>
      <h3 style={{ ...title, fontSize: 13, marginBottom: 6 }}>Fiche</h3>
      <p style={{ ...body, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
        Sélectionne une zone ou un coffre pour l’éditer. Glisse une catégorie du
        panneau items sur une zone pour la lui attribuer.
      </p>
    </div>
  );
}

function ZoneCard({ zone, doc, categories, onEdit, onSelect, confirm }) {
  const stats = zoneStats(zone, doc.chests);
  const patch = (p) => onEdit((d) => ({
    ...d, zones: d.zones.map((z) => (z.id === zone.id ? { ...z, ...p } : z)),
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
      <div style={{ ...mono, fontSize: 10.5, color: MUTED }}>
        {rectArea(zone.rect)} cases · {zone.rect.x0},{zone.rect.z0} → {zone.rect.x1},{zone.rect.z1}
      </div>

      <button type="button" onClick={remove} style={dangerBtn}>Supprimer la zone</button>
    </div>
  );
}

function ChestCard({ chests, doc, onEdit, onSelect }) {
  const ids = new Set(chests.map((c) => c.id));
  const one = chests.length === 1 ? chests[0] : null;
  const slots = chests.reduce((n, c) => n + (c.kind === 'double' ? 54 : 27), 0);
  const patchAll = (p) => onEdit((d) => ({
    ...d, chests: d.chests.map((c) => (ids.has(c.id) ? { ...c, ...p } : c)),
  }));
  const remove = () => {
    onEdit((d) => ({ ...d, chests: d.chests.filter((c) => !ids.has(c.id)) }));
    onSelect({ type: null, ids: [] });
  };
  const zone = one?.zoneId ? doc.zones.find((z) => z.id === one.zoneId) : null;

  return (
    <div style={{ ...panel, display: 'grid', gap: 9 }}>
      <h3 style={{ ...title, fontSize: 13 }}>
        {chests.length === 1 ? 'Coffre' : `${chests.length} coffres`}
      </h3>
      <div style={{ ...mono, fontSize: 11, color: GOLD }}>{slots} slots au total</div>

      <div>
        <div style={label}>Type</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['double', 'Double (54)'], ['single', 'Simple (27)']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => patchAll({ kind: k })}
              style={chip(chests.every((c) => c.kind === k))}>{l}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={label}>Orientation <span style={{ ...mono }}>(R)</span></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['north', '↑'], ['south', '↓'], ['west', '←'], ['east', '→']].map(([f, l]) => (
            <button key={f} type="button" onClick={() => patchAll({ facing: f })}
              style={chip(chests.every((c) => c.facing === f))}>{l}</button>
          ))}
        </div>
      </div>

      {one && (
        <>
          <label style={{ ...body, fontSize: 11.5, color: MUTED }}>
            Libellé (rôle du coffre, jamais son contenu)
            <input value={one.label || ''} onChange={(e) => patchAll({ label: e.target.value })}
              placeholder="ex. tri Redstone" style={{ ...input, marginTop: 3 }} />
          </label>
          <div style={{ ...mono, fontSize: 10.5, color: MUTED }}>
            position {one.x}, {one.y}, {one.z}
            {zone && <> · zone « {zone.name || zone.id} »</>}
            {!zone && <> · <span style={{ color: '#e8c86a' }}>hors zone</span></>}
          </div>
        </>
      )}

      <button type="button" onClick={remove} style={dangerBtn}>
        Supprimer {chests.length > 1 ? `les ${chests.length} coffres` : 'le coffre'}
      </button>
    </div>
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
        {stats.delta >= 0 ? `+${stats.delta}` : stats.delta} slots · {stats.chests} coffres
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

const chip = (on) => ({
  padding: '5px 10px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11.5,
  background: on ? 'rgba(232,200,106,0.16)' : 'transparent',
  border: `1px solid ${on ? 'rgba(232,200,106,0.5)' : 'rgba(120,100,170,0.3)'}`,
  color: on ? GOLD : MUTED,
});

const dangerBtn = {
  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', ...body, fontSize: 11.5,
  background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.35)', color: '#ff8a9b',
};

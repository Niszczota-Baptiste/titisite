import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useCodex } from '../../hooks/useCodex';
import { useConfirm } from '../../ui/ConfirmProvider';
import { searchCatalog } from '../../data/minefieldCatalog';
import { GOLD, INK, MUTED, ZONE_PALETTE, body, mono, panel, title } from './theme';

// Panneau items : le codex du site sert de référentiel pour décrire ce que
// contiendra chaque catégorie de rangement. On classe des *types* d'items, pas
// des quantités — le plan ne suit aucun stock.
//
// Niveau 1 de la spec : on glisse une catégorie sur une zone du plan (la zone
// hérite de la catégorie). Le glisser-déposer passe par dataTransfer, le canvas
// résout la zone sous le point de dépôt.

export function ItemsPanel({ categories, onCategoriesChanged, selectedZone, onAssign }) {
  const { catalog } = useCodex();
  const confirm = useConfirm();
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => {
    const m = new Map();
    for (const e of catalog) if (e.id && !m.has(e.id)) m.set(e.id, e);
    return m;
  }, [catalog]);

  const open = categories.find((c) => c.id === openId) || null;
  const results = useMemo(
    () => (query.trim().length < 2 ? [] : searchCatalog(catalog, query, 24)),
    [catalog, query],
  );

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onCategoriesChanged(); } finally { setBusy(false); }
  };

  const create = () => {
    const name = window.prompt('Nom de la catégorie ?');
    if (!name?.trim()) return;
    run(() => api.vault.categories.create({
      name: name.trim(), color: ZONE_PALETTE[categories.length % ZONE_PALETTE.length],
    }));
  };

  const rename = (cat) => {
    const name = window.prompt('Nouveau nom ?', cat.name);
    if (!name?.trim() || name === cat.name) return;
    run(() => api.vault.categories.update(cat.id, { name: name.trim() }));
  };

  const remove = async (cat) => {
    const ok = await confirm({
      title: `Supprimer « ${cat.name} » ?`,
      message: 'La catégorie disparaît de tous les plans qui l’utilisent.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (ok) run(() => api.vault.categories.remove(cat.id));
  };

  const toggleItem = (cat, itemId) => {
    const itemIds = cat.itemIds.includes(itemId)
      ? cat.itemIds.filter((i) => i !== itemId)
      : [...cat.itemIds, itemId];
    run(() => api.vault.categories.update(cat.id, { itemIds }));
  };

  return (
    <div style={{ ...panel, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ ...title, fontSize: 13 }}>Items & catégories</h3>
        <button type="button" onClick={create} disabled={busy} style={smallBtn}>+ Catégorie</button>
      </div>
      <p style={{ ...body, fontSize: 11, color: MUTED, margin: 0 }}>
        Glisse une catégorie sur une zone du plan pour la lui attribuer.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {categories.map((c) => (
          <span
            key={c.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-vault-category', String(c.id));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => setOpenId(openId === c.id ? null : c.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px',
              borderRadius: 999, cursor: 'grab', ...body, fontSize: 11.5,
              background: openId === c.id ? `${c.color}26` : 'rgba(20,14,38,0.6)',
              border: `1px solid ${c.color}`, color: c.color,
            }}
          >
            {c.name}
            <span style={{ ...mono, fontSize: 9.5, color: MUTED }}>{c.itemIds.length}</span>
          </span>
        ))}
      </div>

      {open && (
        <div style={{ borderTop: '1px solid rgba(80,50,130,0.25)', paddingTop: 8, display: 'grid', gap: 7 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ ...body, fontSize: 12, color: open.color }}>{open.name}</strong>
            <div style={{ flex: 1 }} />
            {selectedZone && (
              <button type="button" style={smallBtn} onClick={() => onAssign(open.id)}>
                → zone « {selectedZone.name || selectedZone.id} »
              </button>
            )}
            <button type="button" style={smallBtn} onClick={() => rename(open)}>Renommer</button>
            <button type="button" style={dangerBtn} onClick={() => remove(open)}>Suppr.</button>
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ZONE_PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => run(() => api.vault.categories.update(open.id, { color: c }))}
                style={{
                  width: 15, height: 15, borderRadius: 4, background: c, cursor: 'pointer',
                  border: open.color === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)',
                }} />
            ))}
          </div>

          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Ajouter un item du codex…" style={input}
          />
          {results.length > 0 && (
            <div style={{ display: 'grid', gap: 2, maxHeight: 160, overflow: 'auto' }}>
              {results.map((e) => (
                <button key={`${e.source}:${e.id}`} type="button" onClick={() => toggleItem(open, e.id)}
                  style={rowBtn(open.itemIds.includes(e.id))}>
                  <Icon entry={e} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{e.nomFr}</span>
                  <span style={{ ...mono, fontSize: 9.5, color: MUTED }}>{e.source}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ ...body, fontSize: 10.5, color: MUTED }}>
            {open.itemIds.length} item(s) — clic pour retirer
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 200, overflow: 'auto' }}>
            {open.itemIds.slice(0, 240).map((id) => {
              const entry = byId.get(id);
              return (
                <button key={id} type="button" title={entry?.nomFr || id}
                  onClick={() => toggleItem(open, id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                    borderRadius: 6, cursor: 'pointer', ...body, fontSize: 10.5,
                    background: 'rgba(20,14,38,0.6)', border: '1px solid rgba(80,50,130,0.3)', color: INK,
                    maxWidth: 150, overflow: 'hidden', whiteSpace: 'nowrap',
                  }}>
                  <Icon entry={entry} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry?.nomFr || id}</span>
                </button>
              );
            })}
            {open.itemIds.length > 240 && (
              <span style={{ ...body, fontSize: 10.5, color: MUTED }}>… +{open.itemIds.length - 240}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Icon({ entry }) {
  if (entry?.icon) {
    return <img src={entry.icon} alt="" width={14} height={14} style={{ imageRendering: 'pixelated', flexShrink: 0 }} />;
  }
  return <span style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(120,100,170,0.35)', flexShrink: 0 }} />;
}

const input = {
  width: '100%', padding: '6px 8px', borderRadius: 7, background: 'rgba(8,5,20,0.7)',
  border: '1px solid rgba(80,50,130,0.35)', color: INK, ...body, fontSize: 12,
};

const smallBtn = {
  padding: '4px 8px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11,
  background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.4)', color: GOLD,
};

const dangerBtn = {
  padding: '4px 8px', borderRadius: 7, cursor: 'pointer', ...body, fontSize: 11,
  background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.35)', color: '#ff8a9b',
};

const rowBtn = (on) => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
  cursor: 'pointer', ...body, fontSize: 11.5,
  background: on ? 'rgba(232,200,106,0.14)' : 'transparent',
  border: `1px solid ${on ? 'rgba(232,200,106,0.4)' : 'transparent'}`,
  color: INK,
});

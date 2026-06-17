import { useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { resolveBlock } from '../../../data/blockCodex';
import { normName } from '../../../data/minefieldCatalog';
import { buildRecipeIndex } from '../../../data/minecraftRecipes';
import { planCraft } from '../../../data/craftPlan';
import { useCodex } from '../../../hooks/useCodex';
import { card, muted } from '../shared';

const WORLD_EMOJI = { overworld: '🌳', nether: '🔥', end: '🌌' };

// Liste de matériaux (BOM) d'un build, croisée avec les coffres : besoin /
// possédé / manquant + dans quels coffres. Décomposition optionnelle du manquant
// en matières premières via le moteur de craft (« 440 planches = 110 bûches »).
export function BlueprintBom({ bom, codex, items = [], chests = [], readOnly = false }) {
  const { byId, idSet } = useCodex();
  const [decompose, setDecompose] = useState(false);
  const [rawIndex, setRawIndex] = useState(null);

  const chestById = useMemo(() => new Map(chests.map((c) => [c.id, c])), [chests]);

  // Inventaire indexé par nom FR normalisé → total + détail coffres.
  const invByName = useMemo(() => {
    const m = new Map();
    for (const r of items) {
      const k = normName(r.name);
      if (!m.has(k)) m.set(k, { total: 0, rows: [] });
      const e = m.get(k);
      e.total += r.quantity;
      e.rows.push({ qty: r.quantity, chestId: r.chestId });
    }
    return m;
  }, [items]);

  // Lignes BOM enrichies (nom, icône, possédé, manquant, coffres).
  const rows = useMemo(() => bom.map((b) => {
    const entry = resolveBlock(codex, b.blockId);
    const inv = invByName.get(normName(entry.nomFr));
    const owned = inv?.total || 0;
    const missing = Math.max(0, b.count - owned);
    return { ...b, entry, owned, missing, chests: inv?.rows || [] };
  }), [bom, codex, invByName]);

  const totalNeeded = rows.reduce((s, r) => s + r.count, 0);
  const totalMissing = rows.reduce((s, r) => s + r.missing, 0);

  // Matières premières du manquant (expansion craft, inventaire ignoré : le
  // croisement coffres est déjà fait au niveau bloc).
  const rawMaterials = useMemo(() => {
    if (!decompose || !rawIndex) return null;
    const acc = new Map();
    for (const r of rows) {
      if (r.missing <= 0) continue;
      const targetId = r.blockId.includes(':') ? r.blockId.split(':')[1] : r.blockId;
      const plan = planCraft({ index: rawIndex, inventory: new Map(), idSet, targetId, qty: r.missing });
      for (const [id, n] of plan.missing) acc.set(id, (acc.get(id) || 0) + n);
    }
    return [...acc.entries()].map(([id, n]) => ({ id, n, entry: byId.get(id) })).sort((a, b) => b.n - a.n);
  }, [decompose, rawIndex, rows, idSet, byId]);

  const toggleDecompose = async () => {
    if (!rawIndex) {
      const custom = await api.recipes.list().catch(() => []);
      setRawIndex(await buildRecipeIndex(custom));
    }
    setDecompose((v) => !v);
  };

  return (
    <div style={{ padding: 14, borderTop: '1px solid rgba(80,50,130,0.22)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ color: '#ede8f8', fontSize: 15 }}>📋 Liste de matériaux</strong>
        <span style={{ ...muted, fontSize: 12 }}>
          {rows.length} types · {totalNeeded.toLocaleString('fr-FR')} blocs
          {!readOnly && ` · manque ${totalMissing.toLocaleString('fr-FR')}`}
        </span>
        {!readOnly && (
          <button type="button" onClick={toggleDecompose}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif", background: decompose ? 'rgba(201,168,232,0.2)' : 'transparent', border: `1px solid ${decompose ? '#c9a8e8' : 'rgba(80,50,130,0.28)'}`, color: decompose ? '#c9a8e8' : '#ede8f8' }}>
            🛠️ Décomposer le manquant
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 360, overflowY: 'auto' }}>
        {rows.map((r) => (
          <div key={r.blockId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(14,9,28,0.5)', border: '1px solid rgba(80,50,130,0.2)', borderRadius: 9, padding: '6px 10px' }}>
            <Icon icon={r.entry.icon} />
            <span style={{ color: '#ede8f8', fontSize: 13, flex: '1 1 150px', minWidth: 120 }}>{r.entry.nomFr}</span>
            <span style={{ fontSize: 13, color: '#ede8f8', whiteSpace: 'nowrap' }}>×{r.count.toLocaleString('fr-FR')}</span>
            {!readOnly && (
              <span style={{ fontSize: 12, whiteSpace: 'nowrap', color: r.owned >= r.count ? '#4ade80' : 'rgba(180,170,200,0.7)' }}>
                possédé {r.owned}
              </span>
            )}
            {!readOnly && (r.missing > 0
              ? <span style={{ fontSize: 12, color: '#fb923c', whiteSpace: 'nowrap' }}>manque {r.missing}</span>
              : <span style={{ fontSize: 12, color: '#4ade80', whiteSpace: 'nowrap' }}>✓</span>)}
            {!readOnly && (
              <span style={{ ...muted, fontSize: 11, flexBasis: '100%' }}>
                {r.chests.length === 0 ? 'aucun coffre' : r.chests.map((c, i) => {
                  const ch = c.chestId != null ? chestById.get(c.chestId) : null;
                  return <span key={i} style={{ marginRight: 10 }}>{ch ? `${WORLD_EMOJI[ch.world] || '📦'} ${ch.name}` : '📦 Non rangé'} : {c.qty}</span>;
                })}
              </span>
            )}
          </div>
        ))}
      </div>

      {decompose && rawMaterials && (
        <div style={{ ...card, marginTop: 12, padding: 12 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'rgba(180,170,200,0.6)', marginBottom: 8 }}>
            Matières premières pour le manquant
          </div>
          {rawMaterials.length === 0 ? (
            <span style={{ ...muted, fontSize: 13 }}>Rien à crafter (tout est possédé).</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {rawMaterials.map((m) => (
                <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Icon icon={m.entry?.icon} size={20} />
                  <span style={{ color: '#ede8f8' }}>{m.entry?.nomFr || m.id}</span>
                  <strong style={{ color: '#fb923c' }}>×{m.n.toLocaleString('fr-FR')}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Icon({ icon, size = 24 }) {
  if (!icon) return <span style={{ fontSize: size, width: size, textAlign: 'center' }}>📦</span>;
  return <img src={icon} alt="" width={size} height={size} loading="lazy" style={{ imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }} />;
}

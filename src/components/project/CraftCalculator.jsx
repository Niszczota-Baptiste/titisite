import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { buildIdIndex, normName } from '../../data/minefieldCatalog';
import { buildRecipeIndex } from '../../data/minecraftRecipes';
import { planCraft } from '../../data/craftPlan';
import { useCodex } from '../../hooks/useCodex';
import { CodexItem, CodexPicker } from '../admin/editors/minecraft/CodexPicker';
import { CraftGrid } from '../admin/editors/minecraft/CraftGrid';
import { Button, ErrorBanner, Field, card, muted } from './shared';
import { WORLDS } from './Minecraft';

const worldEmoji = (w) => WORLDS.find((x) => x.id === w)?.emoji ?? '🗺️';

// Calculateur de craft d'un projet : cible + quantité → arbre développé jusqu'aux
// matières premières, croisé avec l'inventaire des coffres. Produit une « liste
// de préparation » (quoi sortir de quel coffre + crafts intermédiaires) et
// applique le craft (transaction) via api.ws(slug).minecraft.craftApply.
export function CraftCalculator({ items, chests, ws, onApplied, toast }) {
  const { catalog, byId, idSet } = useCodex();
  const nameId = useMemo(() => buildIdIndex(catalog), [catalog]);

  const [index, setIndex] = useState(null); // Map<id, recette> (vanilla+custom)
  const [targetId, setTargetId] = useState('');
  const [qty, setQty] = useState(1);
  const [resultChestId, setResultChestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.recipes.list().catch(() => [])
      .then((custom) => buildRecipeIndex(custom))
      .then((idx) => { if (alive) setIndex(idx); });
    return () => { alive = false; };
  }, []);

  const chestById = useMemo(() => new Map(chests.map((c) => [c.id, c])), [chests]);

  // Inventaire agrégé par id de codex + lignes (pour le détail coffres + FIFO).
  const { inventory, rowsByItem } = useMemo(() => {
    const inv = new Map();
    const rows = new Map();
    for (const r of items) {
      const id = nameId.get(normName(r.name));
      if (!id) continue;
      inv.set(id, (inv.get(id) || 0) + r.quantity);
      if (!rows.has(id)) rows.set(id, []);
      rows.get(id).push({ rowId: r.id, chestId: r.chestId, qty: r.quantity, name: r.name });
    }
    return { inventory: inv, rowsByItem: rows };
  }, [items, nameId]);

  const plan = useMemo(() => {
    if (!index || !targetId) return null;
    return planCraft({ index, inventory, idSet, targetId, qty: Math.max(1, qty) });
  }, [index, inventory, idSet, targetId, qty]);

  const canCraft = plan && plan.missing.size === 0 && (plan.steps.length > 0 || plan.consume.size > 0);

  // Répartit la conso d'un item sur ses lignes (FIFO) → deltas par ligne + détail coffres.
  const distribute = (id, amount) => {
    const out = [];
    let left = amount;
    for (const row of rowsByItem.get(id) || []) {
      if (left <= 0) break;
      const take = Math.min(left, row.qty);
      if (take > 0) { out.push({ ...row, take }); left -= take; }
    }
    return out;
  };

  const apply = async () => {
    if (!plan || !canCraft) return;
    setBusy(true); setErr('');
    const consume = [];
    for (const [id, amount] of plan.consume) {
      for (const part of distribute(id, amount)) consume.push({ id: part.rowId, delta: -part.take });
    }
    const produce = [{
      name: byId.get(targetId)?.nomFr || targetId,
      quantity: Math.max(1, qty),
      chestId: resultChestId === '' ? null : Number(resultChestId),
    }];
    try {
      const updated = await ws.minecraft.craftApply({ consume, produce });
      toast?.success?.('Craft appliqué : coffres mis à jour');
      onApplied?.(updated);
      setTargetId('');
    } catch (e) { setErr(e.message || 'Application impossible.'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <ErrorBanner error={err} onDismiss={() => setErr('')} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: '2 1 240px', minWidth: 220 }}>
          <Field label="Objet à crafter">
            <CodexPicker catalog={catalog} byId={byId} value={targetId}
              onChange={(id) => setTargetId(id)} autoFocus />
          </Field>
        </div>
        <div style={{ flex: '0 1 110px', minWidth: 90 }}>
          <Field label="Quantité">
            <input type="number" min={1} value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              style={inp} />
          </Field>
        </div>
      </div>

      {!index ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement des recettes…</p>
      ) : !targetId ? (
        <p style={{ ...muted, fontSize: 13 }}>Choisis un objet pour développer son arbre de craft.</p>
      ) : !index.has(targetId) ? (
        <p style={{ ...muted, fontSize: 13 }}>
          Aucune recette connue pour « {byId.get(targetId)?.nomFr || targetId} ». Ajoute-la dans
          l'admin (onglet « Coffres & Shops » → Recettes) si c'est un objet Minefield.
        </p>
      ) : plan && (
        <PlanView
          plan={plan} byId={byId} chestById={chestById} distribute={distribute}
          targetId={targetId} qty={qty} index={index}
        />
      )}

      {plan && index?.has(targetId) && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
          <label style={{ ...muted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            Ranger le résultat dans
            <select value={resultChestId} onChange={(e) => setResultChestId(e.target.value)} style={inp}>
              <option value="">Non rangé</option>
              {chests.map((c) => (
                <option key={c.id} value={c.id}>{worldEmoji(c.world)} {c.name}</option>
              ))}
            </select>
          </label>
          <Button onClick={apply} disabled={!canCraft || busy}>
            {busy ? 'Application…' : '✅ Craft effectué'}
          </Button>
          {!canCraft && plan.missing.size > 0 && (
            <span style={{ color: '#fb923c', fontSize: 13 }}>
              Il te manque des matières premières — complète l'inventaire d'abord.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PlanView({ plan, byId, chestById, distribute, targetId, qty, index }) {
  const target = byId.get(targetId);
  const targetSurplus = (() => {
    // rab dû à l'arrondi sur la cible (info seulement)
    const step = plan.steps.find((s) => s.id === targetId);
    return step ? step.produced - qty : 0;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* À sortir des coffres */}
      {plan.consume.size > 0 && (
        <SectionCard title="📤 À sortir des coffres">
          {[...plan.consume].map(([id, amount]) => (
            <div key={id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <CodexItem byId={byId} id={id} size={22} />
                <strong style={{ color: '#4dd9ac' }}>×{amount}</strong>
              </div>
              <div style={{ ...muted, fontSize: 12, paddingLeft: 30 }}>
                {distribute(id, amount).map((part, i) => {
                  const ch = part.chestId != null ? chestById.get(part.chestId) : null;
                  return (
                    <span key={i} style={{ marginRight: 12 }}>
                      {ch ? `${worldEmoji(ch.world)} ${ch.name}` : '📦 Non rangé'} : {part.take}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {/* Manquant */}
      {plan.missing.size > 0 && (
        <SectionCard title="❗ Manquant (à récolter)">
          {[...plan.missing].map(([id, amount]) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <CodexItem byId={byId} id={id} size={22} />
              <strong style={{ color: '#fb923c' }}>×{amount}</strong>
            </div>
          ))}
        </SectionCard>
      )}

      {/* Étapes de craft */}
      {plan.steps.length > 0 && (
        <SectionCard title="🛠️ Étapes de craft (dans l'ordre)">
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plan.steps.map((s, i) => {
              const grid = index?.get(s.id)?.grid;
              return (
                <li key={i} style={{ color: '#ede8f8', fontSize: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {s.type === 'smelting' ? '🔥' : s.type === 'stonecutting' ? '🪚' : '🛠️'}
                    Crafter {s.times}× <CodexItem byId={byId} id={s.id} size={18} />
                    <span style={muted}>(produit {s.produced})</span>
                  </span>
                  {Array.isArray(grid) && grid.some((c) => c) && (
                    <div style={{ marginTop: 6 }}>
                      <CraftGrid grid={grid} byId={byId} cell={26} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </SectionCard>
      )}

      <div style={{ ...muted, fontSize: 13 }}>
        Résultat : <strong style={{ color: '#ede8f8' }}>{qty}× {target?.nomFr || targetId}</strong>
        {targetSurplus > 0 && ` (tu en produiras ${targetSurplus} de plus, arrondi au craft)`}
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{
        fontSize: 12, letterSpacing: '0.4px', textTransform: 'uppercase',
        color: 'rgba(180,170,200,0.6)', marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

const inp = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)',
  borderRadius: 10, padding: '9px 12px', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
};

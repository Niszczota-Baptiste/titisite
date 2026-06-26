import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { resolveBlock } from '../../../data/blockCodex';
import { normName } from '../../../data/minefieldCatalog';
import { buildRecipeIndex } from '../../../data/minecraftRecipes';
import { planCraft } from '../../../data/craftPlan';
import { useCodex } from '../../../hooks/useCodex';
import { card, muted } from '../shared';
import { CodexItem } from '../../admin/editors/minecraft/CodexPicker';
import { CraftGrid } from '../../admin/editors/minecraft/CraftGrid';

const WORLD_EMOJI = { overworld: '🌳', nether: '🔥', end: '🌌' };
const strip = (id) => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);

// Décompte Minecraft : 64 / stack, 27 stacks / boîte de Shulker = 1728 / SB.
const STACK = 64, SHULKER = 1728;
function stacksOf(count) {
  const sb = Math.floor(count / SHULKER);
  const rem = count % SHULKER;
  const stacks = Math.floor(rem / STACK);
  const units = rem % STACK;
  return { sb, stacks, units };
}
// Libellé compact « 1 SB + 12 st + 5 ».
function stacksLabel(count) {
  const { sb, stacks, units } = stacksOf(count);
  const parts = [];
  if (sb) parts.push(`${sb} SB`);
  if (stacks) parts.push(`${stacks} st`);
  if (units || !parts.length) parts.push(`${units}`);
  return parts.join(' + ');
}

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Liste de matériaux (BOM) d'un build. Deux vues :
//  • « Items finaux » : les blocs tels que posés (croisés avec les coffres).
//  • « Matières de base » : tout décomposé en matières premières via le moteur de
//    craft, avec la liste des crafts à faire en dessous.
export function BlueprintBom({ bom, codex, items = [], chests = [], readOnly = false }) {
  const { byId, idSet } = useCodex();
  const [mode, setMode] = useState('final'); // 'final' | 'base'
  const [rawIndex, setRawIndex] = useState(null);

  const chestById = useMemo(() => new Map(chests.map((c) => [c.id, c])), [chests]);

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

  const rows = useMemo(() => bom.map((b) => {
    const entry = resolveBlock(codex, b.blockId);
    const inv = invByName.get(normName(entry.nomFr));
    const owned = inv?.total || 0;
    const missing = Math.max(0, b.count - owned);
    return { ...b, entry, owned, missing, chests: inv?.rows || [] };
  }), [bom, codex, invByName]);

  const totalNeeded = rows.reduce((s, r) => s + r.count, 0);
  const totalMissing = rows.reduce((s, r) => s + r.missing, 0);

  // Charge l'index de recettes à la première bascule sur « base ».
  useEffect(() => {
    if (mode === 'base' && !rawIndex) {
      api.recipes.list().catch(() => [])
        .then((custom) => buildRecipeIndex(custom))
        .then(setRawIndex);
    }
  }, [mode, rawIndex]);

  // Décomposition complète du BOM → matières de base + crafts agrégés.
  const baseData = useMemo(() => {
    if (mode !== 'base' || !rawIndex) return null;
    const raws = new Map();
    const steps = new Map(); // id -> { times, produced, type, station, grid }
    for (const b of bom) {
      const plan = planCraft({ index: rawIndex, inventory: new Map(), idSet, targetId: strip(b.blockId), qty: b.count });
      for (const [id, n] of plan.missing) raws.set(id, (raws.get(id) || 0) + n);
      for (const s of plan.steps) {
        const r = rawIndex.get(s.id);
        const e = steps.get(s.id) || { times: 0, produced: 0, type: s.type, station: r?.station || '', grid: r?.grid || [] };
        e.times += s.times; e.produced += s.produced;
        steps.set(s.id, e);
      }
    }
    return {
      raws: [...raws.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
      steps: [...steps.entries()].map(([id, e]) => ({ id, ...e })),
    };
  }, [mode, rawIndex, bom, idSet]);

  const exportCsv = () => {
    if (mode === 'base' && baseData) {
      const header = ['matière', 'id', 'quantité', 'stacks', 'boîtes_shulker'];
      const out = baseData.raws.map((m) => [byId.get(m.id)?.nomFr || m.id, m.id, m.n, Math.floor(m.n / STACK), (m.n / SHULKER).toFixed(2)]);
      downloadCsv('materiaux-base.csv', [header, ...out]);
      return;
    }
    const header = ['bloc', 'id', 'quantité', 'possédé', 'manquant', 'stacks', 'boîtes_shulker'];
    const out = rows.map((r) => [r.entry.nomFr, r.blockId, r.count, r.owned, r.missing, Math.floor(r.count / STACK), (r.count / SHULKER).toFixed(2)]);
    downloadCsv('liste-materiaux.csv', [header, ...out]);
  };

  return (
    <div style={{ padding: 14, borderTop: '1px solid rgba(80,50,130,0.22)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ color: '#ede8f8', fontSize: 15 }}>📋 Liste de matériaux</strong>
        <span style={{ ...muted, fontSize: 12 }}>
          {rows.length} types · {totalNeeded.toLocaleString('fr-FR')} blocs
          {!readOnly && mode === 'final' && ` · manque ${totalMissing.toLocaleString('fr-FR')}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[['final', '🧱 Items finaux'], ['base', '🪵 Matières de base']].map(([m, lbl]) => (
            <button type="button" key={m} onClick={() => setMode(m)}
              style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
                background: mode === m ? 'rgba(201,168,232,0.2)' : 'transparent',
                border: `1px solid ${mode === m ? '#c9a8e8' : 'rgba(80,50,130,0.28)'}`,
                color: mode === m ? '#c9a8e8' : '#ede8f8',
              }}>{lbl}</button>
          ))}
          <button type="button" onClick={exportCsv}
            title="Exporter la liste de matériaux en CSV (stacks + boîtes de Shulker)"
            style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif", background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: '#ede8f8' }}>
            ⬇ CSV
          </button>
        </div>
      </div>

      {mode === 'final' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 360, overflowY: 'auto' }}>
          {rows.map((r) => (
            <div key={r.blockId} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(14,9,28,0.5)', border: '1px solid rgba(80,50,130,0.2)', borderRadius: 9, padding: '6px 10px' }}>
              <Icon icon={r.entry.icon} />
              <span style={{ color: '#ede8f8', fontSize: 13, flex: '1 1 150px', minWidth: 120 }}>{r.entry.nomFr}</span>
              <span style={{ fontSize: 13, color: '#ede8f8', whiteSpace: 'nowrap' }}>×{r.count.toLocaleString('fr-FR')}</span>
              <span style={{ ...muted, fontSize: 11, whiteSpace: 'nowrap' }} title="Boîtes de Shulker (1728) + stacks (64) + unités">{stacksLabel(r.count)}</span>
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
      ) : !baseData ? (
        <p style={{ ...muted, fontSize: 13 }}>Décomposition…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...card, padding: 12 }}>
            <div style={subLabel}>Matières de base (tout le build)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {baseData.raws.map((m) => (
                <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <CodexItem byId={byId} id={m.id} size={22} showName={false} />
                  <span style={{ color: '#ede8f8' }}>{byId.get(m.id)?.nomFr || m.id}</span>
                  <strong style={{ color: '#4dd9ac' }}>×{m.n.toLocaleString('fr-FR')}</strong>
                </span>
              ))}
            </div>
          </div>

          {baseData.steps.length > 0 && (
            <div style={{ ...card, padding: 12 }}>
              <div style={subLabel}>Crafts à faire</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {baseData.steps.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#ede8f8', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {s.station
                        ? <CodexItem byId={byId} id={s.station} size={16} showName={false} />
                        : (s.type === 'smelting' ? '🔥' : s.type === 'stonecutting' ? '🪚' : '🛠️')}
                      Crafter {s.times.toLocaleString('fr-FR')}×
                      <CodexItem byId={byId} id={s.id} size={18} />
                      <span style={muted}>(produit {s.produced})</span>
                    </span>
                    {Array.isArray(s.grid) && s.grid.some((c) => c) && <CraftGrid grid={s.grid} byId={byId} cell={22} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const subLabel = {
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.4px',
  color: 'rgba(180,170,200,0.6)', marginBottom: 8,
};

function Icon({ icon, size = 24 }) {
  if (!icon) return <span style={{ fontSize: size, width: size, textAlign: 'center' }}>📦</span>;
  return <img src={icon} alt="" width={size} height={size} loading="lazy" style={{ imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }} />;
}

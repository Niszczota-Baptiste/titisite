// Craft Minefield : recherche de recettes, recettes d'un item, plan de craft
// calculé CÔTÉ SERVEUR (le dump server/data/recipes_minefield.json est
// confidentiel — jamais renvoyé en entier, uniquement des vues ciblées et
// paginées, le tout derrière requireAuth).

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { normName } from '../codex.js';
import {
  buildCraftIndex, craftNameOf, idByFreeName, minefieldRecipes, resolveNamespacedId,
} from '../craft/data.js';
import { planCraftServer } from '../craft/plan.js';

export const craftRouter = Router();
craftRouter.use(requireAuth);

// ── Index fusionné (Minefield > admin > vanilla), invalidé quand la table
// custom_recipes bouge (stamp bon marché à chaque requête). ────────────────
let _cache = null; // { stamp, index }

function craftIndex() {
  const s = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(MAX(id), 0) AS i, COALESCE(MAX(updated_at), 0) AS u
    FROM custom_recipes
  `).get();
  const stamp = `${s.c}:${s.i}:${s.u}`;
  if (!_cache || _cache.stamp !== stamp) {
    const rows = db.prepare('SELECT * FROM custom_recipes ORDER BY position, id').all();
    _cache = { stamp, index: buildCraftIndex(rows) };
  }
  return _cache.index;
}

// ── Sérialisation (ids plats + noms FR ; les icônes restent côté client via
// le codex déjà chargé) ─────────────────────────────────────────────────────

function serializeIngredient(ing) {
  if (ing.item) return { id: ing.item, name: craftNameOf(ing.item), count: ing.count };
  const options = ing.options || [];
  if (options.length > 0) {
    return {
      id: options[0],
      name: options.map((o) => craftNameOf(o)).join(' / '),
      count: ing.count,
      options,
    };
  }
  return { id: null, name: `#${ing.tag || '?'}`, count: ing.count, tag: ing.tag || null };
}

function serializeEntry(e) {
  return {
    key: e.key,
    source: e.source,
    label: e.label || '',
    result: { id: e.resultId, name: craftNameOf(e.resultId) },
    resultCount: e.resultCount,
    type: e.type,
    shapeless: e.shapeless,
    station: e.stationId ? { id: e.stationId, name: craftNameOf(e.stationId) } : null,
    grid: e.grid || [],
    ingredients: e.ingredients.map(serializeIngredient),
    depth: Number.isFinite(e.depth) ? e.depth : null,
  };
}

// ── Recherche paginée dans les recettes Minefield ───────────────────────────
// GET /api/craft/recipes?q=&crafter=&page=&limit=
craftRouter.get('/recipes', (req, res) => {
  const { entries } = minefieldRecipes();
  const q = normName(String(req.query.q || ''));
  const tokens = q.split(/\s+/).filter(Boolean);
  const crafter = String(req.query.crafter || '').trim();

  // Facette « crafters » calculée sur tout le dump (6 valeurs, pas de fuite).
  const byCrafter = new Map();
  for (const e of entries) byCrafter.set(e.crafter, (byCrafter.get(e.crafter) || 0) + 1);
  const crafters = [...byCrafter.entries()].map(([id, count]) => ({
    id,
    stationId: resolveNamespacedId(id),
    name: craftNameOf(resolveNamespacedId(id)) || id,
    count,
  })).sort((a, b) => b.count - a.count);

  let list = entries;
  if (crafter) list = list.filter((e) => e.crafter === crafter || e.stationId === crafter);
  if (tokens.length > 0) {
    list = list.filter((e) => {
      const hay = `${normName(e.label)} ${normName(craftNameOf(e.resultId))}`;
      return tokens.every((t) => hay.includes(t));
    });
  }
  list = [...list].sort((a, b) => {
    const an = normName(a.label || craftNameOf(a.resultId));
    const bn = normName(b.label || craftNameOf(b.resultId));
    return an < bn ? -1 : an > bn ? 1 : 0;
  });

  const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 30)));
  const pages = Math.max(1, Math.ceil(list.length / limit));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(req.query.page) || 1)));
  res.json({
    total: list.length,
    page,
    pages,
    limit,
    crafters,
    recipes: list.slice((page - 1) * limit, page * limit).map(serializeEntry),
  });
});

// ── La/les recette(s) produisant un item (toutes sources, défaut en 1er) ────
// GET /api/craft/recipe/:itemId — id plat de codex ou namespacé.
craftRouter.get('/recipe/:itemId', (req, res) => {
  const id = resolveNamespacedId(req.params.itemId);
  if (!id) return res.status(404).json({ error: 'unknown_item' });
  const entries = craftIndex().get(id) || [];
  res.json({ itemId: id, name: craftNameOf(id), recipes: entries.map(serializeEntry) });
});

// ── Plan de craft serveur, croisé avec les coffres d'un workspace ───────────
// POST /api/craft/plan { item, qty, workspace?, choices? }  (une cible)
//   ou { items: [{ item, qty }], … }  (BOM d'un build : plusieurs cibles en un
//   appel, restes partagés ; les ids inconnus du codex — états de blocs, eau… —
//   sont tolérés et ressortent en matières premières telles quelles)
craftRouter.post('/plan', (req, res) => {
  const body = req.body || {};
  const clampQty = (q) => Math.min(1_000_000, Math.max(1, Math.floor(Number(q) || 1)));
  const stripNs = (s) => { const i = s.indexOf(':'); return i === -1 ? s : s.slice(i + 1); };

  let targets;
  let single = null;
  if (Array.isArray(body.items)) {
    targets = body.items.slice(0, 1000)
      .map((it) => {
        const raw = String(it?.item || '').trim();
        if (!raw) return null;
        return { id: resolveNamespacedId(raw) || stripNs(raw), qty: clampQty(it?.qty) };
      })
      .filter(Boolean);
    if (targets.length === 0) return res.status(400).json({ error: 'unknown_item' });
  } else {
    const targetId = resolveNamespacedId(body.item);
    if (!targetId) return res.status(400).json({ error: 'unknown_item' });
    single = { id: targetId, qty: clampQty(body.qty) };
    targets = [single];
  }
  const choices = {};
  if (body.choices && typeof body.choices === 'object') {
    for (const [k, v] of Object.entries(body.choices)) {
      if (typeof v === 'string' && v) choices[String(k)] = v;
    }
  }

  // Workspace optionnel : membre du projet (admin : tous) — sinon 404, même
  // réponse qu'un slug inexistant (pas de fuite d'existence).
  let wsRow = null;
  const slug = String(body.workspace || '').trim();
  if (slug) {
    wsRow = db.prepare(`
      SELECT id, slug, name FROM workspaces
      WHERE slug = ? AND status = 'active' AND (is_minecraft = 1 OR minecraft_only = 1)
    `).get(slug);
    const allowed = wsRow && (req.user.role === 'admin'
      || db.prepare('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(wsRow.id, req.user.id));
    if (!allowed) return res.status(404).json({ error: 'not_found' });
  }

  // Inventaire agrégé par id de codex (rapprochement par nom normalisé, comme
  // le stock des quêtes) + lignes par item pour la répartition FIFO.
  const inventory = new Map();
  const rowsByItem = new Map();
  if (wsRow) {
    const rows = db.prepare(`
      SELECT id, name, quantity, chest_id AS chestId FROM minecraft_resources
      WHERE workspace_id = ? AND quantity > 0 ORDER BY position, id
    `).all(wsRow.id);
    for (const r of rows) {
      const id = idByFreeName(r.name);
      if (!id) continue;
      inventory.set(id, (inventory.get(id) || 0) + r.quantity);
      if (!rowsByItem.has(id)) rowsByItem.set(id, []);
      rowsByItem.get(id).push({ rowId: r.id, chestId: r.chestId, qty: r.quantity });
    }
  }

  const index = craftIndex();
  const plan = planCraftServer({ index, inventory, targets, choices });

  // Répartit la conso d'un item sur ses lignes (FIFO) → quoi sortir de quel coffre.
  const distribute = (id, amount) => {
    const out = [];
    let left = amount;
    for (const row of rowsByItem.get(id) || []) {
      if (left <= 0) break;
      const take = Math.min(left, row.qty);
      if (take > 0) { out.push({ rowId: row.rowId, chestId: row.chestId, take }); left -= take; }
    }
    return out;
  };

  const stations = new Map();
  const steps = plan.steps.map((s) => {
    const e = s.recipe;
    if (e.stationId) stations.set(e.stationId, craftNameOf(e.stationId));
    return {
      itemId: s.id,
      name: craftNameOf(s.id),
      times: s.times,
      produced: s.produced,
      key: e.key,
      source: e.source,
      label: e.label || '',
      type: e.type,
      shapeless: e.shapeless,
      resultCount: e.resultCount,
      station: e.stationId ? { id: e.stationId, name: craftNameOf(e.stationId) } : null,
      grid: e.grid || [],
      consumed: s.consumed.map((c) => ({ id: c.item, name: craftNameOf(c.item), count: c.count })),
    };
  });

  res.json({
    target: single ? { id: single.id, name: craftNameOf(single.id), qty: single.qty } : null,
    targets: targets.map((t) => ({ id: t.id, name: craftNameOf(t.id), qty: t.qty })),
    known: single ? index.has(single.id) : true,
    workspace: wsRow ? wsRow.slug : null,
    steps,
    consume: [...plan.consume].map(([id, total]) => ({
      id, name: craftNameOf(id), total, from: distribute(id, total),
    })),
    missing: [...plan.missing].map(([id, count]) => ({
      id, name: craftNameOf(id), count, owned: inventory.get(id) || 0,
    })),
    surplus: [...plan.surplus].map(([id, count]) => ({ id, name: craftNameOf(id), count })),
    alternatives: Object.fromEntries(
      [...plan.alternatives].map(([id, entries]) => [id, entries.map(serializeEntry)]),
    ),
    chosen: Object.fromEntries(plan.chosen),
    stations: [...stations].map(([id, name]) => ({ id, name })),
  });
});

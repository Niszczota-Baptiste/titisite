// Référentiel de craft côté serveur : recettes CUSTOM du serveur Minefield
// (server/data/recipes_minefield.json — CONFIDENTIEL : hors git, jamais dans
// public/ ni src/data/, exposé uniquement en ciblé via /api/craft/* derrière
// requireAuth) fusionnées avec les recettes vanilla (src/data/
// recipes_vanilla.json + recipes_grids.json) et les recettes admin
// (table custom_recipes, passées par la route).
//
// Tout est chargé UNE fois en mémoire (paresseux) et ramené à des ids de
// codex « plats » (sans namespace), le même référentiel que le client
// (public/codex/codex.json pour Minefield, src/data/codex_vanilla.json pour
// vanilla) — un dump absent dégrade silencieusement sur vanilla seul.

import fs from 'node:fs';
import path from 'node:path';
import { normName } from '../codex.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const MINEFIELD_RECIPES = path.join(ROOT, 'server', 'data', 'recipes_minefield.json');
const CODEX_MF = path.join(ROOT, 'public', 'codex', 'codex.json');
const CODEX_VA = path.join(ROOT, 'src', 'data', 'codex_vanilla.json');
const VANILLA_RECIPES = path.join(ROOT, 'src', 'data', 'recipes_vanilla.json');
const VANILLA_GRIDS = path.join(ROOT, 'src', 'data', 'recipes_grids.json');

function readJSON(file, fallback) {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- chemins codés en dur relatifs au repo
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return fallback; }
}

// ── Codex (id plat → nom FR, par namespace) ─────────────────────────────────

let _codex = null;

function codex() {
  if (!_codex) {
    const mf = new Map();
    const va = new Map();
    for (const e of readJSON(CODEX_MF, [])) if (e?.id && !mf.has(e.id)) mf.set(e.id, e.nomFr || e.id);
    for (const e of readJSON(CODEX_VA, [])) if (e?.id && !va.has(e.id)) va.set(e.id, e.nomFr || e.id);
    // Index nom normalisé → id, pour rapprocher les lignes d'inventaire
    // (stockées par nom libre). Minefield d'abord : premier arrivé gagne,
    // comme buildIdIndex côté client.
    const byName = new Map();
    for (const [id, nom] of mf) { const k = normName(nom); if (k && !byName.has(k)) byName.set(k, id); }
    for (const [id, nom] of va) { const k = normName(nom); if (k && !byName.has(k)) byName.set(k, id); }
    _codex = { mf, va, byName, idSet: new Set([...mf.keys(), ...va.keys()]) };
  }
  return _codex;
}

/** Nom FR d'un id plat (Minefield prioritaire), repli sur l'id brut. */
export function craftNameOf(id) {
  const { mf, va } = codex();
  return mf.get(id) ?? va.get(id) ?? id;
}

/** Noms normalisés candidats d'un id plat (les deux codex peuvent diverger). */
export function nameCandidatesOf(id) {
  const { mf, va } = codex();
  const out = new Set();
  for (const n of [mf.get(id), va.get(id)]) { const k = normName(n); if (k) out.add(k); }
  return out;
}

/** Id plat correspondant à un nom libre (inventaire), ou null. */
export function idByFreeName(name) {
  return codex().byName.get(normName(name)) ?? null;
}

export function codexIdSet() { return codex().idSet; }

/**
 * Résout un id namespacé (« minefield:x » / « minecraft:x ») vers l'id plat du
 * codex. FALLBACK OBLIGATOIRE : certains items custom sont enregistrés sous
 * minecraft: (ex. minecraft:red_book) — si l'id manque dans le codex de son
 * namespace, on cherche le même id dans l'AUTRE codex avant de déclarer
 * inconnu (null). Un id déjà plat est accepté tel quel s'il est connu.
 */
export function resolveNamespacedId(full) {
  const s = String(full || '').trim();
  if (!s) return null;
  const { mf, va } = codex();
  const i = s.indexOf(':');
  if (i === -1) return mf.has(s) || va.has(s) ? s : null;
  const ns = s.slice(0, i);
  const id = s.slice(i + 1);
  const [primary, secondary] = ns === 'minefield' ? [mf, va] : [va, mf];
  if (primary.has(id) || secondary.has(id)) return id;
  return null;
}

// ── Recettes Minefield (dump serveur) ───────────────────────────────────────

// Grille du dump {"row,col": "ns:id"} → tableau de 9 cases d'ids plats
// ('' = vide), le format déjà consommé par CraftGrid côté client.
function gridToCells(grid) {
  const cells = Array.from({ length: 9 }, () => '');
  for (const [key, full] of Object.entries(grid || {})) {
    const [row, col] = key.split(',').map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 2 || col < 0 || col > 2) continue;
    cells[row * 3 + col] = resolveNamespacedId(full) || '';
  }
  return cells.some((c) => c) ? cells : [];
}

let _minefield = null; // { entries: [], byResult: Map, count, missing: bool }

/**
 * Charge le dump Minefield et le normalise en entrées de calcul. Seules les
 * recettes enabled && visible && !deprecated sont retenues (les « deprecated »
 * produisent des blocs obsolètes : gardées dans le fichier, jamais proposées).
 */
export function minefieldRecipes() {
  if (!_minefield) {
    const raw = readJSON(MINEFIELD_RECIPES, null);
    if (raw === null) {
      console.warn(`[craft] ${MINEFIELD_RECIPES} absent — calculateur limité aux recettes vanilla/admin (voir README).`);
    }
    const entries = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      if (!r || !r.enabled || !r.visible || r.deprecated) continue;
      const resultId = resolveNamespacedId(r.result);
      if (!resultId) continue;
      const ingredients = (r.ingredients || [])
        .map((i) => ({ item: resolveNamespacedId(i?.item), count: Math.max(1, Math.floor(Number(i?.count) || 1)) }))
        .filter((i) => i.item);
      if (ingredients.length === 0) continue;
      const crafter = String(r.crafter || 'minecraft:crafting_table');
      const stationId = crafter === 'minecraft:crafting_table' ? null : resolveNamespacedId(crafter);
      entries.push({
        key: `mf:${r.id}`,
        source: 'minefield',
        label: String(r.name || '').trim(),
        resultId,
        resultCount: Math.max(1, Math.floor(Number(r.count) || 1)),
        shapeless: !!r.shapeless,
        type: 'crafting',
        crafter,
        stationId,
        ingredients,
        grid: r.shapeless ? [] : gridToCells(r.grid),
      });
    }
    const byResult = new Map();
    for (const e of entries) {
      if (!byResult.has(e.resultId)) byResult.set(e.resultId, []);
      byResult.get(e.resultId).push(e);
    }
    _minefield = { entries, byResult, missing: raw === null };
  }
  return _minefield;
}

// ── Recettes vanilla (mêmes données que le client, lues par fs) ─────────────

const strip = (id) => String(id || '').replace(/^minecraft:/, '');

function normIngredient(ingredient, count) {
  const c = Math.max(1, Math.floor(Number(count) || 1));
  if (Array.isArray(ingredient)) return { options: ingredient.map(strip), count: c };
  const s = String(ingredient || '');
  if (s.startsWith('#')) return { tag: strip(s.slice(1)), count: c };
  return { item: strip(s), count: c };
}

let _vanilla = null; // toutes les recettes vanilla (les variantes servent d'alternatives)

export function vanillaRecipes() {
  if (!_vanilla) {
    const data = readJSON(VANILLA_RECIPES, {});
    const grids = readJSON(VANILLA_GRIDS, {});
    const out = [];
    // La grille pré-calculée est indexée par résultat : elle ne vaut que pour
    // la recette « de base » (id == result), pas pour les variantes _from_….
    for (const r of data.crafting || []) {
      const resultId = strip(r.result);
      const grid = (r.id === resultId && grids[resultId]) || [];
      out.push({
        key: `va:c:${r.id}`, source: 'vanilla', label: '', resultId,
        resultCount: Math.max(1, Number(r.count) || 1), shapeless: grid.length === 0,
        type: 'crafting', crafter: 'minecraft:crafting_table', stationId: null,
        ingredients: (r.ingredients || []).map((i) => normIngredient(i.ingredient, i.count)),
        grid,
      });
    }
    for (const r of data.smelting || []) {
      out.push({
        key: `va:s:${r.id}`, source: 'vanilla', label: '', resultId: strip(r.result),
        resultCount: 1, shapeless: true, type: 'smelting', crafter: 'minecraft:furnace', stationId: null,
        ingredients: [normIngredient(r.ingredient, 1)], grid: [],
      });
    }
    for (const r of data.stonecutting || []) {
      out.push({
        key: `va:t:${r.id}`, source: 'vanilla', label: '', resultId: strip(r.result),
        resultCount: Math.max(1, Number(r.count) || 1), shapeless: true,
        type: 'stonecutting', crafter: 'minecraft:stonecutter', stationId: null,
        ingredients: [normIngredient(r.ingredient, 1)], grid: [],
      });
    }
    for (const r of data.smithing || []) {
      out.push({
        key: `va:m:${r.id}`, source: 'vanilla', label: '', resultId: strip(r.result),
        resultCount: 1, shapeless: true, type: 'smithing', crafter: 'minecraft:smithing_table', stationId: null,
        ingredients: [normIngredient(r.base, 1), normIngredient(r.addition, 1)], grid: [],
      });
    }
    _vanilla = out;
  }
  return _vanilla;
}

// ── Résolution des tags vanilla (port de src/data/minecraftRecipes.js) ──────

const TAG_SUFFIX = {
  planks: '_planks',
  logs: '_log',
  wooden_slabs: '_slab',
  wooden_pressure_plates: '_pressure_plate',
  wooden_buttons: '_button',
  wooden_doors: '_door',
  wooden_stairs: '_stairs',
  coals: null,
  stone_crafting_materials: null,
};

export function resolveTagCandidates(tag, idSet) {
  const keep = (arr) => arr.filter((id) => idSet.has(id));
  if (tag === 'coals') return keep(['coal', 'charcoal']);
  if (tag === 'stone_crafting_materials') return keep(['cobblestone', 'blackstone', 'cobbled_deepslate']);
  if (tag === 'planks') return keep([...idSet].filter((id) => id.endsWith('_planks')));
  const m = tag.match(/^(.+?)_(logs|stems)$/);
  if (m) {
    const w = m[1];
    return keep([`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`,
      `${w}_stem`, `${w}_hyphae`, `stripped_${w}_stem`, `stripped_${w}_hyphae`]);
  }
  const suf = TAG_SUFFIX[tag];
  if (suf) return keep([...idSet].filter((id) => id.endsWith(suf)));
  const base = tag.replace(/s$/, '');
  return keep([...idSet].filter((id) => id.includes(base)));
}

// Ids candidats d'un ingrédient (item concret, choix, ou tag résolu).
function ingredientCandidates(ing) {
  if (ing.item) return [ing.item];
  if (Array.isArray(ing.options)) return ing.options;
  if (ing.tag) return resolveTagCandidates(ing.tag, codexIdSet());
  return [];
}

// ── Table admin (custom_recipes) → entrées de calcul ────────────────────────

/** Rows bruts de la table custom_recipes → entrées normalisées. */
export function adminEntries(rows) {
  const out = [];
  for (const r of rows || []) {
    let ingredients = [];
    let grid = [];
    try { ingredients = JSON.parse(r.ingredients) || []; } catch { /* ligne corrompue : ignorée */ }
    try { grid = JSON.parse(r.grid) || []; } catch { grid = []; }
    ingredients = ingredients
      .map((i) => ({ item: String(i?.item || '').trim(), count: Math.max(1, Math.floor(Number(i?.count) || 1)) }))
      .filter((i) => i.item);
    if (!r.result_id || ingredients.length === 0) continue;
    out.push({
      key: `admin:${r.id}`,
      source: 'admin',
      label: String(r.note || '').trim(),
      resultId: r.result_id,
      resultCount: Math.max(1, Number(r.result_count) || 1),
      shapeless: !Array.isArray(grid) || !grid.some((c) => c),
      type: r.type || 'crafting',
      crafter: null,
      stationId: r.station || null,
      ingredients,
      grid: Array.isArray(grid) && grid.some((c) => c) ? grid : [],
    });
  }
  return out;
}

// ── Index fusionné + profondeurs ────────────────────────────────────────────

/**
 * Construit l'index résultat → recettes candidates, la PREMIÈRE étant le choix
 * par défaut du calculateur. Les recettes sans voie acyclique (depth Infinity,
 * ex. bloc → lingot quand le lingot ne se fabrique QUE depuis le bloc) passent
 * en dernier : jamais défaut, mais forçables en alternative. Parmi les
 * recettes viables : Minefield (les vraies recettes du serveur) > admin
 * (saisies main) > vanilla, puis la MOINS PROFONDE (évite les variantes
 * inverses), puis la clé pour un ordre stable.
 */
export function buildCraftIndex(customRows = []) {
  const index = new Map();
  const push = (e) => {
    if (!index.has(e.resultId)) index.set(e.resultId, []);
    index.get(e.resultId).push(e);
  };
  for (const e of minefieldRecipes().entries) push(e);
  for (const e of adminEntries(customRows)) push(e);
  for (const e of vanillaRecipes()) push(e);

  computeDepths(index);
  const tier = { minefield: 0, admin: 1, vanilla: 2 };
  const inf = (e) => (Number.isFinite(e.depth) ? 0 : 1);
  for (const entries of index.values()) {
    entries.sort((a, b) => (inf(a) - inf(b))
      || (tier[a.source] - tier[b.source])
      || ((a.depth ?? Infinity) - (b.depth ?? Infinity))
      || (a.key < b.key ? -1 : 1));
  }
  return index;
}

// Profondeur d'un item = 0 s'il est brut (aucune recette), sinon min sur ses
// recettes de (1 + max des profondeurs des ingrédients). Calcul par POINT FIXE
// (les profondeurs ne font que descendre → converge en ≤ profondeur max réelle
// itérations) : les items pris dans un cycle PUR (bloc ↔ lingot sans autre
// voie) restent à Infinity, puis sont requalifiés en matière première (coût 0
// comme ingrédient — le planificateur les traite en feuille) SANS requalifier
// leurs recettes, qui gardent depth Infinity : jamais choisies par défaut,
// mais forçables en alternative (utile quand on possède les blocs).
function computeDepths(index) {
  const itemD = new Map();
  const all = [];
  for (const [id, entries] of index) {
    itemD.set(id, Infinity);
    for (const e of entries) {
      e.depth = Infinity;
      // candidats par ingrédient pré-résolus (les tags scannent tout le codex)
      e._cands = e.ingredients.map((ing) => ingredientCandidates(ing));
      all.push(e);
    }
  }
  const depthOf = (id) => (itemD.has(id) ? itemD.get(id) : 0); // sans recette = brut
  const entryDepth = (e) => {
    let d = 0;
    for (const cands of e._cands) {
      if (cands.length === 0) continue; // tag irrésolu : traité comme brut
      let sub = Infinity;
      for (const c of cands) { const v = depthOf(c); if (v < sub) sub = v; }
      d = Math.max(d, sub);
      if (d === Infinity) break;
    }
    return d === Infinity ? Infinity : 1 + d;
  };
  const run = (frozen) => {
    for (let iter = 0; iter < 64; iter++) {
      let changed = false;
      for (const e of all) {
        if (frozen.has(e.resultId)) continue;
        const d = entryDepth(e);
        if (d < e.depth) { e.depth = d; changed = true; }
      }
      for (const [id, entries] of index) {
        if (frozen.has(id)) continue;
        let best = Infinity;
        for (const e of entries) if (e.depth < best) best = e.depth;
        if (best < itemD.get(id)) itemD.set(id, best);
      }
      if (!changed) break;
    }
  };
  const frozen = new Set();
  run(frozen);

  // Cycles purs : des items restent à Infinity (lingot ↔ bloc ↔ briques sans
  // voie externe) — MAIS tout l'aval l'est aussi (la porte qui consomme le
  // lingot). On « pèle » : à chaque tour, on requalifie en matière première
  // LE membre qui ressemble le plus au matériau de base de la famille, puis on
  // relance le point fixe (repart de l'état courant, les profondeurs ne font
  // que baisser) — l'aval se résout de lui-même. Signaux, dans l'ordre :
  //   1. suffixe de matériau de base (_ingot, _gem…) — dans une famille
  //      cyclique, c'est l'unité qui se mine/récolte en jeu ;
  //   2. score de « décompression » : part des recettes de l'item qui font
  //      1 gros → N petits (bloc → 2 lingots) — signe que sa vraie source est
  //      ailleurs, vs les recettes de compression (4 lingots → bloc) ;
  //   3. usage total comme ingrédient, puis l'id (déterminisme).
  const BASE_MATERIAL_RE = /(_ingot|_gem|_dust|_crystal|_shard|_scrap|_nugget|_pearl)$/;
  const usage = new Map();
  for (const e of all) {
    for (const ing of e.ingredients) {
      if (ing.item) usage.set(ing.item, (usage.get(ing.item) || 0) + ing.count);
    }
  }
  const decompression = (id) => {
    const entries = index.get(id) || [];
    if (entries.length === 0) return 0;
    const n = entries.filter((e) => e.ingredients.reduce((s, i) => s + i.count, 0) < e.resultCount).length;
    return n / entries.length;
  };
  const score = (id) => [
    BASE_MATERIAL_RE.test(id) ? 1 : 0,
    decompression(id),
    usage.get(id) || 0,
  ];
  const better = (a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
    return a < b;
  };
  for (let guard = 0; guard < 256; guard++) {
    let pick = null;
    for (const [id, d] of itemD) {
      if (d !== Infinity || frozen.has(id)) continue;
      if (!pick || better(id, pick)) pick = id;
    }
    if (!pick) break;
    frozen.add(pick);
    itemD.set(pick, 0); // feuille pour ses consommateurs ; ses recettes restent Infinity
    run(frozen);
  }
  for (const e of all) delete e._cands;
}

// Calculateur de craft CÔTÉ SERVEUR (port de src/data/craftPlan.js, enrichi) :
// développe récursivement l'arbre d'une cible jusqu'aux matières premières, en
// consommant d'abord l'inventaire puis les restes de craft (arrondi au craft
// supérieur). Les CYCLES (bloc ↔ lingot) sont coupés : un item déjà présent
// dans la pile d'expansion est traité comme une feuille (matière première).
//
// `index`  : Map<id, entrées[]> (buildCraftIndex — 1re entrée = défaut)
// `targets`: [{ id, qty }] — une cible (calculateur) ou plusieurs (BOM d'un
//            build) ; les restes d'arrondis sont partagés entre cibles.
// `choices`: { [itemId]: key } — recette alternative imposée par l'utilisateur
// Sortie   : { steps, consume, missing, surplus, alternatives, chosen }
//   - steps        : crafts dans l'ordre d'exécution (matières d'abord)
//   - consume      : Map<id, qté> prélevée sur l'inventaire réel
//   - missing      : Map<id, qté> de matières premières manquantes
//   - surplus      : Map<id, qté> de restes produits par les arrondis
//   - alternatives : Map<id, entrées[]> — items développés à plusieurs recettes
//   - chosen       : Map<id, key> — recette effectivement retenue par item

import { resolveTagCandidates, codexIdSet } from './data.js';

const MAX_DEPTH = 64;

export function planCraftServer({ index, inventory, targets, choices = {} }) {
  const idSet = codexIdSet();
  const inv = new Map(inventory); // copie mutable (inventaire réel restant)
  const extra = new Map();        // restes de craft réutilisables
  const consume = new Map();
  const missing = new Map();
  const steps = [];
  const alternatives = new Map();
  const chosen = new Map();

  const add = (m, k, n) => m.set(k, (m.get(k) || 0) + n);
  const take = (m, k, n) => {
    const have = m.get(k) || 0;
    const used = Math.min(have, n);
    if (used > 0) m.set(k, have - used);
    return used;
  };

  // Recette retenue pour un item : le choix utilisateur s'il référence bien
  // une recette de cet item, sinon la première VIABLE (l'index est trié :
  // recettes acycliques d'abord, la moins profonde en tête). Un item dont
  // toutes les recettes sont cycliques (depth Infinity, ex. lingot ← bloc
  // seulement) est traité en matière première — sauf choix explicite, utile
  // quand on possède les blocs et veut les re-fondre.
  const pickRecipe = (id) => {
    const entries = index.get(id);
    if (!entries || entries.length === 0) return null;
    const defaultViable = Number.isFinite(entries[0].depth);
    if (!alternatives.has(id) && (entries.length > 1 || !defaultViable)) alternatives.set(id, entries);
    const wanted = choices[id];
    // 'raw' = « ne pas crafter » : l'item reste une matière première à sortir
    // des coffres / récolter, même s'il a une recette.
    if (wanted === 'raw') { chosen.set(id, 'raw'); return null; }
    const entry = (wanted && entries.find((e) => e.key === wanted))
      || (defaultViable ? entries[0] : null);
    if (entry) chosen.set(id, entry.key);
    return entry;
  };

  // Profondeur « effective » d'un candidat : celle de sa meilleure recette,
  // 0 s'il est brut (pas de recette, ou cycle pur → traité en feuille).
  const depthOf = (id) => {
    const entries = index.get(id);
    if (!entries || entries.length === 0) return 0;
    return Number.isFinite(entries[0].depth) ? entries[0].depth : 0;
  };

  // Résout un ingrédient (item / choix / tag) en id concret : d'abord ce que
  // l'on possède (inventaire puis restes), sinon le candidat le MOINS profond
  // (les planches vanilla avant leur variante moussue), puis l'id (stable).
  const resolve = (ing) => {
    if (ing.item) return ing.item;
    const candidates = ing.options
      ? ing.options
      : (ing.tag ? resolveTagCandidates(ing.tag, idSet) : []);
    if (candidates.length === 0) return ing.tag ? `#${ing.tag}` : '#?';
    let best = null;
    for (const c of candidates) {
      if (!best) { best = c; continue; }
      const ownedC = (inv.get(c) || 0) + (extra.get(c) || 0);
      const ownedB = (inv.get(best) || 0) + (extra.get(best) || 0);
      if (ownedC !== ownedB ? ownedC > ownedB
        : depthOf(c) !== depthOf(best) ? depthOf(c) < depthOf(best)
          : c < best) best = c;
    }
    return best;
  };

  const need = (id, want, path, depth) => {
    let remaining = want;
    // 1) restes de craft (internes, sans impact inventaire)
    remaining -= take(extra, id, remaining);
    if (remaining <= 0) return;
    // 2) inventaire réel
    const fromInv = take(inv, id, remaining);
    if (fromInv > 0) { add(consume, id, fromInv); remaining -= fromInv; }
    if (remaining <= 0) return;

    // Matière première (pas de recette), cycle, ou profondeur max → manquant.
    const recipe = path.has(id) || depth > MAX_DEPTH ? null : pickRecipe(id);
    if (!recipe) {
      add(missing, id, remaining);
      return;
    }

    const per = Math.max(1, recipe.resultCount || 1);
    const times = Math.ceil(remaining / per);
    const produced = times * per;
    const leftover = produced - remaining;
    if (leftover > 0) add(extra, id, leftover);

    const nextPath = new Set(path); nextPath.add(id);
    const consumed = [];
    for (const ing of recipe.ingredients) {
      const concrete = resolve(ing);
      const total = ing.count * times;
      consumed.push({ item: concrete, count: total });
      need(concrete, total, nextPath, depth + 1);
    }
    // Empilé APRÈS les enfants → ordre d'exécution (matières d'abord).
    steps.push({ id, recipe, times, produced, consumed });
  };

  const targetIds = new Set();
  for (const t of targets) {
    targetIds.add(t.id);
    need(t.id, Math.max(1, Math.floor(t.qty) || 1), new Set(), 0);
  }

  // surplus final = restes non réutilisés (hors les cibles elles-mêmes)
  const surplus = new Map();
  for (const [id, n] of extra) if (n > 0 && !targetIds.has(id)) surplus.set(id, n);

  return { steps, consume, missing, surplus, alternatives, chosen };
}

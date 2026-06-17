import { resolveTagCandidates } from './minecraftRecipes';

// Calculateur de craft : développe RÉCURSIVEMENT l'arbre d'une cible (vanilla +
// custom) jusqu'aux matières premières, en consommant d'abord l'inventaire, puis
// les surplus de craft (arrondi au craft supérieur). Pur, testable, sans React.
//
// Entrées :
//   index : Map<id, recette>  (cf. buildRecipeIndex)
//   inventory : Map<id, qté disponible>  (agrégée par id de codex)
//   idSet : Set<id> connus du codex (résolution des tags)
//   targetId, qty
// Sortie :
//   { steps, consume, missing, surplus, chosen }
//   - steps   : opérations de craft, ordre d'exécution (plus profond d'abord)
//   - consume : Map<id, qté> prélevée sur l'inventaire réel
//   - missing : Map<id, qté> de matières premières manquantes
//   - surplus : Map<id, qté> de restes produits par les arrondis
//   - chosen  : Map<clé tag/choix, id retenu> (transparence de la résolution)

const MAX_DEPTH = 64;

export function planCraft({ index, inventory, idSet, targetId, qty }) {
  const inv = new Map(inventory); // copie mutable (inventaire réel restant)
  const extra = new Map();        // restes de craft réutilisables
  const consume = new Map();
  const missing = new Map();
  const steps = [];
  const chosen = new Map();

  const add = (m, k, n) => m.set(k, (m.get(k) || 0) + n);
  const take = (m, k, n) => {
    const have = m.get(k) || 0;
    const used = Math.min(have, n);
    if (used > 0) m.set(k, have - used);
    return used;
  };

  // Résout un ingrédient (item / tag / choix) en un id concret, en privilégiant
  // ce que l'on possède (inventaire puis restes), sinon le 1er candidat.
  const resolve = (ing) => {
    if (ing.item) return ing.item;
    const candidates = ing.options
      ? ing.options
      : (ing.tag ? resolveTagCandidates(ing.tag, idSet) : []);
    if (candidates.length === 0) return ing.tag ? `#${ing.tag}` : '#?';
    let best = candidates[0];
    let bestOwned = -1;
    for (const c of candidates) {
      const owned = (inv.get(c) || 0) + (extra.get(c) || 0);
      if (owned > bestOwned) { bestOwned = owned; best = c; }
    }
    const key = ing.tag ? `#${ing.tag}` : ing.options.join('|');
    chosen.set(key, best);
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

    const recipe = index.get(id);
    // Matière première (pas de recette), cycle, ou profondeur max → manquant.
    if (!recipe || path.has(id) || depth > MAX_DEPTH) {
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
    steps.push({ id, type: recipe.type, source: recipe.source, times, produced, consumed });
  };

  if (!index.has(targetId) && !(inventory.get?.(targetId))) {
    // Cible sans recette connue : on signale quand même ce qu'il faut « avoir ».
  }
  need(targetId, Math.max(1, Math.floor(qty) || 1), new Set(), 0);

  // surplus final = restes non réutilisés (hors la cible elle-même)
  const surplus = new Map();
  for (const [id, n] of extra) if (n > 0 && id !== targetId) surplus.set(id, n);

  return { steps, consume, missing, surplus, chosen };
}

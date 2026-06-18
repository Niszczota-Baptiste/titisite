// Recettes unifiées pour le calculateur de craft : base VANILLA en lecture seule
// (src/data/recipes_vanilla.json, tirée via import() dynamique → chunk à part) +
// recettes CUSTOM Minefield (table éditée en admin, passées en argument).
//
// Tout est ramené à des ids de codex (sans le préfixe « minecraft: »). Un
// ingrédient peut être : un item { item, count }, un tag { tag, count } (ex.
// « #minecraft:planks »), ou un choix { options:[ids], count } (ex. charbon OU
// charbon de bois). Les tags/choix sont résolus au moment du calcul, en croisant
// avec l'inventaire (cf. resolveTagCandidates).

let _vanilla = null;

const strip = (id) => String(id || '').replace(/^minecraft:/, '');

// ingredient (string id, string tag, ou array de choix) → forme normalisée.
function normIngredient(ingredient, count) {
  const c = Math.max(1, Math.floor(Number(count) || 1));
  if (Array.isArray(ingredient)) {
    return { options: ingredient.map(strip), count: c };
  }
  const s = String(ingredient || '');
  if (s.startsWith('#')) return { tag: strip(s.slice(1)), count: c };
  return { item: strip(s), count: c };
}

// Charge et indexe les recettes vanilla. On retient UNE recette par résultat
// (priorité crafting « directe » > smelting > stonecutting > smithing), suffisant
// pour développer un arbre de craft.
export function loadVanillaRecipes() {
  if (!_vanilla) {
    _vanilla = Promise.all([
      import('./recipes_vanilla.json').then((m) => m.default || m),
      import('./recipes_grids.json').then((m) => m.default || m).catch(() => ({})),
    ])
      .then(([data, grids]) => {
        const byResult = new Map();
        const put = (recipe) => {
          if (!byResult.has(recipe.resultId)) byResult.set(recipe.resultId, recipe);
        };
        // crafting : on préfère la recette « de base » (id == result, ex.
        // « acacia_planks ») aux variantes (« _from_… »).
        const crafting = [...(data.crafting || [])].sort((a, b) => {
          const ab = a.id === strip(a.result) ? 0 : 1;
          const bb = b.id === strip(b.result) ? 0 : 1;
          return ab - bb;
        });
        for (const r of crafting) {
          const resultId = strip(r.result);
          put({
            resultId,
            resultCount: Math.max(1, Number(r.count) || 1),
            type: 'crafting',
            source: 'vanilla',
            grid: grids[resultId] || [],
            ingredients: (r.ingredients || []).map((i) => normIngredient(i.ingredient, i.count)),
          });
        }
        for (const r of data.smelting || []) {
          put({
            resultId: strip(r.result), resultCount: 1, type: 'smelting', source: 'vanilla',
            ingredients: [normIngredient(r.ingredient, 1)],
          });
        }
        for (const r of data.stonecutting || []) {
          put({
            resultId: strip(r.result), resultCount: Math.max(1, Number(r.count) || 1),
            type: 'stonecutting', source: 'vanilla',
            ingredients: [normIngredient(r.ingredient, 1)],
          });
        }
        for (const r of data.smithing || []) {
          put({
            resultId: strip(r.result), resultCount: 1, type: 'smithing', source: 'vanilla',
            ingredients: [normIngredient(r.base, 1), normIngredient(r.addition, 1)],
          });
        }
        return byResult;
      })
      .catch(() => new Map());
  }
  return _vanilla;
}

/**
 * Construit la table « résultat → recette » combinée. Les recettes custom
 * (Minefield) ÉCRASENT la vanilla pour un même résultat. `customRecipes` est la
 * liste renvoyée par api.recipes.list() ({ resultId, resultCount, type,
 * ingredients:[{item,count}] }).
 */
export async function buildRecipeIndex(customRecipes = []) {
  const vanilla = await loadVanillaRecipes();
  const map = new Map(vanilla);
  for (const r of customRecipes || []) {
    map.set(r.resultId, {
      resultId: r.resultId,
      resultCount: Math.max(1, Number(r.resultCount) || 1),
      type: r.type || 'crafting',
      source: 'custom',
      grid: Array.isArray(r.grid) ? r.grid : [],
      ingredients: (r.ingredients || []).map((i) => normIngredient(i.item, i.count)),
    });
  }
  return map;
}

// Heuristiques de résolution des tags vanilla (#minecraft:<tag>) vers des ids
// concrets, faute de définitions de tags dans les données. On renvoie des
// candidats que l'appelant filtrera sur l'inventaire / fera choisir.
const TAG_SUFFIX = {
  planks: '_planks',
  logs: '_log',
  wooden_slabs: '_slab',
  wooden_pressure_plates: '_pressure_plate',
  wooden_buttons: '_button',
  wooden_doors: '_door',
  wooden_stairs: '_stairs',
  coals: null,        // cas spécial ci-dessous
  stone_crafting_materials: null,
};

/**
 * Renvoie la liste des ids de codex candidats pour un tag, restreinte à ceux
 * réellement connus (`codexIdSet`). `tag` est déjà sans namespace
 * (ex. « planks », « acacia_logs », « coals »).
 */
export function resolveTagCandidates(tag, codexIdSet) {
  const has = (id) => !codexIdSet || codexIdSet.has(id);
  const keep = (arr) => arr.filter(has);

  if (tag === 'coals') return keep(['coal', 'charcoal']);
  if (tag === 'stone_crafting_materials') return keep(['cobblestone', 'blackstone', 'cobbled_deepslate']);
  if (tag === 'planks') return keep([...codexIdSet].filter((id) => id.endsWith('_planks')));

  // Tag « <bois>_logs » (acacia_logs, crimson_stems…) → bûches/bois de ce type.
  const m = tag.match(/^(.+?)_(logs|stems)$/);
  if (m) {
    const w = m[1];
    return keep([`${w}_log`, `${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`,
      `${w}_stem`, `${w}_hyphae`, `stripped_${w}_stem`, `stripped_${w}_hyphae`]);
  }

  // Suffixe générique connu.
  const suf = TAG_SUFFIX[tag];
  if (suf) return keep([...codexIdSet].filter((id) => id.endsWith(suf)));

  // Repli : singularise et matche par sous-chaîne.
  const base = tag.replace(/s$/, '');
  return keep([...codexIdSet].filter((id) => id.includes(base)));
}

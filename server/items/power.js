// Calcul de puissance d'un item custom — fonctions PURES, sans base de données.
//
// Pourquoi un calcul plutôt qu'un tier saisi à la main : le tableur d'origine
// note le tier dans une colonne et les stats dans onze autres, sans lien entre
// les deux. Rien n'y empêche un « Commun » de sortir plus fort qu'un
// « Artefact » — et rien ne le SIGNALE. Ici la puissance est dérivée de ce que
// l'item fait vraiment, et le tier fournit un BUDGET auquel la comparer.
//
// Choix structurant : la rareté ne MULTIPLIE pas la puissance. Un multiplicateur
// « ×0,4 parce que c'est un Commun » écraserait précisément l'anomalie qu'on
// cherche à voir. Elle entre par `mf_item_tiers.budget` : ce qu'un item de ce
// palier est censé coûter. L'indice puissance/budget est le signal
// d'équilibrage, la puissance seule reste comparable d'un tier à l'autre.
//
// Les trois entrées voulues :
//   • le MATÉRIAU  → base = poids(famille) × coefficient(classe)
//   • les EFFETS   → Σ niveau × poids(enchantement)  (+ le drapeau Unbreakable)
//   • la RARETÉ    → budget du tier, hors du total (cf. ci-dessus)
//
// Tous les poids vivent en base (`mf_power_weights`) et sont éditables en
// ligne ; les valeurs ci-dessous ne sont que l'amorçage d'une base vierge.

// ── Référentiels ──────────────────────────────────────────────────────────

/** Les 11 attributs vanilla, dans l'ordre des colonnes du tableur d'origine. */
export const ATTRIBUTS = [
  { cle: 'MAX_HEALTH',           label: 'Points de vie',        nbt: 'generic.max_health',           unite: '½ cœur' },
  { cle: 'MAX_ABSORPTION',       label: 'Absorption',           nbt: 'generic.max_absorption',       unite: '½ cœur' },
  { cle: 'FOLLOW_RANGE',         label: 'Portée de détection',  nbt: 'generic.follow_range',         unite: 'bloc' },
  { cle: 'KNOCKBACK_RESISTANCE', label: 'Résistance au recul',  nbt: 'generic.knockback_resistance', unite: '0–1' },
  { cle: 'MOVEMENT_SPEED',       label: 'Vitesse',              nbt: 'generic.movement_speed',       unite: 'bloc/tick' },
  { cle: 'ATTACK_DAMAGE',        label: 'Dégâts',               nbt: 'generic.attack_damage',        unite: '½ cœur' },
  { cle: 'ARMOR',                label: 'Armure',               nbt: 'generic.armor',                unite: 'pt' },
  { cle: 'ARMOR_TOUGHNESS',      label: 'Robustesse',           nbt: 'generic.armor_toughness',      unite: 'pt' },
  { cle: 'ATTACK_KNOCKBACK',     label: 'Recul infligé',        nbt: 'generic.attack_knockback',     unite: 'pt' },
  { cle: 'ATTACK_SPEED',         label: "Vitesse d'attaque",    nbt: 'generic.attack_speed',         unite: 'atk/s' },
  { cle: 'LUCK',                 label: 'Chance',               nbt: 'generic.luck',                 unite: 'pt' },
];
export const ATTRIBUT_CLES = new Set(ATTRIBUTS.map((a) => a.cle));
const ATTRIBUT_PAR_CLE = new Map(ATTRIBUTS.map((a) => [a.cle, a]));
export const attributMeta = (cle) => ATTRIBUT_PAR_CLE.get(cle) || null;

/** Emplacements où un modificateur s'applique. `any` = tous (Slot omis). */
export const SLOTS = ['any', 'mainhand', 'offhand', 'head', 'chest', 'legs', 'feet'];
export const SLOT_LABELS = {
  any: 'Partout', mainhand: 'Main principale', offhand: 'Main secondaire',
  head: 'Tête', chest: 'Torse', legs: 'Jambes', feet: 'Pieds',
};

/**
 * Enchantements vanilla 1.18. La liste du document d'origine en oubliait six
 * (fire_protection, feather_falling, efficiency, fortune, silk_touch, flame) —
 * ils sont ici : un item custom peut parfaitement les porter, et un
 * enchantement absent de la liste serait un enchantement qu'aucun calcul ne
 * compte. `max` est le plafond vanilla, indicatif : /give ne s'en soucie pas et
 * les items custom le dépassent volontiers (Impaling X sur le trident).
 */
export const ENCHANTEMENTS = [
  { cle: 'aqua_affinity',        label: 'Affinité aquatique',      max: 1 },
  { cle: 'bane_of_arthropods',   label: 'Fléau des arthropodes',   max: 5 },
  { cle: 'blast_protection',     label: 'Protection explosions',   max: 4 },
  { cle: 'channeling',           label: 'Canalisation',            max: 1 },
  { cle: 'curse_of_binding',     label: 'Malédiction du lien',     max: 1 },
  { cle: 'curse_of_vanishing',   label: 'Malédiction de disparition', max: 1 },
  { cle: 'depth_strider',        label: 'Agilité aquatique',       max: 3 },
  { cle: 'efficiency',           label: 'Efficacité',              max: 5 },
  { cle: 'feather_falling',      label: 'Chute amortie',           max: 4 },
  { cle: 'fire_aspect',          label: 'Aura de feu',             max: 2 },
  { cle: 'fire_protection',      label: 'Protection feu',          max: 4 },
  { cle: 'flame',                label: 'Flamme',                  max: 1 },
  { cle: 'fortune',              label: 'Fortune',                 max: 3 },
  { cle: 'frost_walker',         label: 'Semelles givrantes',      max: 2 },
  { cle: 'impaling',             label: 'Empalement',              max: 5 },
  { cle: 'infinity',             label: 'Infinité',                max: 1 },
  { cle: 'knockback',            label: 'Recul',                   max: 2 },
  { cle: 'looting',              label: 'Butin',                   max: 3 },
  { cle: 'loyalty',              label: 'Loyauté',                 max: 3 },
  { cle: 'luck_of_the_sea',      label: 'Chance de la mer',        max: 3 },
  { cle: 'lure',                 label: 'Appât',                   max: 3 },
  { cle: 'mending',              label: 'Raccommodage',            max: 1 },
  { cle: 'multishot',            label: 'Tir multiple',            max: 1 },
  { cle: 'piercing',             label: 'Perforation',             max: 4 },
  { cle: 'power',                label: 'Puissance',               max: 5 },
  { cle: 'projectile_protection', label: 'Protection projectiles', max: 4 },
  { cle: 'protection',           label: 'Protection',              max: 4 },
  { cle: 'punch',                label: 'Frappe',                  max: 2 },
  { cle: 'quick_charge',         label: 'Charge rapide',           max: 3 },
  { cle: 'respiration',          label: 'Respiration',             max: 3 },
  { cle: 'riptide',              label: 'Impulsion',               max: 3 },
  { cle: 'sharpness',            label: 'Tranchant',               max: 5 },
  { cle: 'silk_touch',           label: 'Toucher de soie',         max: 1 },
  { cle: 'smite',                label: 'Châtiment',               max: 5 },
  { cle: 'soul_speed',           label: 'Vitesse des âmes',        max: 3 },
  { cle: 'sweeping_edge',        label: 'Affûtage',                max: 3 },
  { cle: 'swift_sneak',          label: 'Faufilage',               max: 3 },
  { cle: 'thorns',               label: 'Épines',                  max: 3 },
  { cle: 'unbreaking',           label: 'Solidité',                max: 3 },
];
export const ENCHANT_CLES = new Set(ENCHANTEMENTS.map((e) => e.cle));
const ENCHANT_PAR_CLE = new Map(ENCHANTEMENTS.map((e) => [e.cle, e]));
export const enchantMeta = (cle) => ENCHANT_PAR_CLE.get(cle) || null;

/** Familles de matériaux reconnues dans l'id de l'item de base. */
export const MATERIAUX = [
  ['netherite',  'Netherite'],
  ['obsidian',   'Obsidienne (MF)'],
  ['diamond',    'Diamant'],
  ['turtle',     'Écaille de tortue'],
  ['iron',       'Fer / acier'],
  ['chainmail',  'Mailles'],
  ['golden',     'Or'],
  ['gold',       'Or'],
  ['leather',    'Cuir'],
  ['stone',      'Pierre'],
  ['wooden',     'Bois'],
  ['wood',       'Bois'],
];

/** Classes d'objet reconnues dans l'id de l'item de base. */
export const CLASSES = [
  ['helmet',     'casque'],
  ['chestplate', 'plastron'],
  ['leggings',   'jambieres'],
  ['boots',      'bottes'],
  ['sword',      'epee'],
  ['axe',        'hache'],
  ['pickaxe',    'outil'],
  ['shovel',     'outil'],
  ['hoe',        'outil'],
  ['chisel',     'outil'],
  ['bow',        'arc'],
  ['crossbow',   'arc'],
  ['trident',    'trident'],
  ['harpoon',    'trident'],
  ['spear',      'trident'],
  ['shield',     'bouclier'],
  ['totem',      'artefact'],
  ['compass',    'artefact'],
];
export const CLASSE_LABELS = {
  casque: 'Casque', plastron: 'Plastron', jambieres: 'Jambières', bottes: 'Bottes',
  epee: 'Épée', hache: 'Hache', outil: 'Outil', arc: 'Arc', trident: 'Trident/lance',
  bouclier: 'Bouclier', artefact: 'Artefact', autre: 'Autre',
};

/**
 * Déduit famille de matériau et classe d'un id d'item de base
 * (`iron_sword`, `minefield:obsidian_chestplate`, `minecraft:turtle_helmet`).
 * Le namespace est ignoré : `minefield:` et `minecraft:` désignent les mêmes
 * matériaux, seul le nom porte l'information.
 */
export function materialOf(baseItem) {
  const id = String(baseItem || '').toLowerCase().replace(/^[a-z0-9_]+:/, '');
  const famille = MATERIAUX.find(([k]) => id.includes(k))?.[0] || 'autre';
  const classe = CLASSES.find(([k]) => id.includes(k))?.[1] || 'autre';
  // `gold`/`wood` sont des alias de saisie : un seul poids en base par famille.
  const canon = { gold: 'golden', wood: 'wooden' }[famille] || famille;
  return { famille: canon, classe };
}

// ── Barème par défaut ─────────────────────────────────────────────────────
//
// Étalonnage : 1 point de puissance ≈ 1/10 de point d'armure. Une pièce de
// diamant nue vaut ~40, une épée de fer ~22, et un artefact bien fourni tourne
// autour de 220 — d'où les budgets de tiers ci-dessous. Ces nombres n'ont pas
// vocation à être justes du premier coup : ils ont vocation à être VISIBLES et
// corrigés depuis l'onglet Barème quand un item sonne faux.

const attrPoids = {
  MAX_HEALTH: 6, MAX_ABSORPTION: 5, FOLLOW_RANGE: 0.2, KNOCKBACK_RESISTANCE: 40,
  MOVEMENT_SPEED: 300, ATTACK_DAMAGE: 12, ARMOR: 10, ARMOR_TOUGHNESS: 8,
  ATTACK_KNOCKBACK: 8, ATTACK_SPEED: 25, LUCK: 6,
};
// Valeur de base servant à convertir un pourcentage en unité plate :
// « MOVEMENT_SPEED −15 % » vaut −0,15 × 0,1 = −0,015 bloc/tick.
const attrReference = {
  MAX_HEALTH: 20, MAX_ABSORPTION: 4, FOLLOW_RANGE: 32, KNOCKBACK_RESISTANCE: 1,
  MOVEMENT_SPEED: 0.1, ATTACK_DAMAGE: 4, ARMOR: 8, ARMOR_TOUGHNESS: 2,
  ATTACK_KNOCKBACK: 1, ATTACK_SPEED: 4, LUCK: 1,
};
const enchantPoids = {
  aqua_affinity: 6, bane_of_arthropods: 5, blast_protection: 6, channeling: 8,
  curse_of_binding: -10, curse_of_vanishing: -8, depth_strider: 5, efficiency: 4,
  feather_falling: 5, fire_aspect: 6, fire_protection: 6, flame: 6, fortune: 8,
  frost_walker: 5, impaling: 6, infinity: 12, knockback: 5, looting: 8, loyalty: 4,
  luck_of_the_sea: 5, lure: 5, mending: 15, multishot: 8, piercing: 4, power: 7,
  projectile_protection: 6, protection: 8, punch: 5, quick_charge: 5, respiration: 4,
  riptide: 6, sharpness: 8, silk_touch: 10, smite: 5, soul_speed: 6, sweeping_edge: 5,
  swift_sneak: 4, thorns: 6, unbreaking: 5,
};
const materiauPoids = {
  netherite: 55, obsidian: 46, diamond: 40, turtle: 26, iron: 24, chainmail: 16,
  golden: 14, leather: 8, stone: 8, wooden: 4, autre: 10,
};
const classePoids = {
  casque: 0.55, plastron: 1, jambieres: 0.85, bottes: 0.5, epee: 0.9, hache: 0.9,
  outil: 0.4, arc: 0.7, trident: 1, bouclier: 0.6, artefact: 0.8, autre: 0.5,
};

/** Poids d'amorçage d'une base vierge, tels qu'ils entrent dans la table. */
export function defaultWeights() {
  const rows = [];
  for (const a of ATTRIBUTS) {
    rows.push({
      cle: `attribut:${a.cle}`, genre: 'attribut', poids: attrPoids[a.cle],
      reference: attrReference[a.cle],
      note: `${a.label} — points par ${a.unite}. Référence = valeur servant à convertir un %.`,
    });
  }
  for (const e of ENCHANTEMENTS) {
    rows.push({ cle: `enchant:${e.cle}`, genre: 'enchant', poids: enchantPoids[e.cle] ?? 5, reference: 1, note: `${e.label} — points par niveau.` });
  }
  for (const [cle, poids] of Object.entries(materiauPoids)) {
    rows.push({ cle: `materiau:${cle}`, genre: 'materiau', poids, reference: 1, note: 'Points de base du matériau, avant coefficient de classe.' });
  }
  for (const [cle, poids] of Object.entries(classePoids)) {
    rows.push({ cle: `classe:${cle}`, genre: 'classe', poids, reference: 1, note: 'Coefficient multipliant la base du matériau.' });
  }
  rows.push({ cle: 'reglage:unbreakable', genre: 'reglage', poids: 20, reference: 1, note: "Points ajoutés par le drapeau Unbreakable (item incassable)." });
  rows.push({ cle: 'reglage:tolerance', genre: 'reglage', poids: 0.25, reference: 1, note: "Écart au budget toléré avant alerte (0,25 = ±25 %)." });
  return rows;
}

// ── Le calcul ─────────────────────────────────────────────────────────────

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const round = (n) => Math.round(n * 100) / 100;
// Les valeurs converties depuis un pourcentage sont minuscules
// (MOVEMENT_SPEED −15 % = −0,015) : arrondies à 2 décimales, le détail affiché
// dirait « −0,01 × 300 = −3 » sous un total de −4,5. Six décimales suffisent à
// ce que la ligne se recalcule de tête sans mentir.
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** Lit un poids dans la Map du barème, avec repli sur le défaut du module. */
function weight(weights, cle, fallback = 0) {
  const row = weights instanceof Map ? weights.get(cle) : weights?.[cle];
  if (row && Number.isFinite(+row.poids)) return { poids: +row.poids, reference: Number.isFinite(+row.reference) ? +row.reference : 1 };
  return { poids: fallback, reference: 1 };
}

/**
 * Puissance d'un item et le DÉTAIL qui l'explique.
 *
 * @param item    { baseItem, attributs:[{attribut,valeur,mode}], enchantements:[{enchant,niveau}], unbreakable }
 * @param weights Map<cle, {poids, reference}> — le barème en base.
 * @param tiers   échelle complète (pour le budget du tier et la suggestion).
 * @param tierId  tier déclaré de l'item.
 * @returns { total, base, attributs, enchantements, lignes[], budget, indice, verdict, tierSuggere }
 *
 * Chaque ligne du détail porte son calcul en clair (« −15 % × 4 = −0,6 ×
 * 25 »), pour qu'un score contesté se vérifie sans lire ce fichier.
 */
export function computePower(item, weights, { tiers = [], tierId = null } = {}) {
  const lignes = [];

  // 1. Matériau — base = poids(famille) × coefficient(classe).
  const { famille, classe } = materialOf(item?.baseItem);
  const wMat = weight(weights, `materiau:${famille}`, materiauPoids[famille] ?? materiauPoids.autre);
  const wCls = weight(weights, `classe:${classe}`, classePoids[classe] ?? classePoids.autre);
  const base = wMat.poids * wCls.poids;
  lignes.push({
    genre: 'materiau',
    label: `Matériau — ${famille} / ${CLASSE_LABELS[classe] || classe}`,
    detail: `${round(wMat.poids)} × ${round(wCls.poids)}`,
    points: round(base),
  });

  // 2. Attributs — un pourcentage est d'abord ramené en unité plate.
  let attributs = 0;
  for (const a of item?.attributs || []) {
    const cle = String(a?.attribut || '');
    if (!ATTRIBUT_CLES.has(cle)) continue;
    const w = weight(weights, `attribut:${cle}`, attrPoids[cle] ?? 0);
    const ref = w.reference || attrReference[cle] || 1;
    const brut = num(a.valeur);
    const plat = a.mode === 'pourcent' ? (brut / 100) * ref : brut;
    const pts = plat * w.poids;
    attributs += pts;
    const meta = attributMeta(cle);
    lignes.push({
      genre: 'attribut',
      label: `${meta?.label || cle}${a.slot && a.slot !== 'any' ? ` (${SLOT_LABELS[a.slot] || a.slot})` : ''}`,
      detail: a.mode === 'pourcent'
        ? `${brut > 0 ? '+' : ''}${round(brut)} % × ${round6(ref)} = ${round6(plat)} × ${round(w.poids)}`
        : `${brut > 0 ? '+' : ''}${round6(brut)} × ${round(w.poids)}`,
      points: round(pts),
    });
  }

  // 3. Enchantements — niveau × poids. Les malédictions ont un poids négatif :
  //    elles retirent de la puissance, ce qui est bien ce qu'elles font.
  let enchantements = 0;
  for (const e of item?.enchantements || []) {
    const cle = String(e?.enchant || '');
    if (!ENCHANT_CLES.has(cle)) continue;
    const w = weight(weights, `enchant:${cle}`, enchantPoids[cle] ?? 5);
    const niveau = Math.trunc(num(e.niveau)) || 0;
    const pts = niveau * w.poids;
    enchantements += pts;
    lignes.push({
      genre: 'enchant',
      label: `${enchantMeta(cle)?.label || cle} ${niveau}`,
      detail: `${niveau} × ${round(w.poids)}`,
      points: round(pts),
    });
  }

  // 4. Incassable — un item qui ne s'use jamais vaut plus qu'un consommable.
  let bonus = 0;
  if (item?.unbreakable) {
    const w = weight(weights, 'reglage:unbreakable', 20);
    bonus = w.poids;
    lignes.push({ genre: 'reglage', label: 'Incassable', detail: 'forfait', points: round(bonus) });
  }

  const total = round(base + attributs + enchantements + bonus);

  // 5. Confrontation au budget du tier déclaré.
  const tier = tiers.find((t) => t.id === tierId) || null;
  const budget = tier && tier.budget > 0 ? tier.budget : null;
  const tol = weight(weights, 'reglage:tolerance', 0.25).poids;
  const indice = budget ? round(total / budget) : null;
  // Un item sans le moindre attribut ni enchantement n'est pas « sous-évalué » :
  // sa fiche n'a pas été remplie. Les deux se traitent autrement — l'un se
  // rééquilibre, l'autre se documente — donc ils ne partagent pas un verdict.
  const vide = (item?.attributs || []).length === 0 && (item?.enchantements || []).length === 0;
  let verdict = 'inconnu';
  if (vide) verdict = 'incomplet';
  else if (indice != null) {
    if (indice > 1 + tol) verdict = 'sur';
    else if (indice < 1 - tol) verdict = 'sous';
    else verdict = 'ok';
  }

  return {
    total,
    base: round(base),
    attributs: round(attributs),
    enchantements: round(enchantements),
    bonus: round(bonus),
    famille,
    classe,
    lignes,
    budget,
    indice,
    verdict,
    tolerance: tol,
    tierSuggere: suggestTier(total, tiers, tier?.echelle),
  };
}

/**
 * Tier dont le budget est le plus proche de la puissance, à échelle constante :
 * le serveur en fait coexister deux (Commun→Artefact, Banal→Légendaire) et
 * suggérer « Honorable » pour une épée de la guilde d'explorateurs n'aurait
 * aucun sens. Renvoie null si l'échelle n'a aucun budget renseigné.
 */
export function suggestTier(total, tiers = [], echelle = null) {
  const budgetes = tiers.filter((t) => t.budget > 0);
  // Sans tier déclaré, on ne connaît pas l'échelle : on prend « standard »
  // (celle par défaut en base) plutôt que de suggérer au hasard un palier des
  // Tréfonds pour une épée de la guilde d'explorateurs. Si elle est vide, on
  // élargit — mieux vaut une suggestion approximative que pas de suggestion.
  const voulue = echelle || 'standard';
  const pool = budgetes.filter((t) => t.echelle === voulue).length
    ? budgetes.filter((t) => t.echelle === voulue)
    : budgetes;
  if (pool.length === 0) return null;
  let best = null;
  for (const t of pool) {
    const ecart = Math.abs(total - t.budget);
    if (!best || ecart < best.ecart) best = { tier: t, ecart };
  }
  return best ? { id: best.tier.id, nom: best.tier.nom, budget: best.tier.budget } : null;
}

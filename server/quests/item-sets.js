// Sets d'items uniques (« Il existe 6 sets de joyaux, plus le set contient de
// joyaux plus il est précieux ! » — le livre in-game). Un set est une COLLECTION
// attendue : son nom, sa couleur, et le nombre de pièces qu'il compte en jeu.
// L'appartenance vit sur l'item (`quest_custom_items.set_id`), la taille sur le
// set — de quoi afficher « 3/5 documentés » sans rien ressaisir.
//
// Ce module est PUR (aucun accès base) : il est importé par le seed ET par
// db.js, qui ne peut pas dépendre d'un module qui l'importerait en retour.

/**
 * Les 6 sets du livre. `taille` = nombre de joyaux du set en jeu,
 * `motif` = le mot de couleur tel qu'il apparaît dans le lore déjà saisi
 * (« Fait partie du set des joyaux bleus »), au singulier et sans accent.
 */
export const GEM_SETS = [
  { slug: 'joyaux-verts', nom: 'Joyaux verts', couleur: '#7be3a8', taille: 2, motif: 'vert' },
  { slug: 'joyaux-jaunes', nom: 'Joyaux jaunes', couleur: '#e8c86a', taille: 3, motif: 'jaune' },
  { slug: 'joyaux-violets', nom: 'Joyaux violets', couleur: '#b79bff', taille: 4, motif: 'violet' },
  { slug: 'joyaux-blancs', nom: 'Joyaux blancs', couleur: '#e8e4f8', taille: 5, motif: 'blanc' },
  { slug: 'joyaux-bleus', nom: 'Joyaux bleus', couleur: '#7bd3e8', taille: 5, motif: 'bleu' },
  { slug: 'joyaux-legendaires', nom: 'Joyaux légendaires', couleur: '#ff9f43', taille: 5, motif: 'legendaire' },
];

const sansAccent = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

/**
 * Devine le set d'un item à partir de son lore : les fiches disent déjà
 * « Fait partie du set des joyaux bleus ». Le pluriel est optionnel (le lore
 * écrit tantôt « joyaux blanc », tantôt « joyaux blancs »), la ponctuation qui
 * suit est ignorée.
 *
 * Renvoie le `slug` du set, ou null quand le lore ne désigne aucun set — un
 * joyau isolé (« le seul joyau rouge ») n'en a pas, et ne doit pas en recevoir.
 */
export function setSlugFromLore(lore) {
  // Lecture mot à mot plutôt qu'une expression régulière à trous : « set »,
  // « de/des » et le pluriel sont tous optionnels dans le lore, et un motif qui
  // les rend tous facultatifs devient coûteux à faire retracer au moteur.
  const mots = sansAccent(lore).split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < mots.length; i += 1) {
    if (mots[i] !== 'joyau' && mots[i] !== 'joyaux') continue;
    // Le mot « set » doit précéder (à un « de / des » près) : sans lui,
    // « le seul joyau rouge » désignerait un set qui n'existe pas.
    const avant = mots.slice(Math.max(0, i - 2), i);
    if (!avant.includes('set') && !avant.includes('sets')) continue;
    const couleur = (mots[i + 1] || '').replace(/s$/, '');
    const trouve = GEM_SETS.find((set) => set.motif === couleur);
    if (trouve) return trouve.slug;
  }
  return null;
}

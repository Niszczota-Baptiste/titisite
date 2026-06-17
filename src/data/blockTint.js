// Teinte par biome des blocs dans le rendu 3D. RÈGLE : aucune teinte par défaut.
// Un « tintindex » sur une face ne suffit PAS (beaucoup de blocs custom en ont un
// parasite) — on ne teinte QUE si l'id du bloc est dans cette liste blanche, et
// seulement les faces qui portent « tintindex ». Pour teinter un bloc custom, on
// l'ajoute ici explicitement.

const FOLIAGE = 0x48b518;
const GRASS = 0x7cbd6b;
const WATER = 0x3f76e4;

const TINT_BY_ID = {
  // Feuillages
  oak_leaves: FOLIAGE, spruce_leaves: FOLIAGE, birch_leaves: FOLIAGE,
  jungle_leaves: FOLIAGE, acacia_leaves: FOLIAGE, dark_oak_leaves: FOLIAGE,
  mangrove_leaves: FOLIAGE, vine: FOLIAGE,
  // Herbe / végétaux
  grass_block: GRASS, grass: GRASS, tall_grass: GRASS, fern: GRASS,
  large_fern: GRASS, sugar_cane: GRASS, lily_pad: GRASS,
  // Eau
  water: WATER, bubble_column: WATER, water_cauldron: WATER,
};

// Renvoie la couleur de teinte (nombre hex) d'un bloc s'il est dans la liste
// blanche, sinon null (→ texture inchangée). Accepte « ns:id » ou « id ».
export function tintColor(blockId) {
  if (!blockId) return null;
  const id = blockId.includes(':') ? blockId.slice(blockId.indexOf(':') + 1) : blockId;
  return TINT_BY_ID[id] ?? null;
}

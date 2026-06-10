// Shared vocabulary of the 3D world map. The biome/building keys are
// allowlisted server-side (server/routes/writing-admin.js) — keep both in sync.
// No three.js import here: this module is safe to load eagerly (the heavy 3D
// scene itself is lazy-loaded behind ./Scene.jsx).

export const BIOMES = {
  plaines: {
    label: 'Plaines', ground: '#2e5d43', groundEdge: '#21453266', water: '#143c4e',
    decor: 'arbre', decorColor: '#3a7d54', fog: '#0a0618', sun: '#ffe9c4', lava: false,
  },
  foret: {
    label: 'Forêt', ground: '#1f4434', groundEdge: '#152e2466', water: '#103340',
    decor: 'sapin', decorColor: '#2c5e45', fog: '#070d14', sun: '#cfe8d4', lava: false,
  },
  desert: {
    label: 'Désert', ground: '#9a7549', groundEdge: '#6f523666', water: '#1d5a66',
    decor: 'cactus', decorColor: '#4f7d52', fog: '#160e10', sun: '#ffd9a0', lava: false,
  },
  ocean: {
    label: 'Océan', ground: '#3f7268', groundEdge: '#2c504966', water: '#155a72',
    decor: 'rocher', decorColor: '#5d8a83', fog: '#06101c', sun: '#cfe6ff', lava: false,
  },
  neige: {
    label: 'Neige', ground: '#9fb4cc', groundEdge: '#74899f66', water: '#2a4f6e',
    decor: 'sapin', decorColor: '#6e8aa6', fog: '#0a0e1c', sun: '#e8f0ff', lava: false,
  },
  volcan: {
    label: 'Volcan', ground: '#4a3138', groundEdge: '#33222866', water: '#9b2c12',
    decor: 'rocher', decorColor: '#5c4046', fog: '#140608', sun: '#ff9a5a', lava: true,
  },
};

export const BIOME_OPTIONS = Object.entries(BIOMES).map(([value, b]) => ({ value, label: b.label }));

export const BUILDINGS = [
  { value: 'tour', label: 'Tour' },
  { value: 'maison', label: 'Maison' },
  { value: 'donjon', label: 'Donjon' },
  { value: 'temple', label: 'Temple' },
  { value: 'cristal', label: 'Cristal' },
  { value: 'arbre', label: 'Grand arbre' },
  { value: 'ruine', label: 'Ruine' },
  { value: 'phare', label: 'Phare' },
  { value: 'tente', label: 'Campement' },
  { value: 'monolithe', label: 'Monolithe' },
];

export const ZONE_KINDS = [
  { value: 'work', label: 'Contenu (livre, lettre, lieu…)' },
  { value: 'character', label: 'Personnage' },
  { value: 'glossary', label: 'Terme du lexique' },
  { value: 'libre', label: 'Zone libre' },
];

// Usable placement radius (the island plateau is a touch wider).
export const MAP_RADIUS = 20;

// Deterministic PRNG so the decorative scatter is stable between renders.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

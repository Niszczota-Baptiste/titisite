// Shared vocabulary of the voxel world map. The biome/building keys are
// allowlisted server-side (server/routes/writing-admin.js) — keep both in sync.
// No three.js import here: this module is safe to load eagerly (the heavy 3D
// scene itself is lazy-loaded behind ./Scene.jsx) and also feeds the 2D map.

// Voxel palettes: `top` is the block top face, `side` the exposed flanks,
// `decor` the vegetation/props kind scattered on the biome, `density` its
// 0..1 probability per cell. Custom biomes can be declared per-project in
// terrain JSON ({ "biomes": { "mien": { top, side, decor, density } } }) —
// the engine merges them over these defaults, so adding a biome never
// requires touching the engine.
// Biome palette modeled on Minecraft's Overworld + a few Nether/End biomes
// for supernatural regions. Legacy keys (montagne, marais, neige, ocean,
// volcan, toundra…) are kept so existing terrains keep rendering.
export const BIOMES = {
  // ── Overworld ──
  plaines:    { label: 'Plaines', top: '#8ab94f', side: '#7a6248', decor: 'herbe', density: 0.05 },
  tournesols: { label: 'Plaines de tournesols', top: '#8fbc4e', side: '#7a6248', decor: 'fleurs', density: 0.3 },
  foret:      { label: 'Forêt', top: '#5d9a44', side: '#6e5840', decor: 'arbre', density: 0.18 },
  bouleaux:   { label: 'Forêt de bouleaux', top: '#77ab5a', side: '#6e5840', decor: 'bouleau', density: 0.16 },
  foret_sombre: { label: 'Forêt sombre', top: '#3c6e2c', side: '#54422f', decor: 'arbre', density: 0.3 },
  cerisiers:  { label: 'Bosquet de cerisiers', top: '#9fc77f', side: '#7a6248', decor: 'cerisier', density: 0.14 },
  jungle:     { label: 'Jungle', top: '#2c8a2c', side: '#5a4a30', decor: 'jungle', density: 0.24 },
  bambou:     { label: 'Jungle de bambous', top: '#5da348', side: '#6e5840', decor: 'bambou', density: 0.3 },
  taiga:      { label: 'Taïga', top: '#4a7a52', side: '#6e5840', decor: 'sapin', density: 0.2 },
  taiga_enneigee: { label: 'Taïga enneigée', top: '#9db8a4', side: '#7d7565', decor: 'sapin', density: 0.15 },
  neige:      { label: 'Plaines enneigées', top: '#e8edf2', side: '#9aa4b5', decor: 'sapin', density: 0.04 },
  pics_geles: { label: 'Pics gelés', top: '#cfe0f0', side: '#9aa4b5', decor: 'pic_glace', density: 0.08 },
  montagne:   { label: 'Montagnes (pics rocheux)', top: '#8a8d96', side: '#7b7d85', decor: 'rocher', density: 0.05 },
  collines:   { label: 'Collines balayées', top: '#6f8a66', side: '#7b7d85', decor: 'rocher', density: 0.08 },
  savane:     { label: 'Savane', top: '#b8ab5e', side: '#9a7a4a', decor: 'acacia', density: 0.06 },
  desert:     { label: 'Désert', top: '#d8c084', side: '#b09159', decor: 'cactus', density: 0.04 },
  badlands:   { label: 'Badlands', top: '#c0683a', side: '#984e2c', decor: 'rocher', density: 0.03 },
  marais:     { label: 'Marais', top: '#5e7045', side: '#565040', decor: 'roseau', density: 0.12 },
  mangrove:   { label: 'Marais de mangroves', top: '#4c6e3a', side: '#4a3e2c', decor: 'arbre', density: 0.22 },
  champignons: { label: 'Champs de champignons', top: '#8a7a8a', side: '#6e5e6e', decor: 'champignon', density: 0.12 },
  plage:      { label: 'Plage', top: '#d8c084', side: '#b09159', decor: 'none', density: 0 },
  ocean:      { label: 'Océan (rives)', top: '#d8c084', side: '#b09159', decor: 'palmier', density: 0.05 },
  toundra:    { label: 'Toundra', top: '#9aa68f', side: '#7d7565', decor: 'rocher', density: 0.04 },
  // ── Nether / End ──
  neant:      { label: 'Néant (Nether)', top: '#7a3a34', side: '#5a2a26', decor: 'rocher', density: 0.06 },
  foret_pourpre: { label: 'Forêt pourpre', top: '#7a2438', side: '#5a1c2c', decor: 'champignon', density: 0.18 },
  foret_biscornue: { label: 'Forêt biscornue', top: '#2c7a6e', side: '#1e564e', decor: 'champignon', density: 0.18 },
  vallee_ames: { label: 'Vallée de sable des âmes', top: '#5a4a3c', side: '#473a30', decor: 'none', density: 0 },
  basalte:    { label: 'Deltas de basalte', top: '#4a4a52', side: '#3a3a42', decor: 'rocher', density: 0.1 },
  end:        { label: "L'End", top: '#d8d0a8', side: '#b8b088', decor: 'chorus', density: 0.08 },
  volcan:     { label: 'Volcan', top: '#4a3a3e', side: '#4a3c40', decor: 'rocher', density: 0.06 },
};

export const BIOME_OPTIONS = Object.entries(BIOMES).map(([value, b]) => ({ value, label: b.label }));

// Ambience (lighting / sky / water) — day & night variants for the optional
// day-night toggle. Water tint can be overridden per terrain ("waterColor").
export const AMBIANCES = {
  nuit: {
    sky: '#0d0a20', fog: '#0d0a20', sun: '#d8dcff', sunIntensity: 2.6,
    hemi: 1.5, water: '#2a6285', stars: true,
  },
  jour: {
    sky: '#9fc6e8', fog: '#b7d5ea', sun: '#fff3da', sunIntensity: 3.4,
    hemi: 1.7, water: '#2e7da8', stars: false,
  },
};

export const BUILDINGS = [
  { value: 'pagode', label: 'Pagode' },
  { value: 'hanok', label: 'Hanok' },
  { value: 'pavillon', label: 'Pavillon rouge' },
  { value: 'porte', label: 'Porte de pierre' },
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

// 2D markers for the giant world maps. `tier` drives size + label visibility:
// 3 = always labeled (kingdoms/capitals), 2 = labeled when zoomed, 1 = hover.
export const MARKERS = [
  { value: 'royaume', label: 'Royaume', icon: '👑', tier: 3 },
  { value: 'capitale', label: 'Capitale', icon: '🏰', tier: 3 },
  { value: 'cite', label: 'Cité', icon: '🏛️', tier: 2 },
  { value: 'village', label: 'Village', icon: '🏘️', tier: 1 },
  { value: 'forteresse', label: 'Forteresse', icon: '🗼', tier: 2 },
  { value: 'temple', label: 'Temple', icon: '⛩️', tier: 1 },
  { value: 'port', label: 'Port', icon: '⚓', tier: 1 },
  { value: 'ruine', label: 'Ruine', icon: '🏚️', tier: 1 },
  { value: 'antre', label: 'Antre', icon: '💀', tier: 1 },
  { value: 'montagne', label: 'Montagne', icon: '⛰️', tier: 1 },
  { value: 'foret', label: 'Forêt', icon: '🌲', tier: 1 },
  { value: 'ile', label: 'Île', icon: '🏝️', tier: 1 },
  { value: 'personnage', label: 'Personnage', icon: '👤', tier: 1 },
  { value: 'livre', label: 'Récit', icon: '📖', tier: 1 },
  { value: 'lieu', label: 'Lieu', icon: '✦', tier: 1 },
  { value: 'etiquette', label: 'Nom géographique (texte seul)', icon: '𝐀', tier: 2 },
];
export const MARKER_BY_KEY = Object.fromEntries(MARKERS.map((m) => [m.value, m]));

export const DECOR_KINDS = [
  'herbe', 'fleurs', 'arbre', 'bouleau', 'cerisier', 'sapin', 'jungle', 'acacia',
  'cactus', 'rocher', 'roseau', 'palmier', 'bambou', 'champignon', 'pic_glace', 'chorus', 'none',
];

export const ZONE_KINDS = [
  { value: 'work', label: 'Contenu (livre, lettre, lieu…)' },
  { value: 'character', label: 'Personnage' },
  { value: 'glossary', label: 'Terme du lexique' },
  { value: 'libre', label: 'Zone libre' },
];

// Usable placement radius in world units (1 unit = 1 block) for the default
// map size; bigger maps allow proportionally more (see terrain.js).
export const MAP_RADIUS = 20;

export const MAP_SHAPES = [
  { value: 'ile', label: 'Île ronde' },
  { value: 'continent', label: 'Continent (côtes irrégulières)' },
  { value: 'carre', label: 'Carré' },
];

export const MAP_SIZES = [
  { value: 40, label: 'Petite (40)' },
  { value: 48, label: 'Normale (48)' },
  { value: 64, label: 'Grande (64)' },
  { value: 80, label: 'Très grande (80)' },
];

// Example terrain inserted by the admin JSON tab: a square forest world with
// winding violet rivers, flower clearings and a lordly mountain to the east —
// modeled after the user's Minecraft survey map. Demonstrates shape/size,
// waterColor and per-project custom biomes.
export const TERRAIN_TEMPLATE = {
  shape: 'carre',
  size: 64,
  seed: 23,
  waterLevel: 1,
  waterColor: '#7263d8',
  baseBiome: 'foret',
  biomes: {
    sombre: { label: 'Forêt sombre', top: '#2f6038', side: '#54422f', decor: 'arbre', density: 0.24 },
    clairiere: { label: 'Clairière fleurie', top: '#4f8a4f', side: '#5d4a39', decor: 'fleurs', density: 0.35 },
  },
  regions: [
    { biome: 'montagne', cx: 18, cz: 13, r: 12, height: 6, relief: 2.5 },
    { biome: 'bambou', cx: -2, cz: 26, r: 9, height: 0.6, relief: 0.4 },
    { biome: 'sombre', cx: -22, cz: -18, r: 9, height: 1, relief: 0.8 },
    { biome: 'sombre', cx: 6, cz: -24, r: 8, height: 0.8, relief: 0.6 },
    { biome: 'sombre', cx: -2, cz: 14, r: 9, height: 0.8, relief: 0.6 },
    { biome: 'sombre', cx: 24, cz: -12, r: 7, height: 0.6, relief: 0.5 },
    { biome: 'clairiere', cx: -28, cz: 8, r: 6, height: 0.3, relief: 0.3 },
    { biome: 'clairiere', cx: 12, cz: 28, r: 7, height: 0.3, relief: 0.3 },
    { biome: 'clairiere', cx: 28, cz: -26, r: 5, height: 0.3, relief: 0.3 },
  ],
  rivers: [
    { points: [[-13, -32], [-15, -24], [-11, -17], [-13, -10], [-11, -7]], width: 1.3 },
    { points: [[-11, -7], [-14, 0], [-18, 5], [-17, 12], [-19, 22], [-18, 32]], width: 1.3 },
    { points: [[-30, -14], [-26, -6], [-21, 2], [-18, 5]], width: 1.1 },
    { points: [[-11, -7], [-5, -4], [1, -6], [6, -3]], width: 1.0 },
  ],
  lakes: [
    { cx: -11, cz: -8, r: 4.5 },
    { cx: -19, cz: 6, r: 3 },
    { cx: -28, cz: -22, r: 3 },
  ],
  forests: [{ cx: 0, cz: 0, r: 34, density: 0.12 }],
  paths: [],
};

// Normalize a free-form terrain JSON (admin-edited) into safe, clamped data.
// Unknown fields are dropped, every number is bounded — the engine never has
// to trust the input.
export function normalizeTerrain(raw, baseBiome, { world = false } = {}) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const maxSize = world ? 1280 : 88;
  const defSize = world ? 256 : 48;
  const num = (v, min, max, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
  };
  const customBiomes = {};
  if (t.biomes && typeof t.biomes === 'object') {
    for (const [key, b] of Object.entries(t.biomes)) {
      if (!b || typeof b !== 'object') continue;
      const hex = (v, fb) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fb);
      customBiomes[String(key).slice(0, 24)] = {
        label: String(b.label || key).slice(0, 30),
        top: hex(b.top, '#4f8a4f'),
        side: hex(b.side, '#7a6248'),
        decor: DECOR_KINDS.includes(b.decor) ? b.decor : 'herbe',
        density: num(b.density, 0, 0.5, 0.06),
      };
    }
  }
  const biomes = { ...BIOMES, ...customBiomes };
  const biomeKey = (v) => (biomes[v] ? v : (biomes[baseBiome] ? baseBiome : 'plaines'));
  const size = Math.min(maxSize, Math.max(32, Math.round(num(t.size, 32, maxSize, defSize) / 2) * 2));
  const half = size / 2;
  const pts = (v) => (Array.isArray(v) ? v.slice(0, 60).map((p) => [
    num(p?.[0], -half - 4, half + 4, 0), num(p?.[1], -half - 4, half + 4, 0),
  ]) : []);
  const area = (a) => ({
    cx: num(a?.cx, -half, half, 0), cz: num(a?.cz, -half, half, 0),
    r: num(a?.r, 1, size, 5),
  });
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

  // Hand-painted grid layer (written by the admin brush editor). When present
  // it replaces the generated relief; strings are decoded lazily in terrain.js.
  let grid = null;
  if (t.grid && typeof t.grid === 'object'
    && Array.isArray(t.grid.heights) && t.grid.heights.every((r) => typeof r === 'string')
    && t.grid.biomes && Array.isArray(t.grid.biomes.palette) && Array.isArray(t.grid.biomes.cells)) {
    const gsize = Math.min(maxSize, Math.max(32, Math.round(Number(t.grid.size) || defSize)));
    grid = {
      size: gsize,
      rle: t.grid.rle === true,
      heights: t.grid.heights.slice(0, gsize).map((r) => String(r)),
      palette: t.grid.biomes.palette.slice(0, 36).map((k) => String(k).slice(0, 24)),
      cells: t.grid.biomes.cells.slice(0, gsize).map((r) => String(r)),
    };
  }

  return {
    seed: num(t.seed, 0, 2 ** 31, 7),
    blocksPerCell: [8, 16, 32].includes(Number(t.blocksPerCell)) ? Number(t.blocksPerCell) : 16,
    size: grid ? grid.size : size,
    shape: ['ile', 'continent', 'carre'].includes(t.shape) ? t.shape : 'ile',
    grid,
    waterLevel: num(t.waterLevel, 0, 5, 1),
    waterColor: /^#[0-9a-f]{6}$/i.test(String(t.waterColor || '')) ? t.waterColor : null,
    baseBiome: biomeKey(t.baseBiome || baseBiome),
    biomes,
    regions: list(t.regions, 24).map((r) => ({
      ...area(r), biome: biomeKey(r?.biome),
      height: num(r?.height, 0, 10, 2), relief: num(r?.relief, 0, 6, 1),
      name: String(r?.name || '').slice(0, 40),
    })),
    rivers: list(t.rivers, 12).map((r) => ({ points: pts(r?.points), width: num(r?.width, 0.5, 4, 1.2) })),
    lakes: list(t.lakes, 12).map(area),
    forests: list(t.forests, 12).map((f) => ({ ...area(f), density: num(f?.density, 0, 0.6, 0.25) })),
    paths: list(t.paths, 16).map((p) => ({ points: pts(p?.points) })),
  };
}

// Deterministic PRNG so terrain and scatter are stable between renders.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

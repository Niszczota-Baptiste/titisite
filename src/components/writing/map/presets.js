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
export const BIOMES = {
  plaines:  { label: 'Plaines',  top: '#4f8a4f', side: '#7a6248', decor: 'herbe',  density: 0.05 },
  foret:    { label: 'Forêt',    top: '#3a7a48', side: '#6e5840', decor: 'arbre',  density: 0.16 },
  montagne: { label: 'Montagne', top: '#8a8d96', side: '#7b7d85', decor: 'rocher', density: 0.05 },
  desert:   { label: 'Désert',   top: '#d8c084', side: '#b09159', decor: 'cactus', density: 0.04 },
  marais:   { label: 'Marais',   top: '#5e7045', side: '#565040', decor: 'roseau', density: 0.12 },
  toundra:  { label: 'Toundra',  top: '#9aa68f', side: '#7d7565', decor: 'rocher', density: 0.04 },
  neige:    { label: 'Neige',    top: '#e8edf2', side: '#9aa4b5', decor: 'sapin',  density: 0.08 },
  ocean:    { label: 'Océan',    top: '#d8c084', side: '#b09159', decor: 'palmier', density: 0.05 },
  volcan:   { label: 'Volcan',   top: '#4a3a3e', side: '#4a3c40', decor: 'rocher', density: 0.06 },
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

// Default terrain when the project hasn't defined one yet: a soft island of
// the base biome with a couple of relief bumps. Shown in the admin editor as
// the starting template.
export const TERRAIN_TEMPLATE = {
  seed: 7,
  waterLevel: 1,
  regions: [
    { biome: 'foret', cx: -8, cz: -6, r: 10, height: 3, relief: 1.5 },
    { biome: 'montagne', cx: 10, cz: -10, r: 8, height: 6, relief: 3 },
    { biome: 'plaines', cx: 4, cz: 8, r: 12, height: 2, relief: 1 },
  ],
  rivers: [{ points: [[10, -18], [6, -6], [0, 2], [-4, 12], [-6, 20]], width: 1.4 }],
  lakes: [{ cx: -12, cz: 8, r: 4 }],
  forests: [{ cx: -8, cz: -6, r: 7, density: 0.3 }],
  paths: [],
};

// Normalize a free-form terrain JSON (admin-edited) into safe, clamped data.
// Unknown fields are dropped, every number is bounded — the engine never has
// to trust the input.
export function normalizeTerrain(raw, baseBiome) {
  const t = raw && typeof raw === 'object' ? raw : {};
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
        decor: ['herbe', 'arbre', 'sapin', 'cactus', 'rocher', 'roseau', 'palmier', 'bambou', 'none'].includes(b.decor) ? b.decor : 'herbe',
        density: num(b.density, 0, 0.5, 0.06),
      };
    }
  }
  const biomes = { ...BIOMES, ...customBiomes };
  const biomeKey = (v) => (biomes[v] ? v : (biomes[baseBiome] ? baseBiome : 'plaines'));
  const size = Math.min(88, Math.max(32, Math.round(num(t.size, 32, 88, 48) / 2) * 2));
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
    const gsize = Math.min(88, Math.max(32, Math.round(Number(t.grid.size) || 48)));
    grid = {
      size: gsize,
      heights: t.grid.heights.slice(0, gsize).map((r) => String(r).slice(0, gsize)),
      palette: t.grid.biomes.palette.slice(0, 36).map((k) => String(k).slice(0, 24)),
      cells: t.grid.biomes.cells.slice(0, gsize).map((r) => String(r).slice(0, gsize)),
    };
  }

  return {
    seed: num(t.seed, 0, 2 ** 31, 7),
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

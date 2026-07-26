// Palette locale de l'atelier « Salle des coffres » — même approche que
// components/quests/theme.js : le module a son accent (l'or des coffres) sur le
// fond violet du site.

export const BG = '#070512';
export const INK = '#ede8f8';
export const MUTED = 'rgba(180,170,200,0.6)';
export const ACC = '#c9a8e8';
export const ACC_RGB = '201,168,232';
export const GOLD = '#e8c86a';
export const GOLD_RGB = '232,200,106';

// Couleurs fonctionnelles du plan (aucune décoration : tout ce qui est dessiné
// a un rôle — circulation, coffre, zone, entrée).
export const GRID = 'rgba(120,100,170,0.16)';
export const GRID_STRONG = 'rgba(150,130,200,0.34)';
export const CHUNK = 'rgba(232,200,106,0.26)';
export const CHEST = '#e8c86a';
export const CHEST_DIM = 'rgba(232,200,106,0.28)';
export const CORRIDOR = 'rgba(123,211,232,0.30)';
export const CORRIDOR_LINE = '#7bd3e8';
export const STAIR = '#9ad4ae';
export const ENTRY = '#e0526f';

export const LEVELS = {
  ok:   { color: '#9ad4ae', label: '< 80 %' },
  warn: { color: '#e8c86a', label: '80–100 %' },
  over: { color: '#ff8a9b', label: '> 100 %' },
};

export const panel = {
  background: 'rgba(14,9,28,0.72)',
  border: '1px solid rgba(80,50,130,0.24)',
  borderRadius: 12,
  padding: 14,
};

export const title = {
  fontFamily: "'Space Grotesk',sans-serif",
  fontWeight: 700,
  color: INK,
  letterSpacing: '-0.3px',
};

export const mono = { fontFamily: "'JetBrains Mono',monospace" };
export const body = { fontFamily: "'Inter',sans-serif" };

export const ZONE_PALETTE = [
  '#b02e2e', '#e8a87c', '#9ad4ae', '#7bd3e8', '#c9a8e8',
  '#e88cb8', '#e8c86a', '#94a3b8', '#b779e0', '#4dd9ac',
];

export const FLOOR_PALETTE = [
  '#c8a24a', '#c9a8e8', '#7bd3e8', '#9ad4ae', '#e88cb8', '#e0526f',
];

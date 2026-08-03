// Langage visuel du module Lore. Même grammaire que le module quêtes
// (src/components/quests/theme.js) mais accent jade — c'est une salle
// d'enquête, pas un journal de quêtes.

export const ACC = '#7be3a8';
export const ACC_RGB = '123,227,168';
export const GOLD = '#e8c86a';
export const CRIMSON = '#e0526f';
export const INK = '#ede8f8';
export const MUTED = 'rgba(180,170,200,0.62)';

export const panel = {
  background: 'rgba(9,16,14,0.72)',
  border: '1px solid rgba(60,130,90,0.24)',
  borderRadius: 12,
};

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return ACC_RGB;
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

// Types d'entrée. Pour en ajouter un : ici ET dans ENTRY_TYPES
// (server/lore/enums.js) — pas de contrainte en base.
export const ENTRY_TYPES = {
  structure:   { label: 'Structure',   icon: '🏛️', color: '#e8c86a' },
  texte:       { label: 'Texte',       icon: '📜', color: '#c9a8e8' },
  mecanisme:   { label: 'Mécanisme',   icon: '⚙️', color: '#7bd3e8' },
  observation: { label: 'Observation', icon: '👁️', color: '#7be3a8' },
  pnj:         { label: 'PNJ',         icon: '🧑‍🌾', color: '#e0913a' },
  evenement:   { label: 'Événement',   icon: '⚡', color: '#e0526f' },
  objet:       { label: 'Objet',       icon: '📦', color: '#b79bff' },
};
export const ENTRY_TYPE_ORDER = [
  'structure', 'texte', 'mecanisme', 'observation', 'pnj', 'evenement', 'objet',
];

export const DIMENSIONS = {
  overworld: { label: 'Overworld', icon: '🌍' },
  nether:    { label: 'Nether',    icon: '🔥' },
  end:       { label: 'End',       icon: '🌌' },
};
export const DIMENSION_ORDER = ['overworld', 'nether', 'end'];

// Les mondes couverts par l'enquête, chacun avec ses trois dimensions. En
// ajouter un : ici ET dans MONDES (server/lore/enums.js).
export const MONDES = {
  nostra: { label: 'Nostra', icon: '🗺️', color: GOLD },
  novum:  { label: 'Novum',  icon: '✦',  color: '#7bd3e8' },
};
export const MONDE_ORDER = ['nostra', 'novum'];

// Grille des cartes Minecraft niveau 0 : 128×128 blocs. Un joueur posé en
// (0,0) est au CENTRE de sa carte, donc la tuile (i, j) couvre
// [i·128-64, i·128+64) × [j·128-64, j·128+64) — le décalage de -64 est ce qui
// fait coïncider la grille avec les cartes réelles du jeu.
export const TILE_SIZE = 128;
export const TILE_OFFSET = -64;

// Relations entre entrées (miroir de RELATION_TYPES côté serveur).
// `reverse` sert aux liens entrants : « X pointe vers cette entrée ».
export const RELATIONS = {
  same_system: { label: 'même système que',  reverse: 'même système que' },
  points_to:   { label: 'pointe vers',       reverse: 'pointé par' },
  contradicts: { label: 'contredit',         reverse: 'contredit par' },
  variant_of:  { label: 'variante de',       reverse: 'a pour variante' },
  located_in:  { label: 'situé dans',        reverse: 'contient' },
};

// Statuts d'hypothèse — l'axe épistémique du module : le statut se voit
// toujours, une piste morte reste une piste.
export const STATUSES = {
  open:      { label: 'Ouverte',    icon: '🟢', color: '#7bd3e8' },
  testing:   { label: 'En test',    icon: '🧪', color: GOLD },
  confirmed: { label: 'Confirmée',  icon: '✅', color: ACC },
  refuted:   { label: 'Réfutée',    icon: '❌', color: CRIMSON },
  abandoned: { label: 'Abandonnée', icon: '🪦', color: '#8a80a0' },
};
export const STATUS_ORDER = ['open', 'testing', 'confirmed', 'refuted', 'abandoned'];

export const STANCES = {
  supports:    { label: 'soutient',  icon: '✔', color: ACC },
  contradicts: { label: 'contredit', icon: '✘', color: CRIMSON },
  neutral:     { label: 'neutre',    icon: '•', color: 'rgba(180,170,200,0.8)' },
};

export function formatDate(unixSeconds) {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDay(unixSeconds) {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

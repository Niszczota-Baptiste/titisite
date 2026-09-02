// Langage visuel du module « Items customs ». Reprend les jetons violets du
// site (ACC) et l'or/carmin des Quêtes — les deux modules se visitent à la
// suite, ils ne doivent pas avoir l'air de deux applications différentes.

export const ACC = '#c9a8e8';
export const ACC_RGB = '201,168,232';
export const GOLD = '#e8c86a';
export const CRIMSON = '#e0526f';
export const GREEN = '#7be3a8';
export const BLUE = '#7bd3e8';
export const INK = '#ede8f8';
export const MUTED = 'rgba(180,170,200,0.62)';
export const LINE = 'rgba(80,50,130,0.24)';

export const panel = {
  background: 'rgba(14,9,28,0.72)',
  border: `1px solid ${LINE}`,
  borderRadius: 12,
};

/**
 * Verdict d'équilibrage. « incomplet » n'est PAS une nuance de « sous » : une
 * fiche vide se documente, un item faible se rééquilibre — deux gestes
 * différents, donc deux couleurs et deux mots différents.
 */
export const VERDICTS = {
  ok:        { label: 'Dans son palier', court: 'OK',        icon: '✓', color: GREEN },
  sur:       { label: 'Trop fort pour son palier', court: 'Trop fort', icon: '▲', color: CRIMSON },
  sous:      { label: 'Trop faible pour son palier', court: 'Trop faible', icon: '▼', color: GOLD },
  incomplet: { label: 'Fiche à compléter', court: 'À compléter', icon: '○', color: MUTED },
  inconnu:   { label: 'Sans tier ou sans budget', court: '—',    icon: '·', color: MUTED },
};

export const STATUTS = {
  a_tester:  { label: 'À tester', icon: '🧪', color: GOLD },
  en_jeu:    { label: 'En jeu',   icon: '✅', color: GREEN },
  abandonne: { label: 'Abandonné', icon: '🚫', color: MUTED },
};

export const ACQUISITIONS = {
  craftable:    { label: 'Craftable',        icon: '🔨' },
  craft_achat:  { label: 'Craft / Achat',    icon: '🪙' },
  craft_schema: { label: 'Craft sur schéma', icon: '📜' },
  quest_event:  { label: 'Quête / Événement', icon: '⚔️' },
  boutique:     { label: 'Boutique',         icon: '🏪' },
  autre:        { label: 'Autre',            icon: '•' },
};

/** Familles de matériaux → couleur, pour que la base se lise d'un coup d'œil. */
export const MATERIAU_COULEURS = {
  netherite: '#6b5a5a', obsidian: '#7b6bb0', diamond: '#5fd8d0', turtle: '#8fd67a',
  iron: '#c9c9d4', chainmail: '#9aa8b8', golden: '#e8c86a', leather: '#b08a5a',
  stone: '#8f8f8f', wooden: '#9c7043', autre: 'rgba(180,170,200,0.5)',
};

/** Formate un nombre de points : pas de décimale inutile. */
export const pts = (n) => (Number.isFinite(+n)
  ? (Math.abs(+n % 1) < 0.005 ? String(Math.round(+n)) : (+n).toFixed(1).replace('.', ','))
  : '—');

export const pct = (n) => (Number.isFinite(+n) ? `${Math.round(+n * 100)} %` : '—');

export const btn = (actif = false) => ({
  padding: '7px 12px',
  borderRadius: 8,
  border: `1px solid ${actif ? `rgba(${ACC_RGB},0.6)` : LINE}`,
  background: actif ? `rgba(${ACC_RGB},0.14)` : 'rgba(255,255,255,0.02)',
  color: actif ? ACC : INK,
  fontFamily: "'Inter',sans-serif",
  fontSize: 13,
  cursor: 'pointer',
});

export const input = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${LINE}`,
  background: 'rgba(0,0,0,0.28)',
  color: INK,
  fontFamily: "'Inter',sans-serif",
  fontSize: 13,
  boxSizing: 'border-box',
};

export const label = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 5,
};

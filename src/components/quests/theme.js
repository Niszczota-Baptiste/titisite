// Shared visual language for the quest module. Builds on the site's violet
// tokens (ACC) and adds the warm "quest book" accents (gold / crimson) used by
// the banners and occurrence badges.

export const ACC = '#c9a8e8';
export const ACC_RGB = '201,168,232';
export const GOLD = '#e8c86a';
export const CRIMSON = '#e0526f';
export const INK = '#ede8f8';
export const MUTED = 'rgba(180,170,200,0.62)';

export const panel = {
  background: 'rgba(14,9,28,0.72)',
  border: '1px solid rgba(80,50,130,0.24)',
  borderRadius: 12,
};

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return '201,168,232';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

export const OCCURRENCES = {
  simple:       { label: 'Unique',       short: 'Unique', icon: '◆', color: ACC },
  journaliere:  { label: 'Journalière',  short: 'Jour',   icon: '☀', color: GOLD },
  hebdomadaire: { label: 'Hebdomadaire', short: 'Hebdo',  icon: '📅', color: '#7bd3e8' },
  mensuelle:    { label: 'Mensuelle',    short: 'Mois',   icon: '🌙', color: '#b79bff' },
};
export const OCCURRENCE_ORDER = ['simple', 'journaliere', 'hebdomadaire', 'mensuelle'];

export const INPUT_KINDS = {
  item:       { label: 'Objet',      icon: '📦' },
  pa:         { label: 'PA',         icon: '🪙' },
  reputation: { label: 'Réputation', icon: '⚜️' },
  pnj:        { label: 'PNJ',        icon: '🧑‍🌾' },
  autre:      { label: 'Autre',      icon: '•' },
};

export const REWARD_KINDS = {
  item:       { label: 'Objet',       icon: '📦' },
  pa:         { label: 'PA',          icon: '🪙' },
  reputation: { label: 'Réputation',  icon: '⚜️' },
  deblocage:  { label: 'Déblocage',   icon: '🔓' },
  autre:      { label: 'Autre',       icon: '•' },
};

export const PREREQ_KINDS = {
  quete_terminee: { label: 'Quête terminée' },
  reputation_min: { label: 'Réputation min.' },
  item_possede:   { label: 'Objet possédé' },
  maitrise_min:   { label: 'Maîtrise min.' },
  autre:          { label: 'Autre' },
};

export const POINT_ROLES = {
  recuperation: { label: 'Récupération', icon: '⛏️', color: GOLD },
  rendu:        { label: 'Rendu',        icon: '🎁', color: '#7be3a8' },
  pnj:          { label: 'PNJ',          icon: '🧑‍🌾', color: '#7bd3e8' },
  autre:        { label: 'Autre',        icon: '📍', color: ACC },
};

// Relative "prochain reset" / due-date label from a unix-seconds instant.
export function fromNow(unixSeconds) {
  if (!unixSeconds) return '';
  const diff = unixSeconds - Math.floor(Date.now() / 1000);
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  let s;
  if (d >= 1) s = `${d} j${h ? ` ${h} h` : ''}`;
  else if (h >= 1) s = `${h} h${m ? ` ${m} min` : ''}`;
  else s = `${Math.max(1, m)} min`;
  return diff >= 0 ? `dans ${s}` : `il y a ${s}`;
}

export function formatDate(unixSeconds) {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Modules de l'atelier (barre latérale, panneau « Plus » mobile, palette).
// `count` = clé des compteurs renvoyés par /overview (badge de navigation).
export const NAV = [
  { items: [{ to: '', label: 'Vue d\'ensemble', icon: '🏠', end: true }] },
  { label: 'Écrire', items: [
    { to: 'chapitres', label: 'Chapitres', icon: '📖', count: 'chapter' },
    { to: 'plan', label: 'Plan du livre', icon: '🗂️' },
    { to: 'ecrire', label: 'Écriture', icon: '✍️' },
  ] },
  { label: 'Univers', items: [
    { to: 'personnages', label: 'Personnages', icon: '👤', count: 'character' },
    { to: 'lieux', label: 'Lieux & cartes', icon: '📍', count: 'place' },
    { to: 'univers', label: 'Lore', icon: '📜', count: 'lore' },
    { to: 'chronologie', label: 'Chronologie', icon: '⏳', count: 'event' },
    { to: 'graphe', label: 'Graphe des relations', icon: '🕸️' },
  ] },
  { label: 'Créer', items: [
    { to: 'idees', label: 'Brainstorming', icon: '💡', count: 'inbox', countHint: 'dans l\'inbox' },
    { to: 'tableaux', label: 'Tableaux blancs', icon: '🧩' },
  ] },
  { label: 'Suivi', items: [
    { to: 'taches', label: 'Tâches', icon: '✅', count: 'tasks' },
    { to: 'coherence', label: 'Cohérence', icon: '🧭', count: 'issues' },
    { to: 'recherche', label: 'Recherche', icon: '🔎' },
  ] },
];

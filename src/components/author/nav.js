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
    { to: 'commentaires', label: 'Commentaires', icon: '💬', count: 'comments', countHint: 'à traiter' },
    { to: 'taches', label: 'Tâches', icon: '✅', count: 'tasks' },
    { to: 'coherence', label: 'Cohérence', icon: '🧭', count: 'issues' },
    { to: 'recherche', label: 'Recherche', icon: '🔎' },
  ] },
];

// Navigation d'un invité « omniscient » : le livre et son univers en lecture,
// sans la boîte à idées, les tâches, la cohérence ni les réglages.
export const GUEST_NAV = [
  { items: [{ to: '', label: 'Vue d\'ensemble', icon: '🏠', end: true }] },
  { label: 'Le livre', items: [
    { to: 'chapitres', label: 'Chapitres & plan', icon: '📖', count: 'chapter' },
  ] },
  { label: 'Univers', items: [
    { to: 'personnages', label: 'Personnages', icon: '👤', count: 'character' },
    { to: 'lieux', label: 'Lieux & cartes', icon: '📍', count: 'place' },
    { to: 'univers', label: 'Lore', icon: '📜', count: 'lore' },
    { to: 'chronologie', label: 'Chronologie', icon: '⏳', count: 'event' },
    { to: 'graphe', label: 'Graphe des relations', icon: '🕸️' },
    { to: 'tableaux', label: 'Tableaux partagés', icon: '🧩' },
  ] },
  { label: 'Échanger', items: [
    { to: 'commentaires', label: 'Commentaires', icon: '💬' },
    { to: 'recherche', label: 'Recherche', icon: '🔎' },
  ] },
];

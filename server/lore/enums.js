// Listes extensibles du module Lore. Volontairement PAS de CHECK SQL sur ces
// colonnes (voir le commentaire du bloc lore_ dans db.js#migrate) : ajouter une
// valeur = l'ajouter ici, la validation des routes suit.

export const ENTRY_TYPES = [
  'structure', 'texte', 'mecanisme', 'observation', 'pnj', 'evenement', 'objet',
];

export const HYPOTHESIS_STATUSES = ['open', 'testing', 'confirmed', 'refuted', 'abandoned'];
// Statuts terminaux : la note de résolution est exigée pour les trois —
// confirmed/refuted par la spec, abandoned parce que la raison d'un abandon
// est précisément ce que l'outil doit garder (« pistes mortes » consultables).
export const TERMINAL_STATUSES = ['confirmed', 'refuted', 'abandoned'];

export const STANCES = ['supports', 'contradicts', 'neutral'];

export const RELATION_TYPES = ['same_system', 'points_to', 'contradicts', 'variant_of', 'located_in'];

export const DIMENSIONS = ['overworld', 'nether', 'end'];

export const REVISION_TARGETS = ['entry', 'hypothesis'];

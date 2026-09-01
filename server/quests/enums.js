// Listes de valeurs du module Quêtes, partagées entre le routeur de lecture et
// celui d'édition. C'est LA source de vérité côté serveur pour tout ce qui n'a
// pas de contrainte CHECK en base.
//
// Pourquoi pas un CHECK SQL pour les catégories ? Parce qu'en SQLite une
// contrainte CHECK ne s'étend pas sans reconstruire la table : la liste doit
// rester ouverte (« il existe probablement d'autres paliers/catégories que je
// n'ai pas encore vus »). Les énumérations réellement figées — type de résultat
// de butin, source de probabilité, sens d'une ligne d'offre — gardent, elles,
// leur CHECK en base ET leur Set ici.
//
// AJOUTER UNE VALEUR :
//   • catégorie de quête   → QUEST_CATEGORIES + QUEST_CATEGORIES (front, theme.js)
//   • catégorie d'item     → UNIQUE_ITEM_CATEGORIES + ITEM_CATEGORIES (theme.js)
//   • rareté               → rien à toucher : c'est une table éditable en ligne
//   • monnaie              → rien à toucher : créer un item unique de catégorie
//                            « monnaie », il devient utilisable comme prix

/** Familles de quêtes. `recolte` est le défaut historique (rendu d'objets). */
export const QUEST_CATEGORIES = new Set(['recolte', 'craft', 'achat', 'pvp', 'autre']);

/** Catégories d'items uniques. */
export const UNIQUE_ITEM_CATEGORIES = new Set([
  'contenant', 'monnaie', 'ressource', 'equipement', 'consommable', 'autre',
]);

/** Ce qu'une ligne de butin peut produire. */
export const LOOT_RESULT_TYPES = new Set([
  'unique_item', 'item_referentiel', 'pa', 'reputation', 'autre',
]);

/** D'où vient une probabilité — une observation empirique n'est pas une donnée officielle. */
export const PROBA_SOURCES = new Set(['officielle', 'estimee', 'observee']);

/** Sources saisies à la main, pour ce qui n'est dérivable d'aucune relation. */
export const MANUAL_SOURCE_KINDS = new Set([
  'mob', 'coffre', 'evenement', 'pnj', 'peche', 'minage', 'autre',
]);

/**
 * Ce qu'un PNJ donne en échange d'un joyau (barème de rachat d'un set) :
 * des PA, de la réputation chez une faction, ou un objet.
 */
export const BUYOUT_PAIEMENTS = new Set(['pa', 'reputation', 'item']);

/** Sens d'une ligne d'offre : ce qu'on donne ↔ ce qu'on reçoit. */
export const OFFER_SENS = new Set(['donne', 'recoit']);

/** Nature d'une ligne d'offre (un item unique est un `item` en `custom:<id>`). */
export const OFFER_LINE_KINDS = new Set(['item', 'pa', 'autre']);

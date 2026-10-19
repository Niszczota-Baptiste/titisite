import { same as defaultSame } from './fields.js';

// Fusion d'un brouillon local (écrit hors connexion, ou resté après une
// fermeture d'onglet) avec l'état actuel du serveur. Jamais d'écrasement en
// silence :
//   - champ déjà identique côté serveur → rien à faire ;
//   - brouillon écrit sur la révision actuelle → ma valeur s'applique ;
//   - serveur modifié depuis : si CE champ n'a pas bougé (valeur de base
//     conservée dans le brouillon) → ma valeur s'applique ; s'il a bougé →
//     conflit, l'auteur tranche (même modale qu'un conflit d'autosave) ;
//   - brouillon d'un ancien format, sans valeur de base → conflit.
// → { apply: { champ: valeur }, clash: [champ] }
export function mergeDraft(draft, server, same = defaultSame) {
  const apply = {};
  const clash = [];
  const base = draft?.base || null;
  for (const [k, v] of Object.entries(draft?.fields || {})) {
    if (same(k, v, server[k])) continue;
    if (draft.revision === server.revision) { apply[k] = v; continue; }
    if (base && Object.prototype.hasOwnProperty.call(base, k) && same(k, base[k], server[k])) { apply[k] = v; continue; }
    clash.push(k);
  }
  return { apply, clash };
}

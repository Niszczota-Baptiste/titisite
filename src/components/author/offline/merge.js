import { same as defaultSame } from './fields.js';

// Fusion d'un brouillon local (écrit hors connexion, ou resté après une
// fermeture d'onglet) avec l'état actuel du serveur. Jamais d'écrasement en
// silence :
//   - champ déjà identique côté serveur → rien à faire ;
//   - brouillon écrit sur la révision actuelle → ma valeur s'applique ;
//   - serveur modifié depuis : si CE champ n'a pas bougé (valeur de base
//     conservée dans le brouillon) → ma valeur s'applique ; s'il a bougé →
//     conflit, l'auteur tranche (même modale qu'un conflit d'autosave) ;
//   - brouillon d'un ancien format, sans valeur de base → conflit ;
//   - conflit déjà constaté et pas encore tranché (`conflict` +
//     `conflictKeys`, posés par l'éditeur ou par la synchronisation) → il le
//     RESTE, même si le brouillon a depuis été réécrit sur la révision du
//     serveur : seul le choix de l'auteur le lève.
// → { apply: { champ: valeur }, clash: [champ] }
export function mergeDraft(draft, server, same = defaultSame) {
  const apply = {};
  const clash = [];
  const base = draft?.base || null;
  const pinned = draft?.conflict && Array.isArray(draft.conflictKeys) ? new Set(draft.conflictKeys) : null;
  for (const [k, v] of Object.entries(draft?.fields || {})) {
    if (same(k, v, server[k])) continue;
    if (pinned?.has(k)) { clash.push(k); continue; }
    if (draft.revision === server.revision) { apply[k] = v; continue; }
    if (base && Object.prototype.hasOwnProperty.call(base, k) && same(k, base[k], server[k])) { apply[k] = v; continue; }
    clash.push(k);
  }
  return { apply, clash };
}

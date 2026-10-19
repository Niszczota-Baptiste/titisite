import { ensureAuthorCacheOwner } from '../../../api/client';

// Mise en route du hors connexion pour le compte connecté :
//   1. les copies de lecture (Cache Storage du service worker) n'appartiennent
//      qu'à UN compte : si un autre compte s'est connecté sur ce navigateur, on
//      les efface AVANT la moindre lecture (ensureAuthorCacheOwner) ;
//   2. enregistrement du service worker de l'atelier (build de production
//      seulement — en développement Vite sert les modules à la volée).

let registered = false;

export async function setupOffline(user) {
  await ensureAuthorCacheOwner(user.id);
  if (registered || !import.meta.env.PROD || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  registered = true;
  try {
    await navigator.serviceWorker.register('/auteur-sw.js', { scope: '/auteur' });
  } catch { /* sans service worker, l'atelier marche comme avant (en ligne) */ }
}

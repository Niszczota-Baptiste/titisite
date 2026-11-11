// Pont vers les fonctions natives de l'application Mon Atelier.
//
// Le conteneur Android (Capacitor) injecte `window.Capacitor` dans la page ;
// on l'appelle directement — aucune dépendance npm côté site, et la même
// interface tourne dans un navigateur (les adaptateurs « web » de ce dossier
// prennent alors le relais). Chaque fonction native a son module ici :
// config.js (adresse du site), vault.js (boîte de réception locale),
// recorder.js (microphone), intake.js (partage entrant, raccourcis),
// sessions.js (Mon Temps).

const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);

export const isNative = () => !!cap()?.isNativePlatform?.();

export function native(plugin, method, args = {}) {
  const c = cap();
  if (!c?.nativePromise) {
    const err = new Error('native_unavailable');
    err.code = 'UNAVAILABLE';
    return Promise.reject(err);
  }
  return c.nativePromise(plugin, method, args);
}

// Écoute un événement d'un plugin ; renvoie la fonction de désinscription.
export function nativeOn(plugin, eventName, handler) {
  const c = cap();
  if (!c?.addListener) return () => {};
  const sub = c.addListener(plugin, eventName, (data) => { if (data) handler(data); });
  return () => { try { sub.remove(); } catch { /* page en cours de fermeture */ } };
}

// Adresse (même origine) d'un fichier gardé par l'application : lu par le
// WebView avec déplacement dans la piste, sans passer par le pont.
export const fileSrc = (path) => cap()?.convertFileSrc?.(path) ?? path;

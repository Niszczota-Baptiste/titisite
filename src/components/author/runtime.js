// Où tourne l'atelier : dans le site (/auteur), ou dans l'application « Mon
// Atelier » — la même interface, embarquée dans l'APK et servie sous l'origine
// du site par le conteneur Android (cf. docs/atelier-mobile.md). Le drapeau est
// posé au build par vite.atelier.config.js ; absent partout ailleurs (site,
// tests Node).
export const IS_APP = (() => {
  try { return !!import.meta.env?.VITE_ATELIER_APP; } catch { return false; }
})();

// Sortie de l'atelier : l'administration du site, ou l'accueil de l'application.
export const HOME_PATH = IS_APP ? '/' : '/admin';
export const HOME_LABEL = IS_APP ? 'Accueil de l\'atelier' : 'Administration';

// Portée du service worker (copies de lecture hors connexion). Dans
// l'application, toute l'origine est l'atelier ; sur le site, seulement /auteur.
export const SW_SCOPE = IS_APP ? '/' : '/auteur';

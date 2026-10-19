// État du réseau vu par l'atelier. `navigator.onLine` ment souvent (portail
// captif, serveur injoignable, wifi de train) : on se fie aux requêtes réelles.
// src/api/client.js émet `au-net` après chaque appel /api/author/* — réussite
// = en ligne ; échec réseau ou copie servie par le service worker = hors ligne.

const listeners = new Set();
let state = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  since: Date.now(),
};

export function getNet() {
  return state;
}

export function setOnline(online) {
  if (state.online === online) return;
  state = { online, since: Date.now() };
  for (const fn of listeners) fn(state);
}

export function subscribeNet(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Erreur « pas de réseau » (et non refus du serveur) : fetch impossible, ou
// lecture absente du cache hors connexion (503 { error: 'offline' }).
export function isNetworkError(err) {
  return !!err && (err.offline === true || err.message === 'offline');
}

if (typeof window !== 'undefined') {
  window.addEventListener('au-net', (e) => setOnline(!!e.detail?.online));
  window.addEventListener('offline', () => setOnline(false));
  // `online` n'est qu'un indice : la prochaine requête confirmera.
  window.addEventListener('online', () => setOnline(true));
}

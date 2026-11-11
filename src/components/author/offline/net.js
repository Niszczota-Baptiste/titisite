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

// ── Session ─────────────────────────────────────────────────────────────────
// Trois situations que l'interface ne doit pas confondre :
//   - coupure réseau (isNetworkError) : on réessaiera tout seul ;
//   - session expirée (401) : il faut se reconnecter, rien n'est perdu ;
//   - accès refusé (403 `forbidden`) : ce compte n'a pas, ou plus, l'atelier.
// Dans les trois cas le travail non envoyé reste sur l'appareil, rattaché au
// compte qui l'a écrit.

const authListeners = new Set();
let auth = { state: 'ok', since: Date.now() };

export function getAuth() {
  return auth;
}

export function setAuth(next) {
  const value = ['ok', 'expired', 'forbidden'].includes(next) ? next : 'ok';
  if (auth.state === value) return;
  auth = { state: value, since: Date.now() };
  for (const fn of authListeners) fn(auth);
}

export function subscribeAuth(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export const isSessionError = (err) => !!err && err.status === 401;
export const isAccessError = (err) => !!err && err.status === 403 && err.message === 'forbidden';

// Erreur après laquelle on GARDE tout et on réessaiera plus tard, sans rien
// marquer « en échec » : session à rétablir, accès à rétablir, serveur saturé
// ou en panne. → 'session' | 'access' | 'rate' | 'server' | null
export function pauseReason(err) {
  if (!err || isNetworkError(err)) return null;
  if (isSessionError(err)) return 'session';
  if (isAccessError(err)) return 'access';
  if (err.status === 429) return 'rate';
  if (err.status >= 500) return 'server';
  return null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('au-auth', (e) => setAuth(e.detail?.state));
  window.addEventListener('au-net', (e) => setOnline(!!e.detail?.online));
  window.addEventListener('offline', () => setOnline(false));
  // `online` n'est qu'un indice : la prochaine requête confirmera.
  window.addEventListener('online', () => setOnline(true));
}

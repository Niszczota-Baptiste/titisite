// Service worker de l'atelier d'auteur — portée /auteur.
//
// Ce fichier est un GABARIT : il n'est pas importé par l'application. Au build,
// le plugin `auteurServiceWorker` (vite.config.js) y injecte la version et la
// liste des fichiers de l'atelier, puis l'écrit dans dist/auteur-sw.js (servi
// sans cache HTTP par server/index.js). En développement il n'est pas
// enregistré.
//
// Rôle : que l'atelier s'ouvre et se lise sans réseau.
//   - l'application (index.html + morceaux JS/CSS de /auteur) est mise de côté
//     à l'installation ;
//   - les lectures GET /api/author/* passent d'abord par le réseau (données
//     fraîches) et retombent sur la dernière copie si le réseau manque ou
//     traîne ; une absence de copie répond 503 { error: 'offline' } ;
//   - les images (/api/author/media/*, noms immuables) sont servies depuis le
//     cache une fois vues.
// Les écritures ne passent JAMAIS par ici : l'application les garde sur
// l'appareil et les synchronise elle-même (src/components/author/offline/).
// Les copies sont privées à ce navigateur et effacées à la déconnexion ou au
// changement de compte (src/api/client.js : clearSession,
// ensureAuthorCacheOwner).

const VERSION = '__AU_VERSION__';
const PRECACHE = __AU_PRECACHE__;

const SHELL = `au-shell-${VERSION}`;
const DATA = 'au-data-v1';
const MEDIA = 'au-media-v1';
const META = 'au-meta';
const SHELL_URL = '/index.html';
const NET_TIMEOUT_MS = 6000;
const KEEP_SHELLS = 2; // la version précédente reste servie aux onglets déjà ouverts

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // cache: 'reload' : jamais une copie périmée du cache HTTP du navigateur.
    await cache.addAll([SHELL_URL, ...PRECACHE].map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const meta = await caches.open(META);
    const prev = await meta.match('/__au/shells').then((r) => (r ? r.json() : [])).catch(() => []);
    const keep = [SHELL, ...prev.filter((n) => n !== SHELL)].slice(0, KEEP_SHELLS);
    await meta.put('/__au/shells', json(keep));
    for (const name of await caches.keys()) {
      if (name.startsWith('au-shell-') && !keep.includes(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Clé de cache : paramètres triés, vides retirés — `?b=1&a=2` et `?a=2&b=1`
// sont la même lecture.
function dataKey(url) {
  const u = new URL(url.href);
  const params = [...u.searchParams.entries()].filter(([, v]) => v !== '').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  return u.href;
}

// Copie servie hors connexion : marquée pour que l'application le sache.
async function fromCache(hit) {
  const headers = new Headers(hit.headers);
  headers.set('X-Au-Cache', 'hit');
  return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
}

const offline = () => json({ error: 'offline' }, { status: 503, headers: { 'X-Au-Cache': 'miss' } });

async function navigation(req) {
  try {
    const res = await withTimeout(fetch(req), NET_TIMEOUT_MS);
    if (res.ok && (res.headers.get('Content-Type') || '').includes('text/html')) {
      const cache = await caches.open(SHELL);
      await cache.put(SHELL_URL, res.clone());
    }
    return res;
  } catch {
    const hit = await caches.match(SHELL_URL);
    return hit || new Response('Hors connexion', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function asset(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(SHELL);
    await cache.put(req, res.clone());
  }
  return res;
}

async function media(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.status === 200) await cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function data(req, url) {
  const key = dataKey(url);
  const cache = await caches.open(DATA);
  const network = fetch(req).then(async (res) => {
    if (res.status === 200) await cache.put(key, res.clone());
    return res;
  });
  try {
    return await withTimeout(network, NET_TIMEOUT_MS);
  } catch {
    const hit = await cache.match(key);
    if (hit) { network.catch(() => {}); return fromCache(hit); }
    try { return await network; } catch { return offline(); }
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { event.respondWith(navigation(req)); return; }
  if (url.pathname.startsWith('/assets/')) { event.respondWith(asset(req)); return; }
  if (url.pathname.startsWith('/api/author/media/')) { event.respondWith(media(req)); return; }
  // Exports (fichiers à télécharger) : jamais mis en cache.
  if (url.pathname.startsWith('/api/author/') && !/\/export(\/|$)/.test(url.pathname)) {
    event.respondWith(data(req, url));
  }
});

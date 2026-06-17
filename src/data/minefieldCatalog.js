// Catalogue des items/blocs custom du serveur Minefield (namespace « minefield »,
// extrait de minefield_1_18.jar). Chaque entrée : { type, id, nomFr, categorie, icon }.
// Les icônes sont des PNG pixel-art servis depuis public/codex/icons/.
//
// Alimente, sur l'onglet Minecraft des projets, l'autocomplete du modal
// « Nouvelle ressource » (en plus des blocs vanilla de minecraftBlocks.js) et
// l'affichage des vraies icônes des items inventoriés. ~139 entrées n'ont pas
// de texture (icon: null) → repli sur l'emoji existant.
//
// Le fichier est volumineux (~2000 entrées) : on le charge à la demande via
// fetch() une seule fois, plutôt que de l'embarquer dans le bundle JS.

const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Normalise un nom pour la recherche / le rapprochement (sans accents, minuscule). */
export const normName = (s) => stripDiacritics(String(s || '').toLowerCase()).trim();

let _promise = null;

// Un fichier codex (Minefield custom OU vanilla 1.18.2) → entrées enrichies.
// `icon` est toujours préfixé par `/codex/` (les deux fichiers stockent un
// chemin relatif : « icons/… » pour Minefield, « vanilla/icons/… » pour vanilla).
function fetchCodex(url, source) {
  return fetch(url)
    .then((r) => (r.ok ? r.json() : []))
    .then((arr) => (Array.isArray(arr) ? arr : []).map((e) => ({
      type: e.type,
      id: e.id,
      nomFr: e.nomFr,
      categorie: e.categorie,
      source,
      icon: e.icon ? `/codex/${e.icon}` : null,
      _key: normName(e.nomFr),
    })))
    .catch(() => []);
}

/**
 * Charge (et met en cache) le catalogue : items/blocs custom Minefield **puis**
 * vanilla Minecraft 1.18.2. Renvoie toujours un tableau — jamais d'erreur : si
 * un fetch échoue, on dégrade silencieusement (l'onglet retombe sur les emojis).
 *
 * Minefield est placé en premier pour gagner sur vanilla en cas de collision de
 * nom (index d'icônes + recherche). Chaque entrée porte `icon` (URL ou null),
 * `source` ('minefield'|'minecraft') et `_key` (nom normalisé pré-calculé).
 */
// Vanilla : codex_vanilla.json (src/data, import dynamique → chunk à part),
// icônes servies depuis public/codex/vanilla-icons/.
function loadVanilla() {
  return import('./codex_vanilla.json')
    .then((m) => (m.default || m).map((e) => ({
      type: e.type,
      id: e.id,
      nomFr: e.nomFr,
      categorie: '',
      source: 'minecraft',
      icon: e.icon ? `/codex/vanilla-icons/${e.icon.replace(/^icons\//, '')}` : null,
      _key: normName(e.nomFr),
    })))
    .catch(() => []);
}

/**
 * Charge (et met en cache) le catalogue : items/blocs custom Minefield + vanilla
 * Minecraft 1.18. Renvoie toujours un tableau — jamais d'erreur. Trié par nom FR
 * pour que MF et MC soient entrelacés (sinon les ~2000 MF masquent le vanilla
 * dans les menus). Minefield reste prioritaire en cas de collision de nom
 * (placé avant le tri stable).
 */
export function loadMinefieldCatalog() {
  if (!_promise) {
    _promise = Promise.all([
      fetchCodex('/codex/codex.json', 'minefield'),
      loadVanilla(),
    ]).then(([mf, vanilla]) => [...mf, ...vanilla]
      .sort((a, b) => (a._key < b._key ? -1 : a._key > b._key ? 1 : 0)));
  }
  return _promise;
}

/**
 * Rapproche un nom libre (ex. sortie de la lecture IA d'un screenshot) d'une
 * entrée du catalogue : essai exact sur le nom normalisé, puis inclusion lâche
 * dans un sens ou l'autre. Renvoie l'entrée ou null.
 */
export function matchCatalogName(catalog, name) {
  const key = normName(name);
  if (!key || !Array.isArray(catalog)) return null;
  return (
    catalog.find((e) => e._key === key)
    || catalog.find((e) => e._key && (e._key.includes(key) || key.includes(e._key)))
    || null
  );
}

/**
 * Filtre le catalogue par nom FR (tous les tokens doivent matcher, tolérant aux
 * accents/casse). `limit` borne la liste pour garder le menu utile.
 */
export function searchCatalog(catalog, query, limit = 40) {
  if (!Array.isArray(catalog) || catalog.length === 0) return [];
  const tokens = normName(query).split(/\s+/).filter(Boolean);
  const out = [];
  for (const e of catalog) {
    if (tokens.length === 0 || tokens.every((t) => e._key.includes(t))) {
      out.push(e);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Index Map<nom normalisé, URL d'icône> — sert à retrouver l'icône d'une
 * ressource déjà enregistrée à partir de son nom libre. Les entrées sans
 * texture sont ignorées ; en cas de doublon de nom, la première gagne.
 */
export function buildIconIndex(catalog) {
  const m = new Map();
  if (!Array.isArray(catalog)) return m;
  for (const e of catalog) {
    if (!e.icon) continue;
    if (!m.has(e._key)) m.set(e._key, e.icon);
  }
  return m;
}

/**
 * Index Map<nom normalisé, id de codex> — permet de retrouver l'id technique
 * d'une ressource (stockée par nom libre) pour charger son modèle 3D. En cas de
 * doublon de nom, la première entrée gagne (Minefield avant vanilla).
 */
export function buildIdIndex(catalog) {
  const m = new Map();
  if (!Array.isArray(catalog)) return m;
  for (const e of catalog) {
    if (!e.id) continue;
    if (!m.has(e._key)) m.set(e._key, e.id);
  }
  return m;
}

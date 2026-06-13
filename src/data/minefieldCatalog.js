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

/**
 * Charge (et met en cache) le codex Minefield. Renvoie toujours un tableau —
 * jamais d'erreur : si le fetch échoue, on dégrade silencieusement sur [] et
 * l'onglet retombe sur les emojis + la liste vanilla.
 *
 * Chaque entrée renvoyée est enrichie de `icon` (URL absolue ou null) et `_key`
 * (nom normalisé, pré-calculé pour la recherche).
 */
export function loadMinefieldCatalog() {
  if (!_promise) {
    _promise = fetch('/codex/codex.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => (Array.isArray(arr) ? arr : []).map((e) => ({
        type: e.type,
        id: e.id,
        nomFr: e.nomFr,
        categorie: e.categorie,
        icon: e.icon ? `/codex/${e.icon}` : null,
        _key: normName(e.nomFr),
      })))
      .catch(() => []);
  }
  return _promise;
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

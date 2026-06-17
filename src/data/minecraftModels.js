// Chargement à la demande des modèles 3D de blocs (résolus parent+textures par
// l'outil d'extraction Minefield). Le manifeste id → fichier vit dans src/data
// mais n'est tiré que via import() dynamique : il reste donc dans un chunk à
// part, jamais dans le bundle principal. Les modèles eux-mêmes sont servis
// statiquement depuis public/codex/models/, les textures depuis
// public/codex/model-textures/ — fetch() runtime, comme le codex.
//
// Format d'un modèle : { id, type, render, textures:{role:fichier.png}, elements?:[...] }
//   render "model" : géométrie custom (elements = boîtes 0–16). Seul ce type est
//                    rendu en 3D ; "cube"/"flat" retombent sur l'icône plate.

export const MODEL_TEXTURE_BASE = '/codex/model-textures/';

let _manifest = null;       // Promise<{ id: "block_<id>.json" }>
const _models = new Map();  // id -> Promise<model|null>

/** Charge (une fois) le manifeste id → nom de fichier, via import() dynamique. */
export function loadModelsManifest() {
  if (!_manifest) {
    _manifest = import('./models_manifest.json')
      .then((m) => m.default || m)
      .catch(() => ({}));
  }
  return _manifest;
}

/**
 * Renvoie le modèle résolu d'un id de codex, ou null si aucun modèle 3D n'existe
 * (l'appelant retombe alors sur l'icône plate). Résultat mémoïsé par id.
 */
export function loadModel(id) {
  if (!id) return Promise.resolve(null);
  if (_models.has(id)) return _models.get(id);
  const p = loadModelsManifest()
    .then((man) => {
      const file = man[id];
      if (!file) return null;
      return fetch(`/codex/models/${file}`).then((r) => (r.ok ? r.json() : null));
    })
    .catch(() => null);
  _models.set(id, p);
  return p;
}

/**
 * Vrai si l'id possède un modèle à géométrie (render "model") — sans charger le
 * modèle complet, juste le manifeste. Sert à décider du fallback côté UI.
 */
export function hasModel(id) {
  if (!id) return Promise.resolve(false);
  return loadModelsManifest().then((man) => Boolean(man[id]));
}

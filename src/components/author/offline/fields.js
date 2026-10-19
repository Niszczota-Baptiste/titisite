// Comparaison et mise au format « réseau » des champs d'une fiche — partagé
// par l'autosave (useEntityDoc) et la synchronisation hors connexion (sync.js).
// Fonctions pures : testées dans test/author-offline.test.js.

export function norm(key, v) {
  if (key === 'tags') return JSON.stringify((v || []).map((t) => (typeof t === 'string' ? t : t.name).toLowerCase()).sort());
  if (key === 'aliases') return JSON.stringify((v || []).map((a) => [a.alias, a.kind]));
  if (v === undefined || v === null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export const same = (key, a, b) => norm(key, a) === norm(key, b);

// Valeur envoyée au serveur pour une clé (les tags partent en noms).
export function wire(key, v) {
  if (key === 'tags') return (v || []).map((t) => (typeof t === 'string' ? t : t.name));
  if (key === 'aliases') return (v || []).map((a) => ({ alias: a.alias, kind: a.kind, note: a.note || '' }));
  return v;
}

export function wireAll(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = wire(k, v);
  return out;
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

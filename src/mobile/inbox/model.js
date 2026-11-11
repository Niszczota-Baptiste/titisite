// Boîte de réception LOCALE de l'application : les captures non classées.
//
// Une capture naît sur l'appareil, sans réseau, sans compte et sans projet —
// texte, lien, image, son, ou plusieurs à la fois. Elle garde sa provenance
// (saisie, enregistrement, partage depuis une autre application, import) et
// rejoint un projet plus tard, quand on le décide. Fonctions pures, testées
// dans test/atelier-inbox.test.js ; le stockage est dans platform/vault.js.
//
//   { id, text, url, files: [{ id, role, name, mime, size, path?, durationMs?,
//       integrity?, markers?, capturedAt? }], origin, owner, createdAt,
//     updatedAt, target, state, error, progress }
//
//   owner   compte qui l'a créée (« <site>|<id> »), ou null si personne n'était
//           connecté — une capture d'un compte n'est jamais montrée à un autre ;
//   target  où elle doit être classée : { serverUrl, pid, title, entityId? } ;
//   state   'local' (à classer) → 'queued' (en attente d'envoi) → retirée une
//           fois reçue par le site ; 'failed' = le site l'a refusée ;
//   progress ce qui est déjà arrivé (pour reprendre un envoi interrompu).

export function newItemId() {
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
  return `c-${uuid}`;
}

export function newItem({ text = '', url = null, files = [], origin = 'saisie', owner = null, now = Date.now() } = {}) {
  return {
    id: newItemId(), text, url, files, origin, owner,
    createdAt: now, updatedAt: now, target: null, state: 'local', error: null, progress: {},
  };
}

export const isEmpty = (item) => !String(item.text || '').trim() && !item.url && !(item.files || []).length;

export const audioFiles = (item) => (item.files || []).filter((f) => f.role === 'audio');
export const imageFiles = (item) => (item.files || []).filter((f) => f.role === 'image');

// Nature dominante, pour l'icône et pour savoir ce que la capture deviendra :
// un son devient une idée musicale ; tout le reste, une idée.
export function itemKind(item) {
  if (audioFiles(item).length) return 'audio';
  if (imageFiles(item).length) return 'image';
  if (item.url) return 'link';
  return 'text';
}

export const KIND_ICON = { audio: '🎙️', image: '🖼️', link: '🔗', text: '💡' };

// Première ligne lisible : sert de titre provisoire, jamais demandé à l'auteur.
export function itemTitle(item, fallback = 'Capture') {
  const first = String(item.text || '').split('\n').map((l) => l.trim()).find(Boolean);
  if (first) return first.length > 80 ? `${first.slice(0, 79)}…` : first;
  const audio = audioFiles(item)[0];
  if (audio) return audio.label || audio.name || 'Prise';
  if (item.url) return item.url;
  const image = imageFiles(item)[0];
  if (image) return image.name || 'Image';
  return fallback;
}

// Texte envoyé au site pour une idée : le texte, puis le lien s'il n'y figure
// pas déjà.
export function composeText(item) {
  const text = String(item.text || '').trim();
  const url = item.url && !text.includes(item.url) ? item.url : '';
  return [text, url].filter(Boolean).join('\n\n') || itemTitle(item);
}

// Un lien dans un texte collé ou partagé (le premier), pour l'aperçu.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;
export function findUrl(text) {
  const m = URL_RE.exec(String(text || ''));
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

// Ce que ce compte a le droit de voir : ses captures, et celles faites quand
// personne n'était connecté. Les autres restent sur l'appareil, invisibles.
export function visibleItems(items, owner) {
  return (items || []).filter((it) => !it.owner || it.owner === owner);
}

export function hiddenCount(items, owner) {
  return (items || []).filter((it) => it.owner && it.owner !== owner).length;
}

// Résumé pour l'accueil : à classer, en attente d'envoi, refusées.
export function inboxSummary(items, owner) {
  const mine = visibleItems(items, owner);
  return {
    total: mine.length,
    local: mine.filter((it) => it.state === 'local').length,
    queued: mine.filter((it) => it.state === 'queued').length,
    failed: mine.filter((it) => it.state === 'failed').length,
    bytes: mine.reduce((n, it) => n + (it.files || []).reduce((a, f) => a + (f.size || 0), 0), 0),
  };
}

// Référence client d'un morceau de la capture : stable d'un essai à l'autre,
// c'est elle qui empêche les doublons côté site.
export const refFor = (item, suffix = '') => `${item.id}${suffix}`.slice(0, 64);

import { fileSrc, isNative, native } from './bridge.js';

// Stockage LOCAL des captures (boîte de réception) — la seule copie d'une idée
// ou d'une prise tant qu'elle n'a pas été reçue par le site.
//
// Dans l'application, tout est gardé côté natif (plugin AtelierVault) : un
// fichier JSON par capture et les fichiers joints tels quels, dans le dossier
// privé de l'application. Ce stockage ne dépend pas de l'origine de la page —
// une capture faite avant d'avoir relié un site, ou sous un autre site, est
// toujours là — et aucun son ne traverse le pont JavaScript : la page lit les
// fichiers par une adresse locale (déplacement dans la piste compris) et les
// envoie elle-même au site.
//
// Dans un navigateur (aperçu, tests) : localStorage pour les captures,
// IndexedDB pour les fichiers.
//
//   vault.list()                    → captures
//   vault.put(item)                 → enregistre (création ou mise à jour)
//   vault.remove(id)                → supprime la capture ET ses fichiers
//   vault.addBlob(blob, meta)       → référence de fichier (web ; import d'image)
//   vault.pick('image' | 'audio')   → référence de fichier choisie sur l'appareil
//   vault.open(fileRef)             → { url, release() } pour l'afficher / l'écouter
//   vault.blob(fileRef)             → Blob, pour l'envoyer
//   vault.stats()                   → { bytes, freeBytes }
//   vault.subscribe(fn)

const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

// ── Navigateur ──────────────────────────────────────────────────────────────

const ITEMS_KEY = 'am-vault:items';
const DB_NAME = 'am-vault';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbRun(mode, fn) {
  const db = await idb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

const readItems = () => { try { return JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]'); } catch { return []; } };
const writeItems = (items) => { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); emit(); };
const fileId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const webVault = {
  async list() { return readItems(); },
  async put(item) {
    const next = { ...item, updatedAt: Date.now() };
    const items = readItems().filter((it) => it.id !== item.id);
    writeItems([next, ...items]);
    return next;
  },
  async remove(id) {
    const items = readItems();
    const gone = items.find((it) => it.id === id);
    for (const f of gone?.files || []) await idbRun('readwrite', (s) => s.delete(f.id)).catch(() => {});
    writeItems(items.filter((it) => it.id !== id));
  },
  async addBlob(blob, meta = {}) {
    const ref = { id: fileId(), name: meta.name || blob.name || 'fichier', mime: blob.type || meta.mime || '', size: blob.size, ...meta };
    await idbRun('readwrite', (s) => s.put(blob, ref.id));
    return ref;
  },
  async pick() { return null; }, // dans un navigateur : <input type="file">
  async blob(ref) {
    const blob = await idbRun('readonly', (s) => s.get(ref.id));
    if (!blob) throw new Error('file_missing');
    return blob;
  },
  async open(ref) {
    const url = URL.createObjectURL(await this.blob(ref));
    return { url, release: () => URL.revokeObjectURL(url) };
  },
  async stats() {
    let estimate = {};
    try { estimate = await navigator.storage?.estimate?.() || {}; } catch { /* indisponible */ }
    const bytes = readItems().reduce((n, it) => n + (it.files || []).reduce((a, f) => a + (f.size || 0), 0), 0);
    return { bytes, freeBytes: estimate.quota ? Math.max(0, estimate.quota - (estimate.usage || 0)) : null };
  },
};

// ── Application ─────────────────────────────────────────────────────────────

const nativeVault = {
  async list() { return (await native('AtelierVault', 'list')).items || []; },
  async put(item) {
    const next = { ...item, updatedAt: Date.now() };
    await native('AtelierVault', 'put', { item: next });
    emit();
    return next;
  },
  async remove(id) { await native('AtelierVault', 'remove', { id }); emit(); },
  // Une image choisie dans la page n'a pas de chemin natif : on passe par le
  // sélecteur de l'appareil (`pick`), qui copie le fichier sans le faire
  // transiter par le pont.
  async addBlob() { throw new Error('use_pick'); },
  async pick(role) {
    const out = await native('AtelierVault', 'pick', { role });
    return out?.file || null;
  },
  async blob(ref) {
    const res = await fetch(fileSrc(ref.path));
    if (!res.ok) throw new Error('file_missing');
    return res.blob();
  },
  async open(ref) { return { url: fileSrc(ref.path), release: () => {} }; },
  async stats() { return native('AtelierVault', 'stats'); },
};

const impl = () => (isNative() ? nativeVault : webVault);

export const vault = {
  list: () => impl().list(),
  put: (item) => impl().put(item),
  remove: (id) => impl().remove(id),
  addBlob: (blob, meta) => impl().addBlob(blob, meta),
  pick: (role) => impl().pick(role),
  blob: (ref) => impl().blob(ref),
  open: (ref) => impl().open(ref),
  stats: () => impl().stats(),
  canPick: () => isNative(),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  changed: emit,
};

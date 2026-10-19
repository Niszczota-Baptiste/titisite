import { isNetworkError } from './net.js';

// Ce qui attend le réseau, gardé sur l'appareil (localStorage : synchrone, donc
// écrit AVANT toute tentative réseau, et partagé entre onglets).
//
//   au-draft:<livre>:<id>  modifications non envoyées d'un élément existant
//                          { fields, base, revision, ts, uid, title, kind,
//                            conflict?, failed?, error? } — `base` = valeurs
//                          serveur des mêmes champs au moment de l'écriture,
//                          pour fusionner sans écraser (merge.js) ;
//   au-local:<livre>       éléments créés hors connexion (id temporaire < 0) ;
//   au-outbox              créations et captures d'idées à envoyer, dans
//                          l'ordre ; chacune porte une référence client qui
//                          rend son envoi idempotent côté serveur ;
//   au-idmap:<livre>       id temporaire → id réel, une fois synchronisé.
//
// `makeStore(storage)` permet de tester sans navigateur.

export const isTempId = (id) => Number(id) < 0;

// Négatif, entier sûr, unique en pratique (horodatage + aléa).
export function newTempId() {
  return -(Date.now() * 100 + Math.floor(Math.random() * 100));
}

export function newClientRef() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

const DRAFT_RE = /^au-draft:(\d+):(-?\d+)$/;

export function makeStore(storage) {
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(); };

  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };
  // Renvoie false si le stockage est plein : l'appelant DOIT le signaler
  // (hors connexion, c'est la seule copie du travail).
  const write = (key, value) => {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
      emit();
      return true;
    } catch { return false; }
  };

  const draftKey = (pid, id) => `au-draft:${pid}:${id}`;
  const localKey = (pid) => `au-local:${pid}`;
  const mapKey = (pid) => `au-idmap:${pid}`;

  const store = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit,

    // ── Brouillons ──────────────────────────────────────────────────────
    draftKey,
    readDraft: (pid, id) => read(draftKey(pid, id), null),
    writeDraft: (pid, id, rec) => write(draftKey(pid, id), rec),
    removeDraft: (pid, id) => write(draftKey(pid, id), null),
    listDrafts() {
      const out = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        const m = key && DRAFT_RE.exec(key);
        if (!m) continue;
        const rec = read(key, null);
        if (rec?.fields && Object.keys(rec.fields).length) out.push({ pid: Number(m[1]), id: Number(m[2]), key, rec });
      }
      return out;
    },

    // ── Éléments créés hors connexion ──────────────────────────────────
    localEntities: (pid) => read(localKey(pid), {}),
    getLocal: (pid, id) => read(localKey(pid), {})[id] || null,
    putLocal(pid, rec) {
      const all = read(localKey(pid), {});
      all[rec.id] = rec;
      return write(localKey(pid), all);
    },
    removeLocal(pid, id) {
      const all = read(localKey(pid), {});
      delete all[id];
      return write(localKey(pid), Object.keys(all).length ? all : null);
    },

    // ── File d'envoi ────────────────────────────────────────────────────
    outbox: () => read('au-outbox', []),
    pushOp(op) {
      const ops = read('au-outbox', []);
      ops.push({ id: newClientRef(), createdAt: Date.now(), ...op });
      return write('au-outbox', ops);
    },
    updateOp(id, patch) {
      const ops = read('au-outbox', []).map((o) => (o.id === id ? { ...o, ...patch } : o));
      return write('au-outbox', ops);
    },
    removeOp(id) {
      const ops = read('au-outbox', []).filter((o) => o.id !== id);
      return write('au-outbox', ops.length ? ops : null);
    },

    // ── Correspondance id temporaire → id réel ─────────────────────────
    mapped: (pid, tmpId) => read(mapKey(pid), {})[tmpId] || null,
    setMapped(pid, tmpId, entry) {
      const all = read(mapKey(pid), {});
      all[tmpId] = { ...entry, ts: Date.now() };
      return write(mapKey(pid), all);
    },
    // Ménage : correspondances et éléments déjà synchronisés de plus d'un jour.
    prune(pids, maxAgeMs = 86_400_000) {
      const now = Date.now();
      for (const pid of pids) {
        const map = read(mapKey(pid), {});
        let changed = false;
        for (const [k, v] of Object.entries(map)) if (now - (v.ts || 0) > maxAgeMs) { delete map[k]; changed = true; }
        if (changed) write(mapKey(pid), Object.keys(map).length ? map : null);
        const locals = read(localKey(pid), {});
        let lchanged = false;
        for (const [k, v] of Object.entries(locals)) if (v.syncedAs && now - (v.syncedAt || 0) > maxAgeMs) { delete locals[k]; lchanged = true; }
        if (lchanged) write(localKey(pid), Object.keys(locals).length ? locals : null);
      }
    },
    projectsWithLocalData() {
      const pids = new Set();
      for (let i = 0; i < storage.length; i += 1) {
        const m = /^au-(?:local|idmap):(\d+)$/.exec(storage.key(i) || '');
        if (m) pids.add(Number(m[1]));
      }
      return [...pids];
    },

    // Tout ce qui attend, pour l'interface (compteurs, liste « à synchroniser »).
    pending(uid) {
      const drafts = store.listDrafts().filter((d) => d.id > 0 && (!d.rec.uid || d.rec.uid === uid));
      const ops = store.outbox().filter((o) => o.uid === uid);
      const creations = ops.filter((o) => o.type === 'create').map((o) => ({ op: o, local: store.getLocal(o.pid, o.tmpId) }));
      const ideas = ops.filter((o) => o.type === 'quick');
      const conflicts = drafts.filter((d) => d.rec.conflict).length;
      const failed = drafts.filter((d) => d.rec.failed).length + ops.filter((o) => o.failed).length;
      return { drafts, creations, ideas, conflicts, failed, total: drafts.length + ops.length };
    },
  };
  return store;
}

const memory = new Map();
const fallbackStorage = {
  get length() { return memory.size; },
  key: (i) => [...memory.keys()][i] ?? null,
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => { memory.set(k, String(v)); },
  removeItem: (k) => { memory.delete(k); },
};

function browserStorage() {
  try { return window.localStorage; } catch { return fallbackStorage; }
}

export const offlineStore = makeStore(typeof window === 'undefined' ? fallbackStorage : browserStorage());

// Autre onglet : les compteurs suivent.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key && /^au-(draft|local|outbox|idmap)/.test(e.key)) offlineStore.emit(); });
}

export { isNetworkError };

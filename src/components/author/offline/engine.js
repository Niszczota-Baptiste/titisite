import { api } from '../../../api/client';
import { getNet, subscribeNet } from './net.js';
import { offlineStore } from './store.js';
import { runSync } from './sync.js';

// Moteur de synchronisation (navigateur) : relance runSync quand le réseau
// revient, quand l'onglet redevient visible, et régulièrement tant que
// quelque chose attend. Un seul onglet synchronise à la fois (Web Locks) ;
// de toute façon les envois sont idempotents ou protégés par révision.

// Éléments ouverts dans un éditeur de CET onglet : leur autosave pousse
// lui-même ses brouillons, la passe de synchronisation n'y touche pas.
const openDocs = new Map();
export const isDocOpen = (pid, id) => openDocs.has(`${pid}:${id}`);

export function registerOpenDoc(pid, id) {
  const k = `${pid}:${id}`;
  openDocs.set(k, (openDocs.get(k) || 0) + 1);
  return () => {
    const n = (openDocs.get(k) || 1) - 1;
    if (n <= 0) openDocs.delete(k); else openDocs.set(k, n);
  };
}

const syncApi = {
  create: (pid, body) => api.author.p(pid).entities.create(body),
  quick: (pid, { text, tags, clientRef }) => api.author.p(pid).notes.quick(text, tags, clientRef),
  update: (pid, id, body) => api.author.p(pid).entities.update(id, body),
};

const listeners = new Set();
let state = { running: false, lastAt: null, last: null, uid: null };
const setState = (patch) => {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
};
export const getSyncState = () => state;
export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let started = null;
let again = false;
let timer = null;

async function pass(uid) {
  const run = () => runSync({
    api: syncApi,
    store: offlineStore,
    uid,
    isOpen: (pid, id) => openDocs.has(`${pid}:${id}`),
    onMapped: (pid, tmpId, entity) => window.dispatchEvent(new CustomEvent('au-mapped', { detail: { pid, tmpId, entity } })),
  });
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('au-sync', { ifAvailable: true }, (lock) => (lock ? run() : null));
  }
  return run();
}

export async function syncNow() {
  const uid = state.uid;
  if (!uid) return null;
  if (state.running) { again = true; return null; }
  if (offlineStore.pending(uid).total === 0) return null;
  setState({ running: true });
  let report = null;
  try {
    report = await pass(uid);
  } catch {
    report = null;
  } finally {
    setState({ running: false, lastAt: Date.now(), last: report || state.last });
  }
  if (report && (report.created || report.ideas || report.saved)) {
    window.dispatchEvent(new CustomEvent('au-sync-done', { detail: report }));
  }
  if (again) { again = false; setTimeout(syncNow, 0); }
  return report;
}

// Démarré une fois par compte (le travail en attente peut concerner
// plusieurs livres). Le point d'appel : AuthorApp, propriétaire seulement.
export function startSync(uid) {
  if (started === uid) return;
  started = uid;
  setState({ uid });
  offlineStore.prune(offlineStore.projectsWithLocalData());
  const kick = () => { clearTimeout(timer); timer = setTimeout(syncNow, 400); };
  subscribeNet((s) => { if (s.online) kick(); });
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  // Filet : toutes les 20 s tant que quelque chose attend — `online` ne se
  // déclenche pas quand c'est le serveur, et non le wifi, qui revient.
  setInterval(() => { if (offlineStore.pending(uid).total) syncNow(); }, 20_000);
  if (getNet().online) kick();
}

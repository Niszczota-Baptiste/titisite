import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSyncState, isDocOpen, subscribeSync } from './engine.js';
import { getNet, subscribeNet } from './net.js';
import { offlineStore } from './store.js';

export function useNet() {
  return useSyncExternalStore((fn) => subscribeNet(fn), getNet, getNet);
}

export function useSyncState() {
  return useSyncExternalStore((fn) => subscribeSync(fn), getSyncState, getSyncState);
}

// Ce qui attend la synchronisation pour ce compte (recalculé à chaque
// changement du stockage local, y compris depuis un autre onglet).
// En ligne, le brouillon d'un éditeur ouvert n'est qu'une frappe en cours
// d'envoi (l'indicateur de sauvegarde en parle) : il ne compte pas.
function computePending(uid) {
  const p = offlineStore.pending(uid);
  if (!getNet().online) return p;
  const drafts = p.drafts.filter((d) => d.rec.conflict || d.rec.failed || !isDocOpen(d.pid, d.id));
  return { ...p, drafts, total: p.total - (p.drafts.length - drafts.length) };
}

export function usePending(uid) {
  const net = useNet();
  const [pending, setPending] = useState(() => computePending(uid));
  useEffect(() => {
    setPending(computePending(uid));
    let t = null;
    const off = offlineStore.subscribe(() => {
      clearTimeout(t);
      t = setTimeout(() => setPending(computePending(uid)), 150);
    });
    return () => { clearTimeout(t); off(); };
  }, [uid, net.online]);
  return pending;
}

// Éléments créés hors connexion d'un livre (pas encore synchronisés).
function readLocal(pid, kindKey) {
  const kinds = kindKey ? kindKey.split(',') : null;
  return Object.values(offlineStore.localEntities(pid))
    .filter((r) => !r.syncedAs && (!kinds || kinds.includes(r.kind)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function useLocalEntities(pid, kinds) {
  const kindKey = kinds ? kinds.join(',') : '';
  const [list, setList] = useState(() => readLocal(pid, kindKey));
  useEffect(() => {
    setList(readLocal(pid, kindKey));
    return offlineStore.subscribe(() => setList(readLocal(pid, kindKey)));
  }, [pid, kindKey]);
  return list;
}

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { vault } from '../platform/vault.js';
import { getInboxSync, subscribeInboxSync } from './engine.js';
import { hiddenCount, inboxSummary, visibleItems } from './model.js';

// Captures visibles par le compte courant, tenues à jour.
export function useInbox(owner) {
  const [all, setAll] = useState(null);
  const reload = useCallback(() => vault.list().then(setAll).catch(() => setAll([])), []);
  useEffect(() => {
    reload();
    const off = vault.subscribe(reload);
    const onFiled = () => reload();
    window.addEventListener('am-filed', onFiled);
    return () => { off(); window.removeEventListener('am-filed', onFiled); };
  }, [reload]);
  const items = visibleItems(all || [], owner).sort((a, b) => b.createdAt - a.createdAt);
  return { loading: all === null, items, hidden: hiddenCount(all || [], owner), summary: inboxSummary(all || [], owner), reload };
}

export function useInboxSync() {
  return useSyncExternalStore((fn) => subscribeInboxSync(fn), getInboxSync, getInboxSync);
}

// Adresse d'affichage d'un fichier de capture (image, son), libérée au démontage.
export function useVaultFile(ref) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!ref) { setUrl(null); return undefined; }
    let alive = true;
    let handle = null;
    vault.open(ref).then((h) => { if (alive) { handle = h; setUrl(h.url); } else h.release(); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; handle?.release(); };
  }, [ref?.id, ref?.path]); // eslint-disable-line
  return url;
}

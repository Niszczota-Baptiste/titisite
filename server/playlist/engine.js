import { choose, rank } from './matching.js';

const providers = ['spotify', 'apple'];
const remoteId = (t, p) => p === 'spotify' ? t.spotify_uri : t.apple_catalog_id || t.library_id;
export function createEngine(store, adapters, config) {
  let queue = Promise.resolve(), running = null, timer, stopped = false;
  const exclusive = fn => { const work = queue.then(fn); queue = work.catch(() => {}); return work; };
  const adapter = p => p === 'spotify' ? adapters.spotify : adapters.apple;
  const owner = p => config.ownerId ? config.ownerId(p) : store.db.prepare('SELECT id FROM users WHERE lower(email)=?').get(p === 'spotify' ? config.spotifyEmail : config.appleEmail)?.id;
  const errorState = (p, e) => store.set(`${p}:error`, e.reason || 'sync_failed');
  function remove(id) {
    const track = store.get(id);
    if (!track) throw new Error('Morceau introuvable.');
    if (track.deleted_at) return;
    store.db.transaction(() => {
      store.db.prepare('UPDATE shared_tracks SET deleted_at=? WHERE id=?').run(Date.now(), id);
      store.mark(id, 'spotify', track.spotify_uri ? 'remove_pending' : 'removed');
      const apple = store.delivery(id, 'apple').status;
      store.mark(id, 'apple', ['sent','confirmed','uncertain','sending','manual'].includes(apple) ? 'manual' : 'removed');
    })();
  }
  async function cycle() {
    const observed = new Map();
    // Read each whole playlist before any writes. Failed/truncated reads never imply deletion.
    for (const p of providers) {
      if (!owner(p) || store.token(p)?.userId !== owner(p) || !store.state(`${p}:playlist`)) continue;
      try {
        const view = await adapter(p).read();
        store.db.transaction(() => {
          const seenIds = new Set();
          for (const t of view.tracks) {
            const row = store.ingest(t, owner(p));
            seenIds.add(row.id);
            if (row.deleted_at) {
              store.mark(row.id, p, p === 'apple' ? 'manual' : 'remove_pending');
            } else store.mark(row.id, p, 'confirmed');
          }
          for (const row of store.list()) {
            if (seenIds.has(row.id)) continue;
            const status = store.delivery(row.id, p).status;
            if (row.deleted_at) { store.mark(row.id, p, 'removed'); continue; }
            if (p === 'spotify' && status === 'confirmed') remove(row.id);
            // Native Apple removals do not delete the shared track or get silently re-added.
            if (p === 'apple' && status === 'confirmed') store.mark(row.id, p, 'missing');
          }
          store.set(`${p}:seen`, view.tracks);
          if (view.snapshot) store.set('spotify:snapshot', view.snapshot);
          store.set(`${p}:lastRead`, Date.now());
          store.set(`${p}:error`, null);
        })();
        observed.set(p, view.tracks);
      } catch (error) { errorState(p, error); }
    }
    for (const row of store.list()) {
      if (stopped) break;
      if (row.deleted_at) {
        if (store.delivery(row.id, 'spotify').status === 'remove_pending' && observed.has('spotify')) {
          try { await adapters.spotify.remove(row); store.mark(row.id, 'spotify', 'removed'); store.set('spotify:snapshot', null); }
          catch (e) { errorState('spotify', e); }
        }
        continue;
      }
      for (const p of providers) {
        if (!observed.has(p)) continue;
        let status = store.delivery(row.id, p).status;
        if (['confirmed','sent','uncertain','manual','missing'].includes(status)) continue;
        try {
          let current = store.get(row.id);
          if (!remoteId(current, p)) {
            // Cache unmatched candidates until explicit retry: avoid repeated catalogue searches every 45s.
            if (status === 'unmatched') continue;
            let candidates = current.isrc ? rank(current, await adapter(p).isrc(current.isrc)) : [];
            let selected = choose(candidates);
            if (!selected) { candidates = rank(current, await adapter(p).search(`${current.title} ${current.artist}`)); selected = choose(candidates); }
            if (!selected) { store.mark(row.id, p, 'unmatched', candidates.slice(0, 5)); continue; }
            store.bind(row.id, selected);
            current = store.get(row.id);
          }
          // The target may already contain a manually matched variant from before matching.
          if (observed.get(p).some(t => remoteId(t, p) === remoteId(current, p))) { store.mark(row.id, p, 'confirmed'); continue; }
          store.mark(row.id, p, 'sending');
          try { await adapter(p).add(current); }
          catch (e) { store.mark(row.id, p, e.uncertain ? 'uncertain' : 'pending'); throw e; }
          store.mark(row.id, p, 'sent');
          // NEVER cache snapshot from a write: it might include concurrent native edits we haven't imported.
          if (p === 'spotify') store.set('spotify:snapshot', null);
        } catch (e) { errorState(p, e); }
      }
    }
    store.set('lastCycle', Date.now());
  }
  const sync = () => {
    if (!running) running = exclusive(cycle).finally(() => { running = null; });
    return running;
  };
  return { exclusive, sync, remove,
    async add(provider, id, userId) {
      const row = await exclusive(async () => store.ingest(await adapter(provider).get(id), userId));
      if (row.deleted_at) throw new Error('Ce morceau a été retiré. Sa suppression reste mémorisée pour éviter sa réimportation.');
      void sync().catch(() => {});
      return row;
    },
    async match(id, provider, remote) {
      await exclusive(async () => {
        const row = store.get(id);
        if (!row || row.deleted_at || !['unmatched','pending'].includes(store.delivery(id, provider).status)) throw new Error('Correspondance non modifiable.');
        store.bind(id, await adapter(provider).get(remote));
        store.mark(id, provider, 'pending');
      });
      void sync().catch(() => {});
    },
    start() {
      if (!config.enabled || timer) return;
      const tick = async () => {
        try { await sync(); } catch { store.set('engineError', 'sync_failed'); }
        if (!stopped) { timer = setTimeout(tick, config.interval); timer.unref(); }
      };
      timer = setTimeout(tick, 1000); timer.unref();
    },
    stop() { stopped = true; clearTimeout(timer); return queue; },
  };
}

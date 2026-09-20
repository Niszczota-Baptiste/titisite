import crypto from 'node:crypto';
import { choose, rank } from './matching.js';

// Independent of shared_tracks: listening never writes to a native playlist.
export function migratePlaybackQueue(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS playback_queue (
    id INTEGER PRIMARY KEY, track TEXT NOT NULL, added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    added_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
    spotify_status TEXT NOT NULL DEFAULT 'pending', apple_status TEXT NOT NULL DEFAULT 'pending',
    spotify_error TEXT, apple_error TEXT, spotify_candidates TEXT NOT NULL DEFAULT '[]',
    apple_candidates TEXT NOT NULL DEFAULT '[]', apple_claim TEXT, apple_deadline INTEGER
  );`);
}

export function createPlaybackQueue(store, adapters, owner, exclusive, now = Date.now) {
  const db = store.db;
  // A process may have died after Spotify accepted a write. Never replay it blindly.
  db.prepare("UPDATE playback_queue SET spotify_status='uncertain' WHERE spotify_status='sending'").run();
  const expire = () => db.prepare("UPDATE playback_queue SET apple_status='uncertain',apple_claim=NULL WHERE apple_status='sending' AND apple_deadline<=?").run(now());
  const unpack = row => row && { ...JSON.parse(row.track), id: row.id, added_by: row.added_by, added_at: row.added_at,
    added_by_name: row.added_by_name, spotify_status: row.spotify_status, apple_status: row.apple_status,
    spotify_error: row.spotify_error, apple_error: row.apple_error,
    spotify_candidates: JSON.parse(row.spotify_candidates), apple_candidates: JSON.parse(row.apple_candidates) };
  const list = () => { expire(); return db.prepare('SELECT q.*,u.name AS added_by_name FROM playback_queue q LEFT JOIN users u ON u.id=q.added_by WHERE archived=0 ORDER BY q.id').all().map(unpack); };
  const get = id => list().find(q => q.id === id);
  const field = p => {
    if (!['spotify','apple'].includes(p)) throw new Error('Service inconnu.');
    return p === 'spotify' ? 'spotify_uri' : 'apple_catalog_id';
  };
  function mark(id, p, status, error = null, candidates = []) {
    field(p);
    db.prepare(`UPDATE playback_queue SET ${p}_status=?,${p}_error=?,${p}_candidates=? WHERE id=?`).run(status, error, JSON.stringify(candidates), id);
  }
  function bind(id, p, match) {
    const key = field(p), row = db.prepare('SELECT track FROM playback_queue WHERE id=?').get(id);
    if (!match[key]) throw new Error('Correspondance indisponible.');
    const track = JSON.parse(row.track);
    track[key] = match[key];
    db.prepare('UPDATE playback_queue SET track=? WHERE id=?').run(JSON.stringify(track), id);
  }
  async function resolve(item, p) {
    const key = field(p);
    if (item[key]) return item;
    let candidates = item.isrc ? rank(item, await adapters[p].isrc(item.isrc)) : [];
    let match = choose(candidates);
    if (!match) { candidates = rank(item, await adapters[p].search(`${item.title} ${item.artist}`)); match = choose(candidates); }
    if (!match) { mark(item.id, p, 'unmatched', null, candidates.slice(0, 5)); return null; }
    bind(item.id, p, match);
    return get(item.id);
  }
  const connected = p => owner(p) && store.token(p)?.userId === owner(p);
  // Must run within the engine's exclusive lock; a blocked item preserves FIFO.
  async function flushInside() {
    if (!connected('spotify')) return;
    for (const item of list()) {
      if (item.spotify_status === 'sent') continue;
      if (item.spotify_status !== 'pending') break;
      try {
        const track = await resolve(item, 'spotify');
        if (!track) break;
        mark(item.id, 'spotify', 'sending');
        await adapters.spotify.queue(track);
        mark(item.id, 'spotify', 'sent');
      } catch (e) {
        mark(item.id, 'spotify', e.uncertain ? 'uncertain' : e.status === 429 ? 'pending' : 'error', e.reason || 'api_error');
        break;
      }
    }
  }
  let flushing;
  const flush = () => flushing || (flushing = exclusive(flushInside).finally(() => { flushing = null; }));
  return { list, flushInside, flush,
    async add(input, userId) {
      const item = await exclusive(async () => {
        const track = input.provider ? await adapters[input.provider].get(input.id) : store.get(input.id);
        if (!track || track.deleted_at) throw new Error('Morceau introuvable.');
        const duplicate = list().find(q => (q.isrc && track.isrc && q.isrc.toUpperCase() === track.isrc.toUpperCase()) ||
          (q.spotify_uri && q.spotify_uri === track.spotify_uri) || (q.apple_catalog_id && q.apple_catalog_id === track.apple_catalog_id));
        if (duplicate) return duplicate;
        if (list().length >= 100) throw new Error('File pleine (100 titres). Masque les morceaux déjà écoutés.');
        const result = db.prepare('INSERT INTO playback_queue(track,added_by,added_at) VALUES(?,?,?)').run(JSON.stringify(track), userId, now());
        return get(Number(result.lastInsertRowid));
      });
      void flush().catch(() => {});
      return item;
    },
    claimApple: (receiver) => exclusive(async () => {
      const lease = store.state('apple:receiver');
      if (lease && lease.id !== receiver && lease.until > now()) throw new Error('Un autre onglet reçoit Apple Music. Suspends sa réception puis attends 90 secondes.');
      store.set('apple:receiver', { id: receiver, until: now() + 90000 });
      if (!connected('apple')) return null;
      const item = list().find(q => q.apple_status !== 'sent');
      if (!item || item.apple_status !== 'pending') return null;
      try {
        const track = await resolve(item, 'apple');
        if (!track) return null;
        const claim = crypto.randomBytes(24).toString('hex');
        mark(item.id, 'apple', 'sending');
        db.prepare('UPDATE playback_queue SET apple_claim=?,apple_deadline=? WHERE id=?').run(claim, now() + 60000, item.id);
        return { item: track, claim };
      } catch (e) { mark(item.id, 'apple', e.status === 429 ? 'pending' : 'error', e.reason || 'api_error'); return null; }
    }),
    acknowledgeApple: (id, claim, delivered) => exclusive(() => {
      expire();
      const result = db.prepare("UPDATE playback_queue SET apple_status=?,apple_claim=NULL WHERE id=? AND archived=0 AND apple_status='sending' AND apple_claim=?")
        .run(delivered ? 'sent' : 'uncertain', id, claim);
      if (!result.changes) throw new Error('Réception expirée ou déjà confirmée. Vérifie la file Apple Music.');
    }),
    retry: (id, p, confirmAbsent) => exclusive(() => {
      field(p);
      const item = get(id), status = item?.[`${p}_status`];
      if (!['error','uncertain','unmatched'].includes(status)) throw new Error('Aucune relance disponible.');
      if (status === 'uncertain' && confirmAbsent !== true) throw new Error('Vérifie d’abord que le titre est absent de la file du lecteur.');
      mark(id, p, 'pending');
    }),
    match: (id, p, remote) => exclusive(async () => {
      field(p);
      if (get(id)?.[`${p}_status`] !== 'unmatched') throw new Error('Correspondance non modifiable.');
      bind(id, p, await adapters[p].get(remote)); mark(id, p, 'pending');
    }),
    archive: id => exclusive(() => {
      const item = get(id);
      if (!item) throw new Error('Élément de file introuvable.');
      if ([item.spotify_status, item.apple_status].includes('sending')) throw new Error('Envoi en cours. Réessaie dans une minute.');
      db.prepare('UPDATE playback_queue SET archived=1 WHERE id=?').run(id);
    }),
    playSpotify: id => exclusive(async () => {
      const item = get(id);
      if (!item?.spotify_uri) throw new Error('Correspondance Spotify indisponible.');
      if (!connected('spotify')) throw new Error('Connecte Spotify dans Réglages.');
      await adapters.spotify.play(item);
    }),
  };
}

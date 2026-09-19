import crypto from 'node:crypto';

export function canViewPlaylist(user, env = process.env, db) {
  if (db) {
    if (db.prepare('SELECT 1 FROM playlist_members WHERE user_id=?').get(user?.id ?? -1)) return true;
    if (!db.prepare('SELECT 1 FROM playlist_members LIMIT 1').get() && user?.role === 'admin') return true;
    return false;
  }
  const apple = (env.PLAYLIST_APPLE_EMAIL || '').trim().toLowerCase();
  const spotify = (env.PLAYLIST_SPOTIFY_EMAIL || '').trim().toLowerCase();
  return Boolean(apple && spotify && apple !== spotify && [apple, spotify].includes(user?.email?.toLowerCase()));
}

export function playlistConfig(env = process.env) {
  const appleEmail = (env.PLAYLIST_APPLE_EMAIL || '').trim().toLowerCase();
  const spotifyEmail = (env.PLAYLIST_SPOTIFY_EMAIL || '').trim().toLowerCase();
  const enabled = Boolean(appleEmail && spotifyEmail && appleEmail !== spotifyEmail);
  const key = env.PLAYLIST_ENCRYPTION_KEY || '';
  if (enabled && !/^[a-f\d]{64}$/i.test(key)) throw new Error('PLAYLIST_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux.');
  const seconds = Number(env.PLAYLIST_POLL_SECONDS || 45);
  if (!Number.isFinite(seconds) || seconds < 30) throw new Error('PLAYLIST_POLL_SECONDS doit être >= 30.');
  return { enabled, appleEmail, spotifyEmail, key, interval: seconds * 1000,
    origin: env.CANONICAL_ORIGIN || 'http://127.0.0.1:5173',
    clientId: env.SPOTIFY_CLIENT_ID || '', teamId: env.APPLE_TEAM_ID || '',
    keyId: env.APPLE_KEY_ID || '', privateKey: (env.APPLE_PRIVATE_KEY || '').replaceAll('\\n', '\n'),
    storefront: 'fr' };
}

export function migratePlaylist(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_tracks (
      id INTEGER PRIMARY KEY, isrc TEXT UNIQUE, title TEXT NOT NULL, artist TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0, spotify_uri TEXT UNIQUE, apple_catalog_id TEXT UNIQUE,
      artwork TEXT, added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      added_at INTEGER NOT NULL, deleted_at INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('synced','pending','unmatched'))
    );
    CREATE TABLE IF NOT EXISTS playlist_aliases (
      provider TEXT NOT NULL, remote_id TEXT NOT NULL, track_id INTEGER NOT NULL REFERENCES shared_tracks(id),
      PRIMARY KEY(provider, remote_id)
    );
    CREATE TABLE IF NOT EXISTS playlist_tokens (
      provider TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ciphertext TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS playlist_members (
      provider TEXT PRIMARY KEY CHECK(provider IN ('spotify','apple')),
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_deliveries (
      track_id INTEGER NOT NULL REFERENCES shared_tracks(id), provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', candidates TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY(track_id, provider)
    );
  `);
}

export function createStore(db, keyHex) {
  const state = (key, fallback = null) => {
    const row = db.prepare('SELECT value FROM playlist_state WHERE key=?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  };
  const set = (key, value) => db.prepare('INSERT INTO playlist_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  const cipherKey = keyHex ? Buffer.from(keyHex, 'hex') : null;
  function saveToken(provider, userId, value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cipherKey, iv);
    cipher.setAAD(Buffer.from(`${provider}:${userId}`));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const ciphertext = [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.');
    db.prepare('INSERT INTO playlist_tokens VALUES (?,?,?) ON CONFLICT(provider) DO UPDATE SET user_id=excluded.user_id,ciphertext=excluded.ciphertext').run(provider, userId, ciphertext);
  }
  function token(provider) {
    const row = db.prepare('SELECT * FROM playlist_tokens WHERE provider=?').get(provider);
    if (!row) return null;
    const [iv, tag, data] = row.ciphertext.split('.').map(s => Buffer.from(s, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', cipherKey, iv);
    decipher.setAAD(Buffer.from(`${provider}:${row.user_id}`));
    decipher.setAuthTag(tag);
    return { userId: row.user_id, ...JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')) };
  }
  const get = id => db.prepare('SELECT * FROM shared_tracks WHERE id=?').get(id);
  const delivery = (id, provider) => db.prepare('SELECT * FROM playlist_deliveries WHERE track_id=? AND provider=?').get(id, provider);
  const mark = (id, provider, status, candidates = []) => {
    db.prepare('UPDATE playlist_deliveries SET status=?,candidates=? WHERE track_id=? AND provider=?').run(status, JSON.stringify(candidates), id, provider);
    db.prepare(`UPDATE shared_tracks SET sync_status=CASE
      WHEN EXISTS(SELECT 1 FROM playlist_deliveries WHERE track_id=? AND status='unmatched') THEN 'unmatched'
      WHEN NOT EXISTS(SELECT 1 FROM playlist_deliveries WHERE track_id=? AND status NOT IN ('confirmed','removed')) THEN 'synced'
      ELSE 'pending' END WHERE id=?`).run(id, id, id);
  };
  function alias(provider, remoteId, id) {
    if (!remoteId) return;
    const old = db.prepare('SELECT track_id FROM playlist_aliases WHERE provider=? AND remote_id=?').get(provider, remoteId);
    if (old && old.track_id !== id) throw new Error('Ce morceau correspond déjà à une autre ligne.');
    db.prepare('INSERT OR IGNORE INTO playlist_aliases VALUES (?,?,?)').run(provider, remoteId, id);
  }
  function find(track) {
    for (const [provider, value] of [['spotify', track.spotify_uri], ['apple', track.apple_catalog_id], ['apple-library', track.library_id]]) {
      if (!value) continue;
      const row = db.prepare('SELECT track_id FROM playlist_aliases WHERE provider=? AND remote_id=?').get(provider, value);
      if (row) return get(row.track_id);
    }
    return track.isrc ? db.prepare('SELECT * FROM shared_tracks WHERE isrc=?').get(track.isrc.toUpperCase()) : null;
  }
  const bind = db.transaction((id, track) => {
    alias('spotify', track.spotify_uri, id);
    alias('apple', track.apple_catalog_id, id);
    alias('apple-library', track.library_id, id);
    db.prepare(`UPDATE shared_tracks SET spotify_uri=coalesce(spotify_uri,?),apple_catalog_id=coalesce(apple_catalog_id,?) WHERE id=?`)
      .run(track.spotify_uri || null, track.apple_catalog_id || null, id);
  });
  const ingest = db.transaction((track, userId) => {
    let row = find(track);
    if (!row) {
      const result = db.prepare(`INSERT INTO shared_tracks(isrc,title,artist,duration_ms,artwork,added_by,added_at) VALUES (?,?,?,?,?,?,?)`)
        .run(track.isrc?.toUpperCase() || null, track.title, track.artist, track.duration_ms || 0, track.artwork || null, userId, Date.now());
      row = get(result.lastInsertRowid);
      for (const provider of ['spotify', 'apple']) db.prepare('INSERT INTO playlist_deliveries(track_id,provider) VALUES (?,?)').run(row.id, provider);
    }
    bind(row.id, track);
    return get(row.id);
  });
  const list = () => db.prepare('SELECT t.*,u.name AS added_by_name FROM shared_tracks t LEFT JOIN users u ON u.id=t.added_by ORDER BY t.added_at DESC,t.id DESC').all().map(t => ({ ...t,
    platforms: Object.fromEntries(db.prepare('SELECT * FROM playlist_deliveries WHERE track_id=?').all(t.id).map(d => [d.provider, { status: d.status, candidates: JSON.parse(d.candidates) }])) }));
  // A crash between sending and recording the response is ambiguous, never blindly resend.
  db.prepare("UPDATE playlist_deliveries SET status='uncertain' WHERE status='sending'").run();
  return { db, state, set, saveToken, token, get, delivery, mark, bind, ingest, find, list };
}

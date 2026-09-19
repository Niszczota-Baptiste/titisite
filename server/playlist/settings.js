import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { playlistConfig } from './store.js';

// Kept beside SQLite (outside the web root), never in SQLite or an API response.
export function encryptionKey(db, env = process.env) {
  if (env.PLAYLIST_ENCRYPTION_KEY) {
    if (!/^[a-f\d]{64}$/i.test(env.PLAYLIST_ENCRYPTION_KEY)) throw new Error('PLAYLIST_ENCRYPTION_KEY invalide.');
    return env.PLAYLIST_ENCRYPTION_KEY;
  }
  const databaseName = db.name || env.DB_PATH || 'data.sqlite';
  const filename = `${path.resolve(databaseName)}.playlist.key`;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path comes only from the server database filename.
    if (!fs.existsSync(filename)) {
      if (db.prepare('SELECT 1 FROM playlist_tokens LIMIT 1').get()) throw new Error('Clé de chiffrement absente : restaurer la clé d’origine avant de redémarrer.');
      // wx prevents replacing an existing key; mode 0600 restricts access on the VPS.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- server-owned path, no HTTP input.
      fs.writeFileSync(filename, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    }
  } catch (e) { if (e.code !== 'EEXIST') throw e; }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- server-owned path.
  const key = fs.readFileSync(filename, 'utf8').trim();
  if (!/^[a-f\d]{64}$/i.test(key)) throw new Error('Clé de chiffrement locale invalide. Restaurer sa sauvegarde.');
  return key;
}

export function runtimeConfig(db, env = process.env) {
  return playlistConfig({ ...env, PLAYLIST_ENCRYPTION_KEY: encryptionKey(db, env) });
}

export function createSettings(store, config) {
  const db = store.db;
  // Migrate an already configured installation once; IDs remain stable if an email changes.
  if (!store.state('members:migrated')) {
    db.transaction(() => {
      for (const [provider, email] of [['apple', config.appleEmail], ['spotify', config.spotifyEmail]]) {
        if (!email) continue;
        const user = db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email);
        if (!user) throw new Error('Un ancien compte Playlist Commune est introuvable. Restaurer ce compte avant de migrer.');
        db.prepare('INSERT INTO playlist_members(provider,user_id) VALUES (?,?)').run(provider, user.id);
      }
      store.set('members:migrated', true);
    })();
  }
  const member = userId => db.prepare('SELECT provider FROM playlist_members WHERE user_id=?').get(userId)?.provider;
  const owner = provider => db.prepare('SELECT user_id FROM playlist_members WHERE provider=?').get(provider)?.user_id;
  const count = () => db.prepare('SELECT count(*) AS n FROM playlist_members').get().n;
  config.ownerId = owner;
  config.enabled = true;
  for (const provider of ['spotify', 'apple']) {
    const saved = store.token(`settings:${provider}`);
    if (saved && saved.userId === owner(provider)) {
      if (provider === 'spotify') config.clientId = saved.clientId;
      else Object.assign(config, { teamId: saved.teamId, keyId: saved.keyId, privateKey: saved.privateKey });
    }
  }
  return {
    member, owner,
    summary(user) {
      return { mine: member(user.id) || null, canInitialize: count() === 0 && user.role === 'admin',
        canInvite: Boolean(member(user.id)) && count() === 1, joinAvailable: count() === 1 && !member(user.id),
        callback: `${config.origin}/api/playlist/spotify/callback` };
    },
    initialize(user, provider) {
      if (user.role !== 'admin' || count() !== 0) throw new Error('Seul un administrateur peut activer la playlist, une seule fois.');
      if (!['apple', 'spotify'].includes(provider)) throw new Error('Choisis ton service musical.');
      db.prepare('INSERT INTO playlist_members(provider,user_id) VALUES (?,?)').run(provider, user.id);
    },
    invite(user) {
      if (!member(user.id) || count() !== 1) throw new Error('Les deux places sont déjà réservées ou cet accès est interdit.');
      const code = crypto.randomBytes(24).toString('hex');
      const expires = Date.now() + 86400_000;
      store.set('invitation', { hash: crypto.createHash('sha256').update(code).digest('hex'), expires });
      return { code, expires };
    },
    join(user, code) {
      if (typeof code !== 'string' || !/^[a-f\d]{48}$/.test(code)) throw new Error('Code invalide ou expiré.');
      db.transaction(() => {
        const invitation = store.state('invitation');
        const hash = crypto.createHash('sha256').update(code).digest('hex');
        if (!invitation || invitation.expires < Date.now() || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(invitation.hash))) throw new Error('Code invalide ou expiré.');
        if (member(user.id) || count() !== 1) throw new Error('Cette playlist est réservée à deux personnes distinctes.');
        const provider = owner('apple') ? 'spotify' : 'apple';
        db.prepare('INSERT INTO playlist_members(provider,user_id) VALUES (?,?)').run(provider, user.id);
        store.set('invitation', null);
      })();
    },
    save(user, provider, values) {
      if (owner(provider) !== user.id) throw new Error('Tu peux uniquement régler ton propre service musical.');
      if (provider === 'spotify') {
        const clientId = typeof values.clientId === 'string' ? values.clientId.trim() : '';
        if (!/^[a-z\d]{32}$/i.test(clientId)) throw new Error('Le Client ID Spotify doit contenir 32 caractères alphanumériques.');
        if (store.token('spotify') && clientId !== config.clientId) throw new Error('Déconnecte Spotify avant de changer le Client ID.');
        store.saveToken('settings:spotify', user.id, { clientId });
        config.clientId = clientId;
      } else {
        const { teamId, keyId, privateKey } = values;
        if (!/^[A-Z\d]{10}$/.test(teamId || '') || !/^[A-Z\d]{10}$/.test(keyId || '')) throw new Error('Team ID et Key ID Apple : 10 lettres majuscules ou chiffres chacun.');
        if (typeof privateKey !== 'string' || privateKey.length > 12000) throw new Error('Charge ta clé privée MusicKit .p8.');
        let key;
        try { key = crypto.createPrivateKey(privateKey); } catch { throw new Error('La clé .p8 est illisible.'); }
        if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Une clé MusicKit ES256 (P-256) est requise.');
        store.saveToken('settings:apple', user.id, { teamId, keyId, privateKey });
        Object.assign(config, { teamId, keyId, privateKey });
      }
      store.set(`${provider}:settingsRevision`, Date.now());
    },
  };
}

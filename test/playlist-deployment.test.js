import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { bootServer, fetcher } from './harness.js';
import { migratePlaylist } from '../server/playlist/store.js';

const common = {
  NODE_ENV: 'production', CANONICAL_ORIGIN: 'https://playlist.example.com',
  SEED_ITEMS: '0', SEED_DEMO_QUESTS: '0',
  SPOTIFY_CLIENT_ID: '', APPLE_TEAM_ID: '', APPLE_KEY_ID: '', APPLE_PRIVATE_KEY: '',
};

test('production boots without music configuration and keeps the site available', async t => {
  const server = await bootServer({ env: { ...common, PLAYLIST_APPLE_EMAIL: '', PLAYLIST_SPOTIFY_EMAIL: '' } });
  t.after(() => server.stop());
  const client = fetcher(server.base);
  assert.equal((await client.get('/api/health')).status, 200);
  assert.equal((await client.get('/api/playlist/status')).status, 503);
  const login = await client.post('/api/auth/login', { body: { email: 'admin@test.local', password: 'adminpw1-strong' } });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.canViewPlaylist, false);
  if (fs.existsSync(new URL('../dist/index.html', import.meta.url))) {
    const page = await client.get('/playlist');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.text, /id="root"/);
  }
});

test('production uses existing sessions, migrates and backs up the shared database', async t => {
  const server = await bootServer({ env: {
    ...common, PLAYLIST_APPLE_EMAIL: 'admin@test.local', PLAYLIST_SPOTIFY_EMAIL: 'member@test.local',
    PLAYLIST_ENCRYPTION_KEY: 'ab'.repeat(32),
  } });
  t.after(() => server.stop());
  const client = fetcher(server.base);
  assert.equal((await client.get('/api/playlist/status')).status, 401);
  const login = await client.post('/api/auth/login', { body: { email: 'admin@test.local', password: 'adminpw1-strong' } });
  assert.equal(login.status, 200);
  assert.equal(login.json.user.canViewPlaylist, true);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /Secure/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/i);
  const state = await client.get('/api/playlist/status');
  assert.equal(state.status, 200);
  assert.equal(state.json.apple.canConfigure, true);
  assert.equal(state.json.spotify.canConfigure, false);
  assert.equal((await client.post('/api/playlist/sync', { body: {} })).status, 403);
  assert.equal((await client.post('/api/playlist/sync', { body: {}, headers: {
    Origin: common.CANONICAL_ORIGIN, 'X-Playlist-Request': '1',
  } })).status, 202);
  const db = new Database(path.join(server.workdir, 'data.sqlite'));
  try {
    db.prepare("INSERT INTO shared_tracks(title,artist,added_at) VALUES ('Migration test','Fixture',1)").run();
    migratePlaylist(db);
    migratePlaylist(db);
    assert.equal(db.prepare('SELECT count(*) AS n FROM shared_tracks').get().n, 1);
    const backupPath = path.join(server.workdir, 'backup.sqlite');
    await db.backup(backupPath);
    const backup = new Database(backupPath, { readonly: true });
    try {
      assert.equal(backup.prepare('SELECT title FROM shared_tracks').get().title, 'Migration test');
      assert.ok(backup.prepare('SELECT count(*) AS n FROM users').get().n >= 2);
    } finally { backup.close(); }
  } finally { db.close(); }
});

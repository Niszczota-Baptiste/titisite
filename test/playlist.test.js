import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createStore, playlistConfig, migratePlaylist } from '../server/playlist/store.js';
import { createEngine } from '../server/playlist/engine.js';
import { createProviders, ProviderError } from '../server/playlist/providers.js';
import { createPlaylistFeature } from '../server/playlist/router.js';
import { rank, choose } from '../server/playlist/matching.js';

const key = 'ab'.repeat(32);
const config = { enabled: true, key, appleEmail: 'a@test', spotifyEmail: 's@test', interval: 45000, clientId: 'test-client', origin: 'http://127.0.0.1:5173', storefront: 'fr' };
const song = { title: 'Voyage', artist: 'Artiste', duration_ms: 200000, isrc: 'FR1232600001' };
const spotifySong = { ...song, provider: 'spotify', remote_id: 'sp1', spotify_uri: 'spotify:track:sp1' };
const appleSong = { ...song, provider: 'apple', remote_id: '123', apple_catalog_id: '123', library_id: 'i.lib' };
function database() {
  const db = new Database(':memory:'); db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,name TEXT,token_version INTEGER DEFAULT 0);
    INSERT INTO users(id,email,name) VALUES(1,'a@test','Apple'),(2,'s@test','Spotify'),(3,'other@test','Other');
    CREATE TABLE revoked_tokens(jti TEXT PRIMARY KEY);`);
  migratePlaylist(db);
  return db;
}
function fixture(t) {
  const db = database(); t.after(() => db.close());
  const store = createStore(db, key);
  store.saveToken('apple', 1, { musicUserToken: 'apple-secret' });
  store.saveToken('spotify', 2, { access_token: 'secret', refresh_token: 'refresh-secret', expiresAt: Date.now() + 3600_000 });
  store.set('spotify:playlist', 'sp-list'); store.set('apple:playlist', 'p.list');
  const remote = { spotify: [], apple: [] }, adds = { spotify: 0, apple: 0 };
  const adapters = Object.fromEntries(['spotify','apple'].map(p => [p, {
    read: async () => ({ tracks: structuredClone(remote[p]), snapshot: p === 'spotify' ? 'snapshot' : undefined }),
    get: async () => p === 'spotify' ? spotifySong : appleSong,
    isrc: async () => [p === 'spotify' ? spotifySong : appleSong],
    search: async () => [p === 'spotify' ? spotifySong : appleSong],
    add: async track => { adds[p]++; remote[p].push(p === 'spotify' ? { ...track, ...spotifySong } : { ...track, ...appleSong }); },
    remove: async () => { remote.spotify = []; },
  }]));
  const engine = createEngine(store, adapters, config);
  return { db, store, remote, adds, adapters, engine };
}
test('configuration closes module by default and validates secrets', () => {
  assert.equal(playlistConfig({}).enabled, false);
  assert.throws(() => playlistConfig({ PLAYLIST_APPLE_EMAIL:'a', PLAYLIST_SPOTIFY_EMAIL:'b' }), /ENCRYPTION/);
  assert.throws(() => playlistConfig({ PLAYLIST_POLL_SECONDS:'NaN' }), /SECONDS/);
});
test('tokens authenticated and encrypted at rest; wrong key and row substitution fail', t => {
  const { db, store } = fixture(t);
  const ciphertext = db.prepare("SELECT ciphertext FROM playlist_tokens WHERE provider='spotify'").get().ciphertext;
  assert.ok(!ciphertext.includes('secret'));
  assert.equal(store.token('spotify').refresh_token, 'refresh-secret');
  assert.throws(() => createStore(db, 'cd'.repeat(32)).token('spotify'));
  db.prepare("UPDATE playlist_tokens SET user_id=1 WHERE provider='spotify'").run();
  assert.throws(() => store.token('spotify'));
});
test('simultaneous native additions with the same ISRC become one row without pushes', async t => {
  const { engine, remote, store, adds } = fixture(t);
  remote.spotify = [spotifySong, spotifySong]; remote.apple = [appleSong];
  await engine.sync(); await engine.sync();
  assert.equal(store.list().length, 1); assert.equal(store.list()[0].sync_status, 'synced');
  assert.deepEqual(adds, { spotify: 0, apple: 0 });
});
test('native additions and concurrent sync requests send once to the other platform', async t => {
  const { engine, remote, store, adds } = fixture(t);
  remote.spotify = [spotifySong];
  await Promise.all([engine.sync(), engine.sync(), engine.sync()]); await engine.sync();
  assert.equal(store.list()[0].added_by, 2); assert.equal(adds.apple, 1); assert.equal(adds.spotify, 0);
  assert.equal(store.list()[0].sync_status, 'synced');
});
test('web duplicate requests are idempotent and push to both platforms', async t => {
  const { engine, store, adds } = fixture(t);
  await Promise.all([engine.add('spotify','sp1',1), engine.add('spotify','sp1',1)]);
  await engine.sync(); await engine.sync();
  assert.equal(store.list().length, 1); assert.deepEqual(adds, { spotify: 1, apple: 1 });
});
test('Spotify native removal is tombstoned and Apple cannot resurrect it', async t => {
  const { engine, remote, store, adds } = fixture(t);
  remote.spotify = [spotifySong]; remote.apple = [appleSong];
  await engine.sync(); remote.spotify = []; await engine.sync(); await engine.sync();
  const row = store.list()[0]; assert.ok(row.deleted_at); assert.equal(row.platforms.apple.status, 'manual');
  assert.equal(adds.spotify, 0);
  remote.apple = []; await engine.sync(); assert.equal(store.list()[0].platforms.apple.status, 'removed');
});
test('web deletion is retried on Spotify and keeps an Apple manual-removal notice', async t => {
  const { engine, remote, store, adapters } = fixture(t);
  remote.spotify = [spotifySong]; remote.apple = [appleSong]; await engine.sync();
  engine.remove(store.list()[0].id);
  const original = adapters.spotify.remove;
  adapters.spotify.remove = async () => { throw new ProviderError('spotify',429,'QUOTA_EXCEEDED'); };
  await engine.sync(); assert.equal(store.list()[0].platforms.spotify.status, 'remove_pending');
  adapters.spotify.remove = original; await engine.sync();
  assert.equal(store.list()[0].platforms.spotify.status, 'removed'); assert.equal(store.list()[0].platforms.apple.status, 'manual');
});
test('partial/failed remote reads cannot delete or push to that side', async t => {
  const { engine, remote, store, adapters } = fixture(t);
  remote.spotify = [spotifySong]; remote.apple = [appleSong]; await engine.sync();
  adapters.spotify.read = async () => { throw new Error('pagination failed'); };
  await engine.sync(); assert.equal(store.list()[0].deleted_at, null);
});
test('Apple native deletion is displayed and is never automatically re-added', async t => {
  const { engine, remote, store, adds } = fixture(t);
  remote.spotify = [spotifySong]; remote.apple = [appleSong]; await engine.sync();
  remote.apple = []; await engine.sync(); await engine.sync();
  assert.equal(store.list()[0].deleted_at, null); assert.equal(store.list()[0].platforms.apple.status, 'missing'); assert.equal(adds.apple, 0);
});
test('eventual Apple consistency does not replay acknowledged writes', async t => {
  const { engine, remote, store, adapters } = fixture(t); let sends = 0;
  remote.spotify = [spotifySong]; adapters.apple.add = async () => { sends++; };
  await engine.sync(); await engine.sync(); await engine.sync();
  assert.equal(sends, 1); assert.equal(store.list()[0].platforms.apple.status, 'sent');
});
test('ambiguous writes and process restart never cause automatic duplicates', async t => {
  const { engine, remote, store, adapters, db } = fixture(t); let sends = 0;
  remote.spotify = [spotifySong]; adapters.apple.add = async () => { sends++; throw new ProviderError('apple',502,'network_error',true); };
  await engine.sync(); await engine.sync(); assert.equal(sends, 1);
  const row = store.list()[0]; assert.equal(row.platforms.apple.status, 'uncertain');
  store.mark(row.id,'apple','sending');
  const restarted = createStore(db,key); assert.equal(restarted.delivery(row.id,'apple').status,'uncertain');
  remote.apple = [appleSong]; await engine.sync(); assert.equal(store.list()[0].sync_status,'synced');
});
test('unmatched searches are cached; manual match starts delivery', async t => {
  const { engine, remote, store, adapters, adds } = fixture(t); let searches = 0;
  remote.spotify = [spotifySong]; adapters.apple.isrc = async () => [];
  adapters.apple.search = async () => { searches++; return [{ ...appleSong, isrc: null, title: 'Autre morceau' }]; };
  await engine.sync(); await engine.sync(); assert.equal(searches,1); assert.equal(store.list()[0].sync_status,'unmatched');
  await engine.match(store.list()[0].id,'apple','123'); await engine.sync(); assert.equal(adds.apple,1);
});
test('strict duration, artist, version and ambiguous fallback matching', () => {
  assert.equal(choose(rank(song,[{ ...song, isrc:null, duration_ms:203001 }])),null);
  assert.equal(choose(rank(song,[{ ...song, isrc:null, artist:'Different' }])),null);
  assert.equal(choose(rank(song,[{ ...song, isrc:null, title:'Voyage Live' }])),null);
  assert.ok(choose(rank(song,[{ ...song, isrc:null, duration_ms:203000 }])));
  assert.equal(choose(rank(song,[{ ...song, isrc:null },{ ...song, isrc:null }])),null);
  assert.ok(choose(rank(song,[{ ...song }])));
});
test('new 2026 Spotify endpoints, nested item, snapshot optimization and pagination', async t => {
  const { store } = fixture(t); const calls = [];
  const raw = { id:'sp1', uri:'spotify:track:sp1', type:'track', name:'Voyage', artists:[{name:'Artiste'}], external_ids:{isrc:song.isrc} };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST' || options.method === 'DELETE') return Response.json({snapshot_id:'write-snapshot'});
    if (url.includes('/items')) return Response.json({ items:[{item:raw}], next: url.includes('offset=') ? null : 'https://api.spotify.com/v1/playlists/sp-list/items?offset=1' });
    return Response.json({snapshot_id:'same'});
  };
  const api = createProviders(store,config,fetcher);
  const view = await api.spotify.read(); assert.equal(view.tracks.length,2);
  store.set('spotify:snapshot','same'); store.set('spotify:seen',view.tracks);
  calls.length = 0; await api.spotify.read(); assert.equal(calls.length,1);
  await api.spotify.add(spotifySong); await api.spotify.remove(spotifySong);
  assert.ok(calls[1].url.endsWith('/items')); assert.deepEqual(JSON.parse(calls[2].options.body),{items:[{uri:spotifySong.spotify_uri}]});
});
test('incomplete or changing Spotify snapshots are rejected', async t => {
  const { store } = fixture(t); let n = 0;
  const api = createProviders(store,config, async url => Response.json(url.includes('/items') ? {items:[],next:null} : {snapshot_id:String(n++)}));
  await assert.rejects(api.spotify.read(), /playlist_changed_during_read/);
  const missing = createProviders(store,config, async url => Response.json(url.includes('/items') ? {items:[{item:null}],next:null} : {snapshot_id:'s'}));
  await assert.rejects(missing.spotify.read(), /unavailable_playlist_item/);
});
test('429 QUOTA_EXCEEDED persists cooldown, respects Retry-After and blocks other calls', async t => {
  const { store } = fixture(t); let calls = 0;
  const fetcher = async () => { calls++; return Response.json({error:{reason:'QUOTA_EXCEEDED'}},{status:429,headers:{'Retry-After':'600'}}); };
  await assert.rejects(createProviders(store,config,fetcher).spotify.search('test'), /QUOTA_EXCEEDED/);
  assert.ok(store.state('spotify:backoff').until >= Date.now() + 599000);
  await assert.rejects(createProviders(store,config,fetcher).spotify.search('test')); assert.equal(calls,1);
});
test('refresh token rotation and single-flight refresh', async t => {
  const { store } = fixture(t); store.saveToken('spotify',2,{refresh_token:'old',expiresAt:0}); let refreshes = 0;
  const api = createProviders(store,config,async (url, options) => {
    if (url.includes('/api/token')) { refreshes++; assert.match(options.body,/refresh_token=old/); return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600}); }
    return Response.json({tracks:{items:[]}});
  });
  await Promise.all([api.spotify.search('a'),api.spotify.search('b')]); assert.equal(refreshes,1); assert.equal(store.token('spotify').refresh_token,'rotated');
});
test('non-JSON rate-limit responses still persist Retry-After', async t => {
  const { store } = fixture(t);
  const api = createProviders(store,config,async () => new Response('Too many requests',{status:429,headers:{'Retry-After':'90'}}));
  await assert.rejects(api.spotify.search('test'),/rate_limited/);
  assert.ok(store.state('spotify:backoff').until >= Date.now() + 89000);
});
test('Apple ES256, library/catalog distinction, pagination and add payload', async t => {
  const { store } = fixture(t); const keys = crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}); const calls = [];
  const appleConfig = {...config, teamId:'TEAM',keyId:'KEY',privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'})};
  const api = createProviders(store,appleConfig,async (url,options) => {
    calls.push({url,options});
    jwt.verify(options.headers.Authorization.slice(7),keys.publicKey,{algorithms:['ES256'],issuer:'TEAM'});
    if (options.method === 'POST') return new Response(null,{status:204});
    if (url.includes('offset=2')) return Response.json({data:[]});
    if (url.includes('/playlists/')) return Response.json({data:[{id:'i.lib',type:'library-songs',attributes:{name:'Voyage',hasCatalog:true},relationships:{catalog:{data:[{id:'123',type:'songs'}]}}}],next:'/v1/me/library/playlists/p.list/tracks?offset=2'});
    return Response.json({data:[{id:'123',type:'songs',attributes:{name:'Voyage',artistName:'Artiste',isrc:song.isrc,durationInMillis:200000}}]});
  });
  const view = await api.apple.read(); assert.equal(view.tracks[0].apple_catalog_id,'123'); assert.equal(view.tracks[0].library_id,'i.lib'); assert.equal(view.tracks[0].isrc,song.isrc);
  await api.apple.add(view.tracks[0]); assert.deepEqual(JSON.parse(calls.at(-1).options.body),{data:[{id:'123',type:'songs'}]});
  assert.equal(calls.at(-1).options.headers['Music-User-Token'],'apple-secret');
});
test('remote pagination cannot exfiltrate tokens to another origin', async t => {
  const { store } = fixture(t); let calls = 0;
  const api = createProviders(store,config,async url => {
    calls++; return Response.json(url.includes('/items') ? {items:[],next:'https://evil.example/v1/steal'} : {snapshot_id:'s'});
  });
  await assert.rejects(api.spotify.read(),/pagination/); assert.equal(calls,2);
});
test('router excludes other site members, restricts connection ownership, rejects CSRF, handles strict-session OAuth callback', async t => {
  const db = database(); const requests = [];
  const auth = (req,res,next) => {
    req.user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.get('test-user') || 0));
    if (!req.user) return res.status(401).json({error:'auth'});
    req.token = {jti:'session',exp:Math.floor(Date.now()/1000)+3600}; next();
  };
  const feature = createPlaylistFeature(db,auth,config,async (url,options) => {
    requests.push({url,options});
    return Response.json(url.includes('/api/token') ? {access_token:'token',refresh_token:'refresh',expires_in:3600} : {id:'sp-user',account_id:'account'});
  });
  const app = express(); app.use(express.json(),cookieParser()); app.use('/api/playlist',feature.router);
  const server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
  t.after(async () => { await feature.stop(); await new Promise(r => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/playlist`;
  assert.equal((await fetch(`${base}/status`)).status,401);
  assert.equal((await fetch(`${base}/status`,{headers:{'test-user':'3'}})).status,403);
  assert.equal((await fetch(`${base}/sync`,{method:'POST',headers:{'test-user':'1'}})).status,403);
  const headers = {'test-user':'1',origin:config.origin,'X-Playlist-Request':'1','Content-Type':'application/json'};
  assert.equal((await fetch(`${base}/spotify/connect`,{method:'POST',headers,body:'{}'})).status,403);
  const response = await fetch(`${base}/spotify/connect`,{method:'POST',headers:{...headers,'test-user':'2'},body:'{}'});
  const cookie = response.headers.get('set-cookie').split(';')[0]; assert.match(response.headers.get('set-cookie'),/SameSite=Lax/i);
  const {url} = await response.json(), params = new URL(url).searchParams;
  assert.equal(params.get('code_challenge_method'),'S256');
  const callback = `${base}/spotify/callback?state=${params.get('state')}&code=test-code`;
  const returned = await fetch(callback,{headers:{cookie},redirect:'manual'});
  assert.equal(returned.headers.get('location'),'/playlist?connection=spotify');
  assert.ok(requests[0].options.body.includes('code_verifier='));
  const replay = await fetch(callback,{headers:{cookie},redirect:'manual'}); assert.equal(replay.headers.get('location'),'/playlist?connection=error');
});

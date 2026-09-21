import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createStore, migratePlaylist } from '../server/playlist/store.js';
import { createPlaybackQueue } from '../server/playlist/queue.js';
import { createEngine } from '../server/playlist/engine.js';
import { createProviders, ProviderError } from '../server/playlist/providers.js';
import { receiveApple } from '../src/pages/playlistReceiver.js';

function fixture(t) {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO users VALUES(1,'Apple'),(2,'Spotify')");
  migratePlaylist(db); migratePlaylist(db);
  const store = createStore(db, 'ab'.repeat(32));
  store.saveToken('apple', 1, {}); store.saveToken('spotify', 2, {});
  const owner = p => p === 'apple' ? 1 : 2;
  const song = (p, id) => ({ title: `Titre ${id}`, artist: 'Artiste', duration_ms: 200000, isrc: `FR00000000${id}`, provider: p, remote_id: id,
    ...(p === 'apple' ? { apple_catalog_id: String(id) } : { spotify_uri: `spotify:track:${id}` }) });
  const sends = [];
  const adapters = Object.fromEntries(['apple','spotify'].map(p => [p, { get: async id => song(p, id),
    isrc: async isrc => [song(p, isrc.slice(-1))], search: async () => [], queue: async q => { sends.push(q.spotify_uri); }, play: async () => {} }]));
  const engine = createEngine(store, adapters, { ownerId: owner });
  let time = 1000;
  const create = () => createPlaybackQueue(store, adapters, owner, engine.exclusive, () => time);
  const queue = create();
  t.after(async () => { await engine.stop(); db.close(); });
  return { db, store, queue, engine, adapters, sends, create, advance: ms => { time += ms; } };
}

test('actual playback hides only its service, persists after restart and never cancels the other delivery', async t => {
  const { queue, create, db } = fixture(t);
  const item = await queue.add({ provider: 'spotify', id: '1' }, 2); await queue.flush();
  const state = { uri: 'spotify:track:1', playing: false, durationMs: 200000, positionMs: 0 };
  await queue.observeSpotify(state); assert.equal(queue.list()[0].spotify_started_at, null);
  assert.equal(await queue.observeSpotify({ ...state, uri: 'spotify:track:other', playing: true }), null);
  await queue.observeSpotify({ ...state, playing: true });
  assert.equal(queue.list()[0].spotify_started_at, 1000);
  assert.equal(queue.list()[0].apple_status, 'pending');
  assert.equal(db.prepare('SELECT archived FROM playback_queue WHERE id=?').get(item.id).archived, 0);
  assert.equal(create().list()[0].spotify_started_at, 1000);
  await assert.rejects(queue.startedApple(item.id), /reçu/);
  const delivery = await queue.claimApple('browser');
  await queue.acknowledgeApple(item.id, delivery.claim, true);
  await queue.startedApple(item.id); await queue.startedApple(item.id);
  assert.equal(queue.list()[0].apple_started_at, 1000);
});

test('observed playback resolves a lost Spotify acknowledgement and releases following items without replay', async t => {
  const { queue, adapters, sends } = fixture(t);
  adapters.spotify.queue = async () => { throw new ProviderError('spotify', 502, 'network_error', true); };
  const first = await queue.add({ provider: 'spotify', id: '1' }, 2); await queue.flush();
  await queue.add({ provider: 'spotify', id: '2' }, 2); await queue.flush();
  assert.equal(queue.list()[0].spotify_status, 'uncertain');
  await queue.observeSpotify({ uri: 'spotify:track:replacement', originalUri: 'spotify:track:1', playing: true, positionMs: 0, durationMs: 200000 });
  assert.equal(queue.list()[0].id, first.id); assert.equal(queue.list()[0].spotify_status, 'sent');
  adapters.spotify.queue = async track => sends.push(track.spotify_uri);
  await queue.flush(); assert.deepEqual(sends, ['spotify:track:2']);
});

test('Apple-only unmatched row cannot match an unrelated Spotify snapshot with no relinking id', async t => {
  const { queue, adapters } = fixture(t);
  adapters.spotify.isrc = async () => [];
  await queue.add({ provider: 'apple', id: '1' }, 1); await queue.flush();
  assert.equal(await queue.observeSpotify({ uri: 'spotify:track:other', playing: true }), null);
  assert.equal(queue.list()[0].spotify_started_at, null);
});

test('queue deduplicates simultaneous cross-catalog additions without any playlist', async t => {
  const { queue, sends, store } = fixture(t);
  const rows = await Promise.all([queue.add({ provider:'spotify',id:'1' },2), queue.add({provider:'apple',id:'1'},1)]);
  await Promise.all([queue.flush(),queue.flush(),queue.flush()]);
  assert.equal(rows[0].id, rows[1].id); assert.equal(queue.list().length,1);
  assert.deepEqual(sends,['spotify:track:1']); assert.deepEqual(store.list(),[]);
  assert.equal(store.state('spotify:playlist'),null);
  await assert.rejects(queue.retry(rows[0].id,'spotify',true),/relance/);
});
test('Spotify failure blocks following titles; ambiguous sends require explicit verification', async t => {
  const { queue, adapters, sends } = fixture(t);
  adapters.spotify.queue = async () => { throw new ProviderError('spotify',502,'network_error',true); };
  const first = await queue.add({provider:'spotify',id:'1'},2);
  await queue.add({provider:'spotify',id:'2'},2); await queue.flush();
  assert.equal(queue.list()[0].spotify_status,'uncertain'); assert.equal(queue.list()[1].spotify_status,'pending');
  await assert.rejects(queue.retry(first.id,'spotify',false),/Vérifie/);
  adapters.spotify.queue = async q => { sends.push(q.spotify_uri); };
  await queue.retry(first.id,'spotify',true); await queue.flush();
  assert.deepEqual(sends,['spotify:track:1','spotify:track:2']);
});
test('restart preserves queue and never replays an in-flight Spotify write', async t => {
  const { queue, db, create, sends } = fixture(t);
  const item = await queue.add({provider:'spotify',id:'1'},2); await queue.flush();
  db.prepare("UPDATE playback_queue SET spotify_status='sending' WHERE id=?").run(item.id);
  const restarted = create(); await restarted.flush();
  assert.equal(restarted.list()[0].spotify_status,'uncertain'); assert.equal(sends.length,1);
});
test('Apple claims isolate receivers, hide tokens and reject forged, expired and repeated acknowledgements', async t => {
  const { queue, advance } = fixture(t);
  await queue.add({provider:'apple',id:'1'},2);
  const claim = await queue.claimApple('tab-a');
  assert.ok(claim.claim); assert.equal('apple_claim' in queue.list()[0],false);
  assert.equal(await queue.claimApple('tab-a'),null);
  await assert.rejects(queue.claimApple('tab-b'),/autre onglet/);
  await assert.rejects(queue.acknowledgeApple(claim.item.id,'forged',true));
  await assert.rejects(queue.archive(claim.item.id),/cours/);
  advance(61000);
  await assert.rejects(queue.acknowledgeApple(claim.item.id,claim.claim,true),/expirée/);
  assert.equal(queue.list()[0].apple_status,'uncertain');
  await queue.retry(claim.item.id,'apple',true);
  const next = await queue.claimApple('tab-a'); assert.notEqual(next.claim,claim.claim);
  await queue.acknowledgeApple(next.item.id,next.claim,true);
  await assert.rejects(queue.acknowledgeApple(next.item.id,next.claim,true));
  await assert.rejects(queue.retry(next.item.id,'apple',true));
});
test('unmatched queue stores candidates and manual match enables ordered Apple reception', async t => {
  const { queue, adapters } = fixture(t);
  adapters.apple.isrc = async () => []; adapters.apple.search = async () => [{ title:'Autre',artist:'Autre',remote_id:'9',apple_catalog_id:'9' }];
  const row = await queue.add({provider:'spotify',id:'1'},2);
  assert.equal(await queue.claimApple('tab'),null);
  assert.equal(queue.list()[0].apple_status,'unmatched'); assert.equal(queue.list()[0].apple_candidates.length,1);
  await queue.match(row.id,'apple','9');
  assert.equal((await queue.claimApple('tab')).item.apple_catalog_id,'9');
});
test('archiving cancels pending deliveries only; repeated listening requires an explicit new addition', async t => {
  const { queue, store, sends } = fixture(t);
  store.db.prepare("DELETE FROM playlist_tokens WHERE provider='spotify'").run();
  const row = await queue.add({provider:'spotify',id:'1'},2);
  await queue.archive(row.id);
  store.saveToken('spotify',2,{}); await queue.flush(); assert.equal(sends.length,0);
  const next = await queue.add({provider:'spotify',id:'1'},2); await queue.flush();
  assert.notEqual(row.id,next.id); assert.equal(sends.length,1);
});
test('Spotify uses queue POST and persists quota cooldown before retrying', async t => {
  const { store } = fixture(t); const calls=[];
  store.saveToken('spotify',2,{access_token:'test',expiresAt:Date.now()+600000});
  const api = createProviders(store,{},async (url,opts) => { calls.push({url,opts}); return Response.json({error:{reason:'QUOTA_EXCEEDED'}},{status:429,headers:{'Retry-After':'60'}}); });
  await assert.rejects(api.spotify.queue({spotify_uri:'spotify:track:1'}),/QUOTA/);
  await assert.rejects(api.spotify.queue({spotify_uri:'spotify:track:1'}),/QUOTA/);
  assert.equal(calls.length,1); assert.equal(calls[0].opts.method,'POST');
  assert.equal(new URL(calls[0].url).pathname,'/v1/me/player/queue');
  assert.equal(new URL(calls[0].url).searchParams.get('uri'),'spotify:track:1');
});
test('browser initializes then appends MusicKit queue, and never replays after a lost acknowledgement', async () => {
  const calls=[]; let claimed = false;
  const api = { queueClaimApple: async () => { if (claimed) return {delivery:null}; claimed=true; return {delivery:{item:{id:1,apple_catalog_id:'123'},claim:'secret'}}; },
    queueAppleAck: async (_id,_claim,delivered) => { assert.equal(delivered,true); throw new Error('network'); } };
  const music = { queue:{items:[]},setQueue:async d => { calls.push(d); },playLater:async () => { throw new Error('unexpected'); } };
  await assert.rejects(receiveApple(api,music),/network/);
  assert.equal(await receiveApple(api,music),false); assert.deepEqual(calls,[{song:'123'}]);
  claimed=false; api.queueAppleAck=async () => {}; music.queue.items=[{}];
  music.playLater=async d => { calls.push(d); }; await receiveApple(api,music); assert.equal(calls.length,2);
});
test('browser reports uncertain failure and cancels side effects after leaving the page', async () => {
  const ack=[];
  const api={queueClaimApple:async () => ({delivery:{item:{id:1,apple_catalog_id:'123'},claim:'secret'}}),queueAppleAck:async (...args) => ack.push(args)};
  const music={setQueue:async () => { throw new Error('MusicKit refused'); }};
  await assert.rejects(receiveApple(api,music),/refused/); assert.equal(ack[0][2],false);
  assert.equal(await receiveApple(api,music,() => false),false); assert.equal(ack[1][2],false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayedPosition, applePlayback, waitingTracks } from '../src/pages/playbackProgress.js';
import { createPlaybackStatus } from '../server/playlist/playbackStatus.js';

test('progress handles pause, seeking, end and stale snapshots without inventing completion', () => {
  const sample = { current: { positionMs: 10000, durationMs: 30000, playing: true }, receivedAt: 1000, ageMs: 2000 };
  assert.equal(displayedPosition(sample, 4000), 15000);
  assert.equal(displayedPosition({ ...sample, current: { ...sample.current, playing: false } }, 5000), 10000);
  assert.equal(displayedPosition(sample, 60000), 25000); // bounded 15 s extrapolation
  assert.equal(displayedPosition({ ...sample, current: { ...sample.current, positionMs: 29000 } }, 5000), 30000);
  assert.equal(displayedPosition({ ...sample, current: { ...sample.current, positionMs: 1000 } }, 1000), 3000);
  assert.equal(displayedPosition(null), 0);
});
test('Apple actual player time is in seconds; paused or merely delivered items are not considered started', () => {
  const items = [{ id: 1, apple_catalog_id: '123', title: 'Test', apple_status: 'sent' }];
  const music = { isAuthorized: true, nowPlayingItem: { id: '123' }, currentPlaybackTime: 32.5, currentPlaybackDuration: 180, isPlaying: false };
  const current = applePlayback(music, items);
  assert.equal(current.positionMs, 32500); assert.equal(current.durationMs, 180000); assert.equal(current.playing, false);
  assert.equal(waitingTracks(items, 'apple').length, 1);
  assert.equal(waitingTracks(items, 'apple', [1]).length, 0);
  assert.equal(applePlayback({ ...music, nowPlayingItem: { id: 'unrelated' } }, items), null);
  assert.equal(applePlayback({ ...music, isAuthorized: false }, items), null);
  assert.equal(applePlayback({ ...music, currentPlaybackTime: NaN }, items), null);
});
test('queue visibility is independent per service and survives reload via persisted start markers', () => {
  const items = [{ id: 1, spotify_started_at: 1000, apple_started_at: null }, { id: 2 }];
  assert.deepEqual(waitingTracks(items, 'spotify').map(q => q.id), [2]);
  assert.deepEqual(waitingTracks(items, 'apple').map(q => q.id), [1, 2]);
});
test('Spotify status shares reads across tabs, replaces paused/empty state and sanitizes errors', async () => {
  let calls = 0, now = 1000, value = { playing: true }, error;
  const status = createPlaybackStatus(async () => { calls++; if (error) throw error; return value; }, () => now);
  await Promise.all([status.get(), status.get(), status.get()]); assert.equal(calls, 1);
  now += 4000; assert.equal((await status.get()).ageMs, 4000); assert.equal(calls, 1);
  now += 1000; value = { playing: false }; assert.equal((await status.get()).snapshot.playing, false);
  now += 5000; value = null; assert.equal((await status.get()).snapshot, null);
  now += 5000; error = new Error('sensitive response'); assert.equal((await status.get()).error, 'unavailable');
  const failedCalls = calls; now += 5000; await status.get(); assert.equal(calls, failedCalls);
  error = null; status.invalidate(); await status.get(); assert.equal(calls, failedCalls + 1);
});
test('cache invalidation during a read does not expose the old account state', async () => {
  let resolve;
  const status = createPlaybackStatus(() => new Promise(r => { resolve = r; }));
  const pending = status.get(); status.invalidate(); resolve({ playing: true });
  assert.equal((await pending).snapshot, null);
});

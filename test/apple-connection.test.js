import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeApple } from '../src/pages/appleConnection.js';

const userToken = 'test-user-token-with-sufficient-length';
test('Apple authorize starts synchronously in click and saves only after SDK authorization', async () => {
  let resolve, started = false, saved = false;
  const progress = [];
  const result = authorizeApple({ music: { authorize() { started = true; return new Promise(r => { resolve = r; }); } },
    save: async token => { assert.equal(token, userToken); saved = true; }, progress: text => progress.push(text) });
  assert.equal(started, true); assert.equal(saved, false);
  resolve(userToken); await result;
  assert.equal(saved, true); assert.equal(progress.length, 3);
});
test('Apple SDK rejection is sanitized and does not save a user token', async () => {
  let saved = false;
  await assert.rejects(authorizeApple({ music: { authorize: async () => { throw new Error('Unauthorized sensitive-detail'); } },
    save: async () => { saved = true; } }), e => /MusicKit/.test(e.message) && !/sensitive-detail/.test(e.message));
  assert.equal(saved, false);
});
test('Apple late authorization after timeout cannot save and requires reload', async () => {
  let resolve, saved = false;
  const result = authorizeApple({ music: { authorize: () => new Promise(r => { resolve = r; }) },
    save: async () => { saved = true; }, timeoutMs: 10 });
  await assert.rejects(result, e => e.needsReload === true);
  resolve(userToken); await new Promise(r => setImmediate(r));
  assert.equal(saved, false);
});
test('Apple rejects missing tokens and cancelled page before server save', async () => {
  let saved = false;
  const save = async () => { saved = true; };
  for (const token of [undefined, '', {}, 'short']) {
    await assert.rejects(authorizeApple({ music: { authorize: async () => token }, save }), /utilisable/);
  }
  await assert.rejects(authorizeApple({ music: { authorize: async () => userToken }, save, isActive: () => false }), /interrompue/);
  assert.equal(saved, false);
});
test('Apple server validation failure never announces success', async () => {
  const progress = [];
  await assert.rejects(authorizeApple({ music: { authorize: async () => userToken },
    save: async () => { throw new Error('Compte refusé par le serveur'); }, progress: text => progress.push(text) }), /serveur/);
  assert.equal(progress.length, 2);
});

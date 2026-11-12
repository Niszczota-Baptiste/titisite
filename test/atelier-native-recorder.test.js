import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

// Adaptateur de l'enregistreur natif de l'application (src/mobile/platform/
// recorder.js), face à un faux pont Capacitor : ce que l'interface promet à
// l'utilisateur sur le sort d'une prise.

function fakeBridge() {
  const calls = [];
  const listeners = new Map();
  const answers = { status: { status: 'idle', elapsedMs: 0 } };
  return {
    calls, answers,
    emit(event, data) { for (const fn of listeners.get(event) || []) fn(data); },
    listenerCount: (event) => (listeners.get(event) || new Set()).size,
    Capacitor: {
      isNativePlatform: () => true,
      convertFileSrc: (path) => `https://site.test/_capacitor_file_${path}`,
      nativePromise: async (plugin, method, args) => {
        calls.push([plugin, method, args]);
        const a = answers[method];
        if (a instanceof Error) throw a;
        return typeof a === 'function' ? a(args) : a;
      },
      addListener: (plugin, event, fn) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return { remove: () => listeners.get(event).delete(fn) };
      },
    },
  };
}

const nativeTake = { id: 't1', path: '/data/user/0/fr.monatelier/files/vault/takes/t1.m4a', name: 'prise-20260101-101500.m4a', mime: 'audio/mp4', sizeBytes: 4096, durationMs: 2500, integrity: 'ok', markers: [{ tMs: 900, label: '', kind: 'marker' }], capturedAt: 1_767_262_500 };

describe('enregistreur natif — adaptateur', () => {
  let bridge;
  let mod;
  beforeEach(async () => {
    bridge = fakeBridge();
    globalThis.window = { Capacitor: bridge.Capacitor };
    mod = await import('../src/mobile/platform/recorder.js');
  });
  afterEach(() => { delete globalThis.window; });

  const named = (method) => bridge.calls.filter((c) => c[1] === method);

  it('retrouve une prise déjà en cours quand on rouvre l\'écran', async () => {
    bridge.answers.status = { status: 'paused', elapsedMs: 61_000, notice: 'Appel en cours : la prise est en pause.' };
    const rec = await mod.createNativeRecorder();
    assert.deepEqual({ status: rec.getState().status, elapsedMs: rec.getState().elapsedMs }, { status: 'paused', elapsedMs: 61_000 });
    assert.match(rec.getState().notice, /Appel/);
  });

  it('quitter l\'écran n\'arrête pas la prise : aucune commande d\'arrêt ni d\'abandon', async () => {
    bridge.answers.status = { status: 'recording', elapsedMs: 5000 };
    const rec = await mod.createNativeRecorder();
    await rec.cancel();
    assert.deepEqual(bridge.calls.map((c) => c[1]), ['status']);
    assert.equal(bridge.listenerCount('state'), 0, 'écouteurs retirés');
    assert.equal(bridge.listenerCount('finished'), 0);
  });

  it('la prise rendue pointe sur le fichier de l\'appareil, jamais sur des octets passés par le pont', async () => {
    bridge.answers.stop = { take: nativeTake };
    const rec = await mod.createNativeRecorder();
    const take = await rec.stop();
    assert.equal(take.previewUrl, `https://site.test/_capacitor_file_${nativeTake.path}`);
    assert.equal(take.nativeFile.path, nativeTake.path);
    assert.equal(take.nativeFile.role, 'audio');
    assert.equal(take.source, 'recorded');
    assert.equal(take.markers.length, 1);
    assert.ok(!JSON.stringify(bridge.calls).includes('base64'));
  });

  it('libérer une prise prévient le natif une seule fois', async () => {
    bridge.answers.stop = { take: nativeTake };
    const rec = await mod.createNativeRecorder();
    const take = await rec.stop();
    take.release();
    take.release();
    assert.deepEqual(named('release').map((c) => c[2]), [{ id: 't1' }]);
  });

  it('une prise arrêtée depuis la notification arrive à l\'écran d\'enregistrement', async () => {
    const rec = await mod.createNativeRecorder();
    const got = [];
    rec.onTake((t) => got.push(t));
    bridge.emit('finished', { take: { ...nativeTake, integrity: 'recovered' } });
    bridge.emit('finished', { take: null }); // rien d'écoutable : rien à montrer
    assert.equal(got.length, 1);
    assert.equal(got[0].integrity, 'recovered');
  });

  it('une erreur du natif garde son code et sa phrase', async () => {
    bridge.answers.prepare = Object.assign(new Error('Un appel est en cours : le micro n\'est pas disponible.'), { code: 'mic_busy' });
    const rec = await mod.createNativeRecorder();
    await assert.rejects(() => rec.prepare(), (e) => e.code === 'mic_busy' && /appel/.test(e.nativeMessage));
  });

  it('les prises dues sont rendues telles que le natif les décrit', async () => {
    bridge.answers.recover = { takes: [nativeTake, { ...nativeTake, id: 't2', integrity: 'recovered' }] };
    const takes = await mod.recoverTakes();
    assert.deepEqual(takes.map((t) => t.integrity), ['ok', 'recovered']);
    assert.deepEqual(takes.map((t) => t.nativeFile.id), ['t1', 't2']);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beatTime, beatsFromSignature, clampBpm, dueClicks, recordingPlan, retime, tapTempo,
} from '../src/components/author/audio/metronome.js';
import {
  clampMs, formatBytes, formatMs, loopJump, neighbourMarker, normalizeLoop, sortMarkers,
} from '../src/components/author/audio/time.js';

// Atelier musical — logique pure du lecteur (boucles, repères), du métronome et
// du tap tempo. Le son est produit par le navigateur ; ici on vérifie les
// instants.

describe('métronome — précision', () => {
  it('ne dérive pas : le 10 000e clic tombe exactement à ancre + rang × 60 / bpm', () => {
    const anchor = 12.5;
    for (const bpm of [40, 92, 120, 137.5, 240]) {
      assert.equal(beatTime(anchor, 10_000, bpm), anchor + 10_000 * (60 / bpm));
      // Planifier par petites fenêtres donne les mêmes instants qu'un calcul direct.
      let state = { nextIndex: 0 };
      const times = [];
      for (let now = anchor; times.length < 500; now += 0.025) {
        const { clicks, nextIndex } = dueClicks({ anchor, bpm, nextIndex: state.nextIndex, now });
        for (const c of clicks) times.push(c.time);
        state = { nextIndex };
      }
      times.slice(0, 500).forEach((t, i) => assert.ok(Math.abs(t - (anchor + i * (60 / bpm))) < 1e-9, `bpm ${bpm}, clic ${i}`));
    }
  });

  it('planifie chaque clic une seule fois, accentue le premier temps, et saute un clic manqué au lieu de le jouer en retard', () => {
    const base = { anchor: 0, bpm: 120, beatsPerBar: 3 };
    const a = dueClicks({ ...base, nextIndex: 0, now: 0 });
    assert.deepEqual(a.clicks.map((c) => [c.index, c.time, c.accent]), [[0, 0, true]]);
    const b = dueClicks({ ...base, nextIndex: a.nextIndex, now: 0.05 });
    assert.deepEqual(b.clicks, [], 'rien de nouveau dans la fenêtre');
    const c = dueClicks({ ...base, nextIndex: b.nextIndex, now: 0.45 });
    assert.deepEqual(c.clicks.map((x) => [x.index, x.time, x.accent]), [[1, 0.5, false]]);
    // Le fil d'exécution a été bloqué 2 s : les clics 2 à 4 sont passés, on reprend au suivant.
    const late = dueClicks({ ...base, nextIndex: c.nextIndex, now: 2.45 });
    assert.deepEqual(late.clicks.map((x) => x.index), [5]);
    assert.equal(late.clicks[0].time, 2.5);
    assert.equal(dueClicks({ ...base, nextIndex: 0, now: 1.45 }).clicks.at(-1).accent, true, 'temps 3 = début de mesure');
  });

  it('change de tempo sans à-coup : le prochain clic garde sa place', () => {
    const state = { anchor: 10, bpm: 120, nextIndex: 7 };
    const next = beatTime(state.anchor, state.nextIndex, state.bpm);
    const anchor = retime(state, 90);
    assert.ok(Math.abs(beatTime(anchor, 7, 90) - next) < 1e-9);
    assert.ok(Math.abs(beatTime(anchor, 8, 90) - (next + 60 / 90)) < 1e-9);
  });

  it('borne le tempo et lit la mesure', () => {
    assert.equal(clampBpm(5), 20);
    assert.equal(clampBpm(999), 400);
    assert.equal(clampBpm(92), 92);
    assert.equal(beatsFromSignature('3/4'), 3);
    assert.equal(beatsFromSignature(' 6 / 8 '), 6);
    assert.equal(beatsFromSignature(''), 4);
    assert.equal(beatsFromSignature('valse'), 4);
  });
});

describe('tap tempo', () => {
  const taps = (bpm, n, start = 1000, jitter = () => 0) => Array.from({ length: n }, (_, i) => start + i * (60000 / bpm) + jitter(i));

  it('retrouve le tempo tapé, à quelques dixièmes près malgré l\'imprécision du doigt', () => {
    assert.equal(tapTempo(taps(120, 6)).bpm, 120);
    assert.equal(tapTempo(taps(92, 8)).bpm, 92);
    const wobble = tapTempo(taps(100, 9, 0, (i) => [0, 12, -9, 7, -14, 10, -6, 4, -3][i]));
    assert.ok(Math.abs(wobble.bpm - 100) < 1.5, `≈100, obtenu ${wobble.bpm}`);
  });

  it('demande au moins deux tapes, repart après un silence et ignore une tape manquée', () => {
    assert.equal(tapTempo([]), null);
    assert.equal(tapTempo([500]), null);
    // Ancienne série à 60, silence, nouvelle série à 150 : seule la nouvelle compte.
    const mixed = [...taps(60, 4, 0), ...taps(150, 5, 20_000)];
    assert.equal(tapTempo(mixed).bpm, 150);
    // Une tape manquée (écart double) ne fausse pas la mesure.
    const missed = taps(120, 8).filter((_, i) => i !== 4);
    assert.equal(tapTempo(missed).bpm, 120);
    assert.equal(tapTempo([0, 10]), null, 'hors bornes (6000 bpm)');
  });
});

describe('métronome et enregistrement', () => {
  it('se tait pendant la prise, sauf au casque ; le décompte précède la prise', () => {
    assert.deepEqual(recordingPlan({ metronomeOn: false, bpm: 120, countInBars: 2 }), { countInBeats: 0, countInMs: 0, clickDuringTake: false });
    assert.deepEqual(recordingPlan({ metronomeOn: true, bpm: 120, beatsPerBar: 4, countInBars: 1 }), { countInBeats: 4, countInMs: 2000, clickDuringTake: false });
    assert.deepEqual(recordingPlan({ metronomeOn: true, bpm: 90, beatsPerBar: 3, countInBars: 2, headphones: true }), { countInBeats: 6, countInMs: 4000, clickDuringTake: true });
    assert.equal(recordingPlan({ metronomeOn: true, bpm: 0, countInBars: 1 }).countInBeats, 0, 'tempo invalide : pas de décompte');
  });
});

describe('lecteur — boucles et repères', () => {
  it('formate les durées', () => {
    assert.equal(formatMs(0), '0:00');
    assert.equal(formatMs(65_400), '1:05');
    assert.equal(formatMs(65_400, { tenths: true }), '1:05,4');
    assert.equal(formatMs(3_725_000), '1:02:05');
    assert.equal(formatBytes(900), '900 o');
    assert.equal(formatBytes(3_500_000), '3,3 Mo');
    assert.equal(formatBytes(120_000_000), '114 Mo');
  });

  it('une boucle est bornée à la prise, ordonnée, et d\'au moins 200 ms', () => {
    assert.deepEqual(normalizeLoop(900, 200, 5000), { a: 200, b: 900 });
    assert.deepEqual(normalizeLoop(4000, 9000, 5000), { a: 4000, b: 5000 });
    assert.equal(normalizeLoop(1000, 1100, 5000), null);
    assert.equal(normalizeLoop(null, 900, 5000), null);
    assert.equal(clampMs(-5, 1000), 0);
    assert.equal(clampMs(1500.6, 1000), 1000);
  });

  it('revient au début de la boucle à sa fin, sans rattraper une écoute qui précède', () => {
    const loop = { a: 2000, b: 4000 };
    assert.equal(loopJump(1000, loop), null);
    assert.equal(loopJump(3999, loop), null);
    assert.equal(loopJump(4000, loop), 2000);
    assert.equal(loopJump(4500, loop), 2000);
    assert.equal(loopJump(4500, null), null);
  });

  it('trie les repères et trouve le précédent et le suivant', () => {
    const markers = [{ id: 3, tMs: 9000 }, { id: 1, tMs: 1000 }, { id: 2, tMs: 4000 }];
    assert.deepEqual(sortMarkers(markers).map((m) => m.id), [1, 2, 3]);
    assert.equal(neighbourMarker(markers, 4200, +1).id, 3);
    assert.equal(neighbourMarker(markers, 9000, +1), null);
    // Juste après un repère, « précédent » vise celui d'avant (sinon on resterait bloqué dessus).
    assert.equal(neighbourMarker(markers, 4200, -1).id, 1);
    assert.equal(neighbourMarker(markers, 5000, -1).id, 2);
    assert.equal(neighbourMarker(markers, 500, -1), null);
  });
});

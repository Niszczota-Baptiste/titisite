import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bearingDeg, bearingInfo, cardinal8, cardinal16, distance2D, nearestAxis, ringFrom,
} from '../server/lore/geo.js';

// Le module géo est LA zone à risque du lore : en coordonnées Minecraft,
// X croît vers l'est mais Z croît vers le SUD — le nord est Z décroissant.
// Ces tests verrouillent la convention (0° = nord = -Z) et les 8 secteurs.

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const O = { x: 0, z: 0 };

describe('bearingDeg — nord = Z décroissant', () => {
  it('plein nord (Z décroît) → 0°', () => close(bearingDeg(O, { x: 0, z: -10 }), 0));
  it('plein est (X croît) → 90°', () => close(bearingDeg(O, { x: 10, z: 0 }), 90));
  it('plein sud (Z croît) → 180°', () => close(bearingDeg(O, { x: 0, z: 10 }), 180));
  it('plein ouest (X décroît) → 270°', () => close(bearingDeg(O, { x: -10, z: 0 }), 270));
  it('diagonales exactes', () => {
    close(bearingDeg(O, { x: 10, z: -10 }), 45);   // NE
    close(bearingDeg(O, { x: 10, z: 10 }), 135);   // SE
    close(bearingDeg(O, { x: -10, z: 10 }), 225);  // SO
    close(bearingDeg(O, { x: -10, z: -10 }), 315); // NO
  });
  it('points confondus → null (pas d\'angle)', () => {
    assert.equal(bearingDeg(O, { x: 0, z: 0 }), null);
  });
  it('cas réel : KotaNostra → B6 est quasi plein nord', () => {
    // KotaNostra (-353, -5636) → B6 (206, -7940) : dz négatif dominant.
    const deg = bearingDeg({ x: -353, z: -5636 }, { x: 206, z: -7940 });
    assert.ok(deg > 10 && deg < 20, `attendu ~13.6°, obtenu ${deg}`);
    assert.equal(cardinal8(deg), 'N');
  });
});

describe('cardinal8 — 8 secteurs de 45° centrés sur les axes', () => {
  it('les 8 centres', () => {
    const expected = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    expected.forEach((c, i) => assert.equal(cardinal8(i * 45), c));
  });
  it('bornes de secteur : N couvre [337.5, 22.5)', () => {
    assert.equal(cardinal8(22.4), 'N');
    assert.equal(cardinal8(22.5), 'NE');
    assert.equal(cardinal8(337.5), 'N');
    assert.equal(cardinal8(337.4), 'NO');
    assert.equal(cardinal8(359.9), 'N');
  });
});

describe('cardinal16', () => {
  it('centres et bornes', () => {
    assert.equal(cardinal16(0), 'N');
    assert.equal(cardinal16(22.5), 'NNE'); // 22.5° est le CENTRE de NNE
    assert.equal(cardinal16(45), 'NE');
    assert.equal(cardinal16(11.25), 'NNE'); // borne N/NNE, arrondi au demi supérieur
    assert.equal(cardinal16(11.24), 'N');
    assert.equal(cardinal16(348.75), 'N');
    assert.equal(cardinal16(202.5), 'SSO');
  });
});

describe('nearestAxis — écart signé au plus proche des 8 axes', () => {
  it('écart horaire positif', () => {
    const a = nearestAxis(46);
    assert.equal(a.cardinal, 'NE');
    close(a.deviationDeg, 1);
  });
  it('wrap autour du nord : 359° → N, écart -1°', () => {
    const a = nearestAxis(359);
    assert.equal(a.cardinal, 'N');
    assert.equal(a.axisDeg, 0);
    close(a.deviationDeg, -1);
  });
  it('pile sur un axe → écart nul', () => {
    close(nearestAxis(180).deviationDeg, 0);
  });
});

describe('distance2D', () => {
  it('euclidienne sur X/Z', () => close(distance2D(O, { x: 3, z: 4 }), 5));
});

describe('bearingInfo / ringFrom', () => {
  it('bearingInfo agrège distance + secteurs', () => {
    const info = bearingInfo(O, { x: 0, z: -100 });
    close(info.distance, 100);
    close(info.bearingDeg, 0);
    assert.equal(info.cardinal8, 'N');
    assert.equal(info.cardinal16, 'N');
  });
  it('ringFrom trie par angle, exclut l\'origine, marque les alignés à ±2°', () => {
    const pts = [
      { id: 1, x: 100, z: 2 },    // ~91.1° — E, écart ~1.1° → aligné
      { id: 2, x: 5, z: -100 },   // ~2.9° — N, écart > 2° → pas aligné
      { id: 3, x: 0, z: 0 },      // confondu avec l'origine → exclu
      { id: 4, x: -50, z: 0 },    // 270° — O, pile sur l'axe → aligné
    ];
    const ring = ringFrom(O, pts, { tolerance: 2 });
    assert.deepEqual(ring.map((p) => p.id), [2, 1, 4]); // tri par bearing croissant
    assert.equal(ring.find((p) => p.id === 1).aligned, true);
    assert.equal(ring.find((p) => p.id === 2).aligned, false);
    assert.equal(ring.find((p) => p.id === 4).aligned, true);
    assert.equal(ring.find((p) => p.id === 4).nearestAxisCardinal, 'O');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bearingDirection, imagePlacement, measureDistance, toPct, zoomAt,
} from '../src/components/lore/mapMath.js';

// La carte affiche le nord en haut : Z croît vers le bas de l'écran. Ces
// tests verrouillent la conversion relèvement → direction monde et le
// placement de l'image calibrée par les deux points de référence de Nostra.

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

describe('bearingDirection — 0° = nord = Z décroissant', () => {
  it('les 4 axes', () => {
    let d = bearingDirection(0);
    close(d.dx, 0); close(d.dz, -1);   // nord : Z décroît
    d = bearingDirection(90);
    close(d.dx, 1); close(d.dz, 0);    // est : X croît
    d = bearingDirection(180);
    close(d.dx, 0); close(d.dz, 1);    // sud : Z croît
    d = bearingDirection(270);
    close(d.dx, -1); close(d.dz, 0);   // ouest : X décroît
  });
  it('diagonale NE', () => {
    const d = bearingDirection(45);
    close(d.dx, Math.SQRT1_2); close(d.dz, -Math.SQRT1_2);
  });
});

describe('imagePlacement — calibration deux points du render Nostra', () => {
  const NOSTRA = { imgXLeft: -5353, imgXRight: 4646, imgZBottom: -636 };
  it('largeur 9999 blocs, bord bas ancré, le haut monte vers -Z', () => {
    // Ratio h/w 0.5 : une image deux fois plus large que haute.
    const p = imagePlacement(NOSTRA, 0.5);
    assert.equal(p.spanX, 9999);
    close(p.spanZ, 4999.5);
    assert.equal(p.left, -5353);
    close(p.top, -636 - 4999.5); // le haut de l'image est PLUS AU NORD (Z plus petit)
  });
  it('le centre X de l\'image tombe sur l\'axe de KotaNostra', () => {
    const p = imagePlacement(NOSTRA, 1);
    close(p.left + p.spanX / 2, -353.5); // KotaNostra : x = -353
  });
  it('calibration incomplète ou invalide → null', () => {
    assert.equal(imagePlacement({ imgXLeft: null, imgXRight: 4646, imgZBottom: -636 }, 1), null);
    assert.equal(imagePlacement({ imgXLeft: 10, imgXRight: -10, imgZBottom: 0 }, 1), null); // gauche > droite
    assert.equal(imagePlacement(NOSTRA, 0), null);
  });
});

describe('toPct / measureDistance / zoomAt', () => {
  const view = { cx: 0, cz: 0, span: 1000 };
  it('le centre est à 50/50, le nord au-dessus', () => {
    assert.deepEqual(toPct(view, 0, 0), { left: 50, top: 50 });
    const north = toPct(view, 0, -250);
    close(north.top, 25); // Z plus petit → plus haut à l'écran
    const east = toPct(view, 250, 0);
    close(east.left, 75);
  });
  it('measureDistance : hypoténuse X/Z', () => {
    close(measureDistance({ x: 0, z: 0 }, { x: 30, z: 40 }), 50);
  });
  it('zoomAt garde le point sous le curseur immobile', () => {
    const world = { x: 200, z: -100 };
    const before = toPct(view, world.x, world.z);
    const zoomed = zoomAt(view, world, 0.5);
    const after = toPct(zoomed, world.x, world.z);
    close(before.left, after.left);
    close(before.top, after.top);
    assert.equal(zoomed.span, 500);
  });
  it('zoomAt respecte les bornes de span', () => {
    assert.equal(zoomAt(view, { x: 0, z: 0 }, 1e9).span, 200000);
    assert.equal(zoomAt(view, { x: 0, z: 0 }, 1e-9).span, 32);
  });
});

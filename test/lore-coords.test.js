import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCoords, parseCoords } from '../src/components/lore/coords.js';

// Le champ coordonnées de l'éditeur d'entrée accepte tout ce qu'un joueur
// colle depuis le jeu — ces tests couvrent chaque format promis par la spec.

describe('parseCoords — formats acceptés', () => {
  it('« x z » nu', () => {
    assert.deepEqual(parseCoords('-353 -5636'), { x: -353, y: null, z: -5636 });
  });
  it('« x, y, z » avec virgules', () => {
    assert.deepEqual(parseCoords('-353, 64, -5636'), { x: -353, y: 64, z: -5636 });
  });
  it('valeurs étiquetées x=/z=', () => {
    assert.deepEqual(parseCoords('x=-353 z=-5636'), { x: -353, y: null, z: -5636 });
  });
  it('étiquettes avec deux-points et casse libre, ordre libre', () => {
    assert.deepEqual(parseCoords('Z: -5636, X: -353, Y: 64'), { x: -353, y: 64, z: -5636 });
  });
  it('collage direct depuis F3 (XYZ: … / … / …)', () => {
    assert.deepEqual(parseCoords('XYZ: -353.500 / 64.00000 / -5636.500'), { x: -353, y: 64, z: -5636 });
  });
  it('décimales avec virgule française', () => {
    assert.deepEqual(parseCoords('12,7 -8,2'), { x: 13, y: null, z: -8 });
  });
  it('entrée vide ou sans nombres → null', () => {
    assert.equal(parseCoords(''), null);
    assert.equal(parseCoords('au nord du temple'), null);
  });
  it('un seul nombre → null (x et z vont ensemble)', () => {
    assert.equal(parseCoords('-353'), null);
  });
});

describe('formatCoords', () => {
  it('avec et sans Y', () => {
    assert.equal(formatCoords({ x: -353, y: null, z: -5636 }), 'X -353 · Z -5636');
    assert.equal(formatCoords({ x: -353, y: 64, z: -5636 }), 'X -353 · Y 64 · Z -5636');
  });
  it('coordonnées absentes → chaîne vide', () => {
    assert.equal(formatCoords({ x: null, y: null, z: null }), '');
  });
});

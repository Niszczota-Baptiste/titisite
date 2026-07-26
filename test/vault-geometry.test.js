import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRow, cellAt, chestCells, facingForRow, fitView, lineCells, pairAxis, rectFrom, zoomAt,
} from '../src/components/vault/planGeometry.js';
import { computeWarnings, planTotals, zoneStats } from '../src/components/vault/capacity.js';

// Maths de la vue Plan + capacité : ce sont des fonctions pures, donc testables
// sans navigateur. Ce sont aussi les règles qui décident de ce que l'utilisateur
// voit (rangées, orientations, warnings), d'où les cas explicites ici.

const DIMS = { x: 125, y: 200, z: 125 };

describe('planGeometry — vue', () => {
  it('cadre le gabarit entier et garde le bloc sous le curseur au zoom', () => {
    const view = fitView(DIMS, 800, 600);
    const before = cellAt(view, 400, 300);
    const after = cellAt(zoomAt(view, 2, 400, 300), 400, 300);
    assert.deepEqual(after, before);
  });

  it('normalise un rectangle quel que soit le sens du glissé', () => {
    assert.deepEqual(
      rectFrom({ x: 40, z: 30 }, { x: 4, z: 4 }),
      { x0: 4, x1: 40, z0: 4, z1: 30 },
    );
  });

  it('ne troue pas la trace du pinceau entre deux événements souris', () => {
    const cells = lineCells({ x: 0, z: 0 }, { x: 5, z: 2 });
    assert.equal(cells.length, 6);
    assert.deepEqual(cells[0], [0, 0]);
    assert.deepEqual(cells.at(-1), [5, 2]);
  });
});

describe('planGeometry — coffres', () => {
  it('accole la paire d’un double perpendiculairement à son orientation', () => {
    assert.equal(pairAxis('south'), 'x');
    assert.equal(pairAxis('east'), 'z');
    assert.deepEqual(
      chestCells({ x: 6, z: 8, kind: 'double', facing: 'south' }),
      [[6, 8], [7, 8]],
    );
    assert.deepEqual(
      chestCells({ x: 6, z: 8, kind: 'double', facing: 'east' }),
      [[6, 8], [6, 9]],
    );
    assert.deepEqual(chestCells({ x: 6, z: 8, kind: 'single', facing: 'south' }), [[6, 8]]);
  });

  it('remplit une rangée en doubles 2 par 2, reste d’une case en simple', () => {
    const chests = buildRow({ x: 0, z: 5 }, { x: 6, z: 5 }, { dims: DIMS, y: 1 });
    // 7 cases → 3 doubles + 1 simple
    assert.equal(chests.length, 4);
    assert.equal(chests.filter((c) => c.kind === 'double').length, 3);
    assert.equal(chests.at(-1).kind, 'single');
    assert.equal(chests.reduce((n, c) => n + (c.kind === 'double' ? 54 : 27), 0), 3 * 54 + 27);
  });

  it('force les simples avec Maj', () => {
    const chests = buildRow({ x: 0, z: 5 }, { x: 3, z: 5 }, { dims: DIMS, y: 1, single: true });
    assert.equal(chests.length, 4);
    assert.ok(chests.every((c) => c.kind === 'single'));
  });

  it('oriente la rangée vers la circulation la plus proche', () => {
    // Couloir au sud de la rangée → les coffres doivent faire face au sud.
    const access = new Set(['0,7', '1,7', '2,7', '3,7']);
    assert.equal(facingForRow('x', null, [[0, 5], [1, 5], [2, 5], [3, 5]], access), 'south');
    const north = new Set(['0,3', '1,3', '2,3', '3,3']);
    assert.equal(facingForRow('x', null, [[0, 5], [1, 5], [2, 5], [3, 5]], north), 'north');
    // Une orientation explicite incompatible avec l'axe est ignorée.
    assert.equal(facingForRow('x', 'east', [[0, 5]], north), 'north');
  });

  it('ne pose pas un coffre dont la paire sortirait du gabarit', () => {
    const tiny = { x: 3, y: 10, z: 3 };
    const chests = buildRow({ x: 0, z: 0 }, { x: 2, z: 0 }, { dims: tiny, y: 1 });
    assert.ok(chests.every((c) => chestCells(c).every(([x, z]) => x < tiny.x && z < tiny.z)));
  });
});

describe('capacity — jauges et vérifications', () => {
  const zone = {
    id: 'z1', floorId: 'f1', rect: { x0: 0, z0: 0, x1: 10, z1: 10 },
    name: 'Redstone', color: '#b02e2e', categoryIds: [], reservedSlots: 0, reserved: false,
  };
  const floor = { id: 'f1', name: 'Rez', yMin: 0, yMax: 5, color: '#c8a24a' };
  const chest = (id, x, z, kind = 'double') => ({ id, zoneId: 'z1', x, y: 1, z, kind, facing: 'south' });

  it('applique les trois seuils de la jauge', () => {
    const chests = [chest('c1', 1, 1)]; // 54 slots
    assert.equal(zoneStats({ ...zone, reservedSlots: 20 }, chests).level, 'ok');
    assert.equal(zoneStats({ ...zone, reservedSlots: 50 }, chests).level, 'warn');
    assert.equal(zoneStats({ ...zone, reservedSlots: 60 }, chests).level, 'over');
  });

  it('exclut les zones réservées MàJ des totaux', () => {
    const doc = {
      floors: [floor],
      zones: [{ ...zone, reserved: true, reservedSlots: 999 }],
      chests: [chest('c1', 1, 1)],
      circulation: [],
    };
    const totals = planTotals(doc, DIMS);
    assert.equal(totals.slots, 0);
    assert.equal(totals.needed, 0);
    assert.equal(totals.reservedZones, 1);
    assert.ok(totals.reservedVolumePct > 0);
  });

  it('signale un coffre sans circulation adjacente, et se tait dès qu’il en a une', () => {
    const doc = {
      floors: [floor],
      zones: [zone],
      chests: [chest('c1', 4, 4)],
      circulation: [{ id: 'p1', kind: 'couloir', floorId: 'f1', cells: [[0, 0]] }],
    };
    assert.ok(computeWarnings(doc).some((w) => w.kind === 'chest_no_access'));

    doc.circulation[0].cells = [[4, 5]]; // case au sud du coffre
    assert.ok(!computeWarnings(doc).some((w) => w.kind === 'chest_no_access'));
  });

  it('signale un coffre hors zone, deux zones superposées et un étage isolé', () => {
    const doc = {
      floors: [floor, { id: 'f2', name: 'R+1', yMin: 6, yMax: 12 }],
      zones: [zone, { ...zone, id: 'z2', rect: { x0: 5, z0: 5, x1: 15, z1: 15 } }],
      chests: [{ ...chest('c1', 40, 40), zoneId: null }],
      circulation: [],
    };
    const kinds = computeWarnings(doc).map((w) => w.kind);
    assert.ok(kinds.includes('chest_outside_zone'));
    assert.ok(kinds.includes('zones_overlap'));
    assert.equal(kinds.filter((k) => k === 'floor_no_stairs').length, 2);
  });

  it('ne parle pas d’étage isolé quand il n’y en a qu’un', () => {
    const doc = { floors: [floor], zones: [], chests: [], circulation: [] };
    assert.ok(!computeWarnings(doc).some((w) => w.kind === 'floor_no_stairs'));
  });
});

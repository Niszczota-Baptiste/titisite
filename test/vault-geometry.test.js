import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildChests, cellAt, chestCells, fitView, lineCells, rectCells, rectFrom, straightLine,
  zoneAt, zoneLevelRange, zoomAt,
} from '../src/components/vault/planGeometry.js';
import {
  CHEST_SLOTS, computeWarnings, planTotals, storageIndex, zoneStats,
} from '../src/components/vault/capacity.js';

// Maths de la vue Plan + capacité : fonctions pures, testables sans navigateur.
// Ce sont aussi les règles qui décident de ce que l'utilisateur voit (murs,
// niveaux, annuaire, warnings), d'où les cas explicites ici.

const DIMS = { x: 125, y: 200, z: 125 };
const FLOOR = { id: 'f1', name: 'Rez', yMin: 0, yMax: 5, color: '#c8a24a' };
const ZONE = {
  id: 'z1', floorId: 'f1', rect: { x0: 0, z0: 0, x1: 9, z1: 9 }, yMin: 0, yMax: 4,
  name: 'Redstone', color: '#b02e2e', categoryIds: [], reservedSlots: 0, reserved: false,
};
const chest = (id, x, y, z, items = []) => ({ id, zoneId: 'z1', x, y, z, items });

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
    assert.deepEqual(cells.at(-1), [5, 2]);
  });
});

describe('planGeometry — coffres sans fond et murs', () => {
  it('un coffre occupe exactement une case', () => {
    assert.deepEqual(chestCells({ x: 6, z: 8 }), [[6, 8]]);
  });

  it('trace un mur droit sur l’axe dominant du glissé', () => {
    assert.equal(straightLine({ x: 0, z: 5 }, { x: 9, z: 7 }).length, 10);
    assert.deepEqual(straightLine({ x: 0, z: 5 }, { x: 9, z: 7 })[0], [0, 5]);
    // Glissé plutôt vertical → le mur suit Z.
    assert.deepEqual(straightLine({ x: 3, z: 0 }, { x: 4, z: 4 }).at(-1), [3, 4]);
  });

  it('monte le mur sur tous les niveaux de la zone', () => {
    const cells = straightLine({ x: 0, z: 0 }, { x: 9, z: 0 });
    const levels = zoneLevelRange(ZONE, FLOOR);
    assert.deepEqual(levels, [0, 1, 2, 3, 4]);
    const chests = buildChests(cells, levels, { dims: DIMS, zoneFor: () => 'z1' });
    assert.equal(chests.length, 50, '10 cases × 5 niveaux');
    assert.equal(new Set(chests.map((c) => c.y)).size, 5);
    assert.ok(chests.every((c) => c.items.length === 0 && c.zoneId === 'z1'));
  });

  it('plafonne la hauteur du mur quand on la limite', () => {
    assert.deepEqual(zoneLevelRange(ZONE, FLOOR, 2), [0, 1]);
  });

  it('ne double pas un coffre sur une case déjà occupée', () => {
    const cells = straightLine({ x: 0, z: 0 }, { x: 4, z: 0 });
    const occupied = new Set(['0:0,0', '0:1,0']);
    const chests = buildChests(cells, [0], { dims: DIMS, occupied });
    assert.equal(chests.length, 3);
  });

  it('remplit une zone entière (surface × niveaux)', () => {
    const chests = buildChests(rectCells(ZONE.rect), zoneLevelRange(ZONE, FLOOR), { dims: DIMS });
    assert.equal(chests.length, 100 * 5);
  });

  it('une zone ne capte que les niveaux qu’elle couvre', () => {
    const zones = [ZONE, { ...ZONE, id: 'z2', yMin: 5, yMax: 5 }];
    assert.equal(zoneAt(zones, 'f1', 3, 3, 2).id, 'z1');
    assert.equal(zoneAt(zones, 'f1', 3, 3, 5).id, 'z2');
    assert.equal(zoneAt(zones, 'f1', 3, 3, 9), null);
  });
});

describe('capacity — capacité, annuaire, vérifications', () => {
  it('compte 72 slots par coffre et l’avancement des affectations', () => {
    const chests = [chest('c1', 1, 1, 1), chest('c2', 2, 1, 1, ['redstone'])];
    const s = zoneStats(ZONE, chests);
    assert.equal(CHEST_SLOTS, 72);
    assert.equal(s.slots, 144);
    assert.equal(s.assigned, 1);
    assert.equal(s.free, 1);
    assert.equal(s.levels, 5);
  });

  it('applique les trois seuils de la jauge sur la réserve', () => {
    const chests = [chest('c1', 1, 1, 1)]; // 72 slots
    assert.equal(zoneStats({ ...ZONE, reservedSlots: 20 }, chests).level, 'ok');
    assert.equal(zoneStats({ ...ZONE, reservedSlots: 60 }, chests).level, 'warn');
    assert.equal(zoneStats({ ...ZONE, reservedSlots: 90 }, chests).level, 'over');
  });

  it('exclut les zones réservées MàJ des totaux', () => {
    const doc = {
      floors: [FLOOR],
      zones: [{ ...ZONE, reserved: true, reservedSlots: 999 }],
      chests: [chest('c1', 1, 1, 1)],
      circulation: [],
    };
    const totals = planTotals(doc, DIMS);
    assert.equal(totals.slots, 0);
    assert.equal(totals.needed, 0);
    assert.equal(totals.reservedZones, 1);
  });

  it('l’annuaire donne l’emplacement exact de chaque item, trié par nom', () => {
    const doc = {
      floors: [FLOOR],
      zones: [ZONE],
      chests: [chest('c1', 4, 2, 7, ['redstone']), chest('c2', 5, 2, 7, ['ampoule', 'levier'])],
      circulation: [],
    };
    const rows = storageIndex(doc);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.item), ['ampoule', 'levier', 'redstone']);
    const redstone = rows.find((r) => r.item === 'redstone');
    assert.deepEqual([redstone.x, redstone.y, redstone.z], [4, 2, 7]);
    assert.equal(redstone.zone.id, 'z1');
    assert.equal(redstone.floor.id, 'f1');
  });

  it('signale un coffre hors zone, hors niveaux, superposé, et un item en double', () => {
    const doc = {
      floors: [FLOOR],
      zones: [ZONE],
      chests: [
        { ...chest('c1', 40, 1, 40, []), zoneId: null }, // hors zone
        chest('c2', 3, 5, 3), // la zone s'arrête à 4
        chest('c3', 6, 1, 6, ['redstone']),
        chest('c4', 6, 1, 6, ['redstone']), // même case + même item
      ],
      circulation: [],
    };
    const kinds = computeWarnings(doc).map((w) => w.kind);
    assert.ok(kinds.includes('chest_outside_zone'));
    assert.ok(kinds.includes('chest_off_level'));
    assert.ok(kinds.includes('chests_overlap'));
    assert.ok(kinds.includes('item_duplicated'));
    // Le coffre sans fond s'ouvre de partout : plus de warning d'accessibilité.
    assert.ok(!kinds.includes('chest_no_access'));
  });

  it('deux zones peuvent partager une empreinte si elles occupent des niveaux distincts', () => {
    const doc = {
      floors: [FLOOR],
      zones: [ZONE, { ...ZONE, id: 'z2', yMin: 5, yMax: 5 }],
      chests: [],
      circulation: [],
    };
    assert.ok(!computeWarnings(doc).some((w) => w.kind === 'zones_overlap'));

    const stacked = { ...doc, zones: [ZONE, { ...ZONE, id: 'z2', yMin: 4, yMax: 5 }] };
    assert.ok(computeWarnings(stacked).some((w) => w.kind === 'zones_overlap'));
  });

  it('ne parle pas d’étage isolé quand il n’y en a qu’un', () => {
    const doc = { floors: [FLOOR], zones: [], chests: [], circulation: [] };
    assert.ok(!computeWarnings(doc).some((w) => w.kind === 'floor_no_stairs'));
  });
});

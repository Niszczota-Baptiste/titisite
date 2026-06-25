import test from 'node:test';
import assert from 'node:assert/strict';
import { transformProperties, isYMirrorSafe, __test } from '../server/worldedit/blockstates.js';
import {
  MemoryVolume, readSelection, mirrorSchematic, rotateSchematic, stampSchematic,
  opMirror, opRotate, opTranslate, opReplace, opSet, opCopy, opPaste, sameBlock, selectionSize,
  opWalls, opFaces, opHollow, opOverlay, opNaturalize, opStack, opSphere, opCyl, opSmooth,
} from '../server/worldedit/transform.js';

const ROT90 = { kind: 'rotate', quarts: 1 };
const MX = { kind: 'mirror', axis: 'x' };
const MZ = { kind: 'mirror', axis: 'z' };
const MY = { kind: 'mirror', axis: 'y' };

// ── Table d'états : une assertion par propriété ──────────────────────────────

test('facing : rotation horaire north→east→south→west', () => {
  assert.equal(transformProperties({ facing: 'north' }, ROT90).facing, 'east');
  assert.equal(transformProperties({ facing: 'east' }, ROT90).facing, 'south');
  assert.equal(transformProperties({ facing: 'west' }, ROT90).facing, 'north');
  assert.equal(transformProperties({ facing: 'up' }, ROT90).facing, 'up');
});

test('facing : miroir X (east↔west) et Z (north↔south)', () => {
  assert.equal(transformProperties({ facing: 'east' }, MX).facing, 'west');
  assert.equal(transformProperties({ facing: 'north' }, MX).facing, 'north');
  assert.equal(transformProperties({ facing: 'north' }, MZ).facing, 'south');
  assert.equal(transformProperties({ facing: 'east' }, MZ).facing, 'east');
});

test('axis : x↔z en rotation, inchangé en miroir', () => {
  assert.equal(transformProperties({ axis: 'x' }, ROT90).axis, 'z');
  assert.equal(transformProperties({ axis: 'z' }, ROT90).axis, 'x');
  assert.equal(transformProperties({ axis: 'y' }, ROT90).axis, 'y');
  assert.equal(transformProperties({ axis: 'x' }, MX).axis, 'x');
});

test('rotation (0–15) : +4 par quart, (16−r) miroir X, (8−r) miroir Z', () => {
  assert.equal(transformProperties({ rotation: '0' }, ROT90).rotation, '4');
  assert.equal(transformProperties({ rotation: '14' }, ROT90).rotation, '2');
  assert.equal(transformProperties({ rotation: '4' }, MX).rotation, '12');
  assert.equal(transformProperties({ rotation: '0' }, MX).rotation, '0');
  assert.equal(transformProperties({ rotation: '2' }, MZ).rotation, '6');
});

test('escaliers shape : chiralité inversée au miroir, inchangée en rotation', () => {
  assert.equal(transformProperties({ shape: 'inner_left' }, MX).shape, 'inner_right');
  assert.equal(transformProperties({ shape: 'outer_right' }, MZ).shape, 'outer_left');
  assert.equal(transformProperties({ shape: 'straight' }, MX).shape, 'straight');
  assert.equal(transformProperties({ shape: 'inner_left' }, ROT90).shape, 'inner_left');
});

test('portes hinge : left↔right au miroir', () => {
  assert.equal(transformProperties({ hinge: 'left' }, MX).hinge, 'right');
  assert.equal(transformProperties({ hinge: 'right' }, MZ).hinge, 'left');
  assert.equal(transformProperties({ hinge: 'left' }, ROT90).hinge, 'left');
});

test('rails shape : rotation et miroirs', () => {
  assert.equal(transformProperties({ shape: 'north_south' }, ROT90).shape, 'east_west');
  assert.equal(transformProperties({ shape: 'north_east' }, ROT90).shape, 'south_east');
  assert.equal(transformProperties({ shape: 'ascending_east' }, MX).shape, 'ascending_west');
  assert.equal(transformProperties({ shape: 'ascending_north' }, MX).shape, 'ascending_north');
  assert.equal(transformProperties({ shape: 'north_east' }, MZ).shape, 'south_east');
});

test('miroir Y : half / type / facing vertical', () => {
  assert.equal(transformProperties({ half: 'top' }, MY).half, 'bottom');
  assert.equal(transformProperties({ half: 'upper' }, MY).half, 'lower');
  assert.equal(transformProperties({ type: 'top' }, MY).type, 'bottom');
  assert.equal(transformProperties({ type: 'double' }, MY).type, 'double');
  assert.equal(transformProperties({ facing: 'up' }, MY).facing, 'down');
  assert.equal(transformProperties({ facing: 'north' }, MY).facing, 'north');
});

test('miroir Y : half inchangé en miroir X/Z', () => {
  assert.equal(transformProperties({ half: 'top' }, MX).half, 'top');
});

test('propriétés cardinales (clés north/east/south/west) cyclent', () => {
  const r = transformProperties({ north: 'a', east: 'b', south: 'c', west: 'd' }, ROT90);
  assert.deepEqual(r, { east: 'a', south: 'b', west: 'c', north: 'd' });
  const m = transformProperties({ north: 'a', east: 'b', south: 'c', west: 'd' }, MX);
  assert.deepEqual(m, { north: 'a', east: 'd', south: 'c', west: 'b' });
});

test('isYMirrorSafe : portes/lits/panneaux refusés', () => {
  assert.equal(isYMirrorSafe('minecraft:oak_door'), false);
  assert.equal(isYMirrorSafe('minecraft:red_bed'), false);
  assert.equal(isYMirrorSafe('minecraft:oak_sign'), false);
  assert.equal(isYMirrorSafe('minecraft:stone'), true);
});

test('helpers internes', () => {
  assert.equal(__test.mirrorStairShape('inner_left'), 'inner_right');
  assert.equal(__test.railRotate('north_south', 2), 'north_south');
  assert.equal(__test.railRotate('north_south', 1), 'east_west');
});

// ── Transformations géométriques ─────────────────────────────────────────────

function fill(vol, sel, cb) {
  const s = selectionSize(sel);
  for (let y = 0; y < s.y; y++) for (let z = 0; z < s.z; z++) for (let x = 0; x < s.x; x++) {
    const b = cb(x, y, z);
    if (b) vol.setBlock(sel.min.x + x, sel.min.y + y, sel.min.z + z, b);
  }
}

test('miroir : involution (X∘X = identité), comptes conservés', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 2 } };
  fill(vol, sel, (x, y, z) => ((x + z) % 2 ? { Name: 'minecraft:stone', Properties: null } : null));
  const before = readSelection(vol, sel);
  const once = mirrorSchematic(before, 'x');
  const twice = mirrorSchematic(once, 'x');
  for (let i = 0; i < before.data.length; i++) {
    assert.ok(sameBlock(before.data[i], twice.data[i]), `cellule ${i}`);
  }
});

test('miroir X puis Z d’un escalier symétrique : asymétrie nulle', () => {
  // Un quad d’escaliers orientés vers le centre est invariant par X puis Z
  // (équivalent d’une rotation 180°) si on le re-pose au même endroit.
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } };
  vol.setBlock(0, 0, 0, { Name: 'minecraft:oak_stairs', Properties: { facing: 'south' } });
  vol.setBlock(1, 0, 0, { Name: 'minecraft:oak_stairs', Properties: { facing: 'south' } });
  vol.setBlock(0, 0, 1, { Name: 'minecraft:oak_stairs', Properties: { facing: 'north' } });
  vol.setBlock(1, 0, 1, { Name: 'minecraft:oak_stairs', Properties: { facing: 'north' } });
  opMirror(vol, sel, { axis: 'x' });
  opMirror(vol, sel, { axis: 'z' });
  // X∘Z = rotation 180° : ce quad symétrique est invariant → asymétrie nulle.
  assert.equal(vol.getBlock(0, 0, 0).Properties.facing, 'south');
  assert.equal(vol.getBlock(0, 0, 1).Properties.facing, 'north');
  assert.equal(vol.getBlock(1, 0, 0).Properties.facing, 'south');
});

test('rotation 90×4 = identité', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 1 } };
  fill(vol, sel, (x, y, z) => (x === 0 ? { Name: 'minecraft:oak_stairs', Properties: { facing: 'east' } } : null));
  const before = readSelection(vol, sel);
  let s = before;
  for (let i = 0; i < 4; i++) s = rotateSchematic(s, 1);
  assert.equal(s.sx, before.sx); assert.equal(s.sz, before.sz);
  for (let i = 0; i < before.data.length; i++) assert.ok(sameBlock(before.data[i], s.data[i]), `cell ${i}`);
});

test('rotation 90 d’une emprise non carrée permute X/Z + tourne le facing', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 1 } }; // 4×1×2
  vol.setBlock(0, 0, 0, { Name: 'minecraft:furnace', Properties: { facing: 'north' } });
  const { bounds } = opRotate(vol, sel, { degrees: 90 });
  assert.deepEqual(bounds.max, { x: 1, y: 0, z: 3 }); // 2×1×4
  // (0,0,0) → (x'=(sz-1)-z, z'=x) = (1,0,0)
  assert.equal(vol.getBlock(1, 0, 0).Properties.facing, 'east');
});

// ── Opérations de haut niveau ────────────────────────────────────────────────

test('translate déplace la sélection et vide l’origine', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  vol.setBlock(0, 0, 0, { Name: 'minecraft:gold_block', Properties: null });
  opTranslate(vol, sel, { dx: 5, dy: 1, dz: -2 });
  assert.equal(vol.getBlock(0, 0, 0), null);
  assert.equal(vol.getBlock(5, 1, -2).Name, 'minecraft:gold_block');
});

test('replace (avec états optionnels) et set', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 0, z: 0 } };
  vol.setBlock(0, 0, 0, { Name: 'minecraft:oak_log', Properties: { axis: 'x' } });
  vol.setBlock(1, 0, 0, { Name: 'minecraft:oak_log', Properties: { axis: 'y' } });
  vol.setBlock(2, 0, 0, { Name: 'minecraft:stone', Properties: null });
  const r = opReplace(vol, sel, { from: { name: 'minecraft:oak_log', states: { axis: 'y' } }, to: { name: 'minecraft:spruce_log' } });
  assert.equal(r.blocksChanged, 1);
  assert.equal(vol.getBlock(1, 0, 0).Name, 'minecraft:spruce_log');
  assert.equal(vol.getBlock(0, 0, 0).Name, 'minecraft:oak_log');

  opSet(vol, sel, { block: { name: 'minecraft:glass' } });
  assert.equal(vol.getBlock(0, 0, 0).Name, 'minecraft:glass');
  assert.equal(vol.getBlock(2, 0, 0).Name, 'minecraft:glass');
});

test('copy / paste (overlay préserve l’existant sous l’air)', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } };
  vol.setBlock(0, 0, 0, { Name: 'minecraft:diamond_block', Properties: null }); // (1,0,0) reste air
  vol.setBlock(11, 0, 0, { Name: 'minecraft:bedrock', Properties: null });
  const { clipboard } = opCopy(vol, sel);
  opPaste(vol, clipboard, { at: { x: 10, y: 0, z: 0 }, mode: 'overlay' });
  assert.equal(vol.getBlock(10, 0, 0).Name, 'minecraft:diamond_block');
  assert.equal(vol.getBlock(11, 0, 0).Name, 'minecraft:bedrock'); // air du presse-papier → intact
});

// ── Commandes WorldEdit / GoBrush additionnelles ─────────────────────────────

const STONE = { name: 'minecraft:stone' };
test('walls : 4 côtés ; faces : 6 faces', () => {
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
  const w = new MemoryVolume();
  opWalls(w, sel, { block: STONE });
  assert.equal(w.getBlock(0, 1, 0).Name, 'minecraft:stone'); // côté
  assert.equal(w.getBlock(1, 1, 1), null); // intérieur
  assert.equal(w.getBlock(1, 2, 1), null); // plafond non touché par walls
  const f = new MemoryVolume();
  opFaces(f, sel, { block: STONE });
  assert.equal(f.getBlock(1, 2, 1).Name, 'minecraft:stone'); // plafond
  assert.equal(f.getBlock(1, 0, 1).Name, 'minecraft:stone'); // sol
  assert.equal(f.getBlock(1, 1, 1), null); // intérieur
});

test('hollow : vide l’intérieur plein', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
  opSet(vol, sel, { block: STONE });
  const r = opHollow(vol, sel);
  assert.equal(r.blocksChanged, 1);
  assert.equal(vol.getBlock(1, 1, 1), null);
  assert.equal(vol.getBlock(0, 0, 0).Name, 'minecraft:stone');
});

test('overlay : pose au-dessus de la surface', () => {
  const vol = new MemoryVolume();
  vol.setBlock(0, 0, 0, { Name: 'minecraft:stone', Properties: null });
  opOverlay(vol, { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 3, z: 0 } }, { block: { name: 'minecraft:grass_block' } });
  assert.equal(vol.getBlock(0, 1, 0).Name, 'minecraft:grass_block');
});

test('naturalize : herbe / terre / pierre', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 9, z: 0 } };
  for (let y = 0; y <= 9; y++) vol.setBlock(0, y, 0, { Name: 'minecraft:cobblestone', Properties: null });
  opNaturalize(vol, sel, {});
  assert.equal(vol.getBlock(0, 9, 0).Name, 'minecraft:grass_block');
  assert.equal(vol.getBlock(0, 8, 0).Name, 'minecraft:dirt');
  assert.equal(vol.getBlock(0, 6, 0).Name, 'minecraft:dirt');
  assert.equal(vol.getBlock(0, 5, 0).Name, 'minecraft:stone');
});

test('stack : répète la sélection', () => {
  const vol = new MemoryVolume();
  vol.setBlock(0, 0, 0, { Name: 'minecraft:gold_block', Properties: null });
  const { bounds } = opStack(vol, { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, { count: 2, direction: 'east' });
  assert.equal(vol.getBlock(1, 0, 0).Name, 'minecraft:gold_block');
  assert.equal(vol.getBlock(2, 0, 0).Name, 'minecraft:gold_block');
  assert.equal(bounds.max.x, 2);
});

test('sphere / cyl : pinceaux centrés sur la sélection', () => {
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 6, z: 6 } };
  const s = new MemoryVolume();
  opSphere(s, sel, { block: STONE, radius: 3 });
  assert.equal(s.getBlock(3, 3, 3).Name, 'minecraft:stone'); // centre
  assert.equal(s.getBlock(0, 0, 0), null); // coin hors boule
  const c = new MemoryVolume();
  opCyl(c, sel, { block: { name: 'minecraft:dirt' }, radius: 3 });
  assert.equal(c.getBlock(3, 0, 3).Name, 'minecraft:dirt'); // centre bas
  assert.equal(c.getBlock(3, 6, 3).Name, 'minecraft:dirt'); // centre haut (toute la hauteur)
  assert.equal(c.getBlock(0, 0, 0), null);
});

test('smooth : abaisse un pic isolé vers ses voisins', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 5, z: 4 } };
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 4; z++) vol.setBlock(x, 0, z, { Name: 'minecraft:grass_block', Properties: null });
  for (let y = 1; y <= 4; y++) vol.setBlock(2, y, 2, { Name: 'minecraft:grass_block', Properties: null });
  opSmooth(vol, sel, { iterations: 4 });
  assert.equal(vol.getBlock(2, 4, 2), null); // sommet du pic aplani
});

test('blocs minefield:* : géométrie déplacée, namespace préservé', () => {
  const vol = new MemoryVolume();
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 0 } };
  vol.setBlock(0, 0, 0, { Name: 'minefield:quart_de_bloc', Properties: { facing: 'north' } });
  opMirror(vol, sel, { axis: 'z' });
  const b = vol.getBlock(0, 0, 0);
  assert.equal(b.Name, 'minefield:quart_de_bloc'); // jamais remappé vanilla
  assert.equal(b.Properties.facing, 'south');
});

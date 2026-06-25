import { transformProperties, isYMirrorSafe } from './blockstates.js';

// Cœur de transformation WorldEdit : opère sur un VOLUME (accès bloc en coords
// monde) et une SÉLECTION { min:{x,y,z}, max:{x,y,z} } inclusive.
//
// Un « bloc » = { Name, Properties|null } ; l'air = null (ou Name minecraft:air).
// Les blocs custom `minefield:*` ne sont JAMAIS remappés vers du vanilla : seules
// leurs Properties sont transformées (comme n'importe quel bloc).
//
// Interface Volume attendue : getBlock(x,y,z) -> bloc|null ; setBlock(x,y,z,bloc|null).

const AIR_NAMES = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);
const isAir = (b) => !b || AIR_NAMES.has(b.Name);

// ── Schematic : grille dense d'une sélection (presse-papier) ─────────────────
// data[x + sx*(z + sz*y)] = bloc|null. origin = coin (min) d'origine.
export class Schematic {
  constructor(sx, sy, sz, data, origin = { x: 0, y: 0, z: 0 }) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = data || new Array(sx * sy * sz).fill(null);
    this.origin = origin;
  }

  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  get(x, y, z) { return this.data[this.idx(x, y, z)]; }
  set(x, y, z, b) { this.data[this.idx(x, y, z)] = b; }
}

export function selectionSize(sel) {
  return {
    x: sel.max.x - sel.min.x + 1,
    y: sel.max.y - sel.min.y + 1,
    z: sel.max.z - sel.min.z + 1,
  };
}

export function readSelection(vol, sel) {
  const s = selectionSize(sel);
  const schem = new Schematic(s.x, s.y, s.z, null, { ...sel.min });
  for (let y = 0; y < s.y; y++) {
    for (let z = 0; z < s.z; z++) {
      for (let x = 0; x < s.x; x++) {
        schem.set(x, y, z, vol.getBlock(sel.min.x + x, sel.min.y + y, sel.min.z + z));
      }
    }
  }
  return schem;
}

const clone = (b) => (b ? { Name: b.Name, Properties: b.Properties ? { ...b.Properties } : null } : null);

function applyState(b, op) {
  if (isAir(b)) return b;
  if (op.kind === 'mirror' && op.axis === 'y' && !isYMirrorSafe(b.Name)) return clone(b);
  const props = transformProperties(b.Properties, op);
  return { Name: b.Name, Properties: props };
}

// ── Transformations géométriques d'une Schematic → nouvelle Schematic ────────

export function mirrorSchematic(schem, axis) {
  const { sx, sy, sz } = schem;
  const out = new Schematic(sx, sy, sz, null, schem.origin);
  const op = { kind: 'mirror', axis };
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const nx = axis === 'x' ? sx - 1 - x : x;
        const ny = axis === 'y' ? sy - 1 - y : y;
        const nz = axis === 'z' ? sz - 1 - z : z;
        out.set(nx, ny, nz, applyState(schem.get(x, y, z), op));
      }
    }
  }
  return out;
}

// Rotation horaire autour de Y, par quarts (1=90°, 2=180°, 3=270°).
export function rotateSchematic(schem, quarts) {
  const q = ((quarts % 4) + 4) % 4;
  if (q === 0) return schem;
  let cur = schem;
  for (let i = 0; i < q; i++) cur = rotate90(cur);
  return cur;
}

function rotate90(schem) {
  const { sx, sy, sz } = schem;
  // 90° CW : (x,z) -> (x'=(sz-1)-z, z'=x) ; dims X/Z permutées.
  const out = new Schematic(sz, sy, sx, null, schem.origin);
  const op = { kind: 'rotate', quarts: 1 };
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        out.set(sz - 1 - z, y, x, applyState(schem.get(x, y, z), op));
      }
    }
  }
  return out;
}

// ── Pose d'une Schematic dans un volume ──────────────────────────────────────
// mode 'overwrite' : écrit tout (y compris l'air → efface). 'overlay' : ne pose
// que les blocs non-air (l'air de la schematic laisse le volume intact).
export function stampSchematic(vol, schem, origin, mode = 'overwrite') {
  let changed = 0;
  for (let y = 0; y < schem.sy; y++) {
    for (let z = 0; z < schem.sz; z++) {
      for (let x = 0; x < schem.sx; x++) {
        const b = schem.get(x, y, z);
        if (mode === 'overlay' && isAir(b)) continue;
        const wx = origin.x + x, wy = origin.y + y, wz = origin.z + z;
        const before = vol.getBlock(wx, wy, wz);
        const after = isAir(b) ? null : clone(b);
        if (!sameBlock(before, after)) { vol.setBlock(wx, wy, wz, after); changed++; }
      }
    }
  }
  return changed;
}

function fillSelection(vol, sel, block) {
  let changed = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++) {
    for (let z = sel.min.z; z <= sel.max.z; z++) {
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const before = vol.getBlock(x, y, z);
        if (!sameBlock(before, block)) { vol.setBlock(x, y, z, block ? clone(block) : null); changed++; }
      }
    }
  }
  return changed;
}

export function sameBlock(a, b) {
  if (isAir(a) && isAir(b)) return true;
  if (isAir(a) || isAir(b)) return false;
  if (a.Name !== b.Name) return false;
  const pa = a.Properties || {}, pb = b.Properties || {};
  const ka = Object.keys(pa), kb = Object.keys(pb);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => String(pa[k]) === String(pb[k]));
}

// `from`/`to` : { name, states? }. Un bloc matche si Name === from.name et que
// chaque état de from.states correspond (sous-ensemble). `to` impose le nom et
// fusionne to.states (ou conserve les états source si absent).
function matchBlock(b, from) {
  if (isAir(b)) return false;
  if (b.Name !== from.name) return false;
  if (!from.states) return true;
  const p = b.Properties || {};
  return Object.entries(from.states).every(([k, v]) => String(p[k]) === String(v));
}

// ── Opérations de haut niveau (sur volume + sélection) ───────────────────────
// Chaque op renvoie { blocksChanged, bounds? }. `bounds` = nouvelle emprise si
// l'opération peut déborder la sélection (rotate non carré, translate, paste).

export function opMirror(vol, sel, { axis }) {
  if (!['x', 'y', 'z'].includes(axis)) throw new Error('bad_axis');
  const schem = mirrorSchematic(readSelection(vol, sel), axis);
  const changed = stampSchematic(vol, schem, sel.min, 'overwrite');
  return { blocksChanged: changed, bounds: sel };
}

export function opRotate(vol, sel, { degrees }) {
  const quarts = { 90: 1, 180: 2, 270: 3 }[degrees];
  if (!quarts) throw new Error('bad_degrees');
  const src = readSelection(vol, sel);
  const schem = rotateSchematic(src, quarts);
  // On efface l'ancienne sélection puis on pose la version tournée au même coin.
  fillSelection(vol, sel, null);
  const changed = stampSchematic(vol, schem, sel.min, 'overwrite');
  const bounds = {
    min: { ...sel.min },
    max: { x: sel.min.x + schem.sx - 1, y: sel.min.y + schem.sy - 1, z: sel.min.z + schem.sz - 1 },
  };
  return { blocksChanged: changed, bounds };
}

export function opTranslate(vol, sel, { dx = 0, dy = 0, dz = 0 }) {
  const schem = readSelection(vol, sel);
  fillSelection(vol, sel, null);
  const origin = { x: sel.min.x + dx, y: sel.min.y + dy, z: sel.min.z + dz };
  const changed = stampSchematic(vol, schem, origin, 'overwrite');
  return {
    blocksChanged: changed,
    bounds: { min: origin, max: { x: origin.x + schem.sx - 1, y: origin.y + schem.sy - 1, z: origin.z + schem.sz - 1 } },
  };
}

export function opReplace(vol, sel, { from, to }) {
  if (!from?.name || !to?.name) throw new Error('bad_replace');
  let changed = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++) {
    for (let z = sel.min.z; z <= sel.max.z; z++) {
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const b = vol.getBlock(x, y, z);
        if (!matchBlock(b, from)) continue;
        const props = to.states ? { ...(b.Properties || {}), ...to.states } : (b.Properties ? { ...b.Properties } : null);
        vol.setBlock(x, y, z, { Name: to.name, Properties: props && Object.keys(props).length ? props : null });
        changed++;
      }
    }
  }
  return { blocksChanged: changed, bounds: sel };
}

export function opSet(vol, sel, { block }) {
  if (!block?.name) throw new Error('bad_block');
  const b = { Name: block.name, Properties: block.states || null };
  return { blocksChanged: fillSelection(vol, sel, b), bounds: sel };
}

// copy → renvoie une Schematic (presse-papier) ; aucune écriture.
export function opCopy(vol, sel) {
  return { clipboard: readSelection(vol, sel) };
}

// cut → copie la sélection dans le presse-papier PUIS la vide (tout → air).
export function opCut(vol, sel) {
  const clipboard = readSelection(vol, sel);
  const blocksChanged = fillSelection(vol, sel, null); // null = air
  return { clipboard, blocksChanged, bounds: sel };
}

// paste → pose le presse-papier à `at` (coin min). mode overlay par défaut
// (l'air du presse-papier ne détruit pas l'existant).
export function opPaste(vol, clipboard, { at, mode = 'overlay' }) {
  const origin = { x: at.x, y: at.y, z: at.z };
  const changed = stampSchematic(vol, clipboard, origin, mode);
  return {
    blocksChanged: changed,
    bounds: { min: origin, max: { x: origin.x + clipboard.sx - 1, y: origin.y + clipboard.sy - 1, z: origin.z + clipboard.sz - 1 } },
  };
}

// ── Volume en mémoire (tests + petits builds) ────────────────────────────────
export class MemoryVolume {
  constructor() { this.map = new Map(); }
  key(x, y, z) { return `${x},${y},${z}`; }
  getBlock(x, y, z) { return this.map.get(this.key(x, y, z)) || null; }
  setBlock(x, y, z, b) {
    const k = this.key(x, y, z);
    if (isAir(b)) this.map.delete(k); else this.map.set(k, b);
  }
}

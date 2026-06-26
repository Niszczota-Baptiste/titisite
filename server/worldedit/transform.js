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
const FACES6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

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

// ── Forme de sélection (boîte / sphère / cylindre) ───────────────────────────
export const SELECTION_SHAPES = new Set(['box', 'sphere', 'cylinder']);

// `sel` normalisée (min ≤ max). Renvoie true si (x,y,z) est DANS la sélection
// selon sa forme (par défaut une boîte).
export function selectionContains(sel, x, y, z) {
  if (x < sel.min.x || x > sel.max.x || y < sel.min.y || y > sel.max.y || z < sel.min.z || z > sel.max.z) return false;
  const type = sel.shape?.type || 'box';
  if (type === 'box') return true;
  const cx = (sel.min.x + sel.max.x) / 2, cy = (sel.min.y + sel.max.y) / 2, cz = (sel.min.z + sel.max.z) / 2;
  const rx = (sel.max.x - sel.min.x) / 2 + 0.5, ry = (sel.max.y - sel.min.y) / 2 + 0.5, rz = (sel.max.z - sel.min.z) / 2 + 0.5;
  if (type === 'sphere') return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1;
  if (type === 'cylinder') return ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1;
  return true;
}

// Volume « masqué » par la forme de sélection : les écritures hors forme sont
// ignorées. Toute opération écrivant à travers ce volume respecte donc la forme
// SANS la modifier (sphère, cylindre…). La lecture passe à travers.
export class MaskedVolume {
  constructor(inner, sel) { this.inner = inner; this.sel = sel; }
  getBlock(x, y, z) { return this.inner.getBlock(x, y, z); }
  setBlock(x, y, z, b) { if (selectionContains(this.sel, x, y, z)) this.inner.setBlock(x, y, z, b); }
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

// ── Masques : restreignent les cases affectées par set/mix/erode… ────────────
function neighborsAir(vol, x, y, z) {
  return isAir(vol.getBlock(x + 1, y, z)) || isAir(vol.getBlock(x - 1, y, z))
    || isAir(vol.getBlock(x, y + 1, z)) || isAir(vol.getBlock(x, y - 1, z))
    || isAir(vol.getBlock(x, y, z + 1)) || isAir(vol.getBlock(x, y, z - 1));
}
// mask = { type:'all'|'air'|'solid'|'exposed'|'on_surface'|'above'|'below', y? }
export function maskFn(mask) {
  const t = mask?.type || 'all';
  if (t === 'air') return (vol, x, y, z) => isAir(vol.getBlock(x, y, z));
  if (t === 'solid') return (vol, x, y, z) => !isAir(vol.getBlock(x, y, z));
  if (t === 'exposed') return (vol, x, y, z) => !isAir(vol.getBlock(x, y, z)) && neighborsAir(vol, x, y, z);
  if (t === 'on_surface') return (vol, x, y, z) => isAir(vol.getBlock(x, y, z)) && !isAir(vol.getBlock(x, y - 1, z));
  if (t === 'above') return (vol, x, y) => y >= (Number(mask.y) || 0);
  if (t === 'below') return (vol, x, y) => y <= (Number(mask.y) || 0);
  return () => true;
}
const matchAnyFrom = (b, froms) => froms.some((f) => f?.name && matchBlock(b, f));

// Remplace un ou PLUSIEURS blocs source par une cible.
export function opReplace(vol, sel, { from, to }) {
  if (!to?.name) throw new Error('bad_replace');
  const froms = (Array.isArray(from) ? from : [from]).filter((f) => f?.name);
  if (!froms.length) throw new Error('bad_replace');
  let changed = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++) {
    for (let z = sel.min.z; z <= sel.max.z; z++) {
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const b = vol.getBlock(x, y, z);
        if (!matchAnyFrom(b, froms)) continue;
        const props = to.states ? { ...(b.Properties || {}), ...to.states } : (b.Properties ? { ...b.Properties } : null);
        vol.setBlock(x, y, z, { Name: to.name, Properties: props && Object.keys(props).length ? props : null });
        changed++;
      }
    }
  }
  return { blocksChanged: changed, bounds: sel };
}

export function opSet(vol, sel, { block, mask }) {
  if (!block?.name) throw new Error('bad_block');
  const b = { Name: block.name, Properties: block.states || null };
  if (!mask || mask.type === 'all') return { blocksChanged: fillSelection(vol, sel, b), bounds: sel };
  const mfn = maskFn(mask);
  // Deux passes : le masque est évalué sur l'état D'ORIGINE (sinon set en
  // cascade — ex. on_surface qui remonterait toute la colonne).
  const cells = [];
  for (let y = sel.min.y; y <= sel.max.y; y++)
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++) if (mfn(vol, x, y, z)) cells.push([x, y, z]);
  let changed = 0;
  for (const [x, y, z] of cells) if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); changed++; }
  return { blocksChanged: changed, bounds: sel };
}

// Mélange aléatoire pondéré : chaque case prend un bloc tiré au sort selon les
// poids (% relatifs). `from` optionnel = ne change que les blocs correspondants
// (sinon toute la sélection). Ex. 20% cobble / 30% terre / 20% andésite…
export function opMix(vol, sel, { from, pattern, mask }) {
  if (!Array.isArray(pattern) || pattern.length === 0) throw new Error('bad_pattern');
  const entries = pattern
    .filter((p) => p?.name && Number(p.weight) > 0)
    .map((p) => ({ block: { Name: p.name, Properties: p.states || null }, w: Number(p.weight) }));
  if (!entries.length) throw new Error('bad_pattern');
  const total = entries.reduce((s, e) => s + e.w, 0);
  let acc = 0;
  const cum = entries.map((e) => { acc += e.w; return { block: e.block, c: acc }; });
  const pick = () => {
    const r = Math.random() * total;
    for (const e of cum) if (r < e.c) return e.block;
    return cum[cum.length - 1].block;
  };
  const mfn = maskFn(mask);
  const froms = from ? (Array.isArray(from) ? from : [from]).filter((f) => f?.name) : [];
  const cells = [];
  for (let y = sel.min.y; y <= sel.max.y; y++) {
    for (let z = sel.min.z; z <= sel.max.z; z++) {
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const cur = vol.getBlock(x, y, z);
        if (froms.length && !matchAnyFrom(cur, froms)) continue;
        if (!mfn(vol, x, y, z)) continue;
        cells.push([x, y, z]);
      }
    }
  }
  let changed = 0;
  for (const [x, y, z] of cells) {
    const b = pick();
    if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); changed++; }
  }
  return { blocksChanged: changed, bounds: sel };
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

// ── Commandes type WorldEdit / GoBrush (toutes bornées par la sélection) ─────
const toBlock = (p) => (p && p.name ? { Name: p.name, Properties: p.states || null } : null);

// Murs : les 4 côtés verticaux de la sélection.
export function opWalls(vol, sel, { block }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  let c = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++)
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++)
        if (x === sel.min.x || x === sel.max.x || z === sel.min.z || z === sel.max.z) {
          if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); c++; }
        }
  return { blocksChanged: c, bounds: sel };
}

// Faces : les 6 faces (murs + plafond + plancher).
export function opFaces(vol, sel, { block }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  let c = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++)
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++)
        if (x === sel.min.x || x === sel.max.x || z === sel.min.z || z === sel.max.z || y === sel.min.y || y === sel.max.y) {
          if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); c++; }
        }
  return { blocksChanged: c, bounds: sel };
}

// Creuser : vide les blocs pleins entièrement entourés (garde une coque de 1).
export function opHollow(vol, sel) {
  const clear = [];
  for (let y = sel.min.y + 1; y < sel.max.y; y++)
    for (let z = sel.min.z + 1; z < sel.max.z; z++)
      for (let x = sel.min.x + 1; x < sel.max.x; x++) {
        if (isAir(vol.getBlock(x, y, z))) continue;
        const enclosed = !isAir(vol.getBlock(x + 1, y, z)) && !isAir(vol.getBlock(x - 1, y, z))
          && !isAir(vol.getBlock(x, y + 1, z)) && !isAir(vol.getBlock(x, y - 1, z))
          && !isAir(vol.getBlock(x, y, z + 1)) && !isAir(vol.getBlock(x, y, z - 1));
        if (enclosed) clear.push([x, y, z]);
      }
  for (const [x, y, z] of clear) vol.setBlock(x, y, z, null);
  return { blocksChanged: clear.length, bounds: sel };
}

// Overlay : pose un bloc juste au-dessus de la surface de chaque colonne.
export function opOverlay(vol, sel, { block }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  let c = 0;
  for (let z = sel.min.z; z <= sel.max.z; z++)
    for (let x = sel.min.x; x <= sel.max.x; x++) {
      let top = null;
      for (let y = sel.max.y; y >= sel.min.y; y--) { if (!isAir(vol.getBlock(x, y, z))) { top = y; break; } }
      if (top === null || top >= sel.max.y) continue;
      if (isAir(vol.getBlock(x, top + 1, z))) { vol.setBlock(x, top + 1, z, clone(b)); c++; }
    }
  return { blocksChanged: c, bounds: sel };
}

// Naturaliser : 1 herbe / 3 terre / reste pierre sous chaque surface exposée.
export function opNaturalize(vol, sel, params = {}) {
  const grass = toBlock({ name: params.surface || 'minecraft:grass_block' });
  const dirt = toBlock({ name: params.soil || 'minecraft:dirt' });
  const stone = toBlock({ name: params.filler || 'minecraft:stone' });
  let c = 0;
  for (let z = sel.min.z; z <= sel.max.z; z++)
    for (let x = sel.min.x; x <= sel.max.x; x++) {
      let depth = 0;
      for (let y = sel.max.y; y >= sel.min.y; y--) {
        if (isAir(vol.getBlock(x, y, z))) { depth = 0; continue; }
        const target = depth === 0 ? grass : depth <= 3 ? dirt : stone;
        if (!sameBlock(vol.getBlock(x, y, z), target)) { vol.setBlock(x, y, z, clone(target)); c++; }
        depth++;
      }
    }
  return { blocksChanged: c, bounds: sel };
}

const STACK_DIR = { east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], south: [0, 0, 1], north: [0, 0, -1] };

// Stack : répète la sélection `count` fois dans une direction.
export function opStack(vol, sel, { count, direction }) {
  const dir = STACK_DIR[direction]; if (!dir) throw new Error('bad_direction');
  const n = Math.max(1, Math.min(64, Math.round(count) || 1));
  const schem = readSelection(vol, sel);
  const size = selectionSize(sel);
  let changed = 0;
  let lo = { ...sel.min }, hi = { ...sel.max };
  for (let i = 1; i <= n; i++) {
    const origin = { x: sel.min.x + dir[0] * size.x * i, y: sel.min.y + dir[1] * size.y * i, z: sel.min.z + dir[2] * size.z * i };
    changed += stampSchematic(vol, schem, origin, 'overlay'); // l'air ne détruit pas l'existant
    lo = { x: Math.min(lo.x, origin.x), y: Math.min(lo.y, origin.y), z: Math.min(lo.z, origin.z) };
    hi = { x: Math.max(hi.x, origin.x + size.x - 1), y: Math.max(hi.y, origin.y + size.y - 1), z: Math.max(hi.z, origin.z + size.z - 1) };
  }
  return { blocksChanged: changed, bounds: { min: lo, max: hi } };
}

// Sphère (pinceau) : remplit une boule centrée sur la sélection. `hollow` = coque.
export function opSphere(vol, sel, { block, radius, hollow }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  const cx = (sel.min.x + sel.max.x) / 2, cy = (sel.min.y + sel.max.y) / 2, cz = (sel.min.z + sel.max.z) / 2;
  const r = Math.max(1, Math.round(radius) || 1), r2 = (r + 0.5) * (r + 0.5), ri2 = (r - 0.5) * (r - 0.5);
  let c = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++)
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
        if (d2 > r2 || (hollow && d2 < ri2)) continue;
        if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); c++; }
      }
  return { blocksChanged: c, bounds: sel };
}

// Cylindre vertical (pinceau) : disque de rayon `radius` sur toute la hauteur.
export function opCyl(vol, sel, { block, radius, hollow }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  const cx = (sel.min.x + sel.max.x) / 2, cz = (sel.min.z + sel.max.z) / 2;
  const r = Math.max(1, Math.round(radius) || 1), r2 = (r + 0.5) * (r + 0.5), ri2 = (r - 0.5) * (r - 0.5);
  let c = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++)
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const d2 = (x - cx) ** 2 + (z - cz) ** 2;
        if (d2 > r2 || (hollow && d2 < ri2)) continue;
        if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); c++; }
      }
  return { blocksChanged: c, bounds: sel };
}

// Lisser (GoBrush) : adoucit la hauteur de la surface (moyenne de voisinage).
export function opSmooth(vol, sel, { iterations } = {}) {
  const w = sel.max.x - sel.min.x + 1, d = sel.max.z - sel.min.z + 1;
  const at = (x, z) => x * d + z;
  const height = new Float64Array(w * d).fill(-Infinity); // y de surface (absolu)
  const surf = new Array(w * d).fill(null);              // bloc de surface
  for (let xi = 0; xi < w; xi++) for (let zi = 0; zi < d; zi++) {
    const x = sel.min.x + xi, z = sel.min.z + zi;
    for (let y = sel.max.y; y >= sel.min.y; y--) {
      const blk = vol.getBlock(x, y, z);
      if (!isAir(blk)) { height[at(xi, zi)] = y; surf[at(xi, zi)] = blk; break; }
    }
  }
  const iters = Math.max(1, Math.min(8, Math.round(iterations) || 2));
  let h = height;
  for (let it = 0; it < iters; it++) {
    const nh = h.slice();
    for (let xi = 0; xi < w; xi++) for (let zi = 0; zi < d; zi++) {
      if (h[at(xi, zi)] === -Infinity) continue;
      let sum = 0, cnt = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const nx = xi + dx, nz = zi + dz;
        if (nx < 0 || nx >= w || nz < 0 || nz >= d) continue;
        const v = h[at(nx, nz)]; if (v === -Infinity) continue;
        sum += v; cnt++;
      }
      if (cnt) nh[at(xi, zi)] = sum / cnt;
    }
    h = nh;
  }
  let changed = 0;
  for (let xi = 0; xi < w; xi++) for (let zi = 0; zi < d; zi++) {
    const old = height[at(xi, zi)];
    if (old === -Infinity) continue;
    const target = Math.max(sel.min.y, Math.min(sel.max.y, Math.round(h[at(xi, zi)])));
    const x = sel.min.x + xi, z = sel.min.z + zi;
    if (target < old) {
      for (let y = old; y > target; y--) if (!isAir(vol.getBlock(x, y, z))) { vol.setBlock(x, y, z, null); changed++; }
    } else if (target > old) {
      const fill = surf[at(xi, zi)];
      for (let y = old + 1; y <= target; y++) if (isAir(vol.getBlock(x, y, z))) { vol.setBlock(x, y, z, clone(fill)); changed++; }
    }
  }
  return { blocksChanged: changed, bounds: sel };
}

// Échelle : redimensionne la sélection par un facteur (x0.5, x2, x3, x4, x6…).
// Échantillonnage au plus proche. Réécrit en place à partir du coin min ; pour
// f<1 on efface d'abord l'original. Borné pour éviter les volumes démesurés.
export function opScale(vol, sel, { factor }) {
  const f = factor;
  const src = readSelection(vol, sel);
  const nsx = Math.max(1, Math.round(src.sx * f));
  const nsy = Math.max(1, Math.round(src.sy * f));
  const nsz = Math.max(1, Math.round(src.sz * f));
  if (nsx * nsy * nsz > 8_000_000) throw new Error('too_many_blocks');
  let changed = 0;
  if (f < 1) changed += fillSelection(vol, sel, null); // efface l'original avant réduction
  for (let j = 0; j < nsy; j++)
    for (let k = 0; k < nsz; k++)
      for (let i = 0; i < nsx; i++) {
        const si = Math.min(src.sx - 1, Math.floor(i / f));
        const sj = Math.min(src.sy - 1, Math.floor(j / f));
        const sk = Math.min(src.sz - 1, Math.floor(k / f));
        const after = src.get(si, sj, sk);
        const wx = sel.min.x + i, wy = sel.min.y + j, wz = sel.min.z + k;
        const out = isAir(after) ? null : clone(after);
        if (!sameBlock(vol.getBlock(wx, wy, wz), out)) { vol.setBlock(wx, wy, wz, out); changed++; }
      }
  return {
    blocksChanged: changed,
    bounds: { min: { ...sel.min }, max: { x: sel.min.x + nsx - 1, y: sel.min.y + nsy - 1, z: sel.min.z + nsz - 1 } },
  };
}

// Ligne 3D entre les deux coins de la sélection (Bresenham).
export function opLine(vol, sel, { block }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  let x = sel.min.x, y = sel.min.y, z = sel.min.z;
  const x1 = sel.max.x, y1 = sel.max.y, z1 = sel.max.z;
  const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y), dz = Math.abs(z1 - z);
  const sx = x <= x1 ? 1 : -1, sy = y <= y1 ? 1 : -1, sz = z <= z1 ? 1 : -1;
  let changed = 0;
  const put = (px, py, pz) => { if (!sameBlock(vol.getBlock(px, py, pz), b)) { vol.setBlock(px, py, pz, clone(b)); changed++; } };
  if (dx >= dy && dx >= dz) {
    let ey = dx / 2, ez = dx / 2;
    for (let i = 0; i <= dx; i++) { put(x, y, z); ey -= dy; if (ey < 0) { y += sy; ey += dx; } ez -= dz; if (ez < 0) { z += sz; ez += dx; } x += sx; }
  } else if (dy >= dx && dy >= dz) {
    let ex = dy / 2, ez = dy / 2;
    for (let i = 0; i <= dy; i++) { put(x, y, z); ex -= dx; if (ex < 0) { x += sx; ex += dy; } ez -= dz; if (ez < 0) { z += sz; ez += dy; } y += sy; }
  } else {
    let ex = dz / 2, ey = dz / 2;
    for (let i = 0; i <= dz; i++) { put(x, y, z); ex -= dx; if (ex < 0) { x += sx; ex += dz; } ey -= dy; if (ey < 0) { y += sy; ey += dz; } z += sz; }
  }
  return { blocksChanged: changed, bounds: sel };
}

// Pyramide à base carrée inscrite dans la sélection (base au sol, sommet en haut).
export function opPyramid(vol, sel, { block, hollow }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  const cx = (sel.min.x + sel.max.x) / 2, cz = (sel.min.z + sel.max.z) / 2;
  const half = Math.min(sel.max.x - sel.min.x, sel.max.z - sel.min.z) / 2;
  const h = Math.max(1, sel.max.y - sel.min.y);
  let c = 0;
  for (let level = 0; level <= h; level++) {
    const r = half * (1 - level / h);
    if (r < 0) break;
    const y = sel.min.y + level;
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        if (Math.abs(x - cx) > r + 0.5 || Math.abs(z - cz) > r + 0.5) continue;
        if (hollow && level > 0 && Math.abs(x - cx) < r - 0.5 && Math.abs(z - cz) < r - 0.5) continue;
        if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); c++; }
      }
  }
  return { blocksChanged: c, bounds: sel };
}

// Cône : rayon décroissant avec la hauteur (base ronde au sol).
export function opCone(vol, sel, { block, hollow }) {
  const b = toBlock(block); if (!b) throw new Error('bad_block');
  const cx = (sel.min.x + sel.max.x) / 2, cz = (sel.min.z + sel.max.z) / 2;
  const baseR = Math.min(sel.max.x - sel.min.x, sel.max.z - sel.min.z) / 2;
  const h = Math.max(1, sel.max.y - sel.min.y);
  let c = 0;
  for (let level = 0; level <= h; level++) {
    const r = baseR * (1 - level / h);
    const r2 = (r + 0.5) * (r + 0.5), ri2 = (r - 0.5) * (r - 0.5);
    const y = sel.min.y + level;
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const d2 = (x - cx) ** 2 + (z - cz) ** 2;
        if (d2 > r2 || (hollow && level > 0 && d2 < ri2)) continue;
        if (!sameBlock(vol.getBlock(x, y, z), b)) { vol.setBlock(x, y, z, clone(b)); c++; }
      }
  }
  return { blocksChanged: c, bounds: sel };
}

// Éroder : supprime les blocs pleins ayant ≥ `threshold` faces exposées à l'air.
export function opErode(vol, sel, { iterations, threshold }) {
  const iters = Math.max(1, Math.min(8, Math.round(iterations) || 1));
  const thr = Math.max(1, Math.min(6, Math.round(threshold) || 4));
  let changed = 0;
  for (let it = 0; it < iters; it++) {
    const rm = [];
    for (let y = sel.min.y; y <= sel.max.y; y++)
      for (let z = sel.min.z; z <= sel.max.z; z++)
        for (let x = sel.min.x; x <= sel.max.x; x++) {
          if (isAir(vol.getBlock(x, y, z))) continue;
          let air = 0;
          for (const [dx, dy, dz] of FACES6) if (isAir(vol.getBlock(x + dx, y + dy, z + dz))) air++;
          if (air >= thr) rm.push([x, y, z]);
        }
    for (const [x, y, z] of rm) vol.setBlock(x, y, z, null);
    changed += rm.length;
  }
  return { blocksChanged: changed, bounds: sel };
}

// Dilater : remplit les cases d'air ayant ≥ `threshold` voisins pleins, avec le
// bloc voisin majoritaire.
export function opDilate(vol, sel, { iterations, threshold }) {
  const iters = Math.max(1, Math.min(8, Math.round(iterations) || 1));
  const thr = Math.max(1, Math.min(6, Math.round(threshold) || 3));
  let changed = 0;
  for (let it = 0; it < iters; it++) {
    const add = [];
    for (let y = sel.min.y; y <= sel.max.y; y++)
      for (let z = sel.min.z; z <= sel.max.z; z++)
        for (let x = sel.min.x; x <= sel.max.x; x++) {
          if (!isAir(vol.getBlock(x, y, z))) continue;
          const counts = new Map(); let solid = 0;
          for (const [dx, dy, dz] of FACES6) {
            const nb = vol.getBlock(x + dx, y + dy, z + dz);
            if (!isAir(nb)) { solid++; counts.set(nb.Name, (counts.get(nb.Name) || 0) + 1); }
          }
          if (solid >= thr) {
            let best = null, bn = -1;
            for (const [k, n] of counts) if (n > bn) { bn = n; best = k; }
            add.push([x, y, z, best]);
          }
        }
    for (const [x, y, z, name] of add) vol.setBlock(x, y, z, { Name: name, Properties: null });
    changed += add.length;
  }
  return { blocksChanged: changed, bounds: sel };
}

// Drain : vide l'eau et la lave de la sélection (+ retire le waterlogged).
const FLUIDS = new Set(['minecraft:water', 'minecraft:lava', 'minecraft:flowing_water', 'minecraft:flowing_lava']);
export function opDrain(vol, sel) {
  let changed = 0;
  for (let y = sel.min.y; y <= sel.max.y; y++)
    for (let z = sel.min.z; z <= sel.max.z; z++)
      for (let x = sel.min.x; x <= sel.max.x; x++) {
        const b = vol.getBlock(x, y, z);
        if (isAir(b)) continue;
        if (FLUIDS.has(b.Name)) { vol.setBlock(x, y, z, null); changed++; }
        else if (b.Properties?.waterlogged === 'true') { vol.setBlock(x, y, z, { Name: b.Name, Properties: { ...b.Properties, waterlogged: 'false' } }); changed++; }
      }
  return { blocksChanged: changed, bounds: sel };
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

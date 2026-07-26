// Maths de la vue Plan 2D — fonctions pures, sans React ni DOM (testables et
// partagées entre le canvas, la vue logique et la vue 3D).
//
// Repère : coordonnées locales du gabarit, X vers la droite, Z vers le bas,
// 0-based. La vue est `{ x, z, scale }` où (x, z) est la coordonnée monde
// affichée au pixel (0, 0) du canvas et `scale` le nombre de pixels par bloc.

export const MIN_SCALE = 0.6;
export const MAX_SCALE = 48;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const worldToScreen = (view, wx, wz) => [
  (wx - view.x) * view.scale,
  (wz - view.z) * view.scale,
];

export const screenToWorld = (view, sx, sz) => ({
  x: view.x + sx / view.scale,
  z: view.z + sz / view.scale,
});

/** Case sous un point écran (peut sortir du gabarit — à filtrer par l'appelant). */
export function cellAt(view, sx, sz) {
  const w = screenToWorld(view, sx, sz);
  return { x: Math.floor(w.x), z: Math.floor(w.z) };
}

export const inBounds = (dims, x, z) => x >= 0 && z >= 0 && x < dims.x && z < dims.z;

/** Vue initiale : le gabarit entier, centré, avec une marge. */
export function fitView(dims, width, height, pad = 28) {
  const w = Math.max(1, width - pad * 2);
  const h = Math.max(1, height - pad * 2);
  const scale = clamp(Math.min(w / dims.x, h / dims.z), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: dims.x / 2 - width / (2 * scale),
    z: dims.z / 2 - height / (2 * scale),
  };
}

/** Zoom molette : le bloc sous le curseur ne bouge pas. */
export function zoomAt(view, factor, sx, sz) {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === view.scale) return view;
  const w = screenToWorld(view, sx, sz);
  return { scale, x: w.x - sx / scale, z: w.z - sz / scale };
}

export const panBy = (view, dxPx, dzPx) => ({
  ...view,
  x: view.x - dxPx / view.scale,
  z: view.z - dzPx / view.scale,
});

export function rectFrom(a, b) {
  return {
    x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x),
    z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z),
  };
}

export const clampRect = (rect, dims) => ({
  x0: clamp(rect.x0, 0, dims.x - 1), x1: clamp(rect.x1, 0, dims.x - 1),
  z0: clamp(rect.z0, 0, dims.z - 1), z1: clamp(rect.z1, 0, dims.z - 1),
});

export const rectContains = (rect, x, z) => x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;

export const rectsOverlap = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;

export const rectArea = (r) => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);

/** Cases traversées entre deux points (Bresenham) — le pinceau couloir ne doit
 *  pas trouer sa trace quand la souris va plus vite que les événements. */
export function lineCells(a, b) {
  const cells = [];
  let x = a.x; let z = a.z;
  const dx = Math.abs(b.x - x); const sx = x < b.x ? 1 : -1;
  const dz = -Math.abs(b.z - z); const sz = z < b.z ? 1 : -1;
  let err = dx + dz;
  for (let guard = 0; guard < 4096; guard += 1) {
    cells.push([x, z]);
    if (x === b.x && z === b.z) break;
    const e2 = 2 * err;
    if (e2 >= dz) { err += dz; x += sx; }
    if (e2 <= dx) { err += dx; z += sz; }
  }
  return cells;
}

// ── Coffres ───────────────────────────────────────────────────────────────

// L'axe de la paire d'un coffre double est déduit de l'orientation, comme en
// jeu : deux coffres accolés face au sud sont côte à côte le long de X.
export const pairAxis = (facing) => (facing === 'north' || facing === 'south' ? 'x' : 'z');

export function chestCells(chest) {
  if (chest.kind !== 'double') return [[chest.x, chest.z]];
  return pairAxis(chest.facing) === 'x'
    ? [[chest.x, chest.z], [chest.x + 1, chest.z]]
    : [[chest.x, chest.z], [chest.x, chest.z + 1]];
}

export const cellKey = (x, z) => `${x},${z}`;

/** Index case → coffre, pour le survol et la sélection (un seul niveau Y). */
export function chestIndex(chests) {
  const map = new Map();
  for (const c of chests) {
    for (const [x, z] of chestCells(c)) map.set(cellKey(x, z), c);
  }
  return map;
}

const FACING_BY_AXIS = { x: ['north', 'south'], z: ['west', 'east'] };
const FACING_DELTA = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

/**
 * Orientation d'une rangée : soit celle imposée par l'utilisateur (si elle est
 * compatible avec l'axe), soit celle qui tourne les coffres vers la circulation
 * la plus proche. `access` est un Set de clés de cases (couloirs, escaliers,
 * entrées) de l'étage.
 */
export function facingForRow(axis, chosen, cells, access) {
  const options = FACING_BY_AXIS[axis === 'x' ? 'x' : 'z'];
  if (chosen && options.includes(chosen)) return chosen;
  if (!access || access.size === 0) return options[1];
  const score = options.map((f) => {
    const [dx, dz] = FACING_DELTA[f];
    let hits = 0;
    for (const [x, z] of cells) {
      for (let step = 1; step <= 3; step += 1) {
        if (access.has(cellKey(x + dx * step, z + dz * step))) { hits += 4 - step; break; }
      }
    }
    return hits;
  });
  return score[0] > score[1] ? options[0] : options[1];
}

/**
 * Rangée de coffres entre deux cases : remplissage automatique en coffres
 * **doubles** groupés 2 par 2 le long de l'axe dominant ; un reste d'une case
 * finit en coffre simple. `single: true` (touche Maj) force les simples.
 *
 * Les coffres doubles d'une rangée sont forcément orientés perpendiculairement
 * à l'axe (contrainte du jeu), donc l'orientation choisie n'est retenue que si
 * elle est compatible — sinon on prend celle qui fait face à la circulation.
 */
export function buildRow(from, to, {
  dims, y, zoneId = null, single = false, facing = null, access = null, idPrefix = 'c',
} = {}) {
  const axis = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? 'x' : 'z';
  const fixed = axis === 'x' ? from.z : from.x;
  const start = Math.min(axis === 'x' ? from.x : from.z, axis === 'x' ? to.x : to.z);
  const end = Math.max(axis === 'x' ? from.x : from.z, axis === 'x' ? to.x : to.z);

  const cells = [];
  for (let i = start; i <= end; i += 1) cells.push(axis === 'x' ? [i, fixed] : [fixed, i]);
  const dir = facingForRow(axis, facing, cells, access);

  const chests = [];
  let i = start;
  let n = 0;
  while (i <= end) {
    const remaining = end - i + 1;
    const kind = !single && remaining >= 2 ? 'double' : 'single';
    const x = axis === 'x' ? i : fixed;
    const z = axis === 'x' ? fixed : i;
    const chest = { id: `${idPrefix}${Date.now().toString(36)}${n}`, zoneId, x, y, z, kind, facing: dir, label: '' };
    n += 1;
    if (chestCells(chest).every(([cx, cz]) => inBounds(dims, cx, cz))) chests.push(chest);
    i += kind === 'double' ? 2 : 1;
  }
  return chests;
}

/** L'étage auquel appartient une altitude Y (les tranches ne se chevauchent pas). */
export const floorAtY = (floors, y) => floors.find((f) => y >= f.yMin && y <= f.yMax) || null;

export const floorsByHeight = (floors) => [...floors].sort((a, b) => b.yMin - a.yMin);

/** Zone contenant une case sur un étage donné (la dernière tracée gagne). */
export function zoneAt(zones, floorId, x, z) {
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    const zone = zones[i];
    if (zone.floorId === floorId && rectContains(zone.rect, x, z)) return zone;
  }
  return null;
}

/** Cases de circulation d'un étage, en Set de clés — sert aux warnings et à
 *  l'orientation automatique des rangées. */
export function accessSet(circulation, floorId) {
  const set = new Set();
  for (const p of circulation) {
    if (p.floorId !== floorId) continue;
    if (p.kind === 'couloir') for (const [x, z] of p.cells) set.add(cellKey(x, z));
    else if (p.cell) set.add(cellKey(p.cell[0], p.cell[1]));
  }
  return set;
}

/** Coordonnées monde affichées sous le curseur quand le plan a une origine. */
export const toWorldCoords = (origin, x, y, z) => (origin
  ? { x: origin.x + x, y: origin.y + y, z: origin.z + z }
  : null);

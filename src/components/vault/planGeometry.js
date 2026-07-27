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
//
// Le seul contenant est le coffre sans fond de Minefield : 1×1×1, 72 slots,
// ouvrable de n'importe où. Ni orientation, ni paire, ni contrainte d'accès.

export const chestCells = (chest) => [[chest.x, chest.z]];

export const cellKey = (x, z) => `${x},${z}`;

/** Index case → coffre, pour le survol et la sélection (un seul niveau Y). */
export function chestIndex(chests) {
  const map = new Map();
  for (const c of chests) {
    for (const [x, z] of chestCells(c)) map.set(cellKey(x, z), c);
  }
  return map;
}

/** Cases d'une ligne droite entre deux points (axe dominant — un mur est droit). */
export function straightLine(from, to) {
  const axis = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) ? 'x' : 'z';
  const fixed = axis === 'x' ? from.z : from.x;
  const a = Math.min(axis === 'x' ? from.x : from.z, axis === 'x' ? to.x : to.z);
  const b = Math.max(axis === 'x' ? from.x : from.z, axis === 'x' ? to.x : to.z);
  const cells = [];
  for (let i = a; i <= b; i += 1) cells.push(axis === 'x' ? [i, fixed] : [fixed, i]);
  return cells;
}

/** Toutes les cases d'un rectangle (remplissage d'une zone). */
export function rectCells(rect) {
  const cells = [];
  for (let x = rect.x0; x <= rect.x1; x += 1) {
    for (let z = rect.z0; z <= rect.z1; z += 1) cells.push([x, z]);
  }
  return cells;
}

let idCounter = 0;
export const newChestId = () => {
  idCounter = (idCounter + 1) % 46656;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}`;
};

/**
 * Remplit des cases sur plusieurs niveaux Y — c'est le **mur de coffres** : un
 * glissé au sol monté sur toute la hauteur de la zone (100 de long × 5 de haut
 * = 500 coffres d'un coup). Les cases déjà occupées au même niveau sont
 * ignorées, pour qu'un second passage complète le mur au lieu de le doubler.
 */
export function buildChests(cells, levels, {
  dims, zoneFor = () => null, occupied = null, limit = 20000,
} = {}) {
  const chests = [];
  for (const y of levels) {
    if (y < 0 || y >= dims.y) continue;
    for (const [x, z] of cells) {
      if (!inBounds(dims, x, z)) continue;
      if (occupied?.has(`${y}:${cellKey(x, z)}`)) continue;
      chests.push({ id: newChestId(), zoneId: zoneFor(x, z, y), x, y, z, items: [], label: '' });
      if (chests.length >= limit) return chests;
    }
  }
  return chests;
}

/** Niveaux d'une zone (de bas en haut), éventuellement plafonnés. */
export function zoneLevelRange(zone, floor, max = 0) {
  const yMin = zone?.yMin ?? floor?.yMin ?? 0;
  const yMax = zone?.yMax ?? floor?.yMax ?? yMin;
  const levels = [];
  for (let y = yMin; y <= yMax; y += 1) levels.push(y);
  return max > 0 ? levels.slice(0, max) : levels;
}

/** L'étage auquel appartient une altitude Y (les tranches ne se chevauchent pas). */
export const floorAtY = (floors, y) => floors.find((f) => y >= f.yMin && y <= f.yMax) || null;

export const floorsByHeight = (floors) => [...floors].sort((a, b) => b.yMin - a.yMin);

/**
 * Zone contenant une case (la dernière tracée gagne). Si `y` est fourni, la
 * zone doit aussi couvrir ce niveau : deux zones peuvent se superposer au sol
 * et se partager la hauteur (rez de 0 à 2, mezzanine de 3 à 5).
 */
export function zoneAt(zones, floorId, x, z, y = null) {
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    const zone = zones[i];
    if (zone.floorId !== floorId || !rectContains(zone.rect, x, z)) continue;
    if (y != null && (y < zone.yMin || y > zone.yMax)) continue;
    return zone;
  }
  return null;
}

/** Les zones qui couvrent un niveau Y donné (celles dessinées sur ce niveau). */
export const zonesAtLevel = (zones, floorId, y) => zones.filter(
  (z) => z.floorId === floorId && y >= z.yMin && y <= z.yMax,
);

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

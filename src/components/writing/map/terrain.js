import { MAP_RADIUS, mulberry32, normalizeTerrain } from './presets';

// Voxel terrain builder — pure data in, grids out. No three.js here: the same
// build feeds the 3D mesh (VoxelTerrain) and the 2D canvas map (Map2D), which
// is how the 2D view stays an exact projection of the 3D world.

export const GRID = 2 * (MAP_RADIUS + 4); // cells per side (1 cell = 1 block)
const HALF = GRID / 2;
export const MAX_H = 12;

export const cellToWorld = (i, j) => [i - HALF + 0.5, j - HALF + 0.5];
export const worldToCell = (x, z) => [Math.round(x + HALF - 0.5), Math.round(z + HALF - 0.5)];

// Two-octave value noise on a seeded lattice — enough relief for a diorama.
function makeNoise(seed) {
  const rng = mulberry32(seed);
  const N = 24;
  const lattice = Array.from({ length: (N + 1) * (N + 1) }, () => rng());
  const at = (u, v) => lattice[((v % (N + 1)) + (N + 1)) % (N + 1) * (N + 1) + (((u % (N + 1)) + (N + 1)) % (N + 1))];
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const tx = smooth(x - xi); const ty = smooth(y - yi);
    const a = at(xi, yi); const b = at(xi + 1, yi); const c = at(xi, yi + 1); const d = at(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  return (x, z) => sample(x * 0.18 + 40, z * 0.18 + 40) * 0.7 + sample(x * 0.45 + 9, z * 0.45 + 9) * 0.3;
}

const dist = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);

// Distance from point to a polyline (sampled segments).
function polylineDist(x, z, points) {
  let best = Infinity;
  for (let k = 0; k < points.length - 1; k++) {
    const [ax, az] = points[k]; const [bx, bz] = points[k + 1];
    const dx = bx - ax; const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, dist(x, z, ax + dx * t, az + dz * t));
  }
  return best;
}

// Build every grid the renderers need from the project's terrain JSON + its
// zones. Deterministic for a given input.
export function buildWorld(rawTerrain, baseBiome, zones) {
  const t = normalizeTerrain(rawTerrain, baseBiome);
  const noise = makeNoise(t.seed);
  const W = t.waterLevel;

  const height = new Float32Array(GRID * GRID);
  const biome = new Array(GRID * GRID).fill(t.baseBiome);
  const beach = new Uint8Array(GRID * GRID);
  const path = new Uint8Array(GRID * GRID);
  const bridge = new Uint8Array(GRID * GRID);
  const decorBoost = new Float32Array(GRID * GRID);
  const idx = (i, j) => j * GRID + i;

  // 1) Base island: plateau with noisy edge, dropping under water outside.
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const [x, z] = cellToWorld(i, j);
      const d = Math.hypot(x, z);
      const edge = MAP_RADIUS + 1.5 + noise(x * 2, z * 2) * 3;
      const inside = Math.min(1, Math.max(0, (edge - d) / 4));
      height[idx(i, j)] = inside > 0 ? W + inside * (1 + noise(x, z) * 1.2) : 0;
    }
  }

  // 2) Regions: raise terrain and claim the biome where their weight wins.
  const weight = new Float32Array(GRID * GRID);
  for (const r of t.regions) {
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const [x, z] = cellToWorld(i, j);
        const f = Math.max(0, 1 - dist(x, z, r.cx, r.cz) / r.r);
        if (f <= 0 || height[idx(i, j)] <= 0) continue;
        height[idx(i, j)] += f * (r.height + noise(x + r.cx, z + r.cz) * r.relief * 2);
        if (f > weight[idx(i, j)]) { weight[idx(i, j)] = f; biome[idx(i, j)] = r.biome; }
      }
    }
  }

  // 3) Lakes & rivers carve below the water level.
  for (const l of t.lakes) {
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const [x, z] = cellToWorld(i, j);
        const f = 1 - dist(x, z, l.cx, l.cz) / l.r;
        if (f > 0.12) height[idx(i, j)] = Math.min(height[idx(i, j)], W - 1);
        else if (f > 0) height[idx(i, j)] = Math.min(height[idx(i, j)], W + 0.4);
      }
    }
  }
  for (const r of t.rivers) {
    if (r.points.length < 2) continue;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const [x, z] = cellToWorld(i, j);
        const d = polylineDist(x, z, r.points);
        // Low banks so the water stays visible instead of a deep canyon.
        if (d < r.width) height[idx(i, j)] = Math.min(height[idx(i, j)], W - 1);
        else if (d < r.width + 1.2) height[idx(i, j)] = Math.min(height[idx(i, j)], W);
        else if (d < r.width + 2.4) height[idx(i, j)] = Math.min(height[idx(i, j)], W + 1);
      }
    }
  }

  // 4) Forest patches just raise decor density.
  for (const f of t.forests) {
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const [x, z] = cellToWorld(i, j);
        if (dist(x, z, f.cx, f.cz) < f.r) decorBoost[idx(i, j)] += f.density;
      }
    }
  }

  // 5) Flatten a small plateau under each zone (and rescue zones over water).
  for (const z of zones) {
    const [ci, cj] = worldToCell(z.x, z.z);
    const base = Math.max(W, Math.round(height[idx(
      Math.min(GRID - 1, Math.max(0, ci)), Math.min(GRID - 1, Math.max(0, cj)),
    )] || W));
    const r = 2.4 * (z.scale || 1);
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const [x, zz] = cellToWorld(i, j);
        const d = dist(x, zz, z.x, z.z);
        if (d < r) height[idx(i, j)] = base;
        else if (d < r + 1.5) height[idx(i, j)] = (height[idx(i, j)] + base) / 2;
      }
    }
  }

  // 6) Quantize to voxel steps.
  for (let k = 0; k < height.length; k++) {
    height[k] = Math.min(MAX_H, Math.max(0, Math.round(height[k])));
  }

  const isWater = (i, j) => height[idx(i, j)] < W;
  const heightAtCell = (i, j) => (i < 0 || j < 0 || i >= GRID || j >= GRID ? 0 : height[idx(i, j)]);

  // 7) Routes between connected zones + manual paths, carved on the ground;
  // water crossings become bridges. Each route keeps its world polyline so the
  // scene can animate a pulse along it.
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const routes = [];
  const seen = new Set();
  const carve = (points, route) => {
    for (let k = 0; k < points.length - 1; k++) {
      const [ax, az] = points[k]; const [bx, bz] = points[k + 1];
      const steps = Math.ceil(dist(ax, az, bx, bz) * 2);
      for (let s = 0; s <= steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const z = az + ((bz - az) * s) / steps;
        const [i, j] = worldToCell(x, z);
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        if (isWater(i, j)) bridge[idx(i, j)] = 1;
        else path[idx(i, j)] = 1;
        if (route) route.push([x, z]);
      }
    }
  };
  for (const z of zones) {
    for (const c of z.connections || []) {
      const to = typeof c === 'number' ? c : c.to;
      const style = typeof c === 'number' ? 'route' : c.style;
      const other = zoneById.get(to);
      const key = z.id < to ? `${z.id}-${to}` : `${to}-${z.id}`;
      if (!other || seen.has(key)) continue;
      seen.add(key);
      if (style !== 'route') { routes.push({ key, a: z.id, b: to, style, points: [[z.x, z.z], [other.x, other.z]] }); continue; }
      // Gentle S-curve so roads don't look like ruler lines.
      const mx = (z.x + other.x) / 2 + noise(z.x, other.z) * 6 - 3;
      const mz = (z.z + other.z) / 2 + noise(other.x, z.z) * 6 - 3;
      const pts = [];
      for (let s = 0; s <= 16; s++) {
        const u = s / 16;
        pts.push([
          (1 - u) * (1 - u) * z.x + 2 * (1 - u) * u * mx + u * u * other.x,
          (1 - u) * (1 - u) * z.z + 2 * (1 - u) * u * mz + u * u * other.z,
        ]);
      }
      const sampled = [];
      carve(pts, sampled);
      routes.push({ key, a: z.id, b: to, style: 'route', points: sampled.filter((_, n) => n % 2 === 0) });
    }
  }
  for (const p of t.paths) if (p.points.length > 1) carve(p.points, null);

  // 8) Beaches: land touching water gets a sand lip.
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (isWater(i, j)) continue;
      if (heightAtCell(i - 1, j) < W || heightAtCell(i + 1, j) < W
        || heightAtCell(i, j - 1) < W || heightAtCell(i, j + 1) < W) beach[idx(i, j)] = 1;
    }
  }

  const heightAt = (x, z) => {
    const [i, j] = worldToCell(x, z);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return 0;
    return Math.max(W, height[idx(i, j)]);
  };

  return {
    terrain: t, grid: GRID, waterLevel: W,
    height, biome, beach, path, bridge, decorBoost,
    routes, heightAt, isWater: (x, z) => { const [i, j] = worldToCell(x, z); return i >= 0 && j >= 0 && i < GRID && j < GRID && isWater(i, j); },
  };
}

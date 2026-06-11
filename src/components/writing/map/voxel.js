import * as THREE from 'three';
import { cellToWorld } from './terrain';

// Geometry builders for the voxel look. Everything is merged into as few
// BufferGeometries as possible (vertex colors, one material) — the whole
// terrain is a single draw call, each building one or two.

const FACES = [
  { dir: [0, 1, 0], shade: 1.0, corners: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },   // top
  { dir: [0, -1, 0], shade: 0.45, corners: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] }, // bottom
  { dir: [1, 0, 0], shade: 0.78, corners: [[1, 1, 1], [1, 1, -1], [1, -1, -1], [1, -1, 1]] },
  { dir: [-1, 0, 0], shade: 0.78, corners: [[-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [-1, -1, -1]] },
  { dir: [0, 0, 1], shade: 0.9, corners: [[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]] },
  { dir: [0, 0, -1], shade: 0.65, corners: [[1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]] },
];

class GeoBuffer {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }

  quad(corners, normal, color, shade) {
    for (const [cx, cy, cz] of corners) {
      this.pos.push(cx, cy, cz);
      this.nor.push(...normal);
      this.col.push(color.r * shade, color.g * shade, color.b * shade);
    }
    // Corner lists are clockwise — emit counter-clockwise triangles so faces
    // point outward (front-face culling ate the whole terrain otherwise).
    this.idx.push(this.n, this.n + 2, this.n + 1, this.n, this.n + 3, this.n + 2);
    this.n += 4;
  }

  box(x, y, z, w, h, d, color, faces = FACES) {
    for (const f of faces) {
      this.quad(
        f.corners.map(([cx, cy, cz]) => [x + (cx * w) / 2, y + (cy * h) / 2, z + (cz * d) / 2]),
        f.dir, color, f.shade,
      );
    }
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    return geo;
  }
}

// Merge a blueprint box list ([{x,y,z,w,h,d,color}]) into one geometry.
// Boxes whose color is the literal string 'accent' are returned separately so
// the caller can give them an emissive material.
export function buildBoxes(boxes, accentHex) {
  const solid = new GeoBuffer();
  const glow = new GeoBuffer();
  const cache = new Map();
  const colorOf = (hex) => {
    if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex));
    return cache.get(hex);
  };
  for (const b of boxes) {
    const target = b.color === 'accent' ? glow : solid;
    target.box(b.x, b.y, b.z, b.w, b.h, b.d, colorOf(b.color === 'accent' ? accentHex : b.color));
  }
  return { solid: solid.build(), glow: glow.n ? glow.build() : null };
}

// Terrain mesh from the world grids: one top quad per cell plus the exposed
// side strips down to each lower neighbour. Water cells get no geometry (the
// translucent water plane shows through).
export function buildTerrainGeometry(world) {
  const { grid, height, biome, beach, path, bridge, waterLevel, terrain } = world;
  const buf = new GeoBuffer();
  const colorCache = new Map();
  const colorOf = (hex) => {
    if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex));
    return colorCache.get(hex);
  };
  const sand = colorOf('#d8c084');
  const pathColor = colorOf('#9c8f7a');
  const plankColor = colorOf('#8a6844');
  const idx = (i, j) => j * grid + i;
  const hAt = (i, j) => (i < 0 || j < 0 || i >= grid || j >= grid ? 0 : height[idx(i, j)]);

  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const h = height[idx(i, j)];
      const [x, z] = cellToWorld(i, j, grid);
      if (h < waterLevel) {
        if (bridge[idx(i, j)]) {
          buf.box(x, waterLevel - 0.12, z, 1, 0.25, 1, plankColor);
        }
        // Sandy bed under every water cell — rivers and shores read as water,
        // not as black trenches.
        buf.quad([[x - 0.5, h, z - 0.5], [x + 0.5, h, z - 0.5], [x + 0.5, h, z + 0.5], [x - 0.5, h, z + 0.5]], [0, 1, 0], sand, 0.55);
        continue;
      }
      const b = terrain.biomes[biome[idx(i, j)]] || terrain.biomes.plaines;
      let top = colorOf(b.top);
      if (beach[idx(i, j)]) top = sand;
      if (path[idx(i, j)]) top = pathColor;
      // Subtle per-cell variation keeps big flats from looking like plastic.
      const v = 0.94 + ((i * 7 + j * 13) % 5) * 0.025;
      buf.quad(
        [[x - 0.5, h, z - 0.5], [x + 0.5, h, z - 0.5], [x + 0.5, h, z + 0.5], [x - 0.5, h, z + 0.5]],
        [0, 1, 0], top, v,
      );
      const side = colorOf(b.side);
      const drops = [
        { n: [1, 0, 0], lo: hAt(i + 1, j), quad: (y0, y1) => [[x + 0.5, y1, z + 0.5], [x + 0.5, y1, z - 0.5], [x + 0.5, y0, z - 0.5], [x + 0.5, y0, z + 0.5]] },
        { n: [-1, 0, 0], lo: hAt(i - 1, j), quad: (y0, y1) => [[x - 0.5, y1, z - 0.5], [x - 0.5, y1, z + 0.5], [x - 0.5, y0, z + 0.5], [x - 0.5, y0, z - 0.5]] },
        { n: [0, 0, 1], lo: hAt(i, j + 1), quad: (y0, y1) => [[x - 0.5, y1, z + 0.5], [x + 0.5, y1, z + 0.5], [x + 0.5, y0, z + 0.5], [x - 0.5, y0, z + 0.5]] },
        { n: [0, 0, -1], lo: hAt(i, j - 1), quad: (y0, y1) => [[x + 0.5, y1, z - 0.5], [x - 0.5, y1, z - 0.5], [x - 0.5, y0, z - 0.5], [x + 0.5, y0, z - 0.5]] },
      ];
      for (const dframe of drops) {
        if (dframe.lo >= h) continue;
        const y0 = Math.max(0, dframe.lo);
        buf.quad(dframe.quad(y0, h), dframe.n, side, 0.88);
      }
    }
  }
  return buf.build();
}

// Scattered vegetation/props, merged into one static geometry. Kinds mirror
// the biome presets; positions avoid water, paths and zone plateaus.
export function buildDecorGeometry(world, zones, rng, quality) {
  const { grid, height, biome, path, bridge, beach, waterLevel, decorBoost, terrain } = world;
  const buf = new GeoBuffer();
  const cache = new Map();
  const colorOf = (hex) => { if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex)); return cache.get(hex); };
  const idx = (i, j) => j * grid + i;
  const budget = Math.round((quality === 'low' ? 160 : 380) * (grid / 48) ** 2);
  let used = 0;

  const KINDS = {
    herbe: (x, y, z) => { buf.box(x, y + 0.18, z, 0.1, 0.36, 0.1, colorOf('#5fae5a')); },
    arbre: (x, y, z) => {
      const th = 1 + Math.floor(rng() * 2);
      buf.box(x, y + th / 2, z, 0.3, th, 0.3, colorOf('#5a4030'));
      buf.box(x, y + th + 0.6, z, 1.5, 1.2, 1.5, colorOf('#3c7a45'));
      buf.box(x, y + th + 1.5, z, 0.9, 0.7, 0.9, colorOf('#46894f'));
    },
    sapin: (x, y, z) => {
      buf.box(x, y + 0.4, z, 0.26, 0.8, 0.26, colorOf('#4c382b'));
      buf.box(x, y + 1.1, z, 1.3, 0.6, 1.3, colorOf('#2e5e44'));
      buf.box(x, y + 1.7, z, 0.9, 0.6, 0.9, colorOf('#356a4d'));
      buf.box(x, y + 2.3, z, 0.5, 0.6, 0.5, colorOf('#3d7556'));
    },
    cactus: (x, y, z) => {
      buf.box(x, y + 0.7, z, 0.34, 1.4, 0.34, colorOf('#4f8a52'));
      if (rng() > 0.5) buf.box(x + 0.34, y + 0.9, z, 0.34, 0.5, 0.3, colorOf('#4f8a52'));
    },
    rocher: (x, y, z) => {
      buf.box(x, y + 0.3, z, 0.9, 0.6, 0.8, colorOf('#7c7e86'));
      buf.box(x + 0.25, y + 0.7, z - 0.1, 0.45, 0.4, 0.4, colorOf('#8d8f97'));
    },
    roseau: (x, y, z) => {
      buf.box(x - 0.15, y + 0.5, z, 0.1, 1, 0.1, colorOf('#6f8a4e'));
      buf.box(x + 0.15, y + 0.65, z + 0.1, 0.1, 1.3, 0.1, colorOf('#7a955a'));
    },
    palmier: (x, y, z) => {
      buf.box(x, y + 1, z, 0.26, 2, 0.26, colorOf('#7a5a3c'));
      buf.box(x, y + 2.1, z, 1.6, 0.22, 0.5, colorOf('#4d9152'));
      buf.box(x, y + 2.1, z, 0.5, 0.22, 1.6, colorOf('#4d9152'));
    },
    bambou: (x, y, z) => {
      buf.box(x - 0.2, y + 1.1, z, 0.14, 2.2, 0.14, colorOf('#6fae5c'));
      buf.box(x + 0.2, y + 0.9, z + 0.15, 0.14, 1.8, 0.14, colorOf('#7cba66'));
      buf.box(x, y + 2.3, z, 0.7, 0.16, 0.7, colorOf('#5fa252'));
    },
    none: () => {},
  };

  for (let j = 1; j < grid - 1 && used < budget; j += 1) {
    for (let i = 1; i < grid - 1 && used < budget; i += 1) {
      const k = idx(i, j);
      if (height[k] < waterLevel || path[k] || bridge[k] || beach[k]) continue;
      const b = terrain.biomes[biome[k]] || terrain.biomes.plaines;
      const p = Math.min(0.6, (b.density || 0) + decorBoost[k]);
      if (rng() > p) continue;
      const [x, z] = cellToWorld(i, j, grid);
      if (zones.some((zz) => Math.hypot(zz.x - x, zz.z - z) < 3.4 * (zz.scale || 1))) continue;
      const fn = KINDS[b.decor] || KINDS.herbe;
      fn(x + (rng() - 0.5) * 0.5, height[k], z + (rng() - 0.5) * 0.5);
      used++;
    }
  }
  return buf.build();
}

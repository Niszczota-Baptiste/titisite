// Building blueprints: plain data (lists of boxes), rendered by buildings.jsx
// through the merged-geometry builder. Adding a building = writing a new box
// list here + allowlisting its key server-side — the engine never changes.
// Boxes with color 'accent' glow in the universe's accent color.
//
// The Korean set (pagode / hanok / pavillon / porte) reproduces the look of
// the user's Minecraft builds: green-tiled or charcoal curved roofs with gold
// trim, cream walls, stone arcades, red pillars, bamboo.

const B = (x, y, z, w, h, d, color) => ({ x, y, z, w, h, d, color });

const STONE = '#cfc8bd';
const STONE_D = '#9b948a';
const GRANITE = '#84868e';
const WOOD = '#6e4f38';
const WOOD_D = '#52392a';
const CREAM = '#e9e2d2';
const ROOF_G = '#2f7e63';
const ROOF_G_D = '#26684f';
const GOLD = '#d9b86a';
const CHARCOAL = '#3d3c44';
const RED = '#a8392e';
const RED_D = '#822c23';

// Curved Korean roof, voxel style: a wide eave slab with raised gold corner
// tips, a steeper upper slab and a gold ridge.
function koreanRoof(y, w, d, main, dark) {
  const out = [
    B(0, y + 0.14, 0, w + 1.1, 0.28, d + 1.1, main),
    B(0, y + 0.5, 0, w * 0.72, 0.45, d * 0.72, dark),
    B(0, y + 0.86, 0, w * 0.4, 0.28, d * 0.4, main),
    B(0, y + 1.06, 0, w * 0.46, 0.14, 0.3, GOLD),
  ];
  const cx = (w + 1.1) / 2 - 0.18;
  const cz = (d + 1.1) / 2 - 0.18;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    out.push(B(sx * cx, y + 0.36, sz * cz, 0.36, 0.22, 0.36, GOLD));
  }
  return out;
}

export const BLUEPRINTS = {
  // ── Korean set ──────────────────────────────────────────────────────────────
  pagode: [
    B(0, 0.2, 0, 3.6, 0.4, 2.8, STONE),
    B(0, 0.5, 0, 3.2, 0.25, 2.4, STONE_D),
    // Lower arcade: stone columns + first green roof.
    ...[-1.3, -0.45, 0.45, 1.3].flatMap((x) => [B(x, 1.1, -1, 0.28, 1.2, 0.28, STONE), B(x, 1.1, 1, 0.28, 1.2, 0.28, STONE)]),
    ...koreanRoof(1.7, 3.1, 2.3, ROOF_G, ROOF_G_D).slice(0, 1),
    ...[[-1.85, -1.35], [1.85, -1.35], [-1.85, 1.35], [1.85, 1.35]].map(([x, z]) => B(x, 1.95, z, 0.34, 0.2, 0.34, GOLD)),
    // Upper hall: cream walls, wood lattice windows, accent glow.
    B(0, 2.5, 0, 2.5, 1.3, 1.8, CREAM),
    B(0, 2.5, 0, 2.6, 0.22, 1.9, WOOD_D),
    ...[-0.7, 0, 0.7].map((x) => B(x, 2.62, 0.92, 0.42, 0.6, 0.06, 'accent')),
    ...[-0.7, 0.7].map((x) => B(x, 2.62, -0.92, 0.42, 0.6, 0.06, WOOD_D)),
    // Main double roof.
    ...koreanRoof(3.3, 2.9, 2.2, ROOF_G, ROOF_G_D),
  ],
  hanok: [
    B(0, 0.15, 0, 2.8, 0.3, 2.1, STONE_D),
    B(0, 0.85, 0, 2.3, 1.1, 1.6, CREAM),
    ...[[-1.1, -0.75], [1.1, -0.75], [-1.1, 0.75], [1.1, 0.75]].map(([x, z]) => B(x, 0.85, z, 0.24, 1.1, 0.24, WOOD)),
    B(0, 0.78, 0.82, 0.5, 0.75, 0.07, 'accent'),
    B(-0.85, 0.95, 0.82, 0.4, 0.5, 0.06, WOOD_D),
    B(0.85, 0.95, 0.82, 0.4, 0.5, 0.06, WOOD_D),
    ...koreanRoof(1.55, 2.4, 1.7, CHARCOAL, '#2e2d34'),
  ],
  pavillon: [
    // Open pavilion on red stilts, like the crimson build.
    ...[[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]].map(([x, z]) => B(x, 0.6, z, 0.26, 1.2, 0.26, RED)),
    B(0, 1.3, 0, 2.7, 0.24, 1.9, WOOD_D),
    ...[[-1.1, -0.75], [1.1, -0.75], [-1.1, 0.75], [1.1, 0.75]].map(([x, z]) => B(x, 1.95, z, 0.22, 1.1, 0.22, RED)),
    B(0, 2.1, 0, 1.2, 0.5, 0.8, RED_D),
    B(0, 1.78, 0, 0.34, 0.4, 0.07, 'accent'),
    ...koreanRoof(2.6, 2.6, 1.8, CHARCOAL, RED_D),
  ],
  porte: [
    // Stone gate with bamboo, echoing the walled alley.
    B(-1.15, 1, 0, 0.8, 2, 0.8, GRANITE),
    B(1.15, 1, 0, 0.8, 2, 0.8, GRANITE),
    B(-1.15, 2.12, 0, 0.92, 0.25, 0.92, STONE_D),
    B(1.15, 2.12, 0, 0.92, 0.25, 0.92, STONE_D),
    B(0, 2.42, 0, 3.3, 0.4, 0.95, STONE),
    ...koreanRoof(2.7, 2.6, 0.9, ROOF_G, ROOF_G_D).slice(0, 2),
    B(0, 1.45, 0.1, 0.4, 0.4, 0.4, 'accent'),
    B(-1.95, 1.3, 0.4, 0.14, 2.6, 0.14, '#6fae5c'),
    B(-1.7, 1.05, 0.62, 0.14, 2.1, 0.14, '#7cba66'),
    B(1.85, 1.15, 0.5, 0.14, 2.3, 0.14, '#6fae5c'),
  ],
  // ── Classic set, re-voxelized ───────────────────────────────────────────────
  tour: [
    B(0, 1.4, 0, 1.2, 2.8, 1.2, STONE_D),
    B(0, 2.95, 0, 1.5, 0.3, 1.5, GRANITE),
    ...[[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].map(([x, z]) => B(x, 3.3, z, 0.3, 0.4, 0.3, GRANITE)),
    B(0, 1.9, 0.62, 0.4, 0.55, 0.06, 'accent'),
    B(0, 0.9, 0.62, 0.4, 0.55, 0.06, 'accent'),
  ],
  maison: [
    B(0, 0.7, 0, 1.9, 1.4, 1.5, CREAM),
    ...[[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]].map(([x, z]) => B(x, 0.7, z, 0.2, 1.4, 0.2, WOOD)),
    B(0, 1.62, 0, 2.3, 0.45, 1.9, '#7a3f4e'),
    B(0, 2.05, 0, 1.4, 0.42, 1.2, '#6a3644'),
    B(0, 0.62, 0.78, 0.45, 0.85, 0.06, 'accent'),
  ],
  donjon: [
    B(0, 1, 0, 2, 2, 2, STONE_D),
    B(0, 2.15, 0, 2.3, 0.3, 2.3, GRANITE),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([x, z]) => [
      B(x, 1.4, z, 0.7, 2.8, 0.7, GRANITE),
      B(x, 2.95, z, 0.85, 0.3, 0.85, STONE_D),
    ]),
    B(0, 1.5, 1.02, 0.35, 0.8, 0.06, 'accent'),
  ],
  temple: [
    B(0, 0.2, 0, 2.8, 0.4, 2.1, STONE),
    ...[[-1.05, -0.7], [1.05, -0.7], [-1.05, 0.7], [1.05, 0.7]].map(([x, z]) => B(x, 1.05, z, 0.3, 1.3, 0.3, CREAM)),
    B(0, 1.85, 0, 3, 0.35, 2.3, STONE),
    B(0, 2.2, 0, 2.2, 0.35, 1.6, STONE_D),
    B(0, 0.75, 0, 0.5, 0.5, 0.5, 'accent'),
  ],
  cristal: [
    B(0, 0.25, 0, 1, 0.5, 0.9, GRANITE),
    B(0, 1, 0, 0.85, 1.1, 0.85, 'accent'),
    B(0, 1.85, 0, 0.5, 0.7, 0.5, 'accent'),
    B(0.65, 0.45, 0.3, 0.4, 0.6, 0.4, 'accent'),
    B(-0.6, 0.35, -0.2, 0.5, 0.5, 0.5, '#5c5670'),
  ],
  arbre: [
    B(0, 1, 0, 0.7, 2, 0.7, WOOD),
    B(0, 2.7, 0, 2.6, 1.4, 2.6, '#3c7a45'),
    B(0, 3.7, 0, 1.7, 0.8, 1.7, '#46894f'),
    B(0.9, 2.3, 0.9, 0.3, 0.3, 0.3, 'accent'),
    B(-0.8, 3.1, 0.5, 0.26, 0.26, 0.26, 'accent'),
    B(0.3, 4, -0.6, 0.26, 0.26, 0.26, 'accent'),
  ],
  ruine: [
    B(-0.7, 0.55, -0.3, 0.45, 1.1, 0.45, STONE_D),
    B(0.65, 0.9, -0.4, 0.45, 1.8, 0.45, STONE_D),
    B(0.7, 1.9, -0.4, 0.55, 0.25, 0.55, GRANITE),
    B(0, 0.25, 0.55, 1.4, 0.5, 0.5, GRANITE),
    B(-0.3, 0.3, 0, 0.5, 0.5, 0.5, 'accent'),
  ],
  phare: [
    B(0, 1.5, 0, 1.1, 3, 1.1, CREAM),
    B(0, 1.5, 0, 1.2, 0.4, 1.2, RED),
    B(0, 2.6, 0, 1.2, 0.4, 1.2, RED),
    B(0, 3.3, 0, 0.8, 0.6, 0.8, 'accent'),
    B(0, 3.75, 0, 1.1, 0.3, 1.1, CHARCOAL),
  ],
  tente: [
    B(0, 0.5, 0, 2, 1, 2, '#a05f48'),
    B(0, 1.3, 0, 1.3, 0.7, 1.3, '#8a4f3c'),
    B(0, 1.85, 0, 0.6, 0.5, 0.6, '#7a4434'),
    B(0, 0.45, 1.02, 0.5, 0.7, 0.06, 'accent'),
  ],
  monolithe: [
    B(0, 1.5, 0, 0.9, 3, 0.6, '#3c3550'),
    B(0, 3.1, 0, 0.6, 0.4, 0.45, '#322c44'),
    B(0.18, 2.1, 0.32, 0.16, 0.4, 0.06, 'accent'),
    B(-0.2, 1.4, 0.32, 0.16, 0.28, 0.06, 'accent'),
    B(0.05, 0.7, 0.32, 0.24, 0.16, 0.06, 'accent'),
    B(0.75, 0.25, 0.45, 0.5, 0.5, 0.5, GRANITE),
  ],
};

// Roof height per type — anchors the floating label/preview.
export const BUILDING_HEIGHT = {
  pagode: 4.6, hanok: 2.9, pavillon: 3.9, porte: 3.4,
  tour: 3.7, maison: 2.5, donjon: 3.3, temple: 2.6, cristal: 2.6,
  arbre: 4.4, ruine: 2.2, phare: 4.1, tente: 2.2, monolithe: 3.4,
};

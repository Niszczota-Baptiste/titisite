import zlib from 'node:zlib';
import nbt from 'prismarine-nbt';

// Génération d'une CARTE Minecraft (item `filled_map`, 128×128) — fichier
// `data/map_<n>.dat`. Convertit une image/texte vers la palette de « map colors »
// du jeu : 62 couleurs de base × 4 nuances (multiplicateurs 180/220/255/135), le
// byte stocké = baseId*4 + nuance. baseId 0 = transparent (byte 0).

// Couleurs de base 1.16+ (id → RGB de référence).
const BASE = [
  [0, 0, 0], [127, 178, 56], [247, 233, 163], [199, 199, 199], [255, 0, 0],
  [160, 160, 255], [167, 167, 167], [0, 124, 0], [255, 255, 255], [164, 168, 184],
  [151, 109, 77], [112, 112, 112], [64, 64, 255], [143, 119, 72], [255, 252, 245],
  [216, 127, 51], [178, 76, 216], [102, 153, 216], [229, 229, 51], [127, 204, 25],
  [242, 127, 165], [76, 76, 76], [153, 153, 153], [76, 127, 153], [127, 63, 178],
  [51, 76, 178], [102, 76, 51], [102, 127, 51], [153, 51, 51], [25, 25, 25],
  [250, 238, 77], [92, 219, 213], [74, 128, 255], [0, 217, 58], [129, 86, 49],
  [112, 2, 0], [209, 177, 161], [159, 82, 36], [149, 87, 108], [112, 108, 138],
  [186, 133, 36], [103, 117, 53], [160, 77, 78], [57, 41, 35], [135, 107, 98],
  [87, 92, 92], [122, 73, 88], [76, 62, 92], [76, 50, 35], [76, 82, 42],
  [142, 60, 46], [37, 22, 16], [189, 48, 49], [148, 63, 97], [92, 25, 29],
  [22, 126, 134], [58, 142, 140], [86, 44, 62], [20, 180, 133], [100, 100, 100],
  [216, 175, 147], [127, 167, 150],
];
const SHADE = [180, 220, 255, 135];

// Palette résolue : { byte, r, g, b } pour baseId 1..61 × 4 nuances.
const PALETTE = (() => {
  const pal = [];
  for (let id = 1; id < BASE.length; id++) {
    const [br, bg, bb] = BASE[id];
    for (let s = 0; s < 4; s++) {
      const m = SHADE[s] / 255;
      pal.push({ byte: id * 4 + s, r: Math.round(br * m), g: Math.round(bg * m), b: Math.round(bb * m) });
    }
  }
  return pal;
})();

// RGB → byte de carte le plus proche (distance pondérée perceptuelle).
function nearestByte(r, g, b) {
  let best = PALETTE[0], bd = Infinity;
  for (const c of PALETTE) {
    const dr = r - c.r, dg = g - c.g, db = b - c.b;
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = c; }
  }
  return best.byte;
}

// Données RGBA brutes 128×128 → tableau de 16384 bytes signés (NBT i8).
export function rgbaToMapColors(data, channels) {
  const out = new Int8Array(128 * 128);
  for (let i = 0; i < 128 * 128; i++) {
    const o = i * channels;
    const a = channels === 4 ? data[o + 3] : 255;
    if (a < 128) { out[i] = 0; continue; } // transparent
    const byte = nearestByte(data[o], data[o + 1], data[o + 2]);
    out[i] = byte > 127 ? byte - 256 : byte;
  }
  return out;
}

// Construit le fichier `map_<n>.dat` (NBT gzip) à partir des 16384 bytes.
export function buildMapDat(colors, { dataVersion = 3578, xCenter = 0, zCenter = 0 } = {}) {
  const root = { type: 'compound', name: '', value: {
    DataVersion: { type: 'int', value: dataVersion },
    data: { type: 'compound', value: {
      scale: { type: 'byte', value: 0 },
      dimension: { type: 'string', value: 'minecraft:overworld' },
      trackingPosition: { type: 'byte', value: 0 },
      unlimitedTracking: { type: 'byte', value: 0 },
      locked: { type: 'byte', value: 1 },
      xCenter: { type: 'int', value: xCenter },
      zCenter: { type: 'int', value: zCenter },
      banners: { type: 'list', value: { type: 'compound', value: [] } },
      frames: { type: 'list', value: { type: 'compound', value: [] } },
      colors: { type: 'byteArray', value: Array.from(colors) },
    } },
  } };
  return zlib.gzipSync(nbt.writeUncompressed(root, 'big'));
}

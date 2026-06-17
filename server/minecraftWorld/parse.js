import fs from 'node:fs';
import { extractMcaEntries, regionCoordsFromName } from './zip.js';
import { parseRegion } from './anvil.js';

// Lit un fichier uploadé (ZIP de region/ ou .mca isolé), extrait les blocs DANS
// la boîte, et renvoie une liste sparse + palette + BOM (comptes par blockId).
// Tourne dans un worker (cf. parseWorker.js).
export async function parseWorld({ filePath, originalName, bbox, maxBlocks }) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is a UUID under uploads/, not user-controlled
  const buf = fs.readFileSync(filePath);

  let regions;
  if (/\.zip$/i.test(originalName || '')) {
    regions = extractMcaEntries(buf);
  } else {
    const rc = regionCoordsFromName(originalName);
    if (!rc) throw new Error('region_coords_unknown');
    regions = [{ regionX: rc.regionX, regionZ: rc.regionZ, data: buf }];
  }
  if (regions.length === 0) throw new Error('no_region');

  const palette = [];
  const paletteIndex = new Map();
  const counts = new Map();
  const blocks = []; // interleavé [x,y,z,pi, …] en coords relatives à min
  let count = 0;
  let overflow = false;

  const idxOf = (name) => {
    let i = paletteIndex.get(name);
    if (i === undefined) { i = palette.length; palette.push(name); paletteIndex.set(name, i); }
    return i;
  };
  const emit = (x, y, z, name) => {
    if (overflow) return;
    if (count >= maxBlocks) { overflow = true; return; }
    blocks.push(x - bbox.minX, y - bbox.minY, z - bbox.minZ, idxOf(name));
    counts.set(name, (counts.get(name) || 0) + 1);
    count++;
  };

  for (const r of regions) {
    await parseRegion(r.data, r.regionX, r.regionZ, bbox, emit);
    if (overflow) break;
  }
  if (overflow) throw new Error('too_many_blocks');

  const bom = [...counts.entries()]
    .map(([blockId, c]) => ({ blockId, count: c }))
    .sort((a, b) => b.count - a.count);

  return {
    palette,
    blocks,
    bom,
    count,
    min: { x: bbox.minX, y: bbox.minY, z: bbox.minZ },
    size: { x: bbox.maxX - bbox.minX + 1, y: bbox.maxY - bbox.minY + 1, z: bbox.maxZ - bbox.minZ + 1 },
  };
}

import fs from 'node:fs';
import { extractMcaEntries, regionCoordsFromName } from './zip.js';
import { parseRegion } from './anvil.js';

// Lit un fichier uploadé (ZIP de region/ ou .mca isolé), extrait les blocs DANS
// la boîte, et renvoie une liste sparse + palette + BOM (comptes par blockId).
// Si `bbox` est absent (null/undefined), on détecte automatiquement l'emprise
// réelle des blocs non-air (import « complet », sans coordonnées). Tourne dans
// un worker (cf. parseWorker.js).
const FULL_MAX_SPAN = Number(process.env.BLUEPRINT_MAX_SPAN || 2048);
const FULL_MAX_HEIGHT = Number(process.env.BLUEPRINT_MAX_HEIGHT || 384);

// Scanne toutes les régions et renvoie l'emprise (inclusive) des blocs non-air,
// ou lève « empty_box » si le fichier ne contient aucun bloc.
async function autoBounds(regions) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let any = false;
  for (const r of regions) {
    const scan = {
      minX: r.regionX * 512, maxX: r.regionX * 512 + 511,
      minZ: r.regionZ * 512, maxZ: r.regionZ * 512 + 511,
      minY: -2048, maxY: 2048,
    };
    await parseRegion(r.data, r.regionX, r.regionZ, scan, (x, y, z) => {
      any = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    });
  }
  if (!any) throw new Error('empty_box');
  if (maxX - minX + 1 > FULL_MAX_SPAN || maxZ - minZ + 1 > FULL_MAX_SPAN || maxY - minY + 1 > FULL_MAX_HEIGHT) {
    throw new Error('box_too_big');
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

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

  // Import complet : détection automatique de l'emprise.
  if (!bbox) bbox = await autoBounds(regions);

  const palette = []; // [{ name, props }] — unique par (nom + état complet)
  const paletteIndex = new Map();
  const counts = new Map();
  const blocks = []; // interleavé [x,y,z,pi, …] en coords relatives à min
  let count = 0;
  let overflow = false;

  // Clé stable pour les props (ordre des clés trié).
  const propsKey = (props) => {
    if (!props) return '';
    return Object.keys(props).sort().map((k) => `${k}=${props[k]}`).join(',');
  };
  const idxOf = (name, props) => {
    const key = `${name}|${propsKey(props)}`;
    let i = paletteIndex.get(key);
    if (i === undefined) { i = palette.length; palette.push({ name, props: props || null }); paletteIndex.set(key, i); }
    return i;
  };
  const emit = (x, y, z, name, props = null) => {
    if (overflow) return;
    if (count >= maxBlocks) { overflow = true; return; }
    blocks.push(x - bbox.minX, y - bbox.minY, z - bbox.minZ, idxOf(name, props));
    counts.set(name, (counts.get(name) || 0) + 1); // BOM regroupé par nom
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

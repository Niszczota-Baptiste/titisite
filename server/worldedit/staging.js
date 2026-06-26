/* eslint-disable security/detect-non-literal-fs-filename --
   Tous les chemins ci-dessous sont construits sous uploads/worldedit/<id>/ à
   partir d'identifiants numériques de build et de noms de région r.X.Z.mca
   validés (jamais d'entrée utilisateur brute dans le chemin). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { db } from '../db.js';
import { uploadPath } from '../uploads.js';
import {
  regionFileName, regionCoordsFromName, writeRegion, readRegion, decodeChunk,
  encodeBlockStates, SECTION_VOLUME,
} from '../anvil/index.js';
import { extractMcaEntries } from '../minecraftWorld/zip.js';
import { RegionStore } from './regionStore.js';
import {
  opMirror, opRotate, opTranslate, opReplace, opSet, opCopy, opPaste, opCut,
  opWalls, opFaces, opHollow, opOverlay, opNaturalize, opStack, opSphere, opCyl, opSmooth, opScale, opMix,
  opLine, opPyramid, opCone, opErode, opDilate, opDrain, opBiome, opPath, opTerrain,
  MaskedVolume, SELECTION_SHAPES, sameBlock,
} from './transform.js';
import { makeZip } from './zipWriter.js';

const fdiv = (a, b) => Math.floor(a / b);
const REGION_FILE_RE = /^r\.(-?\d+)\.(-?\d+)\.mca$/;
const MAX_UNDO = Number(process.env.WORLDEDIT_MAX_UNDO || 30);

const baseDir = () => uploadPath('worldedit');
const dirFor = (id) => path.join(baseDir(), String(Number(id)));
const regionsDir = (id) => path.join(dirFor(id), 'regions');
const undoDir = (id) => path.join(dirFor(id), 'undo');
const redoDir = (id) => path.join(dirFor(id), 'redo');
const previewPath = (id) => path.join(dirFor(id), 'preview.json.gz');

// Limites de hauteur du monde Minecraft 1.18+ (blocs y ∈ [-64, 319]).
const WORLD_MIN_Y = Number(process.env.WORLD_MIN_Y ?? -64);
const WORLD_MAX_Y = Number(process.env.WORLD_MAX_Y ?? 319);

// Emprise RÉELLE du contenu (depuis la base) — sert au warmup et à l'aperçu.
export function buildExtent(bp) {
  return {
    min: { x: bp.min_x, y: bp.min_y, z: bp.min_z },
    max: { x: bp.min_x + bp.size_x - 1, y: bp.min_y + bp.size_y - 1, z: bp.min_z + bp.size_z - 1 },
  };
}
// Limites ÉDITABLES : X/Z = emprise du build, Y = hauteur du monde Minecraft.
// On peut donc construire au-dessus/en-dessous du contenu existant.
export function buildLimits(bp) {
  return {
    min: { x: bp.min_x, y: WORLD_MIN_Y, z: bp.min_z },
    max: { x: bp.min_x + bp.size_x - 1, y: WORLD_MAX_Y, z: bp.min_z + bp.size_z - 1 },
  };
}
// Conservé pour compat (extract) : alias d'emprise contenu.
export const buildBBox = buildExtent;

const clampBBox = (b, lim) => ({
  min: { x: Math.max(b.min.x, lim.min.x), y: Math.max(b.min.y, lim.min.y), z: Math.max(b.min.z, lim.min.z) },
  max: { x: Math.min(b.max.x, lim.max.x), y: Math.min(b.max.y, lim.max.y), z: Math.min(b.max.z, lim.max.z) },
});
function growExtent(id, ext) {
  db.prepare(`UPDATE minecraft_blueprints SET min_x=?, min_y=?, min_z=?, size_x=?, size_y=?, size_z=? WHERE id=?`)
    .run(ext.min.x, ext.min.y, ext.min.z, ext.max.x - ext.min.x + 1, ext.max.y - ext.min.y + 1, ext.max.z - ext.min.z + 1, id);
}

function regionKeysForBBox(bbox) {
  const keys = new Set();
  for (let rz = fdiv(bbox.min.z, 512); rz <= fdiv(bbox.max.z, 512); rz++) {
    for (let rx = fdiv(bbox.min.x, 512); rx <= fdiv(bbox.max.x, 512); rx++) keys.add(`${rx},${rz}`);
  }
  return keys;
}
const unionBBox = (a, b) => ({
  min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
  max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
});

// Matérialise le source du build en r.X.Z.mca sous regions/ (idempotent).
function materialize(bp) {
  const rdir = regionsDir(bp.id);
  if (fs.existsSync(rdir) && fs.readdirSync(rdir).some((f) => REGION_FILE_RE.test(f))) return rdir;
  if (!bp.source_file) throw new Error('no_source');
  fs.mkdirSync(rdir, { recursive: true });
  const srcPath = uploadPath(bp.source_file);
  const buf = fs.readFileSync(srcPath);
  if (/\.zip$/i.test(bp.source_name || '')) {
    for (const e of extractMcaEntries(buf)) {
      fs.writeFileSync(path.join(rdir, regionFileName(e.regionX, e.regionZ)), e.data);
    }
  } else {
    const rc = regionCoordsFromName(bp.source_name);
    if (!rc) throw new Error('region_coords_unknown');
    fs.writeFileSync(path.join(rdir, regionFileName(rc.regionX, rc.regionZ)), buf);
  }
  return rdir;
}

function listRegionFiles(id) {
  const rdir = regionsDir(id);
  if (!fs.existsSync(rdir)) return [];
  return fs.readdirSync(rdir)
    .map((f) => { const m = f.match(REGION_FILE_RE); return m ? { file: f, regionX: Number(m[1]), regionZ: Number(m[2]) } : null; })
    .filter(Boolean);
}

function loadStore(bp) {
  materialize(bp);
  const rdir = regionsDir(bp.id);
  const sources = listRegionFiles(bp.id).map(({ file, regionX, regionZ }) => ({
    regionX, regionZ, buffer: fs.readFileSync(path.join(rdir, file)),
  }));
  return new RegionStore(sources);
}

// ── Validation de sélection ──────────────────────────────────────────────────
// Plafond de volume de la BOÎTE de sélection (les ops itèrent chaque case). Élevé
// par défaut : les grosses commandes (terrain, heightmap…) tournent côté serveur
// et écrivent le .mca même si l'aperçu 3D, lui, ne montre qu'une part (truncate).
const MAX_SELECTION_VOLUME = Number(process.env.WORLDEDIT_MAX_SELECTION || 128_000_000);
const CROP_MAX_BLOCKS = Number(process.env.BLUEPRINT_MAX_BLOCKS || 3_000_000);
// Budget d'affichage de l'aperçu (blocs pleins) : au-delà l'aperçu est PARTIEL
// (le navigateur ne peut pas afficher des dizaines de millions de blocs).
const PREVIEW_MAX_BLOCKS = Number(process.env.WORLDEDIT_PREVIEW_MAX || 4_000_000);

// `maxVolume` borne le volume de la boîte (transformations, qui itèrent chaque
// case). Pour l'extraction on passe Infinity : le coût réel y est le nombre de
// blocs NON-air (borné par cropBuild → deriveSparse → too_many_blocks).
export function validateSelection(sel, bbox, { maxVolume = MAX_SELECTION_VOLUME } = {}) {
  for (const c of ['min', 'max']) for (const a of ['x', 'y', 'z']) {
    if (!Number.isFinite(sel?.[c]?.[a])) return 'invalid_selection';
  }
  const norm = {
    min: { x: Math.min(sel.min.x, sel.max.x), y: Math.min(sel.min.y, sel.max.y), z: Math.min(sel.min.z, sel.max.z) },
    max: { x: Math.max(sel.min.x, sel.max.x), y: Math.max(sel.min.y, sel.max.y), z: Math.max(sel.min.z, sel.max.z) },
  };
  for (const a of ['x', 'y', 'z']) {
    if (norm.min[a] < bbox.min[a] || norm.max[a] > bbox.max[a]) return 'out_of_bounds';
  }
  const vol = (norm.max.x - norm.min.x + 1) * (norm.max.y - norm.min.y + 1) * (norm.max.z - norm.min.z + 1);
  if (vol > maxVolume) return 'selection_too_large';
  const stype = SELECTION_SHAPES.has(sel?.shape?.type) ? sel.shape.type : 'box';
  norm.shape = { type: stype };
  return norm;
}

// ── Piles undo / redo (snapshots de fichiers de région) ──────────────────────
function dirSeqs(base) {
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
}
const undoSeqs = (id) => dirSeqs(undoDir(id));
const redoSeqs = (id) => dirSeqs(redoDir(id));

// Copie l'état actuel des régions `regionKeys` dans un nouveau snapshot sous
// `base`. Borne la pile à `cap`.
function snapshotInto(base, id, regionKeys, cap = MAX_UNDO) {
  const seqs = dirSeqs(base);
  const seq = (seqs.length ? seqs[seqs.length - 1] : 0) + 1;
  const dest = path.join(base, String(seq));
  fs.mkdirSync(dest, { recursive: true });
  const rdir = regionsDir(id);
  for (const key of regionKeys) {
    const [rx, rz] = key.split(',').map(Number);
    const fname = regionFileName(rx, rz);
    const src = path.join(rdir, fname);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, fname));
  }
  for (const old of dirSeqs(base).slice(0, Math.max(0, dirSeqs(base).length - cap))) {
    fs.rmSync(path.join(base, String(old)), { recursive: true, force: true });
  }
}
const snapshotRegions = (id, regionKeys) => snapshotInto(undoDir(id), id, regionKeys);
const clearRedo = (id) => fs.rmSync(redoDir(id), { recursive: true, force: true });

// Restaure un snapshot dans regions/, en capturant d'abord l'état actuel des
// mêmes régions dans `intoBase` (pour l'opération inverse). Renvoie les clés.
function applySnapshot(snapDir, id, intoBase) {
  const rdir = regionsDir(id);
  const files = fs.readdirSync(snapDir).filter((f) => REGION_FILE_RE.test(f));
  const keys = files.map((f) => { const m = f.match(REGION_FILE_RE); return `${m[1]},${m[2]}`; });
  snapshotInto(intoBase, id, keys, MAX_UNDO);
  for (const f of files) fs.copyFileSync(path.join(snapDir, f), path.join(rdir, f));
  fs.rmSync(snapDir, { recursive: true, force: true });
}

// ── API publique du staging ──────────────────────────────────────────────────

export function hasPendingEdits(id) {
  return fs.existsSync(previewPath(id));
}

export function previewFilePath(id) {
  const p = previewPath(id);
  return fs.existsSync(p) ? p : null;
}

const OPS = {
  mirror: (store, sel, p) => opMirror(store, sel, p),
  rotate: (store, sel, p) => opRotate(store, sel, p),
  translate: (store, sel, p) => opTranslate(store, sel, p),
  replace: (store, sel, p) => opReplace(store, sel, p),
  set: (store, sel, p) => opSet(store, sel, p),
  cut: (store, sel) => opCut(store, sel), // copie + vide la sélection
  walls: (store, sel, p) => opWalls(store, sel, p),
  faces: (store, sel, p) => opFaces(store, sel, p),
  hollow: (store, sel) => opHollow(store, sel),
  overlay: (store, sel, p) => opOverlay(store, sel, p),
  naturalize: (store, sel, p) => opNaturalize(store, sel, p),
  stack: (store, sel, p) => opStack(store, sel, p),
  sphere: (store, sel, p) => opSphere(store, sel, p),
  cyl: (store, sel, p) => opCyl(store, sel, p),
  smooth: (store, sel, p) => opSmooth(store, sel, p),
  scale: (store, sel, p) => opScale(store, sel, p),
  mix: (store, sel, p) => opMix(store, sel, p),
  line: (store, sel, p) => opLine(store, sel, p),
  pyramid: (store, sel, p) => opPyramid(store, sel, p),
  cone: (store, sel, p) => opCone(store, sel, p),
  erode: (store, sel, p) => opErode(store, sel, p),
  dilate: (store, sel, p) => opDilate(store, sel, p),
  drain: (store, sel) => opDrain(store, sel),
  biome: (store, sel, p) => opBiome(store, sel, p),
  path: (store, sel, p) => opPath(store, sel, p),
  terrain: (store, sel, p) => opTerrain(store, sel, p),
};

// Rend la main à la boucle d'événements (le polling de job répond entre phases).
const tick = () => new Promise((r) => setImmediate(r));

// Applique une opération sur le staging (non destructif) et renvoie le diff.
// `onProgress(phase, pct)` est appelé entre les phases (transform asynchrone).
export async function applyOperation({ bp, operation, params, selection, actor, clipboardStore, onProgress }) {
  const startedAt = Date.now();
  const progress = (phase, pct) => { onProgress?.(phase, pct); };
  const limits = buildLimits(bp);           // X/Z du build, Y = hauteur monde
  const extent = buildExtent(bp);           // emprise réelle du contenu
  const sel = validateSelection(selection, limits);
  if (typeof sel === 'string') throw new Error(sel);

  progress('load', 5);
  const store = loadStore(bp);
  await store.warmup(extent); // décode les chunks du build (XZ) — Y libre ensuite
  progress('apply', 30); await tick();
  // Forme non rectangulaire → écritures bornées à la forme (sphère/cylindre).
  const target = sel.shape && sel.shape.type !== 'box' ? new MaskedVolume(store, sel) : store;

  let result;
  if (operation === 'copy') {
    // copy ne modifie rien : on renvoie le presse-papier (géré côté route/session).
    result = opCopy(store, sel);
    return { clipboard: result.clipboard, blocksChanged: 0, bounds: sel };
  }
  if (operation === 'paste') {
    if (!clipboardStore) throw new Error('empty_clipboard');
    result = opPaste(target, clipboardStore, { at: sel.min, mode: params?.mode === 'overwrite' ? 'overwrite' : 'overlay' });
  } else {
    const fn = OPS[operation];
    if (!fn) throw new Error('unknown_operation');
    // ctx.yield : rendre la main périodiquement pendant les grosses ops (terrain…).
    const ctx = { yield: async () => { await tick(); progress('apply', 45); } };
    result = await fn(target, sel, params || {}, ctx);
  }
  progress('commit', 60); await tick();

  // Snapshot AVANT écriture : régions intersectant sélection ∪ emprise résultat.
  const affected = unionBBox(sel, result.bounds || sel);
  snapshotRegions(bp.id, regionKeysForBBox(affected));
  clearRedo(bp.id); // une nouvelle opération invalide la pile de rétablissement

  // Écrit les régions modifiées sur le staging.
  const rdir = regionsDir(bp.id);
  for (const [key, buffer] of store.commit({ touchedOnly: true })) {
    const [rx, rz] = key.split(',').map(Number);
    fs.writeFileSync(path.join(rdir, regionFileName(rx, rz)), buffer);
  }
  progress('preview', 85); await tick();

  // L'emprise du build grandit si l'opération a écrit au-delà (ex. au-dessus du
  // contenu) — bornée aux limites du monde. L'aperçu couvre la nouvelle emprise.
  const grown = clampBBox(unionBBox(extent, result.bounds || sel), limits);
  growExtent(bp.id, grown);
  // Aperçu PARTIEL au-delà du budget (la commande a tout écrit dans le .mca).
  const sparse = store.deriveSparse(grown, PREVIEW_MAX_BLOCKS, { truncate: true });
  fs.writeFileSync(previewPath(bp.id), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));

  const durationMs = Date.now() - startedAt;
  db.prepare(`
    INSERT INTO worldedit_audit (blueprint_id, actor, operation, params_json, blocks_changed, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bp.id, actor, operation, JSON.stringify({ selection: sel, params: params || {} }), result.blocksChanged || 0, durationMs);

  // `clipboard` n'est présent que pour `cut` (presse-papier rempli au passage).
  return { blocksChanged: result.blocksChanged || 0, bounds: result.bounds || sel, clipboard: result.clipboard, durationMs, previewTruncated: !!sparse.truncated };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Génère du relief depuis une heightmap : `heights` (valeurs 0..1, indexées
// z*sizeX + x) donne la hauteur de chaque colonne XZ dans la sélection. La
// hauteur max = la plage Y de la sélection. mode 'solid' remplit la colonne
// (sous-couche `under` + revêtement au sommet), 'surface' ne pose que le sommet.
export async function applyHeightmap({ bp, actor, selection, heights, params, onProgress }) {
  const startedAt = Date.now();
  const limits = buildLimits(bp);
  const extent = buildExtent(bp);
  const sel = validateSelection(selection, limits);
  if (typeof sel === 'string') throw new Error(sel);
  const surfaceName = params?.block?.name;
  if (!surfaceName) throw new Error('bad_block');
  const surface = { Name: surfaceName, Properties: params.block.states || null };
  const under = params?.under?.name ? { Name: params.under.name, Properties: params.under.states || null } : null;
  const mode = params?.mode === 'surface' ? 'surface' : 'solid';

  const sizeX = sel.max.x - sel.min.x + 1;
  const sizeZ = sel.max.z - sel.min.z + 1;
  const maxH = sel.max.y - sel.min.y;
  if (!heights || heights.length < sizeX * sizeZ) throw new Error('bad_heightmap');

  onProgress?.('load', 5);
  const store = loadStore(bp);
  await store.warmup(extent);
  onProgress?.('apply', 30); await tick();

  let changed = 0;
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const h = Math.round(clamp01(heights[z * sizeX + x]) * maxH);
      const wx = sel.min.x + x, wz = sel.min.z + z;
      const topY = sel.min.y + h;
      if (mode === 'surface') {
        if (!sameBlock(store.getBlock(wx, topY, wz), surface)) { store.setBlock(wx, topY, wz, { Name: surface.Name, Properties: surface.Properties }); changed++; }
      } else {
        for (let y = sel.min.y; y <= topY; y++) {
          const b = (y === topY || !under) ? surface : under;
          if (!sameBlock(store.getBlock(wx, y, wz), b)) { store.setBlock(wx, y, wz, { Name: b.Name, Properties: b.Properties }); changed++; }
        }
      }
    }
    if ((z & 31) === 0) await tick(); // respire périodiquement
  }
  onProgress?.('commit', 60); await tick();

  snapshotRegions(bp.id, regionKeysForBBox(sel));
  clearRedo(bp.id);
  const rdir = regionsDir(bp.id);
  for (const [key, buffer] of store.commit({ touchedOnly: true })) {
    const [rx, rz] = key.split(',').map(Number);
    fs.writeFileSync(path.join(rdir, regionFileName(rx, rz)), buffer);
  }
  onProgress?.('preview', 85); await tick();

  const grown = clampBBox(unionBBox(extent, sel), limits);
  growExtent(bp.id, grown);
  const sparse = store.deriveSparse(grown, PREVIEW_MAX_BLOCKS, { truncate: true });
  fs.writeFileSync(previewPath(bp.id), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));

  const durationMs = Date.now() - startedAt;
  db.prepare(`INSERT INTO worldedit_audit (blueprint_id, actor, operation, params_json, blocks_changed, duration_ms) VALUES (?, ?, 'heightmap', ?, ?, ?)`)
    .run(bp.id, actor, JSON.stringify({ selection: sel, mode }), changed, durationMs);
  return { blocksChanged: changed, bounds: sel, durationMs, previewTruncated: !!sparse.truncated };
}

// Sort la zone en heightmap : pour chaque colonne XZ de la sélection, la hauteur
// du bloc non-air le plus haut (dans la plage Y) → niveau de gris 0..255 (blanc
// = haut, noir = bas / colonne vide). Renvoie un buffer brut 1 canal (z=lignes).
export async function exportHeightmap(bp, selection) {
  const limits = buildLimits(bp);
  const sel = validateSelection(selection, limits);
  if (typeof sel === 'string') throw new Error(sel);
  const store = loadStore(bp);
  await store.warmup(buildExtent(bp));
  const sizeX = sel.max.x - sel.min.x + 1;
  const sizeZ = sel.max.z - sel.min.z + 1;
  const range = Math.max(1, sel.max.y - sel.min.y);
  const data = new Uint8Array(sizeX * sizeZ); // 0 = colonne vide (noir)
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const wx = sel.min.x + x, wz = sel.min.z + z;
      let topY = null;
      for (let y = sel.max.y; y >= sel.min.y; y--) {
        if (store.getBlock(wx, y, wz)) { topY = y; break; }
      }
      data[z * sizeX + x] = topY === null ? 0 : Math.round(((topY - sel.min.y) / range) * 255);
    }
    if ((z & 31) === 0) await tick();
  }
  return { sizeX, sizeZ, data };
}

async function regenPreview(bp) {
  const bbox = buildExtent(bp);
  const store = loadStore(bp);
  await store.warmup(bbox);
  const sparse = store.deriveSparse(bbox);
  fs.writeFileSync(previewPath(bp.id), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));
}

// Annule la dernière opération (en empilant l'inverse dans la pile redo).
export async function undoLast({ bp, actor }) {
  const seqs = undoSeqs(bp.id);
  if (!seqs.length) throw new Error('nothing_to_undo');
  applySnapshot(path.join(undoDir(bp.id), String(seqs[seqs.length - 1])), bp.id, redoDir(bp.id));
  await regenPreview(bp);
  db.prepare(`INSERT INTO worldedit_audit (blueprint_id, actor, operation, params_json, blocks_changed) VALUES (?, ?, 'undo', '{}', 0)`)
    .run(bp.id, actor);
  return { undone: true, remaining: undoSeqs(bp.id).length, redoDepth: redoSeqs(bp.id).length };
}

// Rétablit la dernière opération annulée (et la ré-empile dans undo).
export async function redoLast({ bp, actor }) {
  const seqs = redoSeqs(bp.id);
  if (!seqs.length) throw new Error('nothing_to_redo');
  applySnapshot(path.join(redoDir(bp.id), String(seqs[seqs.length - 1])), bp.id, undoDir(bp.id));
  await regenPreview(bp);
  db.prepare(`INSERT INTO worldedit_audit (blueprint_id, actor, operation, params_json, blocks_changed) VALUES (?, ?, 'redo', '{}', 0)`)
    .run(bp.id, actor);
  return { redone: true, undoDepth: undoSeqs(bp.id).length, redoDepth: redoSeqs(bp.id).length };
}

export const redoDepth = (id) => redoSeqs(id).length;

// Réinitialise le staging (jette toutes les modifications, repart de la source).
export function resetStaging(id) {
  fs.rmSync(dirFor(id), { recursive: true, force: true });
}

export function removeStaging(id) {
  fs.rmSync(dirFor(id), { recursive: true, force: true });
}

const safeName = (s) => String(s || 'build').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'build';
function regionsToDownload(regions, name) {
  if (regions.length === 1) {
    const r = regions[0];
    return { buffer: r.buffer, filename: regionFileName(r.regionX, r.regionZ), mime: 'application/octet-stream' };
  }
  const entries = regions.map((r) => ({ name: `region/${regionFileName(r.regionX, r.regionZ)}`, data: r.buffer }));
  return { buffer: makeZip(entries), filename: `${safeName(name)}-region.zip`, mime: 'application/zip' };
}

// Export du build transformé. Sans offset → recopie lossless des régions de
// staging (préserve coffres, biomes…). Avec offset {dx,dy,dz} → on RE-CHUNK les
// blocs à la nouvelle position monde (perd les block-entities/biomes — pratique
// pour repositionner un build d'assemblage). On choisit ainsi « où le mettre ».
export async function exportBuild(bp, offset = null) {
  const off = offset && (offset.dx || offset.dy || offset.dz) ? offset : null;
  if (!off) {
    materialize(bp);
    const rdir = regionsDir(bp.id);
    const files = listRegionFiles(bp.id);
    if (files.length === 0) throw new Error('no_region');
    const regions = files.map((f) => ({ regionX: f.regionX, regionZ: f.regionZ, buffer: fs.readFileSync(path.join(rdir, f.file)) }));
    return regionsToDownload(regions, bp.name);
  }
  // Re-chunk à la position cible.
  const extent = buildExtent(bp);
  const store = loadStore(bp);
  await store.warmup(extent);
  const sparse = store.deriveSparse(extent, CROP_MAX_BLOCKS);
  const dx = Math.round(off.dx) || 0, dy = Math.round(off.dy) || 0, dz = Math.round(off.dz) || 0;
  const shifted = {
    min: { x: extent.min.x + dx, y: Math.max(WORLD_MIN_Y, extent.min.y + dy), z: extent.min.z + dz },
    max: { x: extent.max.x + dx, y: Math.min(WORLD_MAX_Y, extent.max.y + dy), z: extent.max.z + dz },
  };
  const template = await templateChunk(bp);
  const regions = blankRegions({
    template, origin: shifted.min,
    size: { x: shifted.max.x - shifted.min.x + 1, y: 1, z: shifted.max.z - shifted.min.z + 1 },
  });
  const store2 = new RegionStore(regions);
  await store2.warmup(shifted);
  for (let i = 0; i < sparse.blocks.length; i += 4) {
    const e = sparse.palette[sparse.blocks[i + 3]];
    const x = sparse.min.x + sparse.blocks[i] + dx;
    const y = sparse.min.y + sparse.blocks[i + 1] + dy;
    const z = sparse.min.z + sparse.blocks[i + 2] + dz;
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) continue;
    store2.setBlock(x, y, z, { Name: e.name, Properties: e.props || null });
  }
  const out = [...store2.commit({ touchedOnly: false })].map(([key, buffer]) => {
    const [rx, rz] = key.split(',').map(Number);
    return { regionX: rx, regionZ: rz, buffer };
  });
  return regionsToDownload(out, bp.name);
}

// Extrait une zone : renvoie l'artefact sparse de la sélection + des fichiers de
// région RÉDUITS aux seuls chunks qui l'intersectent (lossless, payloads
// recopiés). Sert à créer un nouveau build léger « comme un import » — bien plus
// rapide à charger/éditer que le .mca complet. Coordonnées monde conservées.
export async function cropBuild(bp, bbox) {
  const store = loadStore(bp);
  await store.warmup(bbox);
  const sparse = store.deriveSparse(bbox, CROP_MAX_BLOCKS); // lève too_many_blocks au-delà
  if (!sparse.count) throw new Error('empty_box');
  const cMinX = fdiv(bbox.min.x, 16), cMaxX = fdiv(bbox.max.x, 16);
  const cMinZ = fdiv(bbox.min.z, 16), cMaxZ = fdiv(bbox.max.z, 16);
  const regions = [];
  for (const r of store.regions.values()) {
    const chunks = r.region.chunks.filter(
      (c) => c.chunkX >= cMinX && c.chunkX <= cMaxX && c.chunkZ >= cMinZ && c.chunkZ <= cMaxZ,
    );
    if (!chunks.length) continue;
    regions.push({ regionX: r.regionX, regionZ: r.regionZ, buffer: writeRegion({ regionX: r.regionX, regionZ: r.regionZ, chunks }) });
  }
  return { sparse, regions };
}

// ── Build vierge (.mca neuf) + export à coordonnées choisies ─────────────────

const airSection = () => encodeBlockStates({ palette: [{ Name: 'minecraft:air', Properties: null }], indices: new Uint16Array(SECTION_VOLUME) });
const emptyList = () => ({ type: 'list', value: { type: 'end', value: [] } });
const emptyCompoundList = () => ({ type: 'list', value: { type: 'compound', value: [] } });

// Chunk synthétique « plein » d'air (repli quand aucun build modèle). Best-effort
// pour la version `dataVersion` ; à valider en jeu.
function syntheticTemplate(dataVersion = 3578) {
  const sections = [];
  for (let y = -4; y <= 19; y++) {
    sections.push({
      Y: { type: 'byte', value: y },
      block_states: airSection(),
      biomes: { type: 'compound', value: { palette: { type: 'list', value: { type: 'string', value: ['minecraft:plains'] } } } },
    });
  }
  return { type: 'compound', name: '', value: {
    DataVersion: { type: 'int', value: dataVersion },
    Status: { type: 'string', value: 'minecraft:full' },
    xPos: { type: 'int', value: 0 }, yPos: { type: 'int', value: -4 }, zPos: { type: 'int', value: 0 },
    LastUpdate: { type: 'long', value: [0, 0] },
    InhabitedTime: { type: 'long', value: [0, 0] },
    sections: { type: 'list', value: { type: 'compound', value: sections } },
    block_entities: emptyCompoundList(),
    block_ticks: emptyList(),
    fluid_ticks: emptyList(),
    PostProcessing: emptyList(),
    structures: { type: 'compound', value: { starts: { type: 'compound', value: {} }, References: { type: 'compound', value: {} } } },
    Heightmaps: { type: 'compound', value: {} },
    isLightOn: { type: 'byte', value: 0 },
  } };
}

// Récupère un chunk MODÈLE depuis un build existant (structure NBT valide pour la
// version Minecraft de l'utilisateur). Renvoie le NBT tagué ou null.
export async function templateChunk(bp) {
  if (!bp?.source_file) return null;
  materialize(bp);
  const rdir = regionsDir(bp.id);
  for (const f of listRegionFiles(bp.id)) {
    const region = readRegion(fs.readFileSync(path.join(rdir, f.file)), f.regionX, f.regionZ);
    if (region.chunks.length) { await decodeChunk(region.chunks[0]); return region.chunks[0].root; }
  }
  return null;
}

// Chunk d'air dérivé d'un modèle, replacé en (cx,cz) et purgé des données liées
// à la position (block entities / ticks).
function airChunkFrom(template, cx, cz) {
  const root = structuredClone(template);
  const v = root.value;
  v.xPos = { type: 'int', value: cx };
  v.zPos = { type: 'int', value: cz };
  for (const sec of (v.sections?.value?.value || [])) sec.block_states = airSection();
  v.block_entities = emptyCompoundList();
  if (v.block_ticks) v.block_ticks = emptyList();
  if (v.fluid_ticks) v.fluid_ticks = emptyList();
  if (v.Heightmaps) v.Heightmaps = { type: 'compound', value: {} };
  return root;
}

const nowSec = () => Math.floor(Date.now() / 1000);
function regionBuffersFromChunks(chunks) {
  const byRegion = new Map();
  for (const { cx, cz, root } of chunks) {
    const rx = fdiv(cx, 32), rz = fdiv(cz, 32);
    const key = `${rx},${rz}`;
    if (!byRegion.has(key)) byRegion.set(key, { rx, rz, chunks: [] });
    const localX = ((cx % 32) + 32) % 32, localZ = ((cz % 32) + 32) % 32;
    byRegion.get(key).chunks.push({ index: localX + localZ * 32, localX, localZ, chunkX: cx, chunkZ: cz, timestamp: nowSec(), compression: 2, payload: null, root, dirty: true });
  }
  const out = [];
  for (const { rx, rz, chunks: cs } of byRegion.values()) {
    cs.sort((a, b) => a.index - b.index);
    out.push({ regionX: rx, regionZ: rz, buffer: writeRegion({ regionX: rx, regionZ: rz, chunks: cs }) });
  }
  return out;
}

// Vérifie qu'un buffer de région se relit et contient des chunks décodables
// (garde-fou « chunk vierge valide » — vague 6). Lève `invalid_blank` sinon.
export async function validateRegions(regions) {
  for (const r of regions) {
    let region;
    try { region = readRegion(r.buffer, r.regionX, r.regionZ); } catch { throw new Error('invalid_blank'); }
    if (!region.chunks.length) throw new Error('invalid_blank');
    // Décode le premier chunk : structure NBT + sections lisibles.
    const c = region.chunks[0];
    try { await decodeChunk(c); } catch { throw new Error('invalid_blank'); }
    const sections = c.root?.value?.sections?.value?.value;
    if (!Array.isArray(sections) || !sections.length) throw new Error('invalid_blank');
  }
  return true;
}

// Régions d'air couvrant la zone [origin, origin+size) en X/Z.
export function blankRegions({ template, dataVersion, origin, size }) {
  const tmpl = template || syntheticTemplate(dataVersion);
  const cMinX = fdiv(origin.x, 16), cMaxX = fdiv(origin.x + size.x - 1, 16);
  const cMinZ = fdiv(origin.z, 16), cMaxZ = fdiv(origin.z + size.z - 1, 16);
  const chunks = [];
  for (let cz = cMinZ; cz <= cMaxZ; cz++) for (let cx = cMinX; cx <= cMaxX; cx++) chunks.push({ cx, cz, root: airChunkFrom(tmpl, cx, cz) });
  return regionBuffersFromChunks(chunks);
}

// Baguette magique : remplit en 6-connexité depuis (seed) tous les blocs de même
// type (bornés à l'emprise du build, plafonné). Renvoie la boîte englobante.
const WAND_MAX = Number(process.env.WORLDEDIT_WAND_MAX || 250_000);
export async function floodSelect(bp, seed) {
  const extent = buildExtent(bp);
  const inB = (x, y, z) => x >= extent.min.x && x <= extent.max.x && y >= extent.min.y && y <= extent.max.y && z >= extent.min.z && z <= extent.max.z;
  const sx = Math.round(Number(seed?.x)), sy = Math.round(Number(seed?.y)), sz = Math.round(Number(seed?.z));
  if (![sx, sy, sz].every(Number.isFinite) || !inB(sx, sy, sz)) throw new Error('out_of_bounds');
  const store = loadStore(bp);
  await store.warmup(extent);
  const target = store.getBlock(sx, sy, sz);
  if (!target) throw new Error('empty_seed'); // pas d'air
  const name = target.Name;
  const seen = new Set([`${sx},${sy},${sz}`]);
  const q = [[sx, sy, sz]];
  let min = { x: sx, y: sy, z: sz }, max = { x: sx, y: sy, z: sz };
  let count = 0;
  while (q.length) {
    if (count >= WAND_MAX) break;
    const [x, y, z] = q.pop();
    const b = store.getBlock(x, y, z);
    if (!b || b.Name !== name) continue;
    count++;
    min = { x: Math.min(min.x, x), y: Math.min(min.y, y), z: Math.min(min.z, z) };
    max = { x: Math.max(max.x, x), y: Math.max(max.y, y), z: Math.max(max.z, z) };
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz, k = `${nx},${ny},${nz}`;
      if (!inB(nx, ny, nz) || seen.has(k)) continue;
      seen.add(k); q.push([nx, ny, nz]);
    }
  }
  return { min, max, count, block: name };
}

export function listAudit(id, limit = 100) {
  return db.prepare('SELECT * FROM worldedit_audit WHERE blueprint_id = ? ORDER BY id DESC LIMIT ?')
    .all(Number(id), Math.min(500, Number(limit) || 100));
}

export function undoDepth(id) { return undoSeqs(id).length; }

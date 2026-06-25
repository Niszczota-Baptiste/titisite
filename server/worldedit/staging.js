/* eslint-disable security/detect-non-literal-fs-filename --
   Tous les chemins ci-dessous sont construits sous uploads/worldedit/<id>/ à
   partir d'identifiants numériques de build et de noms de région r.X.Z.mca
   validés (jamais d'entrée utilisateur brute dans le chemin). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { db } from '../db.js';
import { uploadPath } from '../uploads.js';
import { regionFileName, regionCoordsFromName, writeRegion } from '../anvil/index.js';
import { extractMcaEntries } from '../minecraftWorld/zip.js';
import { RegionStore } from './regionStore.js';
import {
  opMirror, opRotate, opTranslate, opReplace, opSet, opCopy, opPaste, opCut,
} from './transform.js';
import { makeZip } from './zipWriter.js';

const fdiv = (a, b) => Math.floor(a / b);
const REGION_FILE_RE = /^r\.(-?\d+)\.(-?\d+)\.mca$/;
const MAX_UNDO = Number(process.env.WORLDEDIT_MAX_UNDO || 30);

const baseDir = () => uploadPath('worldedit');
const dirFor = (id) => path.join(baseDir(), String(Number(id)));
const regionsDir = (id) => path.join(dirFor(id), 'regions');
const undoDir = (id) => path.join(dirFor(id), 'undo');
const previewPath = (id) => path.join(dirFor(id), 'preview.json.gz');

export function buildBBox(bp) {
  return {
    min: { x: bp.min_x, y: bp.min_y, z: bp.min_z },
    max: { x: bp.min_x + bp.size_x - 1, y: bp.min_y + bp.size_y - 1, z: bp.min_z + bp.size_z - 1 },
  };
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
const MAX_SELECTION_VOLUME = Number(process.env.WORLDEDIT_MAX_SELECTION || 2_000_000);
const CROP_MAX_BLOCKS = Number(process.env.BLUEPRINT_MAX_BLOCKS || 3_000_000);

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
  return norm;
}

// ── Pile d'undo ──────────────────────────────────────────────────────────────
function undoSeqs(id) {
  const udir = undoDir(id);
  if (!fs.existsSync(udir)) return [];
  return fs.readdirSync(udir).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
}

function snapshotRegions(id, regionKeys) {
  const seqs = undoSeqs(id);
  const seq = (seqs.length ? seqs[seqs.length - 1] : 0) + 1;
  const dest = path.join(undoDir(id), String(seq));
  fs.mkdirSync(dest, { recursive: true });
  const rdir = regionsDir(id);
  for (const key of regionKeys) {
    const [rx, rz] = key.split(',').map(Number);
    const fname = regionFileName(rx, rz);
    const src = path.join(rdir, fname);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, fname));
  }
  // Borne la pile : supprime les plus anciens snapshots au-delà de MAX_UNDO.
  const all = undoSeqs(id);
  for (const old of all.slice(0, Math.max(0, all.length - MAX_UNDO))) {
    fs.rmSync(path.join(undoDir(id), String(old)), { recursive: true, force: true });
  }
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
};

// Applique une opération sur le staging (non destructif) et renvoie le diff.
export async function applyOperation({ bp, operation, params, selection, actor, clipboardStore }) {
  const bbox = buildBBox(bp);
  const sel = validateSelection(selection, bbox);
  if (typeof sel === 'string') throw new Error(sel);

  const store = loadStore(bp);
  await store.warmup(bbox); // décode tous les chunks (préview complète ensuite)

  let result;
  if (operation === 'copy') {
    // copy ne modifie rien : on renvoie le presse-papier (géré côté route/session).
    result = opCopy(store, sel);
    return { clipboard: result.clipboard, blocksChanged: 0, bounds: sel };
  }
  if (operation === 'paste') {
    if (!clipboardStore) throw new Error('empty_clipboard');
    result = opPaste(store, clipboardStore, { at: sel.min, mode: params?.mode === 'overwrite' ? 'overwrite' : 'overlay' });
  } else {
    const fn = OPS[operation];
    if (!fn) throw new Error('unknown_operation');
    result = fn(store, sel, params || {});
  }

  // Snapshot AVANT écriture : régions intersectant sélection ∪ emprise résultat.
  const affected = unionBBox(sel, result.bounds || sel);
  snapshotRegions(bp.id, regionKeysForBBox(affected));

  // Écrit les régions modifiées sur le staging.
  const rdir = regionsDir(bp.id);
  for (const [key, buffer] of store.commit({ touchedOnly: true })) {
    const [rx, rz] = key.split(',').map(Number);
    fs.writeFileSync(path.join(rdir, regionFileName(rx, rz)), buffer);
  }

  // Aperçu re-dérivé + persistance.
  const sparse = store.deriveSparse(bbox);
  fs.writeFileSync(previewPath(bp.id), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));

  db.prepare(`
    INSERT INTO worldedit_audit (blueprint_id, actor, operation, params_json, blocks_changed)
    VALUES (?, ?, ?, ?, ?)
  `).run(bp.id, actor, operation, JSON.stringify({ selection: sel, params: params || {} }), result.blocksChanged || 0);

  // `clipboard` n'est présent que pour `cut` (presse-papier rempli au passage).
  return { blocksChanged: result.blocksChanged || 0, bounds: result.bounds || sel, clipboard: result.clipboard };
}

// Annule la dernière opération : restaure les régions du dernier snapshot.
export async function undoLast({ bp, actor }) {
  const seqs = undoSeqs(bp.id);
  if (!seqs.length) throw new Error('nothing_to_undo');
  const seq = seqs[seqs.length - 1];
  const snapDir = path.join(undoDir(bp.id), String(seq));
  const rdir = regionsDir(bp.id);
  for (const f of fs.readdirSync(snapDir)) {
    if (REGION_FILE_RE.test(f)) fs.copyFileSync(path.join(snapDir, f), path.join(rdir, f));
  }
  fs.rmSync(snapDir, { recursive: true, force: true });

  // Régénère l'aperçu depuis l'état restauré.
  const bbox = buildBBox(bp);
  const store = loadStore(bp);
  await store.warmup(bbox);
  const sparse = store.deriveSparse(bbox);
  fs.writeFileSync(previewPath(bp.id), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));

  db.prepare(`INSERT INTO worldedit_audit (blueprint_id, actor, operation, params_json, blocks_changed) VALUES (?, ?, 'undo', '{}', 0)`)
    .run(bp.id, actor);
  return { undone: true, remaining: undoSeqs(bp.id).length };
}

// Réinitialise le staging (jette toutes les modifications, repart de la source).
export function resetStaging(id) {
  fs.rmSync(dirFor(id), { recursive: true, force: true });
}

export function removeStaging(id) {
  fs.rmSync(dirFor(id), { recursive: true, force: true });
}

// Export du build transformé : un .mca seul ou un .zip du dossier region/.
export function exportBuild(bp) {
  materialize(bp);
  const rdir = regionsDir(bp.id);
  const files = listRegionFiles(bp.id);
  if (files.length === 0) throw new Error('no_region');
  if (files.length === 1) {
    return { buffer: fs.readFileSync(path.join(rdir, files[0].file)), filename: files[0].file, mime: 'application/octet-stream' };
  }
  const entries = files.map(({ file }) => ({ name: `region/${file}`, data: fs.readFileSync(path.join(rdir, file)) }));
  const safe = String(bp.name || 'build').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'build';
  return { buffer: makeZip(entries), filename: `${safe}-region.zip`, mime: 'application/zip' };
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

export function listAudit(id, limit = 100) {
  return db.prepare('SELECT * FROM worldedit_audit WHERE blueprint_id = ? ORDER BY id DESC LIMIT ?')
    .all(Number(id), Math.min(500, Number(limit) || 100));
}

export function undoDepth(id) { return undoSeqs(id).length; }

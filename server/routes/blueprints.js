import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { Router } from 'express';
import { db } from '../db.js';
import { safeUnlink, uploadPath, uploadWorld, uploadScreenshotMemory } from '../uploads.js';
import { parseWorldFile } from '../minecraftWorld/index.js';
import { removeStaging, cropBuild, buildLimits, validateSelection, blankRegions, validateRegions, templateChunk, buildPlaneFromNames } from '../worldedit/staging.js';
import { imageToMapBlocks } from '../worldedit/mapColors.js';
import { makeZip } from '../worldedit/zipWriter.js';
import { regionFileName } from '../anvil/index.js';
import { worldeditScopedRouter } from './worldedit.js';

// Builds importés (.mca) — scopé par workspace (resolveWorkspace en amont).
export const blueprintsRouter = Router({ mergeParams: true });
// Vue publique en lecture seule par token (montée hors scope, sans cookie).
export const blueprintsPublicRouter = Router();

// Garde-fous sur la taille de la boîte importée.
const MAX_SPAN = 2048;     // côté max en X/Z
const MAX_HEIGHT = 384;    // hauteur monde 1.18 (-64..320)
const MAX_BLOCKS = Number(process.env.BLUEPRINT_MAX_BLOCKS || 3_000_000);

function rowToMeta(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    min: { x: r.min_x, y: r.min_y, z: r.min_z },
    size: { x: r.size_x, y: r.size_y, z: r.size_z },
    blockCount: r.block_count,
    paletteCount: safeLen(r.palette),
    hasShare: !!r.share_token,
    shareToken: r.share_token || null,
    hasSource: !!r.source_file, // éditable via WorldEdit (régions réelles conservées)
    createdAt: r.created_at,
  };
}
function safeLen(json) { try { return JSON.parse(json).length; } catch { return 0; } }
function detail(r) {
  return {
    ...rowToMeta(r),
    palette: parseJson(r.palette, []),
    bom: parseJson(r.bom, []),
  };
}
function parseJson(s, fb) { try { return JSON.parse(s) ?? fb; } catch { return fb; } }

function parseBounds(body) {
  const n = (v) => Math.round(Number(v));
  const vals = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'].map((k) => n(body?.[k]));
  if (vals.some((v) => !Number.isFinite(v))) return null;
  let [minX, minY, minZ, maxX, maxY, maxZ] = vals;
  if (minX > maxX) [minX, maxX] = [maxX, minX];
  if (minY > maxY) [minY, maxY] = [maxY, minY];
  if (minZ > maxZ) [minZ, maxZ] = [maxZ, minZ];
  const sx = maxX - minX + 1, sy = maxY - minY + 1, sz = maxZ - minZ + 1;
  if (sx > MAX_SPAN || sz > MAX_SPAN || sy > MAX_HEIGHT) return 'too_big';
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// ── Scoped CRUD ───────────────────────────────────────────────────────────────

blueprintsRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM minecraft_blueprints WHERE workspace_id = ? ORDER BY id DESC')
    .all(req.workspace.id);
  res.json(rows.map(rowToMeta));
});

blueprintsRouter.get('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(detail(r));
});

blueprintsRouter.get('/:id/data', (req, res) => {
  const r = db.prepare('SELECT data_file FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!r?.data_file) return res.status(404).json({ error: 'not_found' });
  sendData(res, r.data_file);
});

blueprintsRouter.post('/', uploadWorld.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  // Import « complet » : aucune coordonnée → l'emprise est détectée côté worker.
  const wantFull = String(req.body?.full) === 'true';
  let bounds = null;
  if (!wantFull) {
    bounds = parseBounds(req.body);
    if (!bounds) { safeUnlink(req.file.filename); return res.status(400).json({ error: 'invalid_bounds' }); }
    if (bounds === 'too_big') { safeUnlink(req.file.filename); return res.status(413).json({ error: 'box_too_big' }); }
  }

  const name = String(req.body?.name || req.file.originalname || 'Build').trim().slice(0, 120) || 'Build';
  const dataFile = `${crypto.randomUUID()}.json.gz`;

  try {
    const meta = await parseWorldFile({
      filePath: req.file.path,
      originalName: req.file.originalname,
      bbox: bounds, // null en mode complet → autoBounds()
      maxBlocks: MAX_BLOCKS,
      dataFilePath: uploadPath(dataFile),
    });
    if (!meta.count) { safeUnlink(req.file.filename); safeUnlink(dataFile); return res.status(422).json({ error: 'empty_box' }); }

    const r = db.prepare(`
      INSERT INTO minecraft_blueprints
        (workspace_id, name, min_x, min_y, min_z, size_x, size_y, size_z,
         block_count, palette, bom, data_file, source_file, source_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.workspace.id, name,
      meta.min.x, meta.min.y, meta.min.z, meta.size.x, meta.size.y, meta.size.z,
      meta.count, JSON.stringify(meta.palette), JSON.stringify(meta.bom), dataFile,
      // On CONSERVE le fichier source (zip region/ ou .mca) pour WorldEdit : il
      // permet de transformer les régions réelles et d'exporter un .mca lossless.
      req.file.filename, req.file.originalname || null, req.user.id,
    );
    res.status(201).json(detail(db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(r.lastInsertRowid)));
  } catch (e) {
    safeUnlink(req.file.filename); safeUnlink(dataFile);
    const code = ['too_many_blocks', 'region_coords_unknown', 'no_region', 'zip_invalid', 'zip64_unsupported', 'world_too_big', 'empty_box', 'box_too_big'].includes(e.message)
      ? e.message : 'parse_failed';
    if (code === 'parse_failed') console.error('[blueprints] parse failed:', e?.message || e);
    res.status(code === 'box_too_big' ? 413 : 422).json({ error: code });
  }
});

// Duplique un build en remplaçant un ou plusieurs types de blocs (même structure,
// autres matériaux). Les swaps portent sur les NOMS de palette (ex.
// « minecraft:oak_planks » → « minecraft:spruce_planks ») : on renomme la palette
// (indices des blocs inchangés) et on recalcule le BOM.
blueprintsRouter.post('/:id/duplicate', (req, res) => {
  const src = db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!src) return res.status(404).json({ error: 'not_found' });
  if (!src.data_file) return res.status(422).json({ error: 'no_data' });

  let sparse;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- data_file is a UUID from DB
    sparse = JSON.parse(zlib.gunzipSync(fs.readFileSync(uploadPath(src.data_file))));
  } catch { return res.status(422).json({ error: 'data_unreadable' }); }

  const map = new Map();
  for (const s of Array.isArray(req.body?.swaps) ? req.body.swaps : []) {
    const from = String(s?.from || '').trim();
    const to = String(s?.to || '').trim();
    if (from && to && from !== to) map.set(from, to);
  }
  const palette = (sparse.palette || []).map((e) => {
    const name = typeof e === 'string' ? e : e.name;
    const props = typeof e === 'string' ? null : (e.props || null);
    return { name: map.get(name) || name, props };
  });

  const blocks = sparse.blocks || [];
  const counts = new Map();
  for (let i = 0; i < blocks.length; i += 4) {
    const name = palette[blocks[i + 3]]?.name;
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const bom = [...counts.entries()].map(([blockId, count]) => ({ blockId, count })).sort((a, b) => b.count - a.count);

  const newSparse = { palette, min: sparse.min, size: sparse.size, count: sparse.count, blocks };
  const dataFile = `${crypto.randomUUID()}.json.gz`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dataFile is a UUID
  fs.writeFileSync(uploadPath(dataFile), zlib.gzipSync(Buffer.from(JSON.stringify(newSparse))));

  const name = String(req.body?.name || '').trim().slice(0, 120) || `${src.name} (copie)`;
  const r = db.prepare(`
    INSERT INTO minecraft_blueprints
      (workspace_id, name, min_x, min_y, min_z, size_x, size_y, size_z, block_count, palette, bom, data_file, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id, name, src.min_x, src.min_y, src.min_z, src.size_x, src.size_y, src.size_z,
    src.block_count, JSON.stringify(palette), JSON.stringify(bom), dataFile, req.user.id,
  );
  res.status(201).json(detail(db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(r.lastInsertRowid)));
});

// Crée un build VIERGE (.mca neuf rempli d'air) à une position monde choisie,
// pour y coller des morceaux et assembler un build plus grand. Le format de
// chunk est repris d'un build existant du workspace (compatible avec la version
// Minecraft de l'utilisateur) ou synthétisé à défaut.
blueprintsRouter.post('/blank', async (req, res) => {
  const clampI = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || d));
  const name = String(req.body?.name || 'Build vierge').trim().slice(0, 120) || 'Build vierge';
  const o = req.body?.origin || {}, s = req.body?.size || {};
  const origin = { x: clampI(o.x, -30_000_000, 30_000_000, 0), y: clampI(o.y, -64, 319, 0), z: clampI(o.z, -30_000_000, 30_000_000, 0) };
  const size = { x: clampI(s.x, 1, MAX_SPAN, 64), y: clampI(s.y, 1, MAX_HEIGHT, 64), z: clampI(s.z, 1, MAX_SPAN, 64) };

  const tpl = db.prepare('SELECT * FROM minecraft_blueprints WHERE workspace_id = ? AND source_file IS NOT NULL ORDER BY id DESC LIMIT 1')
    .get(req.workspace.id);
  let template = null;
  if (tpl) { try { template = await templateChunk(tpl); } catch { /* repli synthétique */ } }

  let regions;
  try {
    regions = blankRegions({ template, origin, size });
    await validateRegions(regions); // garde-fou : chunks vierges valides
  } catch (e) {
    console.error('[blueprints] blank failed:', e?.message || e);
    return res.status(500).json({ error: e?.message === 'invalid_blank' ? 'invalid_blank' : 'blank_failed' });
  }

  let sourceFile, sourceName;
  if (regions.length === 1) {
    sourceName = regionFileName(regions[0].regionX, regions[0].regionZ);
    sourceFile = `${crypto.randomUUID()}.mca`;
    fs.writeFileSync(uploadPath(sourceFile), regions[0].buffer);
  } else {
    sourceName = `blank-${Date.now()}.zip`;
    sourceFile = `${crypto.randomUUID()}.zip`;
    fs.writeFileSync(uploadPath(sourceFile), makeZip(regions.map((r) => ({ name: `region/${regionFileName(r.regionX, r.regionZ)}`, data: r.buffer }))));
  }

  const sparse = { palette: [], blocks: [], min: origin, size, count: 0 };
  const dataFile = `${crypto.randomUUID()}.json.gz`;
  fs.writeFileSync(uploadPath(dataFile), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));

  const r = db.prepare(`
    INSERT INTO minecraft_blueprints
      (workspace_id, name, min_x, min_y, min_z, size_x, size_y, size_z,
       block_count, palette, bom, data_file, source_file, source_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', '[]', ?, ?, ?, ?)
  `).run(
    req.workspace.id, name, origin.x, origin.y, origin.z, size.x, size.y, size.z,
    dataFile, sourceFile, sourceName, req.user.id,
  );
  res.status(201).json(detail(db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(r.lastInsertRowid)));
});

// Screenshot → nouvelle CARTE EN BLOCS (map-art) : l'image est redimensionnée au
// gabarit de la grille de cartes choisie (chaque « carte » Minecraft = 128×128
// blocs), chaque pixel devient le bloc plat dont la couleur de carte l'approche
// (mapColors.js), puis on crée un build PLAT — un mur (vertical) ou un sol (à
// plat) — exactement comme un build importé : source .mca (exportable / éditable
// WorldEdit) + artefact 3D + BOM. Visible dans le générateur 3D, et le .mca se
// colle en jeu pour refaire la carte. Accessible à tout membre du workspace.
const MAP_UNIT = 128;                          // côté d'une carte Minecraft (blocs)
const MAP_MAX_COLS = 4, MAP_MAX_ROWS = 4;      // garde-fou (4×4 = 512×512 = 262 k blocs)
const WORLD_MIN_Y = -64, WORLD_MAX_Y = 319;    // hauteur monde 1.18 (== worldedit/staging)

blueprintsRouter.post('/mapart', uploadScreenshotMemory.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const clampI = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || d));
  const cols = clampI(req.body?.cols, 1, MAP_MAX_COLS, 1);
  const rows = clampI(req.body?.rows, 1, MAP_MAX_ROWS, 1);
  const orientation = req.body?.orientation === 'floor' ? 'floor' : 'wall';
  const fit = ['cover', 'contain', 'fill'].includes(req.body?.fit) ? req.body.fit : 'cover';
  const w = cols * MAP_UNIT, h = rows * MAP_UNIT;

  // Un mur est vertical → borné par la hauteur du monde (384). Au-delà : sol seul.
  if (orientation === 'wall' && h > (WORLD_MAX_Y - WORLD_MIN_Y + 1)) {
    return res.status(422).json({ error: 'too_tall' });
  }

  // Emprise du build : sol = plan XZ (1 bloc en Y) ; mur = plan XY (1 bloc en Z),
  // posé assez bas pour tenir dans la hauteur du monde.
  let origin, size;
  if (orientation === 'floor') {
    origin = { x: 0, y: 64, z: 0 };
    size = { x: w, y: 1, z: h };
  } else {
    const oy = Math.max(WORLD_MIN_Y, Math.min(64, WORLD_MAX_Y - h + 1));
    origin = { x: 0, y: oy, z: 0 };
    size = { x: w, y: h, z: 1 };
  }

  const name = String(req.body?.name || `Carte ${cols}×${rows}`).trim().slice(0, 120) || `Carte ${cols}×${rows}`;

  let names;
  try {
    const { data, info } = await sharp(req.file.buffer)
      .resize(w, h, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    names = imageToMapBlocks(data, w, h, info.channels || 4);
  } catch (e) {
    console.error('[blueprints] mapart resize failed:', e?.message || e);
    return res.status(422).json({ error: 'image_unreadable' });
  }

  // Modèle de chunk repris d'un build existant du workspace (version Minecraft de
  // l'utilisateur), sinon synthétique.
  const tpl = db.prepare('SELECT * FROM minecraft_blueprints WHERE workspace_id = ? AND source_file IS NOT NULL ORDER BY id DESC LIMIT 1')
    .get(req.workspace.id);
  let template = null;
  if (tpl) { try { template = await templateChunk(tpl); } catch { /* repli synthétique */ } }

  let regions, sparse;
  try {
    ({ regions, sparse } = await buildPlaneFromNames({ template, origin, size, names }));
  } catch (e) {
    const code = e?.message === 'empty_plane' ? 'empty_image' : 'mapart_failed';
    if (code === 'mapart_failed') console.error('[blueprints] mapart build failed:', e?.message || e);
    return res.status(422).json({ error: code });
  }

  let sourceFile, sourceName;
  if (regions.length === 1) {
    sourceName = regionFileName(regions[0].regionX, regions[0].regionZ);
    sourceFile = `${crypto.randomUUID()}.mca`;
    fs.writeFileSync(uploadPath(sourceFile), regions[0].buffer);
  } else {
    sourceName = `mapart-${Date.now()}.zip`;
    sourceFile = `${crypto.randomUUID()}.zip`;
    fs.writeFileSync(uploadPath(sourceFile), makeZip(regions.map((r) => ({ name: `region/${regionFileName(r.regionX, r.regionZ)}`, data: r.buffer }))));
  }

  const dataFile = `${crypto.randomUUID()}.json.gz`;
  fs.writeFileSync(uploadPath(dataFile), zlib.gzipSync(Buffer.from(JSON.stringify(sparse))));

  const row = db.prepare(`
    INSERT INTO minecraft_blueprints
      (workspace_id, name, min_x, min_y, min_z, size_x, size_y, size_z,
       block_count, palette, bom, data_file, source_file, source_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id, name,
    sparse.min.x, sparse.min.y, sparse.min.z, sparse.size.x, sparse.size.y, sparse.size.z,
    sparse.count, JSON.stringify(sparse.palette), JSON.stringify(sparse.bom), dataFile, sourceFile, sourceName, req.user.id,
  );
  res.status(201).json(detail(db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(row.lastInsertRowid)));
});

// Extrait une zone (sélection) en un NOUVEAU build, éditable et léger (régions
// réduites aux chunks de la zone). Renvoie le build créé → ouverture séparée.
blueprintsRouter.post('/:id/extract', async (req, res) => {
  const src = db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!src) return res.status(404).json({ error: 'not_found' });
  if (!src.source_file) return res.status(422).json({ error: 'not_editable' });

  // Extraction : pas de plafond de volume de boîte (c'est le NOMBRE de blocs
  // réels qui borne, via cropBuild → too_many_blocks).
  const sel = validateSelection(req.body?.selection, buildLimits(src), { maxVolume: Infinity });
  if (typeof sel === 'string') return res.status(400).json({ error: sel });

  let crop;
  try { crop = await cropBuild(src, sel); }
  catch (e) {
    const code = ['empty_box', 'too_many_blocks'].includes(e.message) ? e.message : 'extract_failed';
    if (code === 'extract_failed') console.error('[blueprints] extract failed:', e?.message || e);
    return res.status(code === 'extract_failed' ? 500 : 422).json({ error: code });
  }

  // Source réduite : un .mca isolé si une seule région, sinon un zip region/.
  let sourceFile, sourceName;
  if (crop.regions.length === 1) {
    const r = crop.regions[0];
    sourceName = regionFileName(r.regionX, r.regionZ);
    sourceFile = `${crypto.randomUUID()}.mca`;
    fs.writeFileSync(uploadPath(sourceFile), r.buffer);
  } else {
    const entries = crop.regions.map((r) => ({ name: `region/${regionFileName(r.regionX, r.regionZ)}`, data: r.buffer }));
    sourceName = `zone-${Date.now()}.zip`;
    sourceFile = `${crypto.randomUUID()}.zip`;
    fs.writeFileSync(uploadPath(sourceFile), makeZip(entries));
  }

  const dataFile = `${crypto.randomUUID()}.json.gz`;
  fs.writeFileSync(uploadPath(dataFile), zlib.gzipSync(Buffer.from(JSON.stringify(crop.sparse))));

  const meta = crop.sparse;
  const name = String(req.body?.name || `${src.name} — zone`).trim().slice(0, 120) || 'Zone';
  const r = db.prepare(`
    INSERT INTO minecraft_blueprints
      (workspace_id, name, min_x, min_y, min_z, size_x, size_y, size_z,
       block_count, palette, bom, data_file, source_file, source_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id, name,
    meta.min.x, meta.min.y, meta.min.z, meta.size.x, meta.size.y, meta.size.z,
    meta.count, JSON.stringify(meta.palette), JSON.stringify(meta.bom), dataFile, sourceFile, sourceName, req.user.id,
  );
  res.status(201).json(detail(db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(r.lastInsertRowid)));
});

blueprintsRouter.post('/:id/share', (req, res) => {
  const r = db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  const token = r.share_token || crypto.randomBytes(16).toString('hex');
  db.prepare("UPDATE minecraft_blueprints SET share_token = ?, updated_at = strftime('%s','now') WHERE id = ?")
    .run(token, r.id);
  res.json({ shareToken: token });
});

blueprintsRouter.delete('/:id/share', (req, res) => {
  const r = db.prepare('SELECT id FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  db.prepare("UPDATE minecraft_blueprints SET share_token = NULL, updated_at = strftime('%s','now') WHERE id = ?").run(r.id);
  res.status(204).end();
});

blueprintsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('SELECT data_file, source_file FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(id, req.workspace.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?').run(id, req.workspace.id);
  if (r.data_file) safeUnlink(r.data_file);
  if (r.source_file) safeUnlink(r.source_file);
  removeStaging(id); // efface le staging WorldEdit + la pile d'undo
  res.status(204).end();
});

// ── Liens de partage scopés (view / edit) — gestion réservée au propriétaire ───
// « Gérer les accès » = propriétaire (admin du workspace) uniquement.
function requireOwner(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'owner_only' });
  next();
}

function shareRow(r) {
  return {
    id: r.id, scope: r.scope, label: r.label || '',
    expiresAt: r.expires_at || null, revokedAt: r.revoked_at || null,
    createdAt: r.created_at,
    active: !r.revoked_at && (!r.expires_at || r.expires_at * 1000 >= Date.now()),
  };
}

blueprintsRouter.get('/:id/shares', requireOwner, (req, res) => {
  const bp = db.prepare('SELECT id FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!bp) return res.status(404).json({ error: 'not_found' });
  const rows = db.prepare('SELECT * FROM blueprint_shares WHERE blueprint_id = ? ORDER BY id DESC').all(bp.id);
  res.json(rows.map(shareRow));
});

blueprintsRouter.post('/:id/shares', requireOwner, (req, res) => {
  const bp = db.prepare('SELECT id FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!bp) return res.status(404).json({ error: 'not_found' });
  const scope = req.body?.scope === 'edit' ? 'edit' : 'view';
  const days = Number(req.body?.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? Math.floor(Date.now() / 1000) + Math.min(365, days) * 86400 : null;
  const label = String(req.body?.label || '').trim().slice(0, 80);
  const token = crypto.randomBytes(18).toString('hex');
  const r = db.prepare(`
    INSERT INTO blueprint_shares (blueprint_id, token, scope, label, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bp.id, token, scope, label, expiresAt, req.user.id);
  const row = db.prepare('SELECT * FROM blueprint_shares WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ ...shareRow(row), token });
});

blueprintsRouter.delete('/:id/shares/:shareId', requireOwner, (req, res) => {
  const bp = db.prepare('SELECT id FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!bp) return res.status(404).json({ error: 'not_found' });
  const r = db.prepare("UPDATE blueprint_shares SET revoked_at = strftime('%s','now') WHERE id = ? AND blueprint_id = ? AND revoked_at IS NULL")
    .run(Number(req.params.shareId), bp.id);
  if (!r.changes) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// Sous-routeur WorldEdit (transform/undo/export/preview) — JWT + workspace déjà
// résolus par le routeur scoped en amont.
blueprintsRouter.use('/:id/worldedit', worldeditScopedRouter);

// ── Partage public (lecture seule par token) ──────────────────────────────────

blueprintsPublicRouter.get('/shared/:token', (req, res) => {
  const r = db.prepare('SELECT * FROM minecraft_blueprints WHERE share_token = ?').get(String(req.params.token));
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(detail(r));
});

blueprintsPublicRouter.get('/shared/:token/data', (req, res) => {
  const r = db.prepare('SELECT data_file FROM minecraft_blueprints WHERE share_token = ?').get(String(req.params.token));
  if (!r?.data_file) return res.status(404).json({ error: 'not_found' });
  sendData(res, r.data_file);
});

// Sert l'artefact sparse (JSON gzippé) tel quel : le navigateur le décompresse
// via Content-Encoding, fetch().json() fonctionne directement.
function sendData(res, dataFile) {
  const p = uploadPath(dataFile);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dataFile is a UUID from DB
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Cache-Control', 'private, max-age=300');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dataFile is a UUID from DB
  return fs.createReadStream(p).pipe(res);
}

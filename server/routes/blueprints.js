import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Router } from 'express';
import { db } from '../db.js';
import { safeUnlink, uploadPath, uploadWorld } from '../uploads.js';
import { parseWorldFile } from '../minecraftWorld/index.js';

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
  const bounds = parseBounds(req.body);
  if (!bounds) { safeUnlink(req.file.filename); return res.status(400).json({ error: 'invalid_bounds' }); }
  if (bounds === 'too_big') { safeUnlink(req.file.filename); return res.status(413).json({ error: 'box_too_big' }); }

  const name = String(req.body?.name || req.file.originalname || 'Build').trim().slice(0, 120) || 'Build';
  const dataFile = `${crypto.randomUUID()}.json.gz`;

  try {
    const meta = await parseWorldFile({
      filePath: req.file.path,
      originalName: req.file.originalname,
      bbox: bounds,
      maxBlocks: MAX_BLOCKS,
      dataFilePath: uploadPath(dataFile),
    });
    if (!meta.count) { safeUnlink(req.file.filename); safeUnlink(dataFile); return res.status(422).json({ error: 'empty_box' }); }

    const r = db.prepare(`
      INSERT INTO minecraft_blueprints
        (workspace_id, name, min_x, min_y, min_z, size_x, size_y, size_z,
         block_count, palette, bom, data_file, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.workspace.id, name,
      meta.min.x, meta.min.y, meta.min.z, meta.size.x, meta.size.y, meta.size.z,
      meta.count, JSON.stringify(meta.palette), JSON.stringify(meta.bom), dataFile, req.user.id,
    );
    safeUnlink(req.file.filename); // on ne garde que l'artefact sparse
    res.status(201).json(detail(db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(r.lastInsertRowid)));
  } catch (e) {
    safeUnlink(req.file.filename); safeUnlink(dataFile);
    const code = ['too_many_blocks', 'region_coords_unknown', 'no_region', 'zip_invalid', 'zip64_unsupported'].includes(e.message)
      ? e.message : 'parse_failed';
    console.error('[blueprints] parse failed:', e?.message || e);
    res.status(422).json({ error: code });
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
  const r = db.prepare('SELECT data_file FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?').run(Number(req.params.id), req.workspace.id);
  if (r.data_file) safeUnlink(r.data_file);
  res.status(204).end();
});

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

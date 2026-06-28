import fs from 'node:fs';
import sharp from 'sharp';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { uploadPath, uploadSchematicMemory, uploadScreenshotMemory } from '../uploads.js';
import { OPERATIONS, normalizeParams } from '../worldedit/operations.js';
import {
  buildLimits, buildExtent, applyOperation, applyHeightmap, exportHeightmap, validateSelection,
  applyPanel, panelPlane, PANEL_PRESETS,
  undoLast, redoLast, resetStaging, exportBuild,
  previewFilePath, hasPendingEdits, undoDepth, redoDepth, listAudit, floodSelect,
} from '../worldedit/staging.js';
import {
  saveSchematic, listSchematics, getSchematic, loadSchematicClip, deleteSchematic,
} from '../worldedit/library.js';
import {
  schematicToSponge, schematicToLitematic, parseSchematicFile,
} from '../worldedit/schematicFormats.js';
import { createJob, updateJob, getJob } from '../worldedit/jobs.js';

// Moteur WorldEdit serveur. Deux points d'entrée partagent les mêmes handlers :
//  - scoped  : membre/admin du workspace (cookie JWT)  → owner / editor
//  - token   : lien de partage scopé                   → editor (edit) / viewer (view)
// Toute opération d'écriture exige `canEdit` ; un token `view` est rejeté.

// Limiteur dédié : opérations coûteuses (réécriture de régions).
export const worldeditLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.WORLDEDIT_RATE_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

// Presse-papier serveur en mémoire, par acteur (partagé entre builds). Borné.
const clipboards = new Map();
const CLIP_MAX = 50;
function setClip(key, schem) {
  clipboards.delete(key);
  clipboards.set(key, schem);
  while (clipboards.size > CLIP_MAX) clipboards.delete(clipboards.keys().next().value);
}

function requireEdit(req, res, next) {
  if (!req.we?.canEdit) return res.status(403).json({ error: 'forbidden', detail: 'edit_scope_required' });
  next();
}

// ── Handlers (lisent req.we = { bp, actor, role, canEdit }) ───────────────────

function getOperations(req, res) {
  res.json({ role: req.we.role, canEdit: req.we.canEdit, operations: OPERATIONS });
}

function getState(req, res) {
  const bp = req.we.bp;
  res.json({
    id: bp.id,
    name: bp.name,
    role: req.we.role,
    canEdit: req.we.canEdit,
    editable: !!bp.source_file,
    bbox: buildLimits(bp),    // limites éditables (Y = hauteur du monde)
    extent: buildExtent(bp),  // emprise réelle du contenu (sélection par défaut)
    hasPendingEdits: hasPendingEdits(bp.id),
    undoDepth: undoDepth(bp.id),
    redoDepth: redoDepth(bp.id),
    maxSelectionVolume: Number(process.env.WORLDEDIT_MAX_SELECTION || 128_000_000),
  });
}

// Aperçu = artefact sparse du staging (gzip). 404 si aucune édition en attente
// → le client retombe sur les données d'origine du build.
function getPreview(req, res) {
  const p = previewFilePath(req.we.bp.id);
  if (!p) return res.status(404).json({ error: 'no_preview' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Cache-Control', 'no-store');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- p vient de previewFilePath (chemin staging contrôlé)
  return fs.createReadStream(p).pipe(res);
}

// Géométrie à afficher : aperçu du staging si présent, sinon l'artefact sparse
// d'origine du build. Accessible aux viewers (lecture) comme aux editors.
function getData(req, res) {
  const bp = req.we.bp;
  const p = previewFilePath(bp.id) || (bp.data_file ? uploadPath(bp.data_file) : null);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- p = chemin staging contrôlé ou data_file (UUID en base)
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'no_data' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Cache-Control', 'no-store');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- idem
  return fs.createReadStream(p).pipe(res);
}

async function postTransform(req, res) {
  const bp = req.we.bp;
  if (!bp.source_file) return res.status(422).json({ error: 'not_editable' });
  const operation = String(req.body?.operation || '');
  const params = normalizeParams(operation, req.body?.params || {});
  if (typeof params === 'string') return res.status(400).json({ error: params });
  const selection = req.body?.selection;
  // Presse-papier par UTILISATEUR (et non par build) → copier dans un build,
  // coller dans un autre (assemblage de builds, mca vierge…).
  const clipKey = `${req.we.actor}`;

  const clipboardStore = operation === 'paste' ? clipboards.get(clipKey) : undefined;
  if (operation === 'paste' && !clipboardStore) return res.status(400).json({ error: 'empty_clipboard' });

  // Mode asynchrone : renvoie un jobId immédiatement, le calcul tourne en tâche
  // de fond et rend la main entre phases (cf. applyOperation). Le client suit la
  // progression via GET /jobs/:jobId. (copy reste synchrone, c'est instantané.)
  if (req.body?.async && operation !== 'copy') {
    const jobId = createJob();
    (async () => {
      try {
        const out = await applyOperation({
          bp, operation, params, selection, actor: req.we.actor, clipboardStore,
          onProgress: (phase, pct) => updateJob(jobId, { phase, pct }),
        });
        if (out.clipboard) setClip(clipKey, out.clipboard);
        updateJob(jobId, { status: 'done', phase: 'done', pct: 100, result: { blocksChanged: out.blocksChanged, bounds: out.bounds, undoDepth: undoDepth(bp.id), ms: out.durationMs, previewTruncated: out.previewTruncated } });
      } catch (e) {
        updateJob(jobId, { status: 'error', error: transformErrorCode(e) });
      }
    })();
    return res.json({ jobId });
  }

  try {
    if (operation === 'copy') {
      const out = await applyOperation({ bp, operation, params, selection, actor: req.we.actor });
      setClip(clipKey, out.clipboard);
      return res.json({ blocksChanged: 0, clipboard: { sx: out.clipboard.sx, sy: out.clipboard.sy, sz: out.clipboard.sz } });
    }
    const out = await applyOperation({ bp, operation, params, selection, actor: req.we.actor, clipboardStore });
    if (out.clipboard) setClip(clipKey, out.clipboard); // cut remplit le presse-papier
    return res.json({ blocksChanged: out.blocksChanged, bounds: out.bounds, undoDepth: undoDepth(bp.id), ms: out.durationMs, previewTruncated: out.previewTruncated });
  } catch (e) {
    const code = transformErrorCode(e);
    if (code === 'transform_failed') console.error('[worldedit] transform failed:', e?.message || e);
    return res.status(code === 'transform_failed' ? 500 : 400).json({ error: code });
  }
}

const TRANSFORM_KNOWN = new Set(['invalid_selection', 'out_of_bounds', 'selection_too_large', 'unknown_operation',
  'empty_clipboard', 'no_source', 'too_many_blocks', 'bad_axis', 'bad_degrees', 'bad_block', 'bad_direction',
  'bad_factor', 'bad_pattern', 'bad_biome', 'biome_unsupported']);
function transformErrorCode(e) {
  return TRANSFORM_KNOWN.has(e?.message) ? e.message : 'transform_failed';
}

// Suivi d'un transform asynchrone.
function getJobStatus(req, res) {
  const j = getJob(req.params.jobId);
  if (!j) return res.status(404).json({ error: 'not_found' });
  return res.json(j);
}

async function postUndo(req, res) {
  try {
    const out = await undoLast({ bp: req.we.bp, actor: req.we.actor });
    res.json(out);
  } catch (e) {
    res.status(e.message === 'nothing_to_undo' ? 409 : 500).json({ error: e.message || 'undo_failed' });
  }
}

async function postRedo(req, res) {
  try {
    const out = await redoLast({ bp: req.we.bp, actor: req.we.actor });
    res.json(out);
  } catch (e) {
    res.status(e.message === 'nothing_to_redo' ? 409 : 500).json({ error: e.message || 'redo_failed' });
  }
}

function postReset(req, res) {
  resetStaging(req.we.bp.id);
  res.json({ reset: true });
}

// Baguette magique : renvoie la boîte englobante des blocs connectés au seed.
async function postFlood(req, res) {
  if (!req.we.bp.source_file) return res.status(422).json({ error: 'not_editable' });
  try {
    res.json(await floodSelect(req.we.bp, req.body || {}));
  } catch (e) {
    const code = ['out_of_bounds', 'empty_seed'].includes(e.message) ? e.message : 'flood_failed';
    res.status(code === 'flood_failed' ? 500 : 400).json({ error: code });
  }
}

async function getExport(req, res) {
  const bp = req.we.bp;
  if (!bp.source_file) return res.status(422).json({ error: 'not_editable' });
  const num = (v) => Math.round(Number(v)) || 0;
  const offset = { dx: num(req.query?.dx), dy: num(req.query?.dy), dz: num(req.query?.dz) };
  try {
    const { buffer, filename, mime } = await exportBuild(bp, offset);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message || 'export_failed' });
  }
}

// ── Bibliothèque de schematics (presse-papier persistés, scope workspace) ─────
function getSchematics(req, res) {
  res.json(listSchematics(req.we.bp.workspace_id));
}

function postSchematicSave(req, res) {
  const clip = clipboards.get(`${req.we.actor}`);
  if (!clip) return res.status(400).json({ error: 'empty_clipboard' });
  try {
    const row = saveSchematic({ workspaceId: req.we.bp.workspace_id, name: req.body?.name, schem: clip, userId: req.user?.id ?? null });
    return res.json(row);
  } catch (e) {
    return res.status(e.message === 'library_full' ? 409 : 500).json({ error: e.message || 'save_failed' });
  }
}

function postSchematicLoad(req, res) {
  try {
    const schem = loadSchematicClip(req.we.bp.workspace_id, req.params.sid);
    setClip(`${req.we.actor}`, schem);
    return res.json({ loaded: true, clipboard: { sx: schem.sx, sy: schem.sy, sz: schem.sz } });
  } catch (e) {
    return res.status(e.message === 'not_found' ? 404 : 500).json({ error: e.message || 'load_failed' });
  }
}

function deleteSchematicHandler(req, res) {
  try { deleteSchematic(req.we.bp.workspace_id, req.params.sid); return res.json({ deleted: true }); } catch (e) {
    return res.status(e.message === 'not_found' ? 404 : 500).json({ error: e.message || 'delete_failed' });
  }
}

function getSchematicExport(req, res) {
  const meta = getSchematic(req.we.bp.workspace_id, req.params.sid);
  if (!meta) return res.status(404).json({ error: 'not_found' });
  const fmt = String(req.query?.format || 'schem').toLowerCase();
  try {
    const schem = loadSchematicClip(req.we.bp.workspace_id, req.params.sid);
    const safe = String(meta.name || 'schematic').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'schematic';
    const isLite = fmt === 'litematic';
    const buffer = isLite ? schematicToLitematic(schem, { name: meta.name }) : schematicToSponge(schem, { name: meta.name });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.${isLite ? 'litematic' : 'schem'}"`);
    return res.send(buffer);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'export_failed' });
  }
}

async function postSchematicImport(req, res) {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  try {
    const schem = await parseSchematicFile(req.file.buffer, req.file.originalname);
    if (!schem || !schem.sx) throw new Error('bad_schematic');
    setClip(`${req.we.actor}`, schem);
    let saved = null;
    if (String(req.body?.save) === 'true') {
      saved = saveSchematic({
        workspaceId: req.we.bp.workspace_id,
        name: req.body?.name || req.file.originalname.replace(/\.[^.]+$/, ''),
        schem, userId: req.user?.id ?? null,
      });
    }
    return res.json({ imported: true, clipboard: { sx: schem.sx, sy: schem.sy, sz: schem.sz }, saved });
  } catch (e) {
    const known = ['bad_schematic', 'bad_litematic', 'library_full'];
    return res.status(known.includes(e.message) ? 400 : 500).json({ error: e.message || 'import_failed' });
  }
}

// Image → relief : l'image (luminance) sert de heightmap pour remplir la
// sélection. On redimensionne au gabarit XZ de la sélection (sharp) et la
// hauteur de chaque colonne = luminance × plage Y.
async function postHeightmap(req, res) {
  const bp = req.we.bp;
  if (!bp.source_file) return res.status(422).json({ error: 'not_editable' });
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  let selection, block, under;
  try {
    selection = JSON.parse(req.body?.selection || 'null');
    block = JSON.parse(req.body?.block || 'null');
    under = req.body?.under ? JSON.parse(req.body.under) : null;
  } catch { return res.status(400).json({ error: 'bad_params' }); }
  const mode = req.body?.mode === 'surface' ? 'surface' : 'solid';
  const invert = String(req.body?.invert) === 'true';

  const sel = validateSelection(selection, buildLimits(bp));
  if (typeof sel === 'string') return res.status(400).json({ error: sel });
  const sizeX = sel.max.x - sel.min.x + 1, sizeZ = sel.max.z - sel.min.z + 1;

  try {
    const { data, info } = await sharp(req.file.buffer)
      .resize(sizeX, sizeZ, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels || 1;
    const heights = new Float32Array(sizeX * sizeZ);
    for (let i = 0; i < heights.length; i++) {
      const o = i * ch;
      const lum = ch >= 3 ? (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) : data[o];
      heights[i] = invert ? 1 - lum / 255 : lum / 255;
    }
    const out = await applyHeightmap({ bp, actor: req.we.actor, selection, heights, params: { block, under, mode } });
    return res.json({ blocksChanged: out.blocksChanged, bounds: out.bounds, undoDepth: undoDepth(bp.id), ms: out.durationMs, previewTruncated: out.previewTruncated });
  } catch (e) {
    const known = [...TRANSFORM_KNOWN, 'bad_heightmap', 'bad_params'];
    const code = known.includes(e?.message) ? e.message : 'heightmap_failed';
    if (code === 'heightmap_failed') console.error('[worldedit] heightmap failed:', e?.message || e);
    return res.status(code === 'heightmap_failed' ? 500 : 400).json({ error: code });
  }
}

// Zone → image heightmap (PNG niveaux de gris) : l'inverse de /heightmap.
async function postHeightmapExport(req, res) {
  const bp = req.we.bp;
  if (!bp.source_file) return res.status(422).json({ error: 'not_editable' });
  try {
    const { sizeX, sizeZ, data } = await exportHeightmap(bp, req.body?.selection);
    const png = await sharp(Buffer.from(data), { raw: { width: sizeX, height: sizeZ, channels: 1 } }).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="heightmap.png"');
    return res.send(png);
  } catch (e) {
    const known = ['invalid_selection', 'out_of_bounds', 'selection_too_large'];
    const ok = known.includes(e?.message);
    if (!ok) console.error('[worldedit] heightmap export failed:', e?.message || e);
    return res.status(ok ? 400 : 500).json({ error: ok ? e.message : 'heightmap_export_failed' });
  }
}

// Panneau texte / image → mur plat de blocs (texte coréen sur marbre, etc.).
const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
function textToSvg(text, w, h) {
  const lines = String(text).split('\n').slice(0, 12);
  const SS = 4; // supersample pour des glyphes nets une fois réduits
  const W = w * SS, H = h * SS;
  const lineGap = H / lines.length;
  const fontSize = Math.max(6, Math.floor(lineGap * 0.78));
  const spans = lines.map((ln, i) => `<text x="${W / 2}" y="${lineGap * (i + 0.5)}" font-size="${fontSize}" fill="black" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${escapeXml(ln)}</text>`).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/>${spans}</svg>`);
}

async function postPanel(req, res) {
  const bp = req.we.bp;
  if (!bp.source_file) return res.status(422).json({ error: 'not_editable' });
  let selection, ink;
  try {
    selection = JSON.parse(req.body?.selection || 'null');
    ink = req.body?.ink ? JSON.parse(req.body.ink) : null;
  } catch { return res.status(400).json({ error: 'bad_params' }); }
  const preset = PANEL_PRESETS[req.body?.preset] ? req.body.preset : 'white_marble';
  const invert = String(req.body?.invert) === 'true';
  const text = typeof req.body?.text === 'string' ? req.body.text : '';

  const sel = validateSelection(selection, buildLimits(bp));
  if (typeof sel === 'string') return res.status(400).json({ error: sel });
  const { w, h } = panelPlane(sel);
  if (w < 1 || h < 1) return res.status(400).json({ error: 'bad_panel' });
  if (!text.trim() && !req.file) return res.status(400).json({ error: 'no_content' });

  try {
    const src = text.trim() ? textToSvg(text, w, h) : req.file.buffer;
    const { data, info } = await sharp(src).resize(w, h, { fit: 'fill' }).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels || 1;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const dark = data[i * ch] < 128; // sombre = encre (le texte)
      mask[i] = (dark !== invert) ? 1 : 0;
    }
    const out = await applyPanel(bp, { selection, mask, inkBlock: ink, preset, actor: req.we.actor });
    return res.json({ blocksChanged: out.blocksChanged, bounds: out.bounds, undoDepth: undoDepth(bp.id), ms: out.durationMs, previewTruncated: out.previewTruncated, plane: out.plane });
  } catch (e) {
    const known = [...TRANSFORM_KNOWN, 'bad_panel', 'bad_params', 'no_content'];
    const code = known.includes(e?.message) ? e.message : 'panel_failed';
    if (code === 'panel_failed') console.error('[worldedit] panel failed:', e?.message || e);
    return res.status(code === 'panel_failed' ? 500 : 400).json({ error: code });
  }
}

function getAudit(req, res) {
  res.json(listAudit(req.we.bp.id, req.query?.limit).map((r) => ({
    id: r.id, actor: r.actor, operation: r.operation,
    params: safeJson(r.params_json), blocksChanged: r.blocks_changed, durationMs: r.duration_ms, createdAt: r.created_at,
  })));
}
function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

function attachRoutes(router) {
  router.get('/operations', getOperations);
  router.get('/state', getState);
  router.get('/preview', getPreview);
  router.get('/data', getData);
  router.get('/audit', requireEdit, getAudit);
  router.post('/transform', worldeditLimiter, requireEdit, postTransform);
  router.get('/jobs/:jobId', requireEdit, getJobStatus);
  router.post('/undo', worldeditLimiter, requireEdit, postUndo);
  router.post('/redo', worldeditLimiter, requireEdit, postRedo);
  router.post('/reset', worldeditLimiter, requireEdit, postReset);
  router.post('/select-flood', worldeditLimiter, requireEdit, postFlood);
  router.post('/heightmap', worldeditLimiter, requireEdit, uploadScreenshotMemory.single('image'), postHeightmap);
  router.post('/heightmap-export', worldeditLimiter, requireEdit, postHeightmapExport);
  router.post('/panel', worldeditLimiter, requireEdit, uploadScreenshotMemory.single('image'), postPanel);
  router.get('/export', worldeditLimiter, requireEdit, getExport);
  // Bibliothèque de schematics (scope workspace) + import/export .schem/.litematic.
  router.get('/schematics', requireEdit, getSchematics);
  router.post('/schematics/save', worldeditLimiter, requireEdit, postSchematicSave);
  router.post('/schematics/import', worldeditLimiter, requireEdit, uploadSchematicMemory.single('file'), postSchematicImport);
  router.post('/schematics/:sid/load', worldeditLimiter, requireEdit, postSchematicLoad);
  router.get('/schematics/:sid/export', worldeditLimiter, requireEdit, getSchematicExport);
  router.delete('/schematics/:sid', worldeditLimiter, requireEdit, deleteSchematicHandler);
  return router;
}

// ── Entrée scoped (workspace member/admin) ───────────────────────────────────
// Monté sous blueprintsRouter à « /:id/worldedit » : req.workspace + req.user
// sont déjà résolus par le routeur scoped.
export const worldeditScopedRouter = Router({ mergeParams: true });
worldeditScopedRouter.use((req, res, next) => {
  const bp = db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ? AND workspace_id = ?')
    .get(Number(req.params.id), req.workspace.id);
  if (!bp) return res.status(404).json({ error: 'not_found' });
  req.we = { bp, actor: `user:${req.user.id}`, role: req.user.role === 'admin' ? 'owner' : 'editor', canEdit: true };
  next();
});
attachRoutes(worldeditScopedRouter);

// ── Entrée par token de partage scopé (view / edit) ──────────────────────────
export const worldeditTokenRouter = Router({ mergeParams: true });
worldeditTokenRouter.use('/shared/:token', (req, res, next) => {
  const share = db.prepare('SELECT * FROM blueprint_shares WHERE token = ?').get(String(req.params.token));
  if (!share || share.revoked_at) return res.status(404).json({ error: 'not_found' });
  if (share.expires_at && share.expires_at * 1000 < Date.now()) return res.status(410).json({ error: 'expired' });
  const bp = db.prepare('SELECT * FROM minecraft_blueprints WHERE id = ?').get(share.blueprint_id);
  if (!bp) return res.status(404).json({ error: 'not_found' });
  req.we = {
    bp,
    actor: `token:${share.id}`,
    role: share.scope === 'edit' ? 'editor' : 'viewer',
    canEdit: share.scope === 'edit',
  };
  next();
}, attachRoutes(Router({ mergeParams: true })));

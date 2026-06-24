import fs from 'node:fs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { uploadPath } from '../uploads.js';
import { OPERATIONS, normalizeParams } from '../worldedit/operations.js';
import {
  buildBBox, applyOperation, undoLast, resetStaging, exportBuild,
  previewFilePath, hasPendingEdits, undoDepth, listAudit,
} from '../worldedit/staging.js';

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

// Presse-papier serveur en mémoire, lié à (acteur, build). Borné.
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
    bbox: buildBBox(bp),
    hasPendingEdits: hasPendingEdits(bp.id),
    undoDepth: undoDepth(bp.id),
    maxSelectionVolume: Number(process.env.WORLDEDIT_MAX_SELECTION || 2_000_000),
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
  const clipKey = `${req.we.actor}:${bp.id}`;

  try {
    if (operation === 'copy') {
      const out = await applyOperation({ bp, operation, params, selection, actor: req.we.actor });
      setClip(clipKey, out.clipboard);
      return res.json({ blocksChanged: 0, clipboard: { sx: out.clipboard.sx, sy: out.clipboard.sy, sz: out.clipboard.sz } });
    }
    const clipboardStore = operation === 'paste' ? clipboards.get(clipKey) : undefined;
    if (operation === 'paste' && !clipboardStore) return res.status(400).json({ error: 'empty_clipboard' });
    const out = await applyOperation({ bp, operation, params, selection, actor: req.we.actor, clipboardStore });
    return res.json({ blocksChanged: out.blocksChanged, bounds: out.bounds, undoDepth: undoDepth(bp.id) });
  } catch (e) {
    const known = ['invalid_selection', 'out_of_bounds', 'selection_too_large', 'unknown_operation',
      'empty_clipboard', 'no_source', 'too_many_blocks', 'bad_axis', 'bad_degrees', 'bad_block'];
    const code = known.includes(e.message) ? e.message : 'transform_failed';
    if (code === 'transform_failed') console.error('[worldedit] transform failed:', e?.message || e);
    return res.status(code === 'transform_failed' ? 500 : 400).json({ error: code });
  }
}

async function postUndo(req, res) {
  try {
    const out = await undoLast({ bp: req.we.bp, actor: req.we.actor });
    res.json(out);
  } catch (e) {
    res.status(e.message === 'nothing_to_undo' ? 409 : 500).json({ error: e.message || 'undo_failed' });
  }
}

function postReset(req, res) {
  resetStaging(req.we.bp.id);
  res.json({ reset: true });
}

function getExport(req, res) {
  const bp = req.we.bp;
  if (!bp.source_file) return res.status(422).json({ error: 'not_editable' });
  try {
    const { buffer, filename, mime } = exportBuild(bp);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message || 'export_failed' });
  }
}

function getAudit(req, res) {
  res.json(listAudit(req.we.bp.id, req.query?.limit).map((r) => ({
    id: r.id, actor: r.actor, operation: r.operation,
    params: safeJson(r.params_json), blocksChanged: r.blocks_changed, createdAt: r.created_at,
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
  router.post('/undo', worldeditLimiter, requireEdit, postUndo);
  router.post('/reset', worldeditLimiter, requireEdit, postReset);
  router.get('/export', worldeditLimiter, requireEdit, getExport);
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

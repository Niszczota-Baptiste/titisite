import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import { requireAuth } from '../auth.js';
import { UPLOADS_DIR, safeUnlink, uploadLoreImage, uploadPath } from '../uploads.js';
import {
  DIMENSIONS, ENTRY_TYPES, HYPOTHESIS_STATUSES, RELATION_TYPES, STANCES,
  TERMINAL_STATUSES,
} from '../lore/enums.js';
import { bearingInfo, ringFrom } from '../lore/geo.js';
import {
  addEvidence, createEntry, createHypothesis, createLink, createMap, createShape,
  createTag, deleteEntry, deleteEvidence, deleteHypothesis, deleteLink,
  deleteMap, deleteMedia, deleteShape, deleteTag, entryExists, exportAll,
  getEntry, getEntryBySlug, getHypothesis, getMapRaw, graphData,
  hypothesisExists, insertMedia, listEntries, listHypotheses, listMaps,
  listRevisions, listShapes, listTags, mapPoints, mediaFilenameKnown,
  searchLore, setMapImage, updateEntry, updateEvidence, updateHypothesis,
  updateMap, updateMediaCaption, updateShape, updateTag,
} from '../lore/store.js';

// Module Lore « Nostra » — TOUT est derrière requireAuth + requireLoreView,
// GET compris et médias compris : rien de public, rien en statique.

export const loreRouter = Router();

function requireLoreView(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin') return next();
  if (req.user.can_view_lore === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

loreRouter.use(requireAuth, requireLoreView);

// Le limiteur global /api/* (600/min) s'applique déjà ; on resserre les
// écritures et surtout l'upload (le traitement sharp coûte du CPU).
const writeLimiter = rateLimit({
  windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited' },
});
const uploadLimiter = rateLimit({
  windowMs: 60_000, max: 12, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited' },
});
loreRouter.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return writeLimiter(req, res, next);
});

// ── Petits validateurs ──────────────────────────────────────────────────────

const asInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined; // undefined = invalide
};

// Id de route : un :id invalide devient -1 (aucune ligne → 404 propre) plutôt
// qu'un binding undefined, que better-sqlite3 refuse en levant.
const idParam = (req) => asInt(req.params.id) ?? -1;

// Coordonnées : x/z vont ensemble (une carte a besoin des deux), y est libre.
function coordError(d) {
  for (const v of [d.x, d.y, d.z]) {
    if (v !== undefined && v !== null && !Number.isFinite(Number(v))) return 'invalid_coords';
  }
  const hasX = d.x !== undefined && d.x !== null;
  const hasZ = d.z !== undefined && d.z !== null;
  if (hasX !== hasZ) return 'invalid_coords';
  return null;
}

function entryPayloadError(d, { partial = false } = {}) {
  if (!partial || d.title !== undefined) {
    if (!d.title || !String(d.title).trim()) return 'missing_title';
  }
  if (d.entryType !== undefined && !ENTRY_TYPES.includes(d.entryType)) return 'invalid_entry_type';
  if (d.dimension !== undefined && !DIMENSIONS.includes(d.dimension)) return 'invalid_dimension';
  if (d.discoveredAt !== undefined && d.discoveredAt !== null && !Number.isFinite(Number(d.discoveredAt))) {
    return 'invalid_discovered_at';
  }
  if (d.tags !== undefined && !Array.isArray(d.tags)) return 'invalid_tags';
  return coordError(d);
}

function normalizeEntryPayload(body) {
  const d = { ...body };
  if (d.title !== undefined) d.title = String(d.title).trim().slice(0, 200);
  if (d.bodyMd !== undefined) d.bodyMd = String(d.bodyMd ?? '');
  const coord = (v) => (v === null || v === '' ? null : Math.round(Number(v)));
  if (d.x !== undefined) d.x = coord(d.x);
  if (d.y !== undefined) d.y = coord(d.y);
  if (d.z !== undefined) d.z = coord(d.z);
  if (d.discoveredAt !== undefined) {
    d.discoveredAt = d.discoveredAt === null ? null : Math.round(Number(d.discoveredAt));
  }
  return d;
}

// ── Entrées ─────────────────────────────────────────────────────────────────

loreRouter.get('/entries', (req, res) => {
  const f = {};
  if (req.query.type) f.type = String(req.query.type);
  if (req.query.dimension) f.dimension = String(req.query.dimension);
  if (req.query.canon !== undefined) f.canon = req.query.canon === '1' || req.query.canon === 'true';
  if (req.query.tag) {
    const tag = asInt(req.query.tag);
    if (tag === undefined) return res.status(400).json({ error: 'invalid_tag' });
    f.tag = tag;
  }
  if (req.query.q) f.q = String(req.query.q);
  const box = [req.query.x1, req.query.z1, req.query.x2, req.query.z2].map(asInt);
  if (box.some((v) => v === undefined)) return res.status(400).json({ error: 'invalid_bbox' });
  if (box.every((v) => v !== null)) [f.x1, f.z1, f.x2, f.z2] = box;
  res.json(listEntries(f));
});

loreRouter.get('/entries/:id', (req, res) => {
  const raw = String(req.params.id);
  // Confort : /entries/kotanostra marche aussi (un slug n'est jamais 100 % numérique).
  const entry = /^\d+$/.test(raw) ? getEntry(Number(raw)) : getEntryBySlug(raw);
  if (!entry) return res.status(404).json({ error: 'not_found' });
  res.json(entry);
});

loreRouter.post('/entries', (req, res) => {
  const d = normalizeEntryPayload(req.body || {});
  const err = entryPayloadError(d);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(createEntry(d, req.user.id));
});

loreRouter.put('/entries/:id', (req, res) => {
  const id = idParam(req);
  const d = normalizeEntryPayload(req.body || {});
  const err = entryPayloadError(d, { partial: true });
  if (err) return res.status(400).json({ error: err });
  const entry = updateEntry(id, d, req.user.id);
  if (!entry) return res.status(404).json({ error: 'not_found' });
  res.json(entry);
});

loreRouter.delete('/entries/:id', (req, res) => {
  if (!deleteEntry(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

loreRouter.get('/entries/:id/revisions', (req, res) => {
  const id = idParam(req);
  if (!entryExists(id)) return res.status(404).json({ error: 'not_found' });
  res.json(listRevisions('entry', id));
});

// ── Liens entre entrées ─────────────────────────────────────────────────────

loreRouter.post('/links', (req, res) => {
  const { fromEntryId, toEntryId, relationType, note } = req.body || {};
  const from = asInt(fromEntryId) || null;
  const to = asInt(toEntryId) || null;
  if (!from || !to) return res.status(400).json({ error: 'missing_entry_ids' });
  if (from === to) return res.status(400).json({ error: 'self_link' });
  if (!RELATION_TYPES.includes(relationType)) return res.status(400).json({ error: 'invalid_relation_type' });
  if (!entryExists(from) || !entryExists(to)) return res.status(404).json({ error: 'entry_not_found' });
  const link = createLink({ fromEntryId: from, toEntryId: to, relationType, note }, req.user.id);
  if (!link) return res.status(409).json({ error: 'link_exists' });
  res.status(201).json(link);
});

loreRouter.delete('/links/:id', (req, res) => {
  if (!deleteLink(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Tags ────────────────────────────────────────────────────────────────────

loreRouter.get('/tags', (_req, res) => res.json(listTags()));

loreRouter.post('/tags', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const tag = createTag(name, req.body?.color);
  if (!tag) return res.status(409).json({ error: 'tag_exists' });
  res.status(201).json(tag);
});

loreRouter.put('/tags/:id', (req, res) => {
  const tag = updateTag(idParam(req), req.body || {});
  if (tag === undefined) return res.status(404).json({ error: 'not_found' });
  if (tag === null) return res.status(409).json({ error: 'tag_exists' });
  res.json(tag);
});

loreRouter.delete('/tags/:id', (req, res) => {
  if (!deleteTag(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Hypothèses ──────────────────────────────────────────────────────────────

loreRouter.get('/hypotheses', (req, res) => {
  const f = {};
  if (req.query.status) {
    if (!HYPOTHESIS_STATUSES.includes(req.query.status)) return res.status(400).json({ error: 'invalid_status' });
    f.status = req.query.status;
  }
  res.json(listHypotheses(f));
});

loreRouter.get('/hypotheses/:id', (req, res) => {
  const h = getHypothesis(idParam(req));
  if (!h) return res.status(404).json({ error: 'not_found' });
  res.json(h);
});

function hypothesisPayloadError(d, existing) {
  if (existing === undefined && (!d.title || !String(d.title).trim())) return 'missing_title';
  if (d.title !== undefined && !String(d.title).trim()) return 'missing_title';
  if (d.status !== undefined && !HYPOTHESIS_STATUSES.includes(d.status)) return 'invalid_status';
  if (d.confidence !== undefined) {
    const c = Number(d.confidence);
    if (!Number.isFinite(c) || c < 0 || c > 100) return 'invalid_confidence';
  }
  // Note de résolution exigée pour tout statut terminal — confirmed/refuted
  // (spec) et abandoned (la raison de l'abandon EST la donnée précieuse).
  const status = d.status ?? existing?.status;
  if (TERMINAL_STATUSES.includes(status)) {
    const note = d.resolutionNote ?? existing?.resolutionNote ?? '';
    if (!String(note).trim()) return 'resolution_note_required';
  }
  return null;
}

loreRouter.post('/hypotheses', (req, res) => {
  const d = { ...(req.body || {}) };
  if (d.title !== undefined) d.title = String(d.title).trim().slice(0, 200);
  if (d.confidence !== undefined) d.confidence = Math.round(Number(d.confidence));
  const err = hypothesisPayloadError(d, undefined);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(createHypothesis(d, req.user.id));
});

loreRouter.put('/hypotheses/:id', (req, res) => {
  const id = idParam(req);
  const existing = getHypothesis(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const d = { ...(req.body || {}) };
  if (d.title !== undefined) d.title = String(d.title).trim().slice(0, 200);
  if (d.confidence !== undefined) d.confidence = Math.round(Number(d.confidence));
  const err = hypothesisPayloadError(d, existing);
  if (err) return res.status(400).json({ error: err });
  res.json(updateHypothesis(id, d, req.user.id));
});

loreRouter.delete('/hypotheses/:id', (req, res) => {
  if (!deleteHypothesis(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

loreRouter.get('/hypotheses/:id/revisions', (req, res) => {
  const id = idParam(req);
  if (!hypothesisExists(id)) return res.status(404).json({ error: 'not_found' });
  res.json(listRevisions('hypothesis', id));
});

// ── Preuves ─────────────────────────────────────────────────────────────────

loreRouter.post('/hypotheses/:id/evidence', (req, res) => {
  const hypothesisId = idParam(req);
  if (!hypothesisExists(hypothesisId)) return res.status(404).json({ error: 'not_found' });
  const entryId = asInt(req.body?.entryId) ?? -1;
  if (entryId < 1 || !entryExists(entryId)) return res.status(404).json({ error: 'entry_not_found' });
  const stance = req.body?.stance ?? 'neutral';
  if (!STANCES.includes(stance)) return res.status(400).json({ error: 'invalid_stance' });
  const ev = addEvidence({ hypothesisId, entryId, stance, note: req.body?.note }, req.user.id);
  if (!ev) return res.status(409).json({ error: 'evidence_exists' });
  res.status(201).json(ev);
});

loreRouter.put('/evidence/:id', (req, res) => {
  if (req.body?.stance !== undefined && !STANCES.includes(req.body.stance)) {
    return res.status(400).json({ error: 'invalid_stance' });
  }
  const ev = updateEvidence(idParam(req), req.body || {});
  if (!ev) return res.status(404).json({ error: 'not_found' });
  res.json(ev);
});

loreRouter.delete('/evidence/:id', (req, res) => {
  if (!deleteEvidence(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Carte & géométrie ───────────────────────────────────────────────────────

loreRouter.get('/map/points', (req, res) => {
  const dimension = req.query.dimension ? String(req.query.dimension) : undefined;
  if (dimension && !DIMENSIONS.includes(dimension)) return res.status(400).json({ error: 'invalid_dimension' });
  res.json(mapPoints(dimension));
});

loreRouter.post('/geo/bearing', (req, res) => {
  const { from, to } = req.body || {};
  const pts = [from?.x, from?.z, to?.x, to?.z].map(Number);
  if (pts.some((n) => !Number.isFinite(n))) return res.status(400).json({ error: 'invalid_points' });
  const info = bearingInfo({ x: pts[0], z: pts[1] }, { x: pts[2], z: pts[3] });
  res.json({
    distance: Math.round(info.distance * 10) / 10,
    bearingDeg: info.bearingDeg === null ? null : Math.round(info.bearingDeg * 100) / 100,
    cardinal8: info.cardinal8,
    cardinal16: info.cardinal16,
  });
});

// Mode « origine » de la carte : toutes les entrées géolocalisées de la
// dimension, triées par angle, avec distance et écart au plus proche des 8
// axes. Une seule requête par choix d'origine — le client n'a aucun calcul
// d'angle à refaire (source de vérité unique : server/lore/geo.js).
loreRouter.get('/geo/ring', (req, res) => {
  const ox = Number(req.query.origin_x);
  const oz = Number(req.query.origin_z);
  if (!Number.isFinite(ox) || !Number.isFinite(oz)) return res.status(400).json({ error: 'invalid_origin' });
  let tolerance = req.query.tolerance === undefined ? 2 : Number(req.query.tolerance);
  if (!Number.isFinite(tolerance)) return res.status(400).json({ error: 'invalid_tolerance' });
  tolerance = Math.min(Math.max(tolerance, 0), 45);
  const dimension = req.query.dimension ? String(req.query.dimension) : 'overworld';
  if (!DIMENSIONS.includes(dimension)) return res.status(400).json({ error: 'invalid_dimension' });
  const points = ringFrom({ x: ox, z: oz }, mapPoints(dimension), { tolerance })
    .map((p) => ({
      ...p,
      distance: Math.round(p.distance * 10) / 10,
      bearingDeg: Math.round(p.bearingDeg * 100) / 100,
      deviationDeg: Math.round(p.deviationDeg * 100) / 100,
    }));
  res.json({ origin: { x: ox, z: oz }, dimension, tolerance, points });
});

// ── Tracés d'enquête (lignes / polygones reliant des points) ───────────────

// 2 à 500 sommets [x, z] finis, arrondis au bloc. Tout le tracé est validé ou
// rien — un sommet corrompu invaliderait la forme entière.
function parseShapePoints(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 500) return null;
  const out = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]);
    const z = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    out.push([Math.round(x), Math.round(z)]);
  }
  return out;
}

const COLOR_RE = /^#[0-9a-f]{6}$/i;

loreRouter.get('/shapes', (req, res) => {
  const dimension = req.query.dimension ? String(req.query.dimension) : undefined;
  if (dimension && !DIMENSIONS.includes(dimension)) return res.status(400).json({ error: 'invalid_dimension' });
  res.json(listShapes(dimension));
});

loreRouter.post('/shapes', (req, res) => {
  const b = req.body || {};
  const dimension = b.dimension || 'overworld';
  if (!DIMENSIONS.includes(dimension)) return res.status(400).json({ error: 'invalid_dimension' });
  const points = parseShapePoints(b.points);
  if (!points) return res.status(400).json({ error: 'invalid_points' });
  res.status(201).json(createShape({
    dimension,
    name: String(b.name || '').trim().slice(0, 120),
    color: COLOR_RE.test(b.color) ? b.color : '#e8c86a',
    closed: !!b.closed,
    points,
  }, req.user.id));
});

loreRouter.put('/shapes/:id', (req, res) => {
  const b = req.body || {};
  const d = {};
  if (b.name !== undefined) d.name = String(b.name || '').trim().slice(0, 120);
  if (b.color !== undefined) {
    if (!COLOR_RE.test(b.color)) return res.status(400).json({ error: 'invalid_color' });
    d.color = b.color;
  }
  if (b.closed !== undefined) d.closed = !!b.closed;
  if (b.points !== undefined) {
    const points = parseShapePoints(b.points);
    if (!points) return res.status(400).json({ error: 'invalid_points' });
    d.points = points;
  }
  const shape = updateShape(idParam(req), d);
  if (!shape) return res.status(404).json({ error: 'not_found' });
  res.json(shape);
});

loreRouter.delete('/shapes/:id', (req, res) => {
  if (!deleteShape(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Fonds de carte calibrés ────────────────────────────────────────────────

loreRouter.get('/maps', (_req, res) => res.json(listMaps()));

function mapPayloadError(d, { partial = false } = {}) {
  if (!partial || d.name !== undefined) {
    if (!d.name || !String(d.name).trim()) return 'missing_name';
  }
  if (d.dimension !== undefined && !DIMENSIONS.includes(d.dimension)) return 'invalid_dimension';
  for (const v of [d.imgXLeft, d.imgXRight, d.imgZBottom]) {
    if (v !== undefined && v !== null && !Number.isFinite(Number(v))) return 'invalid_calibration';
  }
  return null;
}

loreRouter.post('/maps', (req, res) => {
  const d = { ...(req.body || {}) };
  if (d.name !== undefined) d.name = String(d.name).trim().slice(0, 120);
  const err = mapPayloadError(d);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(createMap(d));
});

loreRouter.put('/maps/:id', (req, res) => {
  const d = { ...(req.body || {}) };
  if (d.name !== undefined) d.name = String(d.name).trim().slice(0, 120);
  const err = mapPayloadError(d, { partial: true });
  if (err) return res.status(400).json({ error: err });
  const map = updateMap(idParam(req), d);
  if (!map) return res.status(404).json({ error: 'not_found' });
  res.json(map);
});

loreRouter.delete('/maps/:id', (req, res) => {
  if (!deleteMap(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Médias ──────────────────────────────────────────────────────────────────

// Recompression systématique en WebP + miniature ≤ 400 px. Contrairement à
// processAndStoreImage (images publiques du site), un fichier que sharp ne
// décode pas est REJETÉ (415) au lieu d'être conservé tel quel : c'est la
// validation par le contenu réel, pas par l'extension déclarée.
async function processLoreImage(file, { thumbnail = true } = {}) {
  const out = `${crypto.randomUUID()}.webp`;
  const thumbName = thumbnail ? `${crypto.randomUUID()}.webp` : null;
  try {
    const info = await sharp(uploadPath(file.filename))
      .rotate()
      .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(uploadPath(out));
    if (thumbName) {
      await sharp(uploadPath(file.filename))
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(uploadPath(thumbName));
    }
    safeUnlink(file.filename);
    return {
      filename: out, thumbFilename: thumbName, mimeType: 'image/webp',
      width: info.width, height: info.height, size: info.size,
    };
  } catch {
    safeUnlink(file.filename);
    safeUnlink(out);
    if (thumbName) safeUnlink(thumbName);
    return null;
  }
}

loreRouter.post('/media', uploadLimiter, uploadLoreImage.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const entryId = asInt(req.body?.entryId) || null;
  const hypothesisId = asInt(req.body?.hypothesisId) || null;
  if (!entryId && !hypothesisId) {
    safeUnlink(req.file.filename);
    return res.status(400).json({ error: 'missing_target' });
  }
  if ((entryId && !entryExists(entryId)) || (hypothesisId && !hypothesisExists(hypothesisId))) {
    safeUnlink(req.file.filename);
    return res.status(404).json({ error: 'target_not_found' });
  }
  const processed = await processLoreImage(req.file);
  if (!processed) return res.status(415).json({ error: 'not_an_image' });
  res.status(201).json(insertMedia({
    ...processed,
    entryId: entryId || null,
    hypothesisId: hypothesisId || null,
    originalName: req.file.originalname,
    caption: String(req.body?.caption || '').slice(0, 300),
    uploadedBy: req.user.id,
  }));
});

// Fond de carte : même pipeline, sans miniature, remplace l'image précédente.
loreRouter.post('/maps/:id/image', uploadLimiter, uploadLoreImage.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const id = idParam(req);
  if (!getMapRaw(id)) {
    safeUnlink(req.file.filename);
    return res.status(404).json({ error: 'not_found' });
  }
  const processed = await processLoreImage(req.file, { thumbnail: false });
  if (!processed) return res.status(415).json({ error: 'not_an_image' });
  res.json(setMapImage(id, processed.filename));
});

loreRouter.put('/media/:id', (req, res) => {
  const media = updateMediaCaption(idParam(req), String(req.body?.caption || '').slice(0, 300));
  if (!media) return res.status(404).json({ error: 'not_found' });
  res.json(media);
});

loreRouter.delete('/media/:id', (req, res) => {
  if (!deleteMedia(idParam(req))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// Service des fichiers — même double défense que /api/audio : regex sur le nom
// (pas de traversée) + le nom DOIT être connu en base. UUID immuables → cache
// agressif. Derrière le gate lore comme tout le reste du module.
loreRouter.get('/media/file/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).end();
  if (!mediaFilenameKnown(filename)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filename, { root: UPLOADS_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// ── Recherche, graphe, export ───────────────────────────────────────────────

loreRouter.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing_query' });
  res.json(searchLore(q));
});

loreRouter.get('/graph', (_req, res) => res.json(graphData()));

loreRouter.get('/export', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="lore-nostra-export.json"');
  res.json(exportAll());
});

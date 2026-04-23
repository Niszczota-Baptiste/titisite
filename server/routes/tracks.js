import express from 'express';
import { getOne, insert, listAll, remove, reorder, update } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { upload, safeUnlink } from '../uploads.js';

export const tracksRouter = express.Router();
const ADMIN = [requireAuth, requireRole('admin')];

tracksRouter.get('/', (req, res) => res.json(listAll('tracks')));

tracksRouter.get('/:id(\\d+)', (req, res) => {
  const item = getOne('tracks', Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

tracksRouter.post('/', ...ADMIN, (req, res) => {
  const item = insert('tracks', req.body);
  res.status(201).json(item);
});

tracksRouter.put('/:id(\\d+)', ...ADMIN, (req, res) => {
  const item = update('tracks', Number(req.params.id), req.body);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

tracksRouter.delete('/:id(\\d+)', ...ADMIN, (req, res) => {
  const item = getOne('tracks', Number(req.params.id));
  if (item?.filename) safeUnlink(item.filename);
  const ok = remove('tracks', Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

tracksRouter.post('/reorder', ...ADMIN, (req, res) => {
  const list = reorder('tracks', req.body.order);
  res.json(list);
});

// ── Audio upload ──
tracksRouter.post('/:id(\\d+)/audio', ...ADMIN, upload.single('file'), (req, res) => {
  const id = Number(req.params.id);
  const item = getOne('tracks', id);
  if (!item) {
    if (req.file) safeUnlink(req.file.filename);
    return res.status(404).json({ error: 'not_found' });
  }
  if (item.filename) safeUnlink(item.filename);
  const updated = update('tracks', id, { ...item, filename: req.file.filename });
  res.json(updated);
});

tracksRouter.delete('/:id(\\d+)/audio', ...ADMIN, (req, res) => {
  const id = Number(req.params.id);
  const item = getOne('tracks', id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (item.filename) safeUnlink(item.filename);
  const updated = update('tracks', id, { ...item, filename: null, clip_start: 0, duration: '0:00' });
  res.json(updated);
});

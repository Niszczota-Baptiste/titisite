import { Router } from 'express';
import fs from 'node:fs';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { safeUnlink, upload, uploadPath } from '../uploads.js';

export const buildsRouter = Router();

const PROJECT = requireRole('admin', 'member');

const SELECT = `
  SELECT b.*, u.name AS uploaded_by_name
  FROM builds b
  LEFT JOIN users u ON u.id = b.uploaded_by
`;

function rowToBuild(r) {
  if (!r) return null;
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    status: r.status,
    originalName: r.original_name,
    mimeType: r.mime_type,
    size: r.size,
    externalUrl: r.external_url,
    notes: r.notes,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    releasedAt: r.released_at,
    hasFile: !!r.filename,
  };
}

buildsRouter.get('/', requireAuth, PROJECT, (_req, res) => {
  const rows = db.prepare(`${SELECT} ORDER BY b.released_at DESC`).all();
  res.json(rows.map(rowToBuild));
});

// Create with optional file (multipart) or pure JSON with external_url
buildsRouter.post('/', requireAuth, PROJECT, upload.single('file'), (req, res) => {
  const { version, title, status, externalUrl, notes } = req.body || {};
  if (!version) return res.status(400).json({ error: 'missing_version' });
  if (!req.file && !externalUrl) {
    return res.status(400).json({ error: 'file_or_url_required' });
  }
  const f = req.file || null;
  const result = db
    .prepare(`
      INSERT INTO builds (version, title, status, filename, original_name, mime_type, size, external_url, notes, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      version.trim(),
      (title || '').trim(),
      ['alpha', 'beta', 'release'].includes(status) ? status : 'alpha',
      f?.filename || null,
      f?.originalname || null,
      f?.mimetype || null,
      f?.size || null,
      f ? null : (externalUrl || '').trim() || null,
      (notes || '').trim(),
      req.user.id,
    );
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToBuild(row));
});

buildsRouter.put('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM builds WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { version, title, status, externalUrl, notes } = req.body || {};
  db.prepare(`
    UPDATE builds SET
      version       = COALESCE(?, version),
      title         = COALESCE(?, title),
      status        = COALESCE(?, status),
      external_url  = COALESCE(?, external_url),
      notes         = COALESCE(?, notes)
    WHERE id = ?
  `).run(
    version ?? null,
    title ?? null,
    ['alpha', 'beta', 'release'].includes(status) ? status : null,
    externalUrl ?? null,
    notes ?? null,
    id,
  );
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(id);
  res.json(rowToBuild(row));
});

buildsRouter.get('/:id/download', requireAuth, PROJECT, (req, res) => {
  const row = db.prepare(`SELECT * FROM builds WHERE id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (!row.filename) return res.status(404).json({ error: 'no_file' });
  const p = uploadPath(row.filename);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'file_missing' });
  res.download(p, row.original_name);
});

buildsRouter.delete('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT filename FROM builds WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM builds WHERE id = ?`).run(id);
  safeUnlink(row.filename);
  res.status(204).end();
});

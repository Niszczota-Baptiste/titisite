import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { safeUnlink, uploadImage } from '../uploads.js';

export const imagesRouter = Router();

// POST /api/images — admin only, upload a project image
imagesRouter.post(
  '/',
  requireAuth, requireRole('admin'),
  uploadImage.single('file'),
  (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'missing_file' });
    db.prepare(`
      INSERT INTO project_images (filename, original_name, mime_type, size)
      VALUES (?, ?, ?, ?)
    `).run(f.filename, f.originalname, f.mimetype, f.size);
    res.status(201).json({
      filename: f.filename,
      url: `/api/images/${f.filename}`,
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size,
    });
  },
);

// DELETE /api/images/:filename — admin only, remove from disk + DB
imagesRouter.delete('/:filename', requireAuth, requireRole('admin'), (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).end();
  const row = db.prepare(`SELECT filename FROM project_images WHERE filename = ?`).get(filename);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM project_images WHERE filename = ?`).run(filename);
  safeUnlink(filename);
  res.status(204).end();
});

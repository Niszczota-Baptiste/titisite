import crypto from 'node:crypto';
import { Router } from 'express';
import sharp from 'sharp';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { safeUnlink, uploadImage, uploadPath } from '../uploads.js';

export const imagesRouter = Router();

// POST /api/images — admin only, upload a project image.
// L'image est recompressée en WebP (rotation EXIF appliquée, métadonnées
// retirées, bord long limité à 3840 px) : un panorama iPhone de 40 Mo
// ressort en fichier raisonnable pour le web. Les GIF sont gardés tels
// quels pour préserver l'animation ; si sharp ne sait pas lire le fichier,
// l'original est conservé.
imagesRouter.post(
  '/',
  requireAuth, requireRole('admin'),
  uploadImage.single('file'),
  async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'missing_file' });

    let { filename, mimetype, size } = f;
    if (mimetype !== 'image/gif') {
      try {
        const out = `${crypto.randomUUID()}.webp`;
        const info = await sharp(uploadPath(filename))
          .rotate()
          .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(uploadPath(out));
        safeUnlink(filename);
        filename = out;
        mimetype = 'image/webp';
        size = info.size;
      } catch { /* fichier illisible par sharp → original conservé */ }
    }

    db.prepare(`
      INSERT INTO project_images (filename, original_name, mime_type, size)
      VALUES (?, ?, ?, ?)
    `).run(filename, f.originalname, mimetype, size);
    res.status(201).json({
      filename,
      url: `/api/images/${filename}`,
      originalName: f.originalname,
      mimeType: mimetype,
      size,
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

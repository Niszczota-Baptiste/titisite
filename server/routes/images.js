import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { processAndStoreImage } from '../images.js';
import { safeUnlink, uploadImage } from '../uploads.js';

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
    res.status(201).json(await processAndStoreImage(f));
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

import crypto from 'node:crypto';
import sharp from 'sharp';
import { db } from './db.js';
import { safeUnlink, uploadPath } from './uploads.js';

// Traite un fichier image uploadé (multer) : recompression WebP (rotation EXIF,
// métadonnées retirées, bord long ≤ 3840 px), sauf GIF conservés tels quels ;
// insère une ligne project_images et renvoie { filename, url, ... }. Partagé
// par POST /api/images (admin) et les uploads scopés membre (cartes, schémas).
export async function processAndStoreImage(file) {
  let { filename, mimetype, size } = file;
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
  `).run(filename, file.originalname, mimetype, size);
  return {
    filename,
    url: `/api/images/${filename}`,
    originalName: file.originalname,
    mimeType: mimetype,
    size,
  };
}

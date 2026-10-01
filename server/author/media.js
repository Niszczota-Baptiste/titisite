import crypto from 'node:crypto';
import sharp from 'sharp';
import { db } from '../db.js';
import { safeUnlink, uploadPath } from '../uploads.js';
import { liveEntity, mediaFromRow } from './entities.js';
import { AuthorValidationError, cleanText } from './validate.js';

// Images de l'atelier (références visuelles, couvertures, cartes, tableau
// blanc). Même pipeline que le module Lore : tout est réencodé en WebP (EXIF
// retiré, bord long ≤ 3840 px) + miniature ; un fichier que sharp ne décode pas
// est refusé (415). Le fichier d'origine n'est jamais conservé.

export async function processAuthorImage(file) {
  const out = `${crypto.randomUUID()}.webp`;
  const thumb = `${crypto.randomUUID()}.webp`;
  try {
    const info = await sharp(uploadPath(file.filename))
      .rotate()
      .resize({ width: 3840, height: 3840, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(uploadPath(out));
    await sharp(uploadPath(file.filename))
      .rotate()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toFile(uploadPath(thumb));
    safeUnlink(file.filename);
    return { filename: out, thumbFilename: thumb, width: info.width, height: info.height, size: info.size };
  } catch {
    safeUnlink(file.filename);
    safeUnlink(out);
    safeUnlink(thumb);
    return null;
  }
}

// `purpose` : 'gallery' (défaut), 'cover' (devient la couverture de
// l'élément), 'map' (image de carte d'un lieu), 'board' (sans élément).
export function insertMedia(projectId, processed, { entityId = null, purpose = 'gallery', originalName = '', caption = '' }) {
  let entity = null;
  if (entityId) {
    entity = liveEntity(projectId, entityId);
    if (!entity) throw new AuthorValidationError('unknown_entity', 'entityId');
  }
  if (purpose === 'map' && entity?.kind !== 'place') throw new AuthorValidationError('invalid_purpose', 'purpose');
  let id;
  db.transaction(() => {
    const position = entity
      ? db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM author_media WHERE entity_id = ?`).get(entity.id).n
      : 0;
    const info = db.prepare(`
      INSERT INTO author_media (project_id, entity_id, filename, thumb_filename, original_name, mime_type, width, height, size, caption, position)
      VALUES (?, ?, ?, ?, ?, 'image/webp', ?, ?, ?, ?, ?)
    `).run(projectId, entity?.id ?? null, processed.filename, processed.thumbFilename,
      cleanText(originalName, 255, 'originalName').slice(0, 255), processed.width, processed.height, processed.size,
      cleanText(caption, 300, 'caption'), position);
    id = Number(info.lastInsertRowid);
    if (entity && purpose === 'cover') {
      db.prepare(`UPDATE author_entities SET cover_media_id = ? WHERE id = ?`).run(id, entity.id);
    }
    if (entity && purpose === 'map') {
      db.prepare(`UPDATE author_places SET map_media_id = ? WHERE entity_id = ?`).run(id, entity.id);
    }
  })();
  return mediaFromRow(db.prepare(`SELECT * FROM author_media WHERE id = ?`).get(id));
}

export function listProjectMedia(projectId) {
  return db.prepare(`SELECT * FROM author_media WHERE project_id = ? ORDER BY id DESC LIMIT 2000`)
    .all(projectId).map(mediaFromRow);
}

export function updateMedia(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_media WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  if (input.caption !== undefined) {
    db.prepare(`UPDATE author_media SET caption = ? WHERE id = ?`).run(cleanText(input.caption, 300, 'caption'), id);
  }
  if (input.cover === true && row.entity_id) {
    db.prepare(`UPDATE author_entities SET cover_media_id = ? WHERE id = ? AND project_id = ?`).run(id, row.entity_id, projectId);
  }
  return mediaFromRow(db.prepare(`SELECT * FROM author_media WHERE id = ?`).get(id));
}

export function deleteMedia(projectId, id) {
  const row = db.prepare(`SELECT * FROM author_media WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return false;
  db.prepare(`DELETE FROM author_media WHERE id = ?`).run(id);
  safeUnlink(row.filename);
  if (row.thumb_filename) safeUnlink(row.thumb_filename);
  return true;
}

// Le fichier n'est servi que si son nom est connu ET que son projet
// appartient à l'appelant — un nom de fichier deviné ne suffit pas.
export function mediaFileOwned(filename, userId) {
  return !!db.prepare(`
    SELECT 1 FROM author_media m JOIN author_projects p ON p.id = m.project_id
    WHERE (m.filename = ? OR m.thumb_filename = ?) AND p.owner_id = ?
  `).get(filename, filename, userId);
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, getOne, insert } from '../db.js';
import { uploadPath } from '../uploads.js';
import { audioRow, getAudio } from './audio.js';
import { nowS } from './entities.js';
import { AuthorValidationError, cleanText } from './validate.js';

// Publication d'une prise audio — LE SEUL chemin par lequel un son de l'atelier
// privé devient public. Jamais déclenché par un envoi, une synchronisation ou
// un rangement : il faut le demander explicitement, pour une prise précise,
// vers une destination nommée, en confirmant.
//
// Destination prise en charge : 'portfolio' — la collection publique `tracks`
// (section musique du site, fichiers servis par /api/audio). Le fichier est
// COPIÉ sous un nouveau nom : la prise privée reste intacte et privée ; retirer
// la piste publique (administration → Musique) ne touche pas à l'original, et
// supprimer la prise privée ne dépublie rien en silence.

export const PUBLISH_DESTINATIONS = ['portfolio'];

function clock(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Ce qui serait publié — pour l'aperçu avant confirmation. Ne modifie rien.
export function publicationPreview(projectId, mediaId, input = {}) {
  const row = audioRow(projectId, mediaId);
  if (!row) return null;
  const published = row.published_track_id ? getOne('tracks', row.published_track_id) : null;
  return {
    media: getAudio(projectId, mediaId),
    destination: 'portfolio',
    destinations: PUBLISH_DESTINATIONS,
    wouldPublish: {
      title: cleanText(input.title ?? row.label, 200, 'title', { trim: true }),
      genre: cleanText(input.genre ?? '', 80, 'genre', { trim: true }),
      duration: clock(row.duration_ms),
      visibility: 'Section musique du site public, écoutable par tout visiteur.',
    },
    // Déjà publiée ET la piste publique existe encore.
    alreadyPublished: published ? { trackId: published.id, title: published.title, at: row.published_at } : null,
  };
}

export async function publishAudio(projectId, mediaId, input = {}) {
  const row = audioRow(projectId, mediaId);
  if (!row) return { notFound: true };
  if (!PUBLISH_DESTINATIONS.includes(input.destination)) throw new AuthorValidationError('invalid_destination', 'destination');
  if (input.confirm !== true) throw new AuthorValidationError('confirmation_required', 'confirm');
  const title = cleanText(input.title, 200, 'title', { trim: true, required: true });
  const genre = cleanText(input.genre, 80, 'genre', { trim: true });
  if (row.published_track_id && getOne('tracks', row.published_track_id)) {
    return { conflict: { error: 'already_published', trackId: row.published_track_id } };
  }
  const publicName = `${crypto.randomUUID()}${path.extname(row.filename)}`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- noms UUID (base de données / générés ici)
  await fs.promises.copyFile(uploadPath(row.filename), uploadPath(publicName));
  let track;
  try {
    db.transaction(() => {
      track = insert('tracks', { title, genre, duration: clock(row.duration_ms), filename: publicName, clip_start: 0 });
      db.prepare(`UPDATE author_media SET published_track_id = ?, published_at = ? WHERE id = ?`).run(track.id, nowS(), row.id);
    })();
  } catch (err) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- nom UUID généré ici
    fs.unlink(uploadPath(publicName), () => {});
    throw err;
  }
  return { track, media: getAudio(projectId, mediaId) };
}

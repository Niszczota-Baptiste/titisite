import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { safeUnlink, uploadPath } from '../uploads.js';
import { audioFromRow, cleanClientRef, liveEntity, nowS } from './entities.js';
import { AUDIO_INTEGRITY, AUDIO_SOURCES, MARKER_KINDS, MARKERS_MAX_PER_MEDIA } from './enums.js';
import { AuthorValidationError, cleanText } from './validate.js';

// Atelier musical privé : prises audio et repères.
//
// Une prise est un ORIGINAL : elle est conservée octet pour octet (jamais
// réencodée ni découpée), rangée dans author_media (kind = 'audio') et servie
// uniquement par /api/author/media/:filename derrière la garde du propriétaire.
// Boucles et extractions sont des repères (author_media_markers) posés dessus.
// Elle n'entre dans la collection publique `tracks` que par publish.js, sur un
// geste explicite, et par copie.

// ── Reconnaissance du format ────────────────────────────────────────────────
// Le type annoncé par l'appareil et l'extension se falsifient : on lit les
// premiers octets (l'équivalent, pour l'audio, du décodage sharp des images).

export const AUDIO_FAMILIES = {
  mp4: { ext: '.m4a', mime: 'audio/mp4', accept: ['.m4a', '.mp4'] },
  adts: { ext: '.aac', mime: 'audio/aac', accept: ['.aac'] },
  mp3: { ext: '.mp3', mime: 'audio/mpeg', accept: ['.mp3'] },
  ogg: { ext: '.ogg', mime: 'audio/ogg', accept: ['.ogg', '.opus'] },
  wav: { ext: '.wav', mime: 'audio/wav', accept: ['.wav'] },
  flac: { ext: '.flac', mime: 'audio/flac', accept: ['.flac'] },
  webm: { ext: '.webm', mime: 'audio/webm', accept: ['.webm'] },
};

// Type servi d'après l'extension stockée (elle a été alignée sur le contenu).
export const AUDIO_CONTENT_TYPES = Object.fromEntries(
  Object.values(AUDIO_FAMILIES).flatMap((f) => f.accept.map((ext) => [ext, f.mime])),
);

const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

// → 'mp4' | 'adts' | 'mp3' | 'ogg' | 'wav' | 'flac' | 'webm' | null
export function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  if (ascii(buf, 4, 8) === 'ftyp') return 'mp4';
  if (ascii(buf, 0, 4) === 'OggS') return 'ogg';
  if (ascii(buf, 0, 4) === 'fLaC') return 'flac';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return 'wav';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (ascii(buf, 0, 3) === 'ID3') return 'mp3';
  if (buf[0] === 0xff) {
    // ADTS (AAC brut) : synchro 0xFFF + couche 00. MP3 : synchro 0xFFE + couche ≠ 00.
    if ((buf[1] & 0xf6) === 0xf0) return 'adts';
    if ((buf[1] & 0xe0) === 0xe0 && (buf[1] & 0x06) !== 0) return 'mp3';
  }
  return null;
}

function readHead(filename, bytes = 16) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- nom UUID généré par multer
  const fd = fs.openSync(uploadPath(filename), 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function sha256File(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- nom UUID généré par multer
    fs.createReadStream(uploadPath(filename))
      .on('data', (c) => hash.update(c))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

// ── Lecture ─────────────────────────────────────────────────────────────────

const WITH_MARKS = `
  SELECT m.*, (SELECT COUNT(*) FROM author_media_markers k WHERE k.media_id = m.id) AS marker_count
  FROM author_media m
`;

export function audioRow(projectId, id) {
  return db.prepare(`${WITH_MARKS} WHERE m.id = ? AND m.project_id = ? AND m.kind = 'audio'`).get(id, projectId) || null;
}

export function getAudio(projectId, id) {
  return audioFromRow(audioRow(projectId, id));
}

function audioByClientRef(projectId, ref) {
  return audioFromRow(db.prepare(`${WITH_MARKS} WHERE m.project_id = ? AND m.client_ref = ? AND m.kind = 'audio'`).get(projectId, ref));
}

// Toutes les prises du projet, avec l'idée musicale qui les porte (ou aucune :
// prise pas encore rangée, ou dont l'idée a été purgée).
export function listProjectAudio(projectId) {
  return db.prepare(`
    SELECT m.*, (SELECT COUNT(*) FROM author_media_markers k WHERE k.media_id = m.id) AS marker_count,
           e.title AS e_title, e.deleted_at AS e_deleted,
           (SELECT s.reference_media_id FROM author_sounds s WHERE s.entity_id = m.entity_id) AS ref_id
    FROM author_media m LEFT JOIN author_entities e ON e.id = m.entity_id
    WHERE m.project_id = ? AND m.kind = 'audio' ORDER BY m.id DESC LIMIT 2000
  `).all(projectId).map((r) => ({
    ...audioFromRow(r),
    entity: r.entity_id ? { id: r.entity_id, title: r.e_title, trashed: !!r.e_deleted } : null,
    isReference: !!r.ref_id && r.ref_id === r.id,
  }));
}

// ── Réception d'une prise ───────────────────────────────────────────────────

function soundEntity(projectId, entityId) {
  const ent = liveEntity(projectId, entityId);
  if (!ent) throw new AuthorValidationError('unknown_entity', 'entityId');
  // Une prise se range sur une idée musicale ; elle se RELIE à une scène, un
  // personnage ou une ambiance par les relations de cette idée.
  if (ent.kind !== 'sound') throw new AuthorValidationError('invalid_entity', 'entityId');
  return ent;
}

function cleanDuration(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 86_400_000) throw new AuthorValidationError('invalid_number', 'durationMs');
  return n;
}

function cleanEpoch(v, field) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 99_999_999_999) throw new AuthorValidationError('invalid_number', field);
  return n;
}

const oneOf = (v, list, fallback = '') => (list.includes(v) ? v : fallback);

// Reçoit le fichier déposé par multer. Rend { media, existed } ; `existed` =
// la même référence client avait déjà été reçue (réponse perdue, envoi
// rejoué) : le fichier en double est jeté, la prise d'origine est renvoyée.
// Toute erreur laisse le dossier d'envoi propre.
export async function receiveAudio(projectId, file, input = {}) {
  let stored = file.filename;
  try {
    const ref = cleanClientRef(input.clientRef);
    if (ref) {
      const found = audioByClientRef(projectId, ref);
      if (found) { safeUnlink(stored); return { media: found, existed: true }; }
    }
    const entity = input.entityId ? soundEntity(projectId, input.entityId) : null;
    const label = cleanText(input.label, 200, 'label', { trim: true });
    const notes = cleanText(input.notes, 20_000, 'notes');
    const durationMs = cleanDuration(input.durationMs);
    const capturedAt = cleanEpoch(input.capturedAt, 'capturedAt');
    const source = oneOf(input.source, AUDIO_SOURCES);
    const integrity = oneOf(input.integrity, AUDIO_INTEGRITY);

    const family = sniffAudio(readHead(stored));
    if (!family) throw new AuthorValidationError('not_audio', 'audio');
    const spec = AUDIO_FAMILIES[family];
    const ext = path.extname(stored).toLowerCase();
    if (!spec.accept.includes(ext)) {
      // Contenu reconnu sous une autre extension : le fichier est rangé sous
      // la bonne (le type servi en dépend), sans toucher à son contenu.
      const renamed = `${path.basename(stored, ext)}${spec.ext}`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- noms UUID générés ici
      fs.renameSync(uploadPath(stored), uploadPath(renamed));
      stored = renamed;
    }
    const sha256 = await sha256File(stored);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- nom UUID généré ici
    const size = fs.statSync(uploadPath(stored)).size;

    let id;
    try {
      db.transaction(() => {
        const position = entity
          ? db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM author_media WHERE entity_id = ? AND kind = 'audio'`).get(entity.id).n
          : 0;
        const info = db.prepare(`
          INSERT INTO author_media (project_id, entity_id, kind, filename, original_name, mime_type, size, sha256,
                                    duration_ms, label, notes, source, integrity, captured_at, client_ref, position)
          VALUES (?, ?, 'audio', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(projectId, entity?.id ?? null, stored, cleanText(file.originalname || '', 255, 'originalName').slice(0, 255),
          spec.mime, size, sha256, durationMs, label, notes, source, integrity, capturedAt, ref, position);
        id = Number(info.lastInsertRowid);
        if (entity) {
          // La première prise d'une idée en devient la référence ; ensuite,
          // seulement sur demande.
          const cur = db.prepare(`SELECT reference_media_id FROM author_sounds WHERE entity_id = ?`).get(entity.id);
          if (!cur?.reference_media_id || input.reference === true || input.reference === '1') {
            db.prepare(`UPDATE author_sounds SET reference_media_id = ? WHERE entity_id = ?`).run(id, entity.id);
          }
          db.prepare(`UPDATE author_entities SET updated_at = ? WHERE id = ?`).run(nowS(), entity.id);
        }
      })();
    } catch (err) {
      // Deux envois simultanés de la même prise : l'index unique a tranché.
      if (ref && String(err?.code || '').startsWith('SQLITE_CONSTRAINT')) {
        const again = audioByClientRef(projectId, ref);
        if (again) { safeUnlink(stored); return { media: again, existed: true }; }
      }
      throw err;
    }
    return { media: getAudio(projectId, id), existed: false };
  } catch (err) {
    safeUnlink(stored);
    throw err;
  }
}

// Nom, notes, durée, rangement (déplacer vers une autre idée, ou détacher) et
// prise de référence. Le fichier n'est jamais modifié.
export function updateAudio(projectId, id, input = {}) {
  const row = audioRow(projectId, id);
  if (!row) return null;
  const sets = [];
  const vals = [];
  if (input.label !== undefined) { sets.push('label = ?'); vals.push(cleanText(input.label, 200, 'label', { trim: true })); }
  if (input.notes !== undefined) { sets.push('notes = ?'); vals.push(cleanText(input.notes, 20_000, 'notes')); }
  if (input.durationMs !== undefined) { sets.push('duration_ms = ?'); vals.push(cleanDuration(input.durationMs)); }
  let target;
  if (input.entityId !== undefined) {
    target = input.entityId === null || input.entityId === '' ? null : soundEntity(projectId, input.entityId);
  }
  db.transaction(() => {
    if (sets.length) db.prepare(`UPDATE author_media SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    if (target !== undefined && (target?.id ?? null) !== row.entity_id) {
      db.prepare(`UPDATE author_sounds SET reference_media_id = NULL WHERE reference_media_id = ?`).run(id);
      const position = target
        ? db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM author_media WHERE entity_id = ? AND kind = 'audio'`).get(target.id).n
        : 0;
      db.prepare(`UPDATE author_media SET entity_id = ?, position = ? WHERE id = ?`).run(target?.id ?? null, position, id);
      if (target) {
        const cur = db.prepare(`SELECT reference_media_id FROM author_sounds WHERE entity_id = ?`).get(target.id);
        if (!cur?.reference_media_id) db.prepare(`UPDATE author_sounds SET reference_media_id = ? WHERE entity_id = ?`).run(id, target.id);
      }
    }
    const entityId = target !== undefined ? (target?.id ?? null) : row.entity_id;
    if (input.reference === true && entityId) {
      db.prepare(`UPDATE author_sounds SET reference_media_id = ? WHERE entity_id = ?`).run(id, entityId);
    } else if (input.reference === false) {
      db.prepare(`UPDATE author_sounds SET reference_media_id = NULL WHERE reference_media_id = ?`).run(id);
    }
  })();
  return getAudio(projectId, id);
}

// ── Repères ─────────────────────────────────────────────────────────────────

function markerFromRow(r) {
  return {
    id: r.id, mediaId: r.media_id, tMs: r.t_ms, endMs: r.end_ms, kind: r.kind,
    label: r.label, note: r.note, clientRef: r.client_ref, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function markerInput(input, { partial, current = null }) {
  const out = {};
  const ms = (v, field) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 86_400_000) throw new AuthorValidationError('invalid_number', field);
    return n;
  };
  if (!partial || input.tMs !== undefined) out.t_ms = ms(input.tMs, 'tMs');
  if (input.endMs !== undefined) out.end_ms = input.endMs === null || input.endMs === '' ? null : ms(input.endMs, 'endMs');
  if (input.kind !== undefined) {
    if (!MARKER_KINDS.includes(input.kind)) throw new AuthorValidationError('invalid_value', 'kind');
    out.kind = input.kind;
  }
  if (input.label !== undefined) out.label = cleanText(input.label, 120, 'label', { trim: true });
  if (input.note !== undefined) out.note = cleanText(input.note, 4000, 'note');
  const start = out.t_ms ?? current?.t_ms;
  const end = out.end_ms !== undefined ? out.end_ms : current?.end_ms ?? null;
  const kind = out.kind ?? current?.kind ?? 'marker';
  if (end !== null && end <= start) throw new AuthorValidationError('invalid_range', 'endMs');
  // Boucle et extraction sont des plages : sans fin, ce ne sont que des points.
  if ((kind === 'loop' || kind === 'extract') && end === null) throw new AuthorValidationError('invalid_range', 'endMs');
  return out;
}

export function listMarkers(projectId, mediaId) {
  if (!audioRow(projectId, mediaId)) return null;
  return db.prepare(`SELECT * FROM author_media_markers WHERE media_id = ? ORDER BY t_ms, id`).all(mediaId).map(markerFromRow);
}

// Création idempotente par référence client (repères posés pendant
// l'enregistrement puis envoyés avec la prise).
export function createMarker(projectId, mediaId, input = {}) {
  if (!audioRow(projectId, mediaId)) return null;
  const ref = cleanClientRef(input.clientRef);
  const byRef = () => db.prepare(`SELECT * FROM author_media_markers WHERE media_id = ? AND client_ref = ?`).get(mediaId, ref);
  if (ref) {
    const found = byRef();
    if (found) return { marker: markerFromRow(found), existed: true };
  }
  const f = markerInput(input, { partial: false });
  const n = db.prepare(`SELECT COUNT(*) AS n FROM author_media_markers WHERE media_id = ?`).get(mediaId).n;
  if (n >= MARKERS_MAX_PER_MEDIA) throw new AuthorValidationError('too_many_markers', 'markers');
  try {
    const info = db.prepare(`
      INSERT INTO author_media_markers (project_id, media_id, t_ms, end_ms, kind, label, note, client_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, mediaId, f.t_ms, f.end_ms ?? null, f.kind || 'marker', f.label || '', f.note || '', ref);
    return { marker: markerFromRow(db.prepare(`SELECT * FROM author_media_markers WHERE id = ?`).get(info.lastInsertRowid)), existed: false };
  } catch (err) {
    if (ref && String(err?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      const again = byRef();
      if (again) return { marker: markerFromRow(again), existed: true };
    }
    throw err;
  }
}

export function updateMarker(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_media_markers WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  const f = markerInput(input, { partial: true, current: row });
  const cols = Object.keys(f);
  if (cols.length) {
    db.prepare(`UPDATE author_media_markers SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...cols.map((c) => f[c]), nowS(), id);
  }
  return markerFromRow(db.prepare(`SELECT * FROM author_media_markers WHERE id = ?`).get(id));
}

export function deleteMarker(projectId, id) {
  return db.prepare(`DELETE FROM author_media_markers WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

// Un nom de fichier lisible pour le téléchargement d'une prise.
export function downloadName(row) {
  const ext = path.extname(row.filename);
  const base = String(row.label || row.original_name.replace(/\.[^.]+$/, '') || `prise-${row.id}`)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 80) || `prise-${row.id}`;
  return `${base}${ext}`;
}


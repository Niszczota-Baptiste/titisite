import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
// eslint-disable-next-line security/detect-non-literal-fs-filename -- UPLOADS_DIR comes from env/default, not user input
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Per-route caps ──────────────────────────────────────────────────────────
// Documents / audio are bounded; builds keep the historical 1 GB cap because
// game packages legitimately need it (overridable via env).
export const DOC_MAX_BYTES   = Number(process.env.DOC_MAX_BYTES   || 50 * 1024 * 1024);
export const AUDIO_MAX_BYTES = Number(process.env.AUDIO_MAX_BYTES || 100 * 1024 * 1024);
export const BUILD_MAX_BYTES = Number(process.env.BUILD_MAX_BYTES || 1024 * 1024 * 1024);
// Kept for backwards compatibility with the earlier README env name
export const MAX_UPLOAD_BYTES = BUILD_MAX_BYTES;

// ── MIME + extension allowlists ─────────────────────────────────────────────
// Both must match — MIME alone is browser-supplied and trivially spoofable.
export const ALLOWED_DOCUMENT = {
  mime: new Set([
    'application/pdf',
    'application/zip', 'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'text/plain', 'text/markdown', 'text/csv',
    'application/json',
  ]),
  ext: new Set([
    '.pdf', '.zip',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.txt', '.md', '.csv', '.json',
  ]),
};

export const ALLOWED_AUDIO = {
  mime: new Set([
    'audio/mpeg', 'audio/mp3',
    'audio/ogg', 'audio/vorbis',
    'audio/wav', 'audio/x-wav', 'audio/wave',
    'audio/flac', 'audio/x-flac',
    'audio/mp4', 'audio/aac', 'audio/x-m4a',
  ]),
  ext: new Set(['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac']),
};

// Builds: archives + native packages. Scripts/HTML/PHP are explicitly *not*
// allowed even though they could be uploaded as text/plain — extension
// allowlist blocks them.
export const ALLOWED_BUILD = {
  mime: new Set([
    'application/zip', 'application/x-zip-compressed',
    'application/x-7z-compressed',
    'application/x-tar', 'application/gzip', 'application/x-gzip',
    'application/x-rar-compressed', 'application/vnd.rar',
    'application/vnd.android.package-archive', // .apk
    'application/x-msdownload',                 // .exe
    'application/x-apple-diskimage',            // .dmg
    'application/x-iso9660-image',              // .iso
    'application/octet-stream',                 // many native binaries
  ]),
  ext: new Set([
    '.zip', '.7z', '.tar', '.tar.gz', '.tgz', '.gz', '.rar',
    '.apk', '.exe', '.dmg', '.iso', '.bin', '.pak', '.app',
    '.love', // LÖVE2D
  ]),
};

// ── Filename / path safety ──────────────────────────────────────────────────
// Persist the file under a UUID + sanitized extension; the original name is
// kept in the DB only for the Content-Disposition on download.
function sanitizedExt(originalName) {
  const ext = (path.extname(originalName || '').toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
  return ext;
}

function makeStorage() {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      cb(null, `${crypto.randomUUID()}${sanitizedExt(file.originalname)}`);
    },
  });
}

function makeFilter(allowed) {
  return (_req, file, cb) => {
    const ext = sanitizedExt(file.originalname);
    if (!allowed.ext.has(ext)) {
      const err = new Error('extension_not_allowed');
      err.code = 'EXTENSION_NOT_ALLOWED';
      err.allowed = [...allowed.ext];
      return cb(err);
    }
    if (!allowed.mime.has(file.mimetype)) {
      const err = new Error('mime_not_allowed');
      err.code = 'MIME_NOT_ALLOWED';
      err.allowed = [...allowed.mime];
      return cb(err);
    }
    cb(null, true);
  };
}

function makeUploader(allowed, maxBytes) {
  return multer({
    storage: makeStorage(),
    fileFilter: makeFilter(allowed),
    limits: { fileSize: maxBytes, files: 1, fields: 16 },
  });
}

export const uploadDocument = makeUploader(ALLOWED_DOCUMENT, DOC_MAX_BYTES);
export const uploadAudio    = makeUploader(ALLOWED_AUDIO,    AUDIO_MAX_BYTES);
export const uploadBuild    = makeUploader(ALLOWED_BUILD,    BUILD_MAX_BYTES);

export function uploadPath(filename) {
  return path.join(UPLOADS_DIR, filename);
}

export function safeUnlink(filename) {
  if (!filename) return;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filename is a UUID from DB, not user-controlled path
  fs.unlink(uploadPath(filename), () => {});
}

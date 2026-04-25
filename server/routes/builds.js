import { Router } from 'express';
import fs from 'node:fs';
import { db } from '../db.js';
import { safeUnlink, uploadBuild, uploadPath } from '../uploads.js';

export const buildsRouter = Router({ mergeParams: true });

const SELECT = `
  SELECT b.*, u.name AS uploaded_by_name
  FROM builds b
  LEFT JOIN users u ON u.id = b.uploaded_by
`;

// Returns the normalized URL string, or `null` if the input is absent/blank,
// or `false` if it's malformed or has a non-http(s) scheme. We refuse anything
// other than http/https because this URL is rendered as a clickable link and
// `javascript:` / `data:` would be an XSS / phishing vector.
function normalizeExternalUrl(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return false;
  let parsed;
  try { parsed = new URL(trimmed); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return parsed.toString();
}

function rowToBuild(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
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

buildsRouter.get('/', (req, res) => {
  const rows = db.prepare(`${SELECT} WHERE b.workspace_id = ? ORDER BY b.released_at DESC`)
    .all(req.workspace.id);
  res.json(rows.map(rowToBuild));
});

buildsRouter.post('/', uploadBuild.single('file'), (req, res) => {
  const { version, title, status, externalUrl, notes } = req.body || {};
  if (!version) return res.status(400).json({ error: 'missing_version' });
  if (!req.file && !externalUrl) {
    return res.status(400).json({ error: 'file_or_url_required' });
  }
  const f = req.file || null;
  const url = f ? null : normalizeExternalUrl(externalUrl);
  if (url === false) return res.status(400).json({ error: 'invalid_external_url' });
  const result = db.prepare(`
    INSERT INTO builds
      (workspace_id, version, title, status, filename, original_name, mime_type, size, external_url, notes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    version.trim(),
    (title || '').trim(),
    ['alpha', 'beta', 'release'].includes(status) ? status : 'alpha',
    f?.filename || null,
    f?.originalname || null,
    f?.mimetype || null,
    f?.size || null,
    url,
    (notes || '').trim(),
    req.user.id,
  );
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToBuild(row));
});

buildsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM builds WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { version, title, status, externalUrl, notes } = req.body || {};
  let urlUpdate = undefined;
  if (externalUrl !== undefined) {
    urlUpdate = normalizeExternalUrl(externalUrl);
    if (urlUpdate === false) return res.status(400).json({ error: 'invalid_external_url' });
  }
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
    urlUpdate ?? null,
    notes ?? null,
    id,
  );
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(id);
  res.json(rowToBuild(row));
});

buildsRouter.get('/:id/download', (req, res) => {
  const row = db.prepare(`SELECT * FROM builds WHERE id = ? AND workspace_id = ?`)
    .get(Number(req.params.id), req.workspace.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (!row.filename) return res.status(404).json({ error: 'no_file' });
  const p = uploadPath(row.filename);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'file_missing' });
  res.download(p, row.original_name);
});

buildsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT filename FROM builds WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM builds WHERE id = ?`).run(id);
  safeUnlink(row.filename);
  res.status(204).end();
});

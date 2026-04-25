import { Router } from 'express';
import fs from 'node:fs';
import { db } from '../db.js';
import { safeUnlink, uploadDocument, uploadPath } from '../uploads.js';

export const documentsRouter = Router({ mergeParams: true });

function rowToDoc(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    originalName: r.original_name,
    mimeType: r.mime_type,
    size: r.size,
    notes: r.notes,
    uploadedBy: r.uploaded_by,
    uploadedByName: r.uploaded_by_name,
    createdAt: r.created_at,
  };
}

const SELECT = `
  SELECT d.*, u.name AS uploaded_by_name
  FROM documents d
  LEFT JOIN users u ON u.id = d.uploaded_by
`;

documentsRouter.get('/', (req, res) => {
  const rows = db.prepare(`${SELECT} WHERE d.workspace_id = ? ORDER BY d.created_at DESC`)
    .all(req.workspace.id);
  res.json(rows.map(rowToDoc));
});

documentsRouter.post('/', uploadDocument.single('file'), (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'missing_file' });
  const title = (req.body.title || f.originalname || '').trim() || 'Sans titre';
  const notes = (req.body.notes || '').trim();
  const result = db.prepare(`
    INSERT INTO documents (workspace_id, title, filename, original_name, mime_type, size, notes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.workspace.id, title, f.filename, f.originalname, f.mimetype, f.size, notes, req.user.id);
  const row = db.prepare(`${SELECT} WHERE d.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToDoc(row));
});

documentsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM documents WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { title, notes } = req.body || {};
  db.prepare(`
    UPDATE documents SET
      title = COALESCE(?, title),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(title ?? null, notes ?? null, id);
  const row = db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
  res.json(rowToDoc(row));
});

documentsRouter.get('/:id/download', (req, res) => {
  const row = db.prepare(`SELECT * FROM documents WHERE id = ? AND workspace_id = ?`)
    .get(Number(req.params.id), req.workspace.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const p = uploadPath(row.filename);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'file_missing' });
  res.download(p, row.original_name);
});

documentsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT filename FROM documents WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM comments WHERE target_type = 'document' AND target_id = ?`).run(id);
  safeUnlink(row.filename);
  res.status(204).end();
});

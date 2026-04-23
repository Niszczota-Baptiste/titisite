import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

export const meetingsRouter = Router();

const PROJECT = requireRole('admin', 'member');

const SELECT = `
  SELECT m.*, u.name AS created_by_name
  FROM meetings m
  LEFT JOIN users u ON u.id = m.created_by
`;

function getDocumentsFor(targetType, targetId) {
  return db.prepare(`
    SELECT d.id, d.title, d.original_name AS originalName, d.mime_type AS mimeType, d.size
    FROM attachments a
    INNER JOIN documents d ON d.id = a.document_id
    WHERE a.target_type = ? AND a.target_id = ?
    ORDER BY a.created_at ASC
  `).all(targetType, targetId);
}

function syncAttachments(targetType, targetId, documentIds) {
  if (!Array.isArray(documentIds)) return;
  const ids = [...new Set(documentIds.map(Number).filter(Number.isFinite))];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM attachments WHERE target_type = ? AND target_id = ?`).run(targetType, targetId);
    const ins = db.prepare(`INSERT OR IGNORE INTO attachments (target_type, target_id, document_id) VALUES (?, ?, ?)`);
    for (const docId of ids) {
      const exists = db.prepare(`SELECT 1 FROM documents WHERE id = ?`).get(docId);
      if (exists) ins.run(targetType, targetId, docId);
    }
  });
  tx();
}

function rowToMeeting(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    documents: getDocumentsFor('meeting', r.id),
  };
}

function parseTs(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? Math.floor(n / 1000) : null;
}

meetingsRouter.get('/', requireAuth, PROJECT, (_req, res) => {
  const rows = db.prepare(`${SELECT} ORDER BY m.starts_at DESC`).all();
  res.json(rows.map(rowToMeeting));
});

meetingsRouter.post('/', requireAuth, PROJECT, (req, res) => {
  const { title, description, startsAt, endsAt, documentIds } = req.body || {};
  if (!title) return res.status(400).json({ error: 'missing_title' });
  const start = parseTs(startsAt);
  if (start === null) return res.status(400).json({ error: 'invalid_starts_at' });
  const end = parseTs(endsAt);
  const result = db
    .prepare(`
      INSERT INTO meetings (title, description, starts_at, ends_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(title.trim(), (description || '').trim(), start, end, req.user.id);
  if (Array.isArray(documentIds)) syncAttachments('meeting', result.lastInsertRowid, documentIds);
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToMeeting(row));
});

meetingsRouter.put('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { title, description, startsAt, endsAt, documentIds } = req.body || {};
  const start = startsAt !== undefined ? parseTs(startsAt) : existing.starts_at;
  if (start === null) return res.status(400).json({ error: 'invalid_starts_at' });
  const end = endsAt !== undefined ? parseTs(endsAt) : existing.ends_at;
  db.prepare(`
    UPDATE meetings SET
      title       = COALESCE(?, title),
      description = COALESCE(?, description),
      starts_at   = ?,
      ends_at     = ?
    WHERE id = ?
  `).run(title ?? null, description ?? null, start, end, id);
  if (Array.isArray(documentIds)) syncAttachments('meeting', id, documentIds);
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id);
  res.json(rowToMeeting(row));
});

meetingsRouter.delete('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare(`DELETE FROM meetings WHERE id = ?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM attachments WHERE target_type = 'meeting' AND target_id = ?`).run(id);
  res.status(204).end();
});

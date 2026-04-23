import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

export const commentsRouter = Router();

const PROJECT = requireRole('admin', 'member');
const TARGETS = ['document', 'feature', 'discussion'];

const SELECT = `
  SELECT c.*, u.name AS author_name, u.email AS author_email, u.role AS author_role
  FROM comments c
  LEFT JOIN users u ON u.id = c.author_id
`;

function rowToComment(r) {
  if (!r) return null;
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    authorId: r.author_id,
    authorName: r.author_name,
    authorEmail: r.author_email,
    authorRole: r.author_role,
    body: r.body,
    createdAt: r.created_at,
  };
}

commentsRouter.get('/', requireAuth, PROJECT, (req, res) => {
  const { target_type, target_id } = req.query;
  if (!TARGETS.includes(target_type)) return res.status(400).json({ error: 'invalid_target_type' });
  const rows = db
    .prepare(`${SELECT} WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.created_at ASC`)
    .all(target_type, Number(target_id ?? 0));
  res.json(rows.map(rowToComment));
});

commentsRouter.post('/', requireAuth, PROJECT, (req, res) => {
  const { targetType, targetId, body } = req.body || {};
  if (!TARGETS.includes(targetType)) return res.status(400).json({ error: 'invalid_target_type' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'missing_body' });
  const result = db
    .prepare(`INSERT INTO comments (target_type, target_id, author_id, body) VALUES (?, ?, ?, ?)`)
    .run(targetType, Number(targetId ?? 0), req.user.id, body.trim());
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToComment(row));
});

commentsRouter.delete('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT author_id FROM comments WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  // Author can delete own; admin can delete anyone's
  if (row.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  db.prepare(`DELETE FROM comments WHERE id = ?`).run(id);
  res.status(204).end();
});

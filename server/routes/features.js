import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

export const featuresRouter = Router();

const PROJECT = requireRole('admin', 'member');
const STATUSES = ['backlog', 'todo', 'doing', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

const SELECT = `
  SELECT f.*,
         a.name AS assignee_name,
         c.name AS created_by_name,
         (SELECT COUNT(*) FROM comments WHERE target_type = 'feature' AND target_id = f.id) AS comments_count
  FROM features f
  LEFT JOIN users a ON a.id = f.assignee_id
  LEFT JOIN users c ON c.id = f.created_by
`;

function rowToFeature(r) {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    position: r.position,
    commentsCount: r.comments_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

featuresRouter.get('/', requireAuth, PROJECT, (_req, res) => {
  const rows = db.prepare(`${SELECT} ORDER BY f.status, f.position, f.id`).all();
  res.json(rows.map(rowToFeature));
});

featuresRouter.post('/', requireAuth, PROJECT, (req, res) => {
  const { title, description, status, priority, assigneeId } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'missing_title' });
  const st = STATUSES.includes(status) ? status : 'backlog';
  const pr = PRIORITIES.includes(priority) ? priority : 'medium';
  const pos = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM features WHERE status = ?`).get(st).n;
  const result = db
    .prepare(`
      INSERT INTO features (title, description, status, priority, assignee_id, created_by, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(title.trim(), (description || '').trim(), st, pr, assigneeId || null, req.user.id, pos);
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToFeature(row));
});

featuresRouter.put('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { title, description, status, priority, assigneeId, position } = req.body || {};
  const newStatus = STATUSES.includes(status) ? status : existing.status;
  const movedColumn = newStatus !== existing.status;
  const newPos = movedColumn
    ? (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM features WHERE status = ?`).get(newStatus).n)
    : (position ?? existing.position);

  db.prepare(`
    UPDATE features SET
      title       = COALESCE(?, title),
      description = COALESCE(?, description),
      status      = ?,
      priority    = ?,
      assignee_id = ?,
      position    = ?,
      updated_at  = strftime('%s','now')
    WHERE id = ?
  `).run(
    title ?? null,
    description ?? null,
    newStatus,
    PRIORITIES.includes(priority) ? priority : existing.priority,
    assigneeId === null ? null : (assigneeId ?? existing.assignee_id),
    newPos,
    id,
  );
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(id);
  res.json(rowToFeature(row));
});

featuresRouter.delete('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare(`DELETE FROM features WHERE id = ?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM comments WHERE target_type = 'feature' AND target_id = ?`).run(id);
  res.status(204).end();
});

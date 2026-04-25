import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { isMember } from '../workspaces.js';

export const commentsRouter = Router();

// Per-user (or IP fallback) cap to prevent comment spam
const commentLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `comment_${req.user?.id ?? req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

const PROJECT = requireRole('admin', 'member');
const TARGETS = ['document', 'feature', 'discussion'];

const SELECT = `
  SELECT c.*, u.name AS author_name, u.email AS author_email, u.role AS author_role
  FROM comments c
  LEFT JOIN users u ON u.id = c.author_id
`;

function rowToComment(r, viewer) {
  if (!r) return null;
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    authorId: r.author_id,
    authorName: r.author_name,
    // Only admins see the author's email — to members it's PII leakage.
    authorEmail: viewer?.role === 'admin' ? r.author_email : undefined,
    authorRole: r.author_role,
    body: r.body,
    createdAt: r.created_at,
  };
}

// Workspace-scoped targets (features, documents) must check that the viewer
// is a member of the owning workspace; otherwise a member of project A could
// read or post in project B's threads by guessing IDs. 'discussion' is the
// global team chat (targetId=0) and stays visible to every authenticated
// admin/member by design.
function canAccessTarget(user, targetType, targetId) {
  if (user.role === 'admin') return true;
  if (targetType === 'discussion') return true;
  let workspaceId;
  if (targetType === 'feature') {
    workspaceId = db.prepare(`SELECT workspace_id FROM features WHERE id = ?`).get(targetId)?.workspace_id;
  } else if (targetType === 'document') {
    workspaceId = db.prepare(`SELECT workspace_id FROM documents WHERE id = ?`).get(targetId)?.workspace_id;
  }
  if (!workspaceId) return false;
  return isMember(workspaceId, user.id);
}

commentsRouter.get('/', requireAuth, PROJECT, (req, res) => {
  const { target_type, target_id } = req.query;
  if (!TARGETS.includes(target_type)) return res.status(400).json({ error: 'invalid_target_type' });
  const tid = Number(target_id ?? 0);
  if (!canAccessTarget(req.user, target_type, tid)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const rows = db
    .prepare(`${SELECT} WHERE c.target_type = ? AND c.target_id = ? ORDER BY c.created_at ASC`)
    .all(target_type, tid);
  res.json(rows.map((r) => rowToComment(r, req.user)));
});

commentsRouter.post('/', requireAuth, PROJECT, commentLimiter, (req, res) => {
  const { targetType, targetId, body } = req.body || {};
  if (!TARGETS.includes(targetType)) return res.status(400).json({ error: 'invalid_target_type' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'missing_body' });
  const tid = Number(targetId ?? 0);
  if (!canAccessTarget(req.user, targetType, tid)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const result = db
    .prepare(`INSERT INTO comments (target_type, target_id, author_id, body) VALUES (?, ?, ?, ?)`)
    .run(targetType, tid, req.user.id, body.trim());
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToComment(row, req.user));
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

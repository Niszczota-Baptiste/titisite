import { Router } from 'express';
import { db } from '../db.js';

// Mounted at /api/workspaces/:slug/activity-count behind resolveWorkspace.
// Counts what changed in the workspace since the member's last visit
// (workspace_members.last_seen_at). Admins who are not members of the
// workspace have no liaison row: they get zero counts and `seen` is a no-op
// (we never insert a membership behind the scenes).
export const activityRouter = Router({ mergeParams: true });

function lastSeenOf(wsId, userId) {
  return db.prepare(
    `SELECT last_seen_at FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
  ).get(wsId, userId);
}

activityRouter.get('/', (req, res) => {
  const wsId = req.workspace.id;
  const row = lastSeenOf(wsId, req.user.id);
  if (!row) {
    return res.json({ features: 0, comments: 0, documents: 0, total: 0, lastSeenAt: null });
  }
  // First visit ever: everything is "new" would be noisy — count nothing.
  const since = row.last_seen_at;
  if (!since) {
    return res.json({ features: 0, comments: 0, documents: 0, total: 0, lastSeenAt: null });
  }

  const features = db.prepare(
    `SELECT COUNT(*) AS n FROM features WHERE workspace_id = ? AND updated_at > ?`,
  ).get(wsId, since).n;

  // Comments on the workspace's features/documents, excluding the member's own.
  const comments = db.prepare(
    `SELECT COUNT(*) AS n FROM comments c
     WHERE c.created_at > ?
       AND (c.author_id IS NULL OR c.author_id != ?)
       AND (
         (c.target_type = 'feature'  AND c.target_id IN (SELECT id FROM features  WHERE workspace_id = ?))
         OR
         (c.target_type = 'document' AND c.target_id IN (SELECT id FROM documents WHERE workspace_id = ?))
       )`,
  ).get(since, req.user.id, wsId, wsId).n;

  const documents = db.prepare(
    `SELECT COUNT(*) AS n FROM documents WHERE workspace_id = ? AND created_at > ?`,
  ).get(wsId, since).n;

  res.json({
    features,
    comments,
    documents,
    total: features + comments + documents,
    lastSeenAt: since,
  });
});

activityRouter.post('/seen', (req, res) => {
  db.prepare(
    `UPDATE workspace_members SET last_seen_at = strftime('%s','now')
     WHERE workspace_id = ? AND user_id = ?`,
  ).run(req.workspace.id, req.user.id);
  res.json({ ok: true });
});

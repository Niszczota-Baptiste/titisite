import { Router } from 'express';
import { db } from '../db.js';

// Mounted at /api/workspaces/:slug/summary behind resolveWorkspace, so we
// always have req.workspace.id here.
//
// Returns the data the Overview tab used to fetch via 4 separate calls
// (features + meetings + builds + documents). One round-trip, only the
// fields the UI actually renders.
export const summaryRouter = Router({ mergeParams: true });

summaryRouter.get('/', (req, res) => {
  const wsId = req.workspace.id;
  const now = Math.floor(Date.now() / 1000);

  // Status counts in a single GROUP BY
  const countRows = db.prepare(`
    SELECT status, COUNT(*) AS n
    FROM features
    WHERE workspace_id = ?
    GROUP BY status
  `).all(wsId);
  const counts = { backlog: 0, todo: 0, doing: 0, done: 0 };
  for (const r of countRows) if (r.status in counts) counts[r.status] = r.n;
  const total = counts.backlog + counts.todo + counts.doing + counts.done;
  const donePct = total ? Math.round((counts.done / total) * 100) : 0;

  const overdue = db.prepare(`
    SELECT COUNT(*) AS n
    FROM features
    WHERE workspace_id = ? AND due_date IS NOT NULL AND due_date < ? AND status != 'done'
  `).get(wsId, now).n;

  const upcoming = db.prepare(`
    SELECT id, title, starts_at AS startsAt, ends_at AS endsAt
    FROM meetings
    WHERE workspace_id = ? AND starts_at >= ?
    ORDER BY starts_at ASC
    LIMIT 3
  `).all(wsId, now);

  const recentBuilds = db.prepare(`
    SELECT id, version, title, status, released_at AS releasedAt
    FROM builds
    WHERE workspace_id = ?
    ORDER BY released_at DESC
    LIMIT 3
  `).all(wsId);

  const recentDocs = db.prepare(`
    SELECT d.id, d.title, d.created_at AS createdAt,
           u.name AS uploadedByName
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.workspace_id = ?
    ORDER BY d.created_at DESC
    LIMIT 3
  `).all(wsId);

  res.json({
    counts,
    total,
    donePct,
    overdue,
    upcoming,
    recentBuilds,
    recentDocs,
  });
});

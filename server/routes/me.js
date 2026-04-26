import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { ensureIcalToken, rotateIcalToken } from '../users.js';

export const meRouter = Router();

// Canonical origin is configured via env to prevent Host-header injection in
// generated iCal URLs. Falls back to the request's own protocol+host in dev.
function canonicalBase(req) {
  return process.env.CANONICAL_ORIGIN
    || ((req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host'));
}

meRouter.get('/ical-token', requireAuth, requireRole('admin', 'member'), (req, res) => {
  const token = ensureIcalToken(req.user.id);
  const base = canonicalBase(req);
  const host = new URL(base).host;
  res.json({
    token,
    httpUrl: `${base}/api/calendar/${token}.ics`,
    webcalUrl: `webcal://${host}/api/calendar/${token}.ics`,
    downloadUrl: `${base}/api/calendar/${token}.ics?download=1`,
  });
});

meRouter.post('/ical-token/rotate', requireAuth, requireRole('admin', 'member'), (req, res) => {
  const token = rotateIcalToken(req.user.id);
  const base = canonicalBase(req);
  const host = new URL(base).host;
  res.json({
    token,
    httpUrl: `${base}/api/calendar/${token}.ics`,
    webcalUrl: `webcal://${host}/api/calendar/${token}.ics`,
    downloadUrl: `${base}/api/calendar/${token}.ics?download=1`,
  });
});

/**
 * Returns meetings + upcoming/overdue feature due dates across all workspaces
 * the current user has access to. Optionally filtered by [from, to] (unix
 * seconds). Admin sees everything.
 */
meRouter.get('/events', requireAuth, requireRole('admin', 'member'), (req, res) => {
  const from = Number.isFinite(Number(req.query.from)) ? Number(req.query.from) : null;
  const to   = Number.isFinite(Number(req.query.to))   ? Number(req.query.to)   : null;

  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  // Workspaces accessible to the user
  const wsRows = isAdmin
    ? db.prepare(`SELECT id, slug, name, color, icon FROM workspaces WHERE status = 'active'`).all()
    : db.prepare(`
        SELECT w.id, w.slug, w.name, w.color, w.icon
        FROM workspaces w
        INNER JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = ? AND w.status = 'active'
      `).all(userId);

  if (wsRows.length === 0) return res.json([]);
  const wsIds = wsRows.map((w) => w.id);
  const wsById = new Map(wsRows.map((w) => [w.id, w]));
  const placeholders = wsIds.map(() => '?').join(',');

  const rangeSql = (col) => {
    const conds = [];
    const params = [];
    if (from !== null) { conds.push(`${col} >= ?`); params.push(from); }
    if (to   !== null) { conds.push(`${col} <= ?`); params.push(to); }
    return { sql: conds.length ? ` AND ${conds.join(' AND ')}` : '', params };
  };

  const mRange = rangeSql('m.starts_at');
  const meetings = db.prepare(`
    SELECT m.id, m.workspace_id, m.title, m.starts_at, m.ends_at
    FROM meetings m
    WHERE m.workspace_id IN (${placeholders}) ${mRange.sql}
    ORDER BY m.starts_at ASC
  `).all(...wsIds, ...mRange.params);

  const fRange = rangeSql('f.due_date');
  const features = db.prepare(`
    SELECT f.id, f.workspace_id, f.title, f.due_date, f.status, f.priority
    FROM features f
    WHERE f.workspace_id IN (${placeholders}) AND f.due_date IS NOT NULL ${fRange.sql}
    ORDER BY f.due_date ASC
  `).all(...wsIds, ...fRange.params);

  const decorate = (ws) => ({
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
    workspaceName: ws.name,
    workspaceColor: ws.color,
    workspaceIcon: ws.icon,
  });

  const events = [];
  for (const m of meetings) {
    events.push({
      kind: 'meeting',
      id: m.id,
      title: m.title,
      ts: m.starts_at,
      endsAt: m.ends_at,
      ...decorate(wsById.get(m.workspace_id)),
    });
  }
  for (const f of features) {
    events.push({
      kind: 'feature',
      id: f.id,
      title: f.title,
      ts: f.due_date,
      status: f.status,
      priority: f.priority,
      ...decorate(wsById.get(f.workspace_id)),
    });
  }
  events.sort((a, b) => a.ts - b.ts);
  res.json(events);
});

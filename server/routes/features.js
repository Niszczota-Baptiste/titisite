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

function parseTags(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map(String).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const t of input) {
    const v = String(t || '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

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
    const ins = db.prepare(`
      INSERT OR IGNORE INTO attachments (target_type, target_id, document_id) VALUES (?, ?, ?)
    `);
    for (const docId of ids) {
      const exists = db.prepare(`SELECT 1 FROM documents WHERE id = ?`).get(docId);
      if (exists) ins.run(targetType, targetId, docId);
    }
  });
  tx();
}

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
    dueDate: r.due_date,
    tags: parseTags(r.tags),
    commentsCount: r.comments_count,
    documents: getDocumentsFor('feature', r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseDue(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? Math.floor(n / 1000) : null;
}

featuresRouter.get('/', requireAuth, PROJECT, (_req, res) => {
  const rows = db.prepare(`${SELECT} ORDER BY f.status, f.position, f.id`).all();
  res.json(rows.map(rowToFeature));
});

featuresRouter.post('/', requireAuth, PROJECT, (req, res) => {
  const { title, description, status, priority, assigneeId, dueDate, tags, documentIds } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'missing_title' });
  const st = STATUSES.includes(status) ? status : 'backlog';
  const pr = PRIORITIES.includes(priority) ? priority : 'medium';
  const pos = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM features WHERE status = ?`).get(st).n;
  const due = parseDue(dueDate);
  const tagList = normalizeTags(tags) || [];

  const result = db
    .prepare(`
      INSERT INTO features (title, description, status, priority, assignee_id, created_by, position, due_date, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      title.trim(),
      (description || '').trim(),
      st, pr,
      assigneeId || null,
      req.user.id,
      pos,
      due === undefined ? null : due,
      JSON.stringify(tagList),
    );
  if (Array.isArray(documentIds)) syncAttachments('feature', result.lastInsertRowid, documentIds);
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToFeature(row));
});

featuresRouter.put('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { title, description, status, priority, assigneeId, position, dueDate, tags, documentIds } = req.body || {};
  const newStatus = STATUSES.includes(status) ? status : existing.status;
  const movedColumn = newStatus !== existing.status;
  const newPos = movedColumn
    ? (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM features WHERE status = ?`).get(newStatus).n)
    : (position ?? existing.position);

  const due = parseDue(dueDate);
  const normalized = normalizeTags(tags);

  db.prepare(`
    UPDATE features SET
      title       = COALESCE(?, title),
      description = COALESCE(?, description),
      status      = ?,
      priority    = ?,
      assignee_id = ?,
      position    = ?,
      due_date    = ?,
      tags        = COALESCE(?, tags),
      updated_at  = strftime('%s','now')
    WHERE id = ?
  `).run(
    title ?? null,
    description ?? null,
    newStatus,
    PRIORITIES.includes(priority) ? priority : existing.priority,
    assigneeId === null ? null : (assigneeId ?? existing.assignee_id),
    newPos,
    due === undefined ? existing.due_date : due,
    normalized ? JSON.stringify(normalized) : null,
    id,
  );
  if (Array.isArray(documentIds)) syncAttachments('feature', id, documentIds);
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(id);
  res.json(rowToFeature(row));
});

featuresRouter.delete('/:id', requireAuth, PROJECT, (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare(`DELETE FROM features WHERE id = ?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  db.prepare(`DELETE FROM comments WHERE target_type = 'feature' AND target_id = ?`).run(id);
  db.prepare(`DELETE FROM attachments WHERE target_type = 'feature' AND target_id = ?`).run(id);
  res.status(204).end();
});

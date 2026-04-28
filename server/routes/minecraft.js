import { Router } from 'express';
import { db } from '../db.js';

// Mounted under /api/workspaces/:slug/minecraft with mergeParams; resolveWorkspace
// has already populated req.workspace.
export const minecraftRouter = Router({ mergeParams: true });

function rowToResource(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    quantity: r.quantity,
    notes: r.notes,
    position: r.position,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT = `
  SELECT m.*, u.name AS created_by_name
  FROM minecraft_resources m
  LEFT JOIN users u ON u.id = m.created_by
`;

function ensureMinecraftWorkspace(req, res) {
  if (!req.workspace?.isMinecraft) {
    res.status(404).json({ error: 'minecraft_disabled' });
    return false;
  }
  return true;
}

minecraftRouter.get('/', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const rows = db.prepare(`${SELECT} WHERE m.workspace_id = ? ORDER BY m.position, m.id`)
    .all(req.workspace.id);
  res.json(rows.map(rowToResource));
});

minecraftRouter.post('/', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, quantity, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const qty = Number.isFinite(Number(quantity)) ? Math.max(0, Math.floor(Number(quantity))) : 0;
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_resources WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;

  const result = db.prepare(`
    INSERT INTO minecraft_resources
      (workspace_id, name, quantity, notes, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    String(name).trim(),
    qty,
    String(notes || '').trim(),
    pos,
    req.user.id,
  );
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToResource(row));
});

minecraftRouter.put('/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM minecraft_resources WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { name, quantity, notes } = req.body || {};
  const qty = quantity === undefined
    ? existing.quantity
    : Math.max(0, Math.floor(Number(quantity) || 0));

  db.prepare(`
    UPDATE minecraft_resources SET
      name       = COALESCE(?, name),
      quantity   = ?,
      notes      = COALESCE(?, notes),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    qty,
    notes === undefined ? null : String(notes).trim(),
    id,
  );
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id);
  res.json(rowToResource(row));
});

minecraftRouter.post('/:id/adjust', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const { delta } = req.body || {};
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return res.status(400).json({ error: 'invalid_delta' });
  const existing = db.prepare(`SELECT * FROM minecraft_resources WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const next = Math.max(0, existing.quantity + Math.floor(d));
  db.prepare(`
    UPDATE minecraft_resources SET quantity = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(next, id);
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id);
  res.json(rowToResource(row));
});

minecraftRouter.delete('/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const r = db.prepare(`DELETE FROM minecraft_resources WHERE id = ? AND workspace_id = ?`)
    .run(id, req.workspace.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

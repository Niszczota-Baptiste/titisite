import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { isMember } from '../workspaces.js';

// Réglages PERSO du cockpit MF, sous /api/me/cockpit (cookie de session).
// Chaque utilisateur ne voit et ne modifie que SES données — l'id utilisateur
// vient toujours de la session, jamais du client. Accès : admin, ou membre
// ayant can_view_quests / can_edit_quests (mêmes flags que /quetes).
export const cockpitMeRouter = Router();

function requireQuestView(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin') return next();
  if (req.user.can_view_quests === 1 || req.user.can_edit_quests === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

cockpitMeRouter.use(requireAuth, requireQuestView);

// ── Items perso (section `wanted` du flux) ─────────────────────────────────

function rowToItem(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    quantity: r.quantity,
    priority: r.priority,
    note: r.note || '',
    workspaceId: r.workspace_id ?? null,
    workspaceName: r.workspace_name ?? null,
    x: r.x, y: r.y, z: r.z,
    done: r.done === 1,
    doneAt: r.done_at,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const ITEM_SELECT = `
  SELECT i.*, w.name AS workspace_name
  FROM cockpit_items i
  LEFT JOIN workspaces w ON w.id = i.workspace_id
`;

const parsePriority = (v, fallback = 2) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : fallback;
};

const parseCoord = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

// Un item ne peut être rattaché qu'à un workspace visible par l'utilisateur.
function resolveWorkspaceId(user, workspaceId) {
  if (workspaceId === undefined || workspaceId === null || workspaceId === '') return null;
  const id = Number(workspaceId);
  if (!Number.isFinite(id)) return null;
  const ws = db.prepare(`SELECT id FROM workspaces WHERE id = ?`).get(id);
  if (!ws) return null;
  if (user.role !== 'admin' && !isMember(id, user.id)) return null;
  return id;
}

function getOwnItem(userId, id) {
  return db.prepare(`SELECT * FROM cockpit_items WHERE id = ? AND user_id = ?`).get(id, userId);
}

cockpitMeRouter.get('/items', (req, res) => {
  const rows = db.prepare(`${ITEM_SELECT} WHERE i.user_id = ? ORDER BY i.done, i.priority, i.position, i.id`)
    .all(req.user.id);
  res.json(rows.map(rowToItem));
});

cockpitMeRouter.post('/items', (req, res) => {
  const { name, quantity, priority, note, workspaceId, x, y, z } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  if (String(name).trim().length > 120) return res.status(400).json({ error: 'name_too_long' });
  const pos = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM cockpit_items WHERE user_id = ?`)
    .get(req.user.id).n;
  const result = db.prepare(`
    INSERT INTO cockpit_items (user_id, name, quantity, priority, note, workspace_id, x, y, z, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    String(name).trim(),
    Math.max(1, Math.floor(Number(quantity) || 1)),
    parsePriority(priority),
    String(note || '').trim().slice(0, 500),
    resolveWorkspaceId(req.user, workspaceId),
    parseCoord(x), parseCoord(y), parseCoord(z),
    pos,
  );
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToItem(row));
});

cockpitMeRouter.put('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOwnItem(req.user.id, id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { name, quantity, priority, note, workspaceId, x, y, z } = body;
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  db.prepare(`
    UPDATE cockpit_items SET
      name         = COALESCE(?, name),
      quantity     = ?,
      priority     = ?,
      note         = COALESCE(?, note),
      workspace_id = ?,
      x = ?, y = ?, z = ?,
      updated_at   = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim().slice(0, 120),
    quantity === undefined ? existing.quantity : Math.max(1, Math.floor(Number(quantity) || 1)),
    priority === undefined ? existing.priority : parsePriority(priority, existing.priority),
    note === undefined ? null : String(note).trim().slice(0, 500),
    ('workspaceId' in body) ? resolveWorkspaceId(req.user, workspaceId) : existing.workspace_id,
    ('x' in body) ? parseCoord(x) : existing.x,
    ('y' in body) ? parseCoord(y) : existing.y,
    ('z' in body) ? parseCoord(z) : existing.z,
    id,
  );
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
  res.json(rowToItem(row));
});

cockpitMeRouter.patch('/items/:id/done', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOwnItem(req.user.id, id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const next = existing.done ? 0 : 1;
  db.prepare(`
    UPDATE cockpit_items SET done = ?, done_at = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(next, next ? Math.floor(Date.now() / 1000) : null, id);
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
  res.json(rowToItem(row));
});

cockpitMeRouter.delete('/items/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM cockpit_items WHERE id = ? AND user_id = ?`)
    .run(Number(req.params.id), req.user.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Quêtes suivies (filtre du flux) ─────────────────────────────────────────
// Aucune ligne = tout est envoyé (mode par défaut) ; ≥ 1 ligne = seules les
// quêtes suivies apparaissent dans available/deadlines.

cockpitMeRouter.get('/quests', (req, res) => {
  const followed = new Set(
    db.prepare(`SELECT quest_id FROM cockpit_quest_follows WHERE user_id = ?`)
      .all(req.user.id).map((r) => r.quest_id),
  );
  const quests = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type, q.due_date,
           f.nom AS faction_nom, f.couleur AS faction_couleur
    FROM quests q LEFT JOIN factions f ON f.id = q.faction_id
    ORDER BY q.occurrence_type, q.titre
  `).all().map((q) => ({
    id: q.id,
    titre: q.titre,
    occurrenceType: q.occurrence_type,
    dueDate: q.due_date ?? null,
    factionNom: q.faction_nom ?? null,
    factionCouleur: q.faction_couleur ?? null,
    followed: followed.has(q.id),
  }));
  res.json({ quests, followedCount: followed.size });
});

cockpitMeRouter.put('/quests/:id/follow', (req, res) => {
  const id = Number(req.params.id);
  const quest = db.prepare(`SELECT id FROM quests WHERE id = ?`).get(id);
  if (!quest) return res.status(404).json({ error: 'not_found' });
  const followed = !!req.body?.followed;
  if (followed) {
    db.prepare(`INSERT OR IGNORE INTO cockpit_quest_follows (user_id, quest_id) VALUES (?, ?)`)
      .run(req.user.id, id);
  } else {
    db.prepare(`DELETE FROM cockpit_quest_follows WHERE user_id = ? AND quest_id = ?`)
      .run(req.user.id, id);
  }
  const count = db.prepare(`SELECT COUNT(*) AS n FROM cockpit_quest_follows WHERE user_id = ?`)
    .get(req.user.id).n;
  res.json({ questId: id, followed, followedCount: count });
});

import { Router } from 'express';
import { db } from '../db.js';
import { uploadScreenshotMemory } from '../uploads.js';
import { scanChestScreenshot, visionAvailable } from '../minecraftVision.js';

// Mounted under /api/workspaces/:slug/minecraft with mergeParams; resolveWorkspace
// has already populated req.workspace.
export const minecraftRouter = Router({ mergeParams: true });

const VALID_RARITIES = ['Commun', 'Peu commun', 'Rare', 'Épique', 'Légendaire'];

function rowToResource(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    chestId: r.chest_id ?? null,
    name: r.name,
    quantity: r.quantity,
    notes: r.notes,
    category: r.category || '',
    rarity: r.rarity || 'Commun',
    favorite: r.favorite === 1,
    position: r.position,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToChest(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    world: r.world || 'overworld',
    x: r.x,
    y: r.y,
    z: r.z,
    note: r.note || '',
    position: r.position,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    itemCount: r.item_count ?? undefined,
    totalQuantity: r.total_quantity ?? undefined,
  };
}

const SELECT = `
  SELECT m.*, u.name AS created_by_name
  FROM minecraft_resources m
  LEFT JOIN users u ON u.id = m.created_by
`;

const CHEST_SELECT = `
  SELECT c.*, u.name AS created_by_name,
    (SELECT COUNT(*)                     FROM minecraft_resources r WHERE r.chest_id = c.id) AS item_count,
    (SELECT COALESCE(SUM(r.quantity), 0) FROM minecraft_resources r WHERE r.chest_id = c.id) AS total_quantity
  FROM minecraft_chests c
  LEFT JOIN users u ON u.id = c.created_by
`;

function ensureMinecraftWorkspace(req, res) {
  if (!req.workspace?.isMinecraft) {
    res.status(404).json({ error: 'minecraft_disabled' });
    return false;
  }
  return true;
}

// Validates a chest_id belongs to this workspace; returns the numeric id or null
// (null = « non rangé »).
function resolveChestId(workspaceId, chestId) {
  if (chestId === undefined || chestId === null || chestId === '') return null;
  const id = Number(chestId);
  if (!Number.isFinite(id)) return null;
  const row = db.prepare(`SELECT id FROM minecraft_chests WHERE id = ? AND workspace_id = ?`).get(id, workspaceId);
  return row ? id : null;
}

function parseCoord(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function listResources(workspaceId) {
  return db.prepare(`${SELECT} WHERE m.workspace_id = ? ORDER BY m.position, m.id`)
    .all(workspaceId)
    .map(rowToResource);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ── Resources ─────────────────────────────────────────────────────────────────

minecraftRouter.get('/', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  res.json(listResources(req.workspace.id));
});

minecraftRouter.post('/', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, quantity, notes, category, rarity, favorite, chestId } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const qty = Number.isFinite(Number(quantity)) ? Math.max(0, Math.floor(Number(quantity))) : 0;
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_resources WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;

  const rar = VALID_RARITIES.includes(rarity) ? rarity : 'Commun';
  const fav = favorite ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO minecraft_resources
      (workspace_id, chest_id, name, quantity, notes, category, rarity, favorite, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    resolveChestId(req.workspace.id, chestId),
    String(name).trim(),
    qty,
    String(notes || '').trim(),
    String(category || '').trim(),
    rar,
    fav,
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

  const body = req.body || {};
  const { name, quantity, notes, category, rarity, favorite, chestId } = body;
  const qty = quantity === undefined
    ? existing.quantity
    : Math.max(0, Math.floor(Number(quantity) || 0));

  const rar = rarity === undefined
    ? existing.rarity
    : (VALID_RARITIES.includes(rarity) ? rarity : existing.rarity);
  const fav = favorite === undefined ? existing.favorite : (favorite ? 1 : 0);
  // chest_id only changes when explicitly provided (allows moving to « non rangé »).
  const chest = ('chestId' in body) ? resolveChestId(req.workspace.id, chestId) : existing.chest_id;

  db.prepare(`
    UPDATE minecraft_resources SET
      name       = COALESCE(?, name),
      quantity   = ?,
      notes      = COALESCE(?, notes),
      category   = COALESCE(?, category),
      rarity     = ?,
      favorite   = ?,
      chest_id   = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    qty,
    notes === undefined ? null : String(notes).trim(),
    category === undefined ? null : String(category).trim(),
    rar,
    fav,
    chest,
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

minecraftRouter.patch('/:id/favorite', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM minecraft_resources WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const next = existing.favorite ? 0 : 1;
  db.prepare(`
    UPDATE minecraft_resources SET favorite = ?, updated_at = strftime('%s','now') WHERE id = ?
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

// ── Chests (coffres) ────────────────────────────────────────────────────────

minecraftRouter.get('/chests', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const rows = db.prepare(`${CHEST_SELECT} WHERE c.workspace_id = ? ORDER BY c.position, c.id`)
    .all(req.workspace.id);
  res.json(rows.map(rowToChest));
});

minecraftRouter.post('/chests', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, world, x, y, z, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_chests WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;
  const result = db.prepare(`
    INSERT INTO minecraft_chests (workspace_id, name, world, x, y, z, note, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    String(name).trim(),
    String(world || 'overworld').trim().slice(0, 64) || 'overworld',
    parseCoord(x), parseCoord(y), parseCoord(z),
    String(note || '').trim(),
    pos,
    req.user.id,
  );
  const row = db.prepare(`${CHEST_SELECT} WHERE c.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToChest(row));
});

minecraftRouter.put('/chests/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM minecraft_chests WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { name, world, x, y, z, note } = body;
  db.prepare(`
    UPDATE minecraft_chests SET
      name  = COALESCE(?, name),
      world = COALESCE(?, world),
      x = ?, y = ?, z = ?,
      note  = COALESCE(?, note),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    world === undefined ? null : (String(world).trim().slice(0, 64) || 'overworld'),
    'x' in body ? parseCoord(x) : existing.x,
    'y' in body ? parseCoord(y) : existing.y,
    'z' in body ? parseCoord(z) : existing.z,
    note === undefined ? null : String(note).trim(),
    id,
  );
  const row = db.prepare(`${CHEST_SELECT} WHERE c.id = ?`).get(id);
  res.json(rowToChest(row));
});

minecraftRouter.delete('/chests/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM minecraft_chests WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  // Repasse les items du coffre en « non rangé » avant suppression (ne dépend
  // pas du pragma foreign_keys), puis supprime le coffre.
  const tx = db.transaction(() => {
    db.prepare(`UPDATE minecraft_resources SET chest_id = NULL WHERE chest_id = ? AND workspace_id = ?`)
      .run(id, req.workspace.id);
    db.prepare(`DELETE FROM minecraft_chests WHERE id = ? AND workspace_id = ?`).run(id, req.workspace.id);
  });
  tx();
  res.status(204).end();
});

// Remplace (replace) ou fusionne (merge) le contenu d'un coffre à partir d'une
// liste d'items — utilisé par le flux « mise à jour depuis un screenshot » après
// validation par l'utilisateur. Renvoie la liste complète des ressources.
minecraftRouter.post('/chests/:id/apply', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const chestId = Number(req.params.id);
  const chest = db.prepare(`SELECT id FROM minecraft_chests WHERE id = ? AND workspace_id = ?`)
    .get(chestId, req.workspace.id);
  if (!chest) return res.status(404).json({ error: 'not_found' });

  const body = req.body || {};
  const mode = body.mode === 'merge' ? 'merge' : 'replace';
  const clean = (Array.isArray(body.items) ? body.items : [])
    .map((it) => ({
      name: String(it?.name || '').trim(),
      quantity: Math.max(0, Math.floor(Number(it?.quantity) || 0)),
      category: String(it?.category || '').trim(),
      rarity: VALID_RARITIES.includes(it?.rarity) ? it.rarity : 'Commun',
    }))
    .filter((it) => it.name);

  const tx = db.transaction(() => {
    let pos = db.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_resources WHERE workspace_id = ?`,
    ).get(req.workspace.id).n;
    const ins = db.prepare(`
      INSERT INTO minecraft_resources
        (workspace_id, chest_id, name, quantity, notes, category, rarity, favorite, position, created_by)
      VALUES (?, ?, ?, ?, '', ?, ?, 0, ?, ?)
    `);

    if (mode === 'replace') {
      db.prepare(`DELETE FROM minecraft_resources WHERE chest_id = ? AND workspace_id = ?`)
        .run(chestId, req.workspace.id);
      for (const it of clean) {
        ins.run(req.workspace.id, chestId, it.name, it.quantity, it.category, it.rarity, pos++, req.user.id);
      }
    } else {
      const inChest = db.prepare(`SELECT * FROM minecraft_resources WHERE chest_id = ? AND workspace_id = ?`)
        .all(chestId, req.workspace.id);
      const byName = new Map(inChest.map((r) => [norm(r.name), r]));
      const bump = db.prepare(`UPDATE minecraft_resources SET quantity = ?, updated_at = strftime('%s','now') WHERE id = ?`);
      for (const it of clean) {
        const hit = byName.get(norm(it.name));
        if (hit) bump.run(hit.quantity + it.quantity, hit.id);
        else ins.run(req.workspace.id, chestId, it.name, it.quantity, it.category, it.rarity, pos++, req.user.id);
      }
    }
  });
  tx();
  res.json(listResources(req.workspace.id));
});

// ── Screenshot → items (vision IA, hybride : 200 {available:false} sans clé) ──

minecraftRouter.post('/scan-screenshot', uploadScreenshotMemory.single('image'), async (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  if (!visionAvailable()) return res.json({ available: false, items: [] });
  if (!req.file?.buffer) return res.status(400).json({ error: 'missing_image' });
  try {
    const items = await scanChestScreenshot(req.file.buffer, req.file.mimetype);
    res.json({ available: true, items });
  } catch (e) {
    console.error('[minecraft] vision scan failed:', e?.message || e);
    res.status(502).json({ error: 'vision_failed' });
  }
});

import { Router } from 'express';
import { db } from '../db.js';
import { uploadScreenshotMemory } from '../uploads.js';
import { scanChestScreenshot, visionAvailable } from '../minecraftVision.js';
import { canAccessWorkspace } from '../workspaces.js';

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

// Fige le total du jour pour chaque ressource (nom normalisé) du workspace —
// appelé après chaque mutation d'inventaire (un point par jour, upsert). Les
// noms encore suivis récemment mais absents de l'inventaire retombent à 0 pour
// que les tendances du Résumé reflètent les épuisements. Best-effort : une
// erreur d'historique ne doit jamais faire échouer la mutation.
function snapshotStock(workspaceId) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`SELECT name, quantity FROM minecraft_resources WHERE workspace_id = ?`).all(workspaceId);
    const totals = new Map(); // norm -> { name, qty }
    for (const r of rows) {
      const k = norm(r.name);
      if (!k) continue;
      const e = totals.get(k);
      if (e) e.qty += r.quantity;
      else totals.set(k, { name: r.name, qty: r.quantity });
    }
    const up = db.prepare(`
      INSERT INTO minecraft_stock_history (workspace_id, name_norm, name, day, quantity)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (workspace_id, name_norm, day)
      DO UPDATE SET quantity = excluded.quantity, name = excluded.name
    `);
    const tx = db.transaction(() => {
      for (const e of totals.values()) up.run(workspaceId, norm(e.name), e.name, day, e.qty);
      const known = db.prepare(`
        SELECT name_norm, MAX(name) AS name FROM minecraft_stock_history
        WHERE workspace_id = ? AND day >= date('now', '-45 day')
        GROUP BY name_norm
      `).all(workspaceId);
      for (const k of known) {
        if (!totals.has(k.name_norm)) up.run(workspaceId, k.name_norm, k.name, day, 0);
      }
    });
    tx();
  } catch (e) {
    console.error('[minecraft] stock snapshot failed:', e?.message || e);
  }
}

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
  snapshotStock(req.workspace.id);
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
  snapshotStock(req.workspace.id);
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
  snapshotStock(req.workspace.id);
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
  snapshotStock(req.workspace.id);
  res.status(204).end();
});

// ── Wanted (ressources recherchées) ─────────────────────────────────────────
// Wishlist par workspace, triée par priorité (1 haute → 3 basse), cochable
// quand la quantité voulue est récupérée. La progression (inventaire courant)
// est calculée côté client à partir de minecraft_resources.

function rowToWanted(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    quantity: r.quantity,
    priority: r.priority,
    note: r.note || '',
    done: r.done === 1,
    doneAt: r.done_at,
    assignedTo: r.assigned_to ?? null,
    assignedToName: r.assigned_to_name || null,
    position: r.position,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const WANTED_SELECT = `
  SELECT w.*, u.name AS created_by_name, a.name AS assigned_to_name
  FROM minecraft_wanted w
  LEFT JOIN users u ON u.id = w.created_by
  LEFT JOIN users a ON a.id = w.assigned_to
`;

// Une assignation ne peut viser qu'un utilisateur ayant accès au workspace
// (même règle que l'assignee du Kanban). '' / null / undefined → non assigné.
function resolveAssignee(workspaceId, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0 || !canAccessWorkspace(workspaceId, id)) return null;
  return id;
}

const parsePriority = (v, fallback = 2) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : fallback;
};

function listWanted(workspaceId) {
  return db.prepare(`${WANTED_SELECT} WHERE w.workspace_id = ? ORDER BY w.done, w.priority, w.position, w.id`)
    .all(workspaceId)
    .map(rowToWanted);
}

minecraftRouter.get('/wanted', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  res.json(listWanted(req.workspace.id));
});

minecraftRouter.post('/wanted', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, quantity, priority, note, assignedTo } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_wanted WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;
  const result = db.prepare(`
    INSERT INTO minecraft_wanted (workspace_id, name, quantity, priority, note, assigned_to, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    String(name).trim(),
    qty,
    parsePriority(priority),
    String(note || '').trim(),
    resolveAssignee(req.workspace.id, assignedTo),
    pos,
    req.user.id,
  );
  const row = db.prepare(`${WANTED_SELECT} WHERE w.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToWanted(row));
});

// Ajout en masse depuis le « manquant » du calculateur de craft ou du BOM d'un
// build : fusionne par nom normalisé avec les wanted existants (objectif = max
// des deux, priorité = la plus haute ; une ligne déjà cochée est réouverte avec
// le nouvel objectif). Renvoie la liste wanted complète.
minecraftRouter.post('/wanted/bulk', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const body = req.body || {};
  const prio = parsePriority(body.priority);
  const note = String(body.note || '').trim();
  const clean = (Array.isArray(body.items) ? body.items : [])
    .map((it) => ({
      name: String(it?.name || '').trim(),
      quantity: Math.max(1, Math.floor(Number(it?.quantity) || 1)),
    }))
    .filter((it) => it.name);
  if (clean.length === 0) return res.status(400).json({ error: 'missing_items' });

  const tx = db.transaction(() => {
    const existing = db.prepare(`SELECT * FROM minecraft_wanted WHERE workspace_id = ?`).all(req.workspace.id);
    const byName = new Map(existing.map((w) => [norm(w.name), w]));
    let pos = db.prepare(
      `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_wanted WHERE workspace_id = ?`,
    ).get(req.workspace.id).n;
    const ins = db.prepare(`
      INSERT INTO minecraft_wanted (workspace_id, name, quantity, priority, note, position, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const upd = db.prepare(`
      UPDATE minecraft_wanted SET quantity = ?, priority = ?, done = 0, done_at = NULL,
        note = CASE WHEN note = '' THEN ? ELSE note END,
        updated_at = strftime('%s','now')
      WHERE id = ?
    `);
    for (const it of clean) {
      const hit = byName.get(norm(it.name));
      if (hit) {
        upd.run(Math.max(hit.quantity, it.quantity), Math.min(hit.priority, prio), note, hit.id);
      } else {
        ins.run(req.workspace.id, it.name, it.quantity, prio, note, pos++, req.user.id);
      }
    }
  });
  tx();
  res.json(listWanted(req.workspace.id));
});

minecraftRouter.put('/wanted/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM minecraft_wanted WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { name, quantity, priority, note, assignedTo } = body;
  // assigned_to ne change que si fourni ('' / null explicites → désassigné).
  const assignee = ('assignedTo' in body) ? resolveAssignee(req.workspace.id, assignedTo) : existing.assigned_to;
  db.prepare(`
    UPDATE minecraft_wanted SET
      name        = COALESCE(?, name),
      quantity    = ?,
      priority    = ?,
      note        = COALESCE(?, note),
      assigned_to = ?,
      updated_at  = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    quantity === undefined ? existing.quantity : Math.max(1, Math.floor(Number(quantity) || 1)),
    priority === undefined ? existing.priority : parsePriority(priority, existing.priority),
    note === undefined ? null : String(note).trim(),
    assignee,
    id,
  );
  const row = db.prepare(`${WANTED_SELECT} WHERE w.id = ?`).get(id);
  res.json(rowToWanted(row));
});

// Coche / décoche « quantité récupérée ».
minecraftRouter.patch('/wanted/:id/done', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM minecraft_wanted WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const next = existing.done ? 0 : 1;
  db.prepare(`
    UPDATE minecraft_wanted SET done = ?, done_at = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(next, next ? Math.floor(Date.now() / 1000) : null, id);
  const row = db.prepare(`${WANTED_SELECT} WHERE w.id = ?`).get(id);
  res.json(rowToWanted(row));
});

minecraftRouter.delete('/wanted/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const r = db.prepare(`DELETE FROM minecraft_wanted WHERE id = ? AND workspace_id = ?`)
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
  snapshotStock(req.workspace.id);
  res.json(listResources(req.workspace.id));
});

// Applique un craft validé en une transaction : décrémente les lignes
// consommées (par id de ligne, FIFO/répartition décidée côté client) et
// incrémente/insère les produits (cible + éventuels surplus). Renvoie la liste
// complète des ressources à jour.
minecraftRouter.post('/craft/apply', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const wsId = req.workspace.id;
  const body = req.body || {};
  const consume = Array.isArray(body.consume) ? body.consume : [];
  const produce = Array.isArray(body.produce) ? body.produce : [];

  const tx = db.transaction(() => {
    // Décrémentations : chaque entrée vise une ligne de ce workspace.
    for (const c of consume) {
      const rowId = Number(c?.id);
      const delta = Math.floor(Number(c?.delta) || 0);
      if (!Number.isFinite(rowId) || delta === 0) continue;
      const row = db.prepare('SELECT quantity FROM minecraft_resources WHERE id = ? AND workspace_id = ?')
        .get(rowId, wsId);
      if (!row) continue;
      const next = Math.max(0, row.quantity + delta);
      db.prepare("UPDATE minecraft_resources SET quantity = ?, updated_at = strftime('%s','now') WHERE id = ?")
        .run(next, rowId);
    }

    // Productions : fusion par (nom, coffre) sinon insertion.
    let pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_resources WHERE workspace_id = ?')
      .get(wsId).n;
    for (const p of produce) {
      const name = String(p?.name || '').trim();
      const quantity = Math.max(0, Math.floor(Number(p?.quantity) || 0));
      if (!name || quantity === 0) continue;
      const chest = resolveChestId(wsId, p?.chestId);
      const rar = VALID_RARITIES.includes(p?.rarity) ? p.rarity : 'Commun';
      const cat = String(p?.category || '').trim();
      const existing = chest === null
        ? db.prepare('SELECT id, quantity FROM minecraft_resources WHERE workspace_id = ? AND name = ? AND chest_id IS NULL').get(wsId, name)
        : db.prepare('SELECT id, quantity FROM minecraft_resources WHERE workspace_id = ? AND name = ? AND chest_id = ?').get(wsId, name, chest);
      if (existing) {
        db.prepare("UPDATE minecraft_resources SET quantity = ?, updated_at = strftime('%s','now') WHERE id = ?")
          .run(existing.quantity + quantity, existing.id);
      } else {
        db.prepare(`
          INSERT INTO minecraft_resources
            (workspace_id, chest_id, name, quantity, notes, category, rarity, favorite, position, created_by)
          VALUES (?, ?, ?, ?, '', ?, ?, 0, ?, ?)
        `).run(wsId, chest, name, quantity, cat, rar, pos++, req.user.id);
      }
    }
  });
  tx();
  snapshotStock(wsId);
  res.json(listResources(wsId));
});

// ── Historique du stock (tendances / sparklines du Résumé) ──────────────────

minecraftRouter.get('/history', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const days = Math.min(120, Math.max(2, Math.floor(Number(req.query.days) || 30)));
  const rows = db.prepare(`
    SELECT name_norm, name, day, quantity FROM minecraft_stock_history
    WHERE workspace_id = ? AND day >= date('now', ?)
    ORDER BY name_norm, day
  `).all(req.workspace.id, `-${days} day`);
  res.json(rows.map((r) => ({ nameNorm: r.name_norm, name: r.name, day: r.day, quantity: r.quantity })));
});

// ── Équipement nommé (« stuff » : outils/armes renommés + enchants) ─────────

function rowToGear(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    itemName: r.item_name || '',
    enchants: r.enchants || '',
    ownerId: r.owner_id ?? null,
    ownerName: r.owner_name || null,
    chestId: r.chest_id ?? null,
    note: r.note || '',
    position: r.position,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const GEAR_SELECT = `
  SELECT g.*, u.name AS created_by_name, o.name AS owner_name
  FROM minecraft_gear g
  LEFT JOIN users u ON u.id = g.created_by
  LEFT JOIN users o ON o.id = g.owner_id
`;

minecraftRouter.get('/gear', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const rows = db.prepare(`${GEAR_SELECT} WHERE g.workspace_id = ? ORDER BY g.position, g.id`)
    .all(req.workspace.id);
  res.json(rows.map(rowToGear));
});

minecraftRouter.post('/gear', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, itemName, enchants, ownerId, chestId, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_gear WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;
  const result = db.prepare(`
    INSERT INTO minecraft_gear (workspace_id, name, item_name, enchants, owner_id, chest_id, note, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    String(name).trim(),
    String(itemName || '').trim(),
    String(enchants || '').trim(),
    resolveAssignee(req.workspace.id, ownerId),
    resolveChestId(req.workspace.id, chestId),
    String(note || '').trim(),
    pos,
    req.user.id,
  );
  const row = db.prepare(`${GEAR_SELECT} WHERE g.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToGear(row));
});

minecraftRouter.put('/gear/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM minecraft_gear WHERE id = ? AND workspace_id = ?`)
    .get(id, req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { name, itemName, enchants, ownerId, chestId, note } = body;
  db.prepare(`
    UPDATE minecraft_gear SET
      name       = COALESCE(?, name),
      item_name  = COALESCE(?, item_name),
      enchants   = COALESCE(?, enchants),
      owner_id   = ?,
      chest_id   = ?,
      note       = COALESCE(?, note),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    itemName === undefined ? null : String(itemName).trim(),
    enchants === undefined ? null : String(enchants).trim(),
    ('ownerId' in body) ? resolveAssignee(req.workspace.id, ownerId) : existing.owner_id,
    ('chestId' in body) ? resolveChestId(req.workspace.id, chestId) : existing.chest_id,
    note === undefined ? null : String(note).trim(),
    id,
  );
  const row = db.prepare(`${GEAR_SELECT} WHERE g.id = ?`).get(id);
  res.json(rowToGear(row));
});

minecraftRouter.delete('/gear/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const r = db.prepare(`DELETE FROM minecraft_gear WHERE id = ? AND workspace_id = ?`)
    .run(Number(req.params.id), req.workspace.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Villageois (métier, coords, trades avec prix réduit par joueur) ─────────

function rowToTrade(r) {
  if (!r) return null;
  return {
    id: r.id,
    villagerId: r.villager_id,
    itemName: r.item_name,
    price: r.price || '',
    discountUserId: r.discount_user_id ?? null,
    discountUserName: r.discount_user_name || null,
    discountPrice: r.discount_price || '',
    note: r.note || '',
    position: r.position,
  };
}

function rowToVillager(r, trades = []) {
  if (!r) return null;
  let tags = [];
  try {
    const parsed = JSON.parse(r.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch { /* blob illisible → liste vide */ }
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    profession: r.profession || '',
    world: r.world || 'overworld',
    x: r.x,
    y: r.y,
    z: r.z,
    note: r.note || '',
    tags,
    position: r.position,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    trades,
  };
}

// Tags libres : dédupliqués (insensible casse), bornés en nombre et longueur.
function tagsJson(list) {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const v = String(t).trim().slice(0, 32);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= 10) break;
  }
  return JSON.stringify(out);
}

const VILLAGER_SELECT = `
  SELECT v.*, u.name AS created_by_name
  FROM minecraft_villagers v
  LEFT JOIN users u ON u.id = v.created_by
`;
const TRADE_SELECT = `
  SELECT t.*, d.name AS discount_user_name
  FROM minecraft_villager_trades t
  LEFT JOIN users d ON d.id = t.discount_user_id
`;

// Villageois + trades imbriqués (une requête trades pour tout le workspace).
function listVillagers(workspaceId) {
  const villagers = db.prepare(`${VILLAGER_SELECT} WHERE v.workspace_id = ? ORDER BY v.position, v.id`)
    .all(workspaceId);
  const trades = db.prepare(`
    ${TRADE_SELECT}
    WHERE t.villager_id IN (SELECT id FROM minecraft_villagers WHERE workspace_id = ?)
    ORDER BY t.position, t.id
  `).all(workspaceId);
  const byVillager = new Map();
  for (const t of trades) {
    if (!byVillager.has(t.villager_id)) byVillager.set(t.villager_id, []);
    byVillager.get(t.villager_id).push(rowToTrade(t));
  }
  return villagers.map((v) => rowToVillager(v, byVillager.get(v.id) || []));
}

function findVillager(workspaceId, id) {
  return db.prepare(`SELECT * FROM minecraft_villagers WHERE id = ? AND workspace_id = ?`)
    .get(Number(id), workspaceId);
}

minecraftRouter.get('/villagers', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  res.json(listVillagers(req.workspace.id));
});

minecraftRouter.post('/villagers', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, profession, world, x, y, z, note, tags } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_villagers WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;
  const result = db.prepare(`
    INSERT INTO minecraft_villagers (workspace_id, name, profession, world, x, y, z, note, tags, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    String(name).trim(),
    String(profession || '').trim().slice(0, 64),
    String(world || 'overworld').trim().slice(0, 64) || 'overworld',
    parseCoord(x), parseCoord(y), parseCoord(z),
    String(note || '').trim(),
    tagsJson(tags),
    pos,
    req.user.id,
  );
  const row = db.prepare(`${VILLAGER_SELECT} WHERE v.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToVillager(row, []));
});

minecraftRouter.put('/villagers/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const existing = findVillager(req.workspace.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { name, profession, world, x, y, z, note, tags } = body;
  db.prepare(`
    UPDATE minecraft_villagers SET
      name       = COALESCE(?, name),
      profession = COALESCE(?, profession),
      world      = COALESCE(?, world),
      x = ?, y = ?, z = ?,
      note       = COALESCE(?, note),
      tags       = COALESCE(?, tags),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    profession === undefined ? null : String(profession).trim().slice(0, 64),
    world === undefined ? null : (String(world).trim().slice(0, 64) || 'overworld'),
    'x' in body ? parseCoord(x) : existing.x,
    'y' in body ? parseCoord(y) : existing.y,
    'z' in body ? parseCoord(z) : existing.z,
    note === undefined ? null : String(note).trim(),
    tags === undefined ? null : tagsJson(tags),
    existing.id,
  );
  const row = db.prepare(`${VILLAGER_SELECT} WHERE v.id = ?`).get(existing.id);
  const trades = db.prepare(`${TRADE_SELECT} WHERE t.villager_id = ? ORDER BY t.position, t.id`)
    .all(existing.id).map(rowToTrade);
  res.json(rowToVillager(row, trades));
});

minecraftRouter.delete('/villagers/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const existing = findVillager(req.workspace.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM minecraft_villager_trades WHERE villager_id = ?`).run(existing.id);
    db.prepare(`DELETE FROM minecraft_villagers WHERE id = ?`).run(existing.id);
  });
  tx();
  res.status(204).end();
});

// Trades d'un villageois. Le prix réduit est par joueur (soin de zombie /
// Héros du village) : discountUserId désigne QUI a la réduction.
minecraftRouter.post('/villagers/:id/trades', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const villager = findVillager(req.workspace.id, req.params.id);
  if (!villager) return res.status(404).json({ error: 'not_found' });
  const { itemName, price, discountUserId, discountPrice, note } = req.body || {};
  if (!itemName || !String(itemName).trim()) return res.status(400).json({ error: 'missing_item' });
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_villager_trades WHERE villager_id = ?`,
  ).get(villager.id).n;
  const result = db.prepare(`
    INSERT INTO minecraft_villager_trades (villager_id, item_name, price, discount_user_id, discount_price, note, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    villager.id,
    String(itemName).trim(),
    String(price || '').trim().slice(0, 120),
    resolveAssignee(req.workspace.id, discountUserId),
    String(discountPrice || '').trim().slice(0, 120),
    String(note || '').trim(),
    pos,
  );
  const row = db.prepare(`${TRADE_SELECT} WHERE t.id = ?`).get(result.lastInsertRowid);
  res.status(201).json(rowToTrade(row));
});

minecraftRouter.put('/villagers/:id/trades/:tradeId', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const villager = findVillager(req.workspace.id, req.params.id);
  if (!villager) return res.status(404).json({ error: 'not_found' });
  const existing = db.prepare(`SELECT * FROM minecraft_villager_trades WHERE id = ? AND villager_id = ?`)
    .get(Number(req.params.tradeId), villager.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { itemName, price, discountUserId, discountPrice, note } = body;
  db.prepare(`
    UPDATE minecraft_villager_trades SET
      item_name        = COALESCE(?, item_name),
      price            = COALESCE(?, price),
      discount_user_id = ?,
      discount_price   = COALESCE(?, discount_price),
      note             = COALESCE(?, note),
      updated_at       = strftime('%s','now')
    WHERE id = ?
  `).run(
    itemName === undefined ? null : String(itemName).trim(),
    price === undefined ? null : String(price).trim().slice(0, 120),
    ('discountUserId' in body) ? resolveAssignee(req.workspace.id, discountUserId) : existing.discount_user_id,
    discountPrice === undefined ? null : String(discountPrice).trim().slice(0, 120),
    note === undefined ? null : String(note).trim(),
    existing.id,
  );
  const row = db.prepare(`${TRADE_SELECT} WHERE t.id = ?`).get(existing.id);
  res.json(rowToTrade(row));
});

minecraftRouter.delete('/villagers/:id/trades/:tradeId', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const villager = findVillager(req.workspace.id, req.params.id);
  if (!villager) return res.status(404).json({ error: 'not_found' });
  const r = db.prepare(`DELETE FROM minecraft_villager_trades WHERE id = ? AND villager_id = ?`)
    .run(Number(req.params.tradeId), villager.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── POI de la carte du projet (bases, portails, fermes…) ────────────────────

function rowToPoi(r) {
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    category: r.category || 'autre',
    world: r.world || 'overworld',
    x: r.x,
    y: r.y,
    z: r.z,
    note: r.note || '',
    position: r.position,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

minecraftRouter.get('/map-pois', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const rows = db.prepare(`SELECT * FROM minecraft_map_pois WHERE workspace_id = ? ORDER BY position, id`)
    .all(req.workspace.id);
  res.json(rows.map(rowToPoi));
});

minecraftRouter.post('/map-pois', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const { name, category, world, x, y, z, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const px = parseCoord(x); const pz = parseCoord(z);
  if (px === null || pz === null) return res.status(400).json({ error: 'missing_coords' });
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM minecraft_map_pois WHERE workspace_id = ?`,
  ).get(req.workspace.id).n;
  const result = db.prepare(`
    INSERT INTO minecraft_map_pois (workspace_id, name, category, world, x, y, z, note, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.workspace.id,
    String(name).trim(),
    String(category || 'autre').trim().slice(0, 32),
    String(world || 'overworld').trim().slice(0, 64) || 'overworld',
    px, parseCoord(y), pz,
    String(note || '').trim(),
    pos,
    req.user.id,
  );
  res.status(201).json(rowToPoi(db.prepare(`SELECT * FROM minecraft_map_pois WHERE id = ?`).get(result.lastInsertRowid)));
});

minecraftRouter.put('/map-pois/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const existing = db.prepare(`SELECT * FROM minecraft_map_pois WHERE id = ? AND workspace_id = ?`)
    .get(Number(req.params.id), req.workspace.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const { name, category, world, x, y, z, note } = body;
  db.prepare(`
    UPDATE minecraft_map_pois SET
      name       = COALESCE(?, name),
      category   = COALESCE(?, category),
      world      = COALESCE(?, world),
      x = ?, y = ?, z = ?,
      note       = COALESCE(?, note),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    category === undefined ? null : String(category).trim().slice(0, 32),
    world === undefined ? null : (String(world).trim().slice(0, 64) || 'overworld'),
    'x' in body ? parseCoord(x) : existing.x,
    'y' in body ? parseCoord(y) : existing.y,
    'z' in body ? parseCoord(z) : existing.z,
    note === undefined ? null : String(note).trim(),
    existing.id,
  );
  res.json(rowToPoi(db.prepare(`SELECT * FROM minecraft_map_pois WHERE id = ?`).get(existing.id)));
});

minecraftRouter.delete('/map-pois/:id', (req, res) => {
  if (!ensureMinecraftWorkspace(req, res)) return;
  const r = db.prepare(`DELETE FROM minecraft_map_pois WHERE id = ? AND workspace_id = ?`)
    .run(Number(req.params.id), req.workspace.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
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

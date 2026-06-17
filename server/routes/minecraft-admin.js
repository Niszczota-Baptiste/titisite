import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

// Admin central, NON scopé : agrège coffres + ressources de TOUS les workspaces,
// et gère les boutiques. Tout est admin-only (cf. mount dans index.js).
export const minecraftAdminRouter = Router();
minecraftAdminRouter.use(requireAuth, requireRole('admin'));

// ── Vue cross-projets ─────────────────────────────────────────────────────────

minecraftAdminRouter.get('/overview', (_req, res) => {
  const projects = db.prepare(`
    SELECT id, slug, name, is_minecraft AS isMinecraft
    FROM workspaces WHERE is_minecraft = 1 ORDER BY name
  `).all().map((p) => ({ ...p, isMinecraft: p.isMinecraft === 1 }));

  const chests = db.prepare(`
    SELECT c.*, w.slug AS workspace_slug, w.name AS workspace_name,
      (SELECT COUNT(*)                     FROM minecraft_resources r WHERE r.chest_id = c.id) AS item_count,
      (SELECT COALESCE(SUM(r.quantity), 0) FROM minecraft_resources r WHERE r.chest_id = c.id) AS total_quantity
    FROM minecraft_chests c JOIN workspaces w ON w.id = c.workspace_id
    ORDER BY w.name, c.position, c.id
  `).all().map((c) => ({
    id: c.id, workspaceId: c.workspace_id, workspaceSlug: c.workspace_slug, workspaceName: c.workspace_name,
    name: c.name, world: c.world || 'overworld', x: c.x, y: c.y, z: c.z, note: c.note || '',
    itemCount: c.item_count, totalQuantity: c.total_quantity,
  }));

  const resources = db.prepare(`
    SELECT r.*, w.slug AS workspace_slug, w.name AS workspace_name,
      ch.name AS chest_name, ch.world AS chest_world
    FROM minecraft_resources r
    JOIN workspaces w ON w.id = r.workspace_id
    LEFT JOIN minecraft_chests ch ON ch.id = r.chest_id
    ORDER BY w.name, r.name
  `).all().map((r) => ({
    id: r.id, workspaceId: r.workspace_id, workspaceSlug: r.workspace_slug, workspaceName: r.workspace_name,
    chestId: r.chest_id ?? null, chestName: r.chest_name || null, chestWorld: r.chest_world || null,
    name: r.name, quantity: r.quantity, category: r.category || '', rarity: r.rarity || 'Commun',
  }));

  res.json({ projects, chests, resources });
});

// Édition d'une quantité (delta OU valeur absolue), toutes workspaces confondues.
minecraftAdminRouter.post('/resources/:id/adjust', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT quantity FROM minecraft_resources WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const { delta, quantity } = req.body || {};
  let next;
  if (quantity !== undefined) next = Math.max(0, Math.floor(Number(quantity) || 0));
  else next = Math.max(0, row.quantity + Math.floor(Number(delta) || 0));
  db.prepare("UPDATE minecraft_resources SET quantity = ?, updated_at = strftime('%s','now') WHERE id = ?")
    .run(next, id);
  res.json({ id, quantity: next });
});

// ── Boutiques (shops) ─────────────────────────────────────────────────────────

function shopItems(shopId) {
  return db.prepare(`
    SELECT si.*, ch.name AS chest_name, ch.world AS chest_world
    FROM shop_items si LEFT JOIN minecraft_chests ch ON ch.id = si.chest_id
    WHERE si.shop_id = ? ORDER BY si.position, si.id
  `).all(shopId).map((i) => ({
    id: i.id, shopId: i.shop_id, itemId: i.item_id, itemName: i.item_name,
    category: i.category || '', price: i.price, unit: i.unit || 'unité', stock: i.stock,
    chestId: i.chest_id ?? null, chestName: i.chest_name || null, chestWorld: i.chest_world || null,
    note: i.note || '',
  }));
}

function shopWithItems(row) {
  const items = shopItems(row.id);
  return {
    id: row.id, name: row.name, projectId: row.project_id ?? null,
    description: row.description || '', currency: row.currency || 'émeraudes',
    items,
    totalValue: items.reduce((s, it) => s + it.price * it.stock, 0),
  };
}

minecraftAdminRouter.get('/shops', (_req, res) => {
  const shops = db.prepare(`
    SELECT s.*, w.name AS project_name
    FROM shops s LEFT JOIN workspaces w ON w.id = s.project_id
    ORDER BY s.position, s.id
  `).all();
  res.json(shops.map((s) => ({ ...shopWithItems(s), projectName: s.project_name || null })));
});

minecraftAdminRouter.post('/shops', (req, res) => {
  const { name, projectId, description, currency } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'missing_name' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM shops').get().n;
  const r = db.prepare(`
    INSERT INTO shops (name, project_id, description, currency, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(name).trim(),
    projectId ? Number(projectId) : null,
    String(description || '').trim(),
    String(currency || 'émeraudes').trim() || 'émeraudes',
    pos, req.user.id,
  );
  res.status(201).json(shopWithItems(db.prepare('SELECT * FROM shops WHERE id = ?').get(r.lastInsertRowid)));
});

minecraftAdminRouter.put('/shops/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const { name, projectId, description, currency } = req.body || {};
  db.prepare(`
    UPDATE shops SET
      name = COALESCE(?, name),
      project_id = ?,
      description = COALESCE(?, description),
      currency = COALESCE(?, currency),
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    name === undefined ? null : String(name).trim(),
    'projectId' in (req.body || {}) ? (projectId ? Number(projectId) : null) : existing.project_id,
    description === undefined ? null : String(description).trim(),
    currency === undefined ? null : (String(currency).trim() || 'émeraudes'),
    id,
  );
  res.json(shopWithItems(db.prepare('SELECT * FROM shops WHERE id = ?').get(id)));
});

minecraftAdminRouter.delete('/shops/:id', (req, res) => {
  const r = db.prepare('DELETE FROM shops WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Items en vente ────────────────────────────────────────────────────────────

function cleanItemBody(b) {
  return {
    itemId: String(b?.itemId || '').trim(),
    itemName: String(b?.itemName || '').trim(),
    category: String(b?.category || '').trim(),
    price: Math.max(0, Number(b?.price) || 0),
    unit: String(b?.unit || 'unité').trim() || 'unité',
    stock: Math.max(0, Math.floor(Number(b?.stock) || 0)),
    chestId: b?.chestId ? Number(b.chestId) : null,
    note: String(b?.note || '').trim(),
  };
}

minecraftAdminRouter.post('/shops/:id/items', (req, res) => {
  const shopId = Number(req.params.id);
  const shop = db.prepare('SELECT id FROM shops WHERE id = ?').get(shopId);
  if (!shop) return res.status(404).json({ error: 'not_found' });
  const c = cleanItemBody(req.body);
  if (!c.itemId) return res.status(400).json({ error: 'missing_item' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM shop_items WHERE shop_id = ?').get(shopId).n;
  db.prepare(`
    INSERT INTO shop_items (shop_id, item_id, item_name, category, price, unit, stock, chest_id, note, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(shopId, c.itemId, c.itemName, c.category, c.price, c.unit, c.stock, c.chestId, c.note, pos);
  res.status(201).json(shopWithItems(db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId)));
});

minecraftAdminRouter.put('/shop-items/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const c = cleanItemBody({ ...existing, itemId: existing.item_id, itemName: existing.item_name, chestId: existing.chest_id, ...req.body });
  db.prepare(`
    UPDATE shop_items SET
      item_id = ?, item_name = ?, category = ?, price = ?, unit = ?, stock = ?, chest_id = ?, note = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(c.itemId, c.itemName, c.category, c.price, c.unit, c.stock, c.chestId, c.note, id);
  res.json(shopWithItems(db.prepare('SELECT * FROM shops WHERE id = ?').get(existing.shop_id)));
});

minecraftAdminRouter.delete('/shop-items/:id', (req, res) => {
  const existing = db.prepare('SELECT shop_id FROM shop_items WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM shop_items WHERE id = ?').run(Number(req.params.id));
  res.json(shopWithItems(db.prepare('SELECT * FROM shops WHERE id = ?').get(existing.shop_id)));
});

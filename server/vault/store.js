// Couche d'accès aux données de l'atelier « Salle des coffres ».
// Mêmes conventions que le reste du serveur : colonnes snake_case en entrée,
// objets camelCase en sortie, aucune requête préparée au niveau module (les
// tables n'existent qu'après migrate()).

import { db } from '../db.js';
import { planStats } from './capacity.js';
import { EMPTY_DOC, normalizeDims, normalizeDoc, normalizeOrigin } from './validate.js';

// ── Plans ────────────────────────────────────────────────────────────────

function parseDoc(raw) {
  try {
    const doc = JSON.parse(raw || '{}');
    return {
      floors: doc.floors || [],
      zones: doc.zones || [],
      chests: doc.chests || [],
      circulation: doc.circulation || [],
    };
  } catch {
    return { ...EMPTY_DOC };
  }
}

function dimsOf(r) {
  return { x: r.dim_x, y: r.dim_y, z: r.dim_z };
}

function originOf(r) {
  if (r.origin_x == null && r.origin_y == null && r.origin_z == null) return null;
  return { x: r.origin_x ?? 0, y: r.origin_y ?? 0, z: r.origin_z ?? 0 };
}

// `canViewVault` remonte pour que l'UI signale un partage inopérant : le compte
// est bien destinataire, mais l'atelier lui est fermé tant qu'un admin ne lui a
// pas donné le flag. Pas d'email ici — le partage se fait par compte choisi
// dans la liste, il n'a pas à divulguer d'adresse.
export function listShares(planId) {
  return db.prepare(`
    SELECT s.user_id AS id, u.name, u.role, u.can_view_vault
    FROM vault_plan_shares s
    JOIN users u ON u.id = s.user_id
    WHERE s.plan_id = ?
    ORDER BY u.name, u.id
  `).all(planId).map((r) => ({
    id: r.id,
    name: r.name || `Compte #${r.id}`,
    canViewVault: r.role === 'admin' || r.can_view_vault === 1,
  }));
}

/**
 * `full: false` → métadonnées + stats seulement (liste des plans) ;
 * `full: true`  → document complet, à plat comme dans le modèle de la spec.
 */
function mapPlan(r, { full = false, role = null } = {}) {
  if (!r) return null;
  const doc = parseDoc(r.data);
  const dims = dimsOf(r);
  const base = {
    id: r.id,
    name: r.name,
    mcVersion: r.mc_version,
    dims,
    worldOrigin: originOf(r),
    revision: r.revision,
    createdBy: r.created_by,
    createdByName: r.created_by_name || null,
    updatedBy: r.updated_by,
    updatedByName: r.updated_by_name || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    stats: planStats(doc, dims),
    sharedWith: listShares(r.id),
    role,
  };
  return full ? { ...base, ...doc } : base;
}

const PLAN_SELECT = `
  SELECT p.*, cu.name AS created_by_name, uu.name AS updated_by_name
  FROM vault_plans p
  LEFT JOIN users cu ON cu.id = p.created_by
  LEFT JOIN users uu ON uu.id = p.updated_by
`;

/** Mes plans + ceux partagés avec moi. Aucun bypass admin : un plan est personnel. */
export function listPlansFor(userId) {
  const rows = db.prepare(`
    ${PLAN_SELECT}
    WHERE p.created_by = ?
       OR EXISTS (SELECT 1 FROM vault_plan_shares s WHERE s.plan_id = p.id AND s.user_id = ?)
    ORDER BY p.updated_at DESC, p.id DESC
  `).all(userId, userId);
  return rows.map((r) => mapPlan(r, { role: r.created_by === userId ? 'owner' : 'shared' }));
}

/** Ligne + rôle de l'appelant, ou null s'il n'y a pas accès (404 côté route). */
export function planAccess(planId, userId) {
  const row = db.prepare(`${PLAN_SELECT} WHERE p.id = ?`).get(planId);
  if (!row) return null;
  if (row.created_by === userId) return { row, role: 'owner' };
  const shared = db.prepare('SELECT 1 FROM vault_plan_shares WHERE plan_id = ? AND user_id = ?')
    .get(planId, userId);
  return shared ? { row, role: 'shared' } : null;
}

export function getPlan(planId, userId) {
  const access = planAccess(planId, userId);
  if (!access) return null;
  return mapPlan(access.row, { full: true, role: access.role });
}

export function createPlan({ name, mcVersion, dims, worldOrigin, doc }, userId) {
  const d = normalizeDims(dims);
  const origin = normalizeOrigin(worldOrigin);
  const document = normalizeDoc(doc || EMPTY_DOC, d);
  const res = db.prepare(`
    INSERT INTO vault_plans
      (name, mc_version, dim_x, dim_y, dim_z, origin_x, origin_y, origin_z, data, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(name || 'Salle des coffres').slice(0, 120),
    String(mcVersion || '1.21').slice(0, 20),
    d.x, d.y, d.z,
    origin?.x ?? null, origin?.y ?? null, origin?.z ?? null,
    JSON.stringify(document),
    userId, userId,
  );
  return getPlan(res.lastInsertRowid, userId);
}

/**
 * Sauvegarde avec verrou optimiste. L'UPDATE est conditionné à la révision
 * attendue, donc deux éditeurs simultanés ne peuvent pas s'écraser : le second
 * repart avec `{ conflict }` et l'UI propose Recharger / Écraser.
 * `force: true` = « Écraser » — on saute la condition de révision.
 */
export function savePlan(planId, input, userId, { force = false } = {}) {
  const access = planAccess(planId, userId);
  if (!access) return { notFound: true };
  const { row } = access;

  const dims = normalizeDims(input.dims ?? dimsOf(row));
  const origin = normalizeOrigin(input.worldOrigin !== undefined ? input.worldOrigin : originOf(row));
  const document = normalizeDoc(input, dims);
  const expected = Number(input.revision);

  const sql = `
    UPDATE vault_plans SET
      name = ?, mc_version = ?, dim_x = ?, dim_y = ?, dim_z = ?,
      origin_x = ?, origin_y = ?, origin_z = ?,
      data = ?, revision = revision + 1, updated_by = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?${force ? '' : ' AND revision = ?'}
  `;
  const args = [
    String(input.name ?? row.name).slice(0, 120),
    String(input.mcVersion ?? row.mc_version).slice(0, 20),
    dims.x, dims.y, dims.z,
    origin?.x ?? null, origin?.y ?? null, origin?.z ?? null,
    JSON.stringify(document),
    userId,
    planId,
  ];
  if (!force) args.push(expected);

  const res = db.prepare(sql).run(...args);
  if (res.changes === 0) {
    const current = db.prepare(`${PLAN_SELECT} WHERE p.id = ?`).get(planId);
    if (!current) return { notFound: true };
    return {
      conflict: {
        updatedBy: current.updated_by_name || null,
        updatedAt: current.updated_at,
        serverRevision: current.revision,
      },
    };
  }
  return { plan: getPlan(planId, userId) };
}

export function deletePlan(planId) {
  return db.prepare('DELETE FROM vault_plans WHERE id = ?').run(planId).changes > 0;
}

// ── Partage ──────────────────────────────────────────────────────────────

export function addShare(planId, userId) {
  db.prepare('INSERT OR IGNORE INTO vault_plan_shares (plan_id, user_id) VALUES (?, ?)')
    .run(planId, userId);
  return listShares(planId);
}

export function removeShare(planId, userId) {
  db.prepare('DELETE FROM vault_plan_shares WHERE plan_id = ? AND user_id = ?').run(planId, userId);
  return listShares(planId);
}

// ── Snapshots ────────────────────────────────────────────────────────────

// Un snapshot fige le document ET le gabarit ET une copie des catégories
// référencées : celles-ci vivent dans une table globale, donc sans copie un
// snapshot restauré des mois plus tard pointerait vers des catégories
// renommées ou disparues.
function snapshotPayload(row) {
  const doc = parseDoc(row.data);
  const used = new Set(doc.zones.flatMap((z) => z.categoryIds || []));
  const categories = used.size > 0
    ? listCategories().filter((c) => used.has(c.id))
    : [];
  return {
    mcVersion: row.mc_version,
    dims: dimsOf(row),
    worldOrigin: originOf(row),
    doc,
    categories,
  };
}

function mapSnapshot(r, { full = false } = {}) {
  let payload = {};
  try { payload = JSON.parse(r.data || '{}'); } catch { payload = {}; }
  const base = {
    id: r.id,
    planId: r.plan_id,
    label: r.label,
    createdBy: r.created_by,
    createdByName: r.created_by_name || null,
    createdAt: r.created_at,
    mcVersion: payload.mcVersion || '',
    dims: payload.dims || null,
    stats: planStats(payload.doc || EMPTY_DOC, payload.dims),
    categories: payload.categories || [],
  };
  return full ? { ...base, payload } : base;
}

export function listSnapshots(planId) {
  return db.prepare(`
    SELECT v.*, u.name AS created_by_name
    FROM vault_plan_versions v
    LEFT JOIN users u ON u.id = v.created_by
    WHERE v.plan_id = ?
    ORDER BY v.id DESC
  `).all(planId).map((r) => mapSnapshot(r));
}

export function createSnapshot(planId, label, userId) {
  const row = db.prepare('SELECT * FROM vault_plans WHERE id = ?').get(planId);
  if (!row) return null;
  const res = db.prepare(`
    INSERT INTO vault_plan_versions (plan_id, label, data, created_by) VALUES (?, ?, ?, ?)
  `).run(planId, String(label || '').slice(0, 120) || `Snapshot ${new Date().toISOString().slice(0, 10)}`,
    JSON.stringify(snapshotPayload(row)), userId);
  const saved = db.prepare(`
    SELECT v.*, u.name AS created_by_name FROM vault_plan_versions v
    LEFT JOIN users u ON u.id = v.created_by WHERE v.id = ?
  `).get(res.lastInsertRowid);
  return mapSnapshot(saved);
}

/**
 * Restaure un snapshot dans un NOUVEAU plan (l'original n'est jamais écrasé).
 * Les catégories du snapshot qui n'existent plus sont recréées et les zones
 * remappées, pour que le plan restauré soit cohérent tout seul.
 */
export function restoreSnapshot(planId, snapshotId, userId) {
  const snap = db.prepare('SELECT * FROM vault_plan_versions WHERE id = ? AND plan_id = ?')
    .get(snapshotId, planId);
  if (!snap) return null;
  let payload = {};
  try { payload = JSON.parse(snap.data || '{}'); } catch { payload = {}; }

  const dims = normalizeDims(payload.dims);
  const doc = normalizeDoc(payload.doc || EMPTY_DOC, dims);

  const alive = new Set(listCategories().map((c) => c.id));
  const remap = new Map();
  for (const cat of payload.categories || []) {
    if (alive.has(cat.id)) continue;
    const recreated = createCategory(
      { name: cat.name, color: cat.color, itemIds: cat.itemIds }, userId,
    );
    remap.set(cat.id, recreated.id);
  }
  if (remap.size > 0) {
    for (const z of doc.zones) {
      z.categoryIds = (z.categoryIds || []).map((id) => remap.get(id) ?? id);
    }
  }

  const plan = db.prepare('SELECT name FROM vault_plans WHERE id = ?').get(planId);
  return createPlan({
    name: `${plan?.name || 'Plan'} — ${snap.label}`,
    mcVersion: payload.mcVersion,
    dims,
    worldOrigin: payload.worldOrigin,
    doc,
  }, userId);
}

// ── Catégories (table globale, partagée par tous les plans) ───────────────

function mapCategory(r) {
  if (!r) return null;
  let itemIds = [];
  try { itemIds = JSON.parse(r.item_ids || '[]'); } catch { itemIds = []; }
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    itemIds: Array.isArray(itemIds) ? itemIds : [],
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

export function listCategories() {
  return db.prepare('SELECT * FROM vault_categories ORDER BY sort_order, id').all().map(mapCategory);
}

// Ids de codex : chaînes courtes (« minefield:steel_ingot », « redstone »).
// Purement descriptif — aucune quantité n'est associée.
function cleanItemIds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.map((v) => String(v || '').slice(0, 120)).filter(Boolean))];
}

export function createCategory({ name, color, itemIds }, userId) {
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM vault_categories').get().n;
  const res = db.prepare(`
    INSERT INTO vault_categories (name, color, item_ids, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(name || '').slice(0, 80) || 'Catégorie',
    String(color || '#c9a8e8').slice(0, 9),
    JSON.stringify(cleanItemIds(itemIds)),
    next, userId, userId,
  );
  return mapCategory(db.prepare('SELECT * FROM vault_categories WHERE id = ?').get(res.lastInsertRowid));
}

export function updateCategory(id, patch, userId) {
  const row = db.prepare('SELECT * FROM vault_categories WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare(`
    UPDATE vault_categories SET
      name = ?, color = ?, item_ids = ?, sort_order = ?, updated_by = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    patch.name !== undefined ? String(patch.name).slice(0, 80) || row.name : row.name,
    patch.color !== undefined ? String(patch.color).slice(0, 9) : row.color,
    patch.itemIds !== undefined ? JSON.stringify(cleanItemIds(patch.itemIds)) : row.item_ids,
    patch.sortOrder !== undefined ? Math.trunc(Number(patch.sortOrder) || 0) : row.sort_order,
    userId, id,
  );
  return mapCategory(db.prepare('SELECT * FROM vault_categories WHERE id = ?').get(id));
}

// Les zones gardent l'id supprimé dans leur `categoryIds` : on ne réécrit pas
// tous les plans pour une suppression. Le front ignore un id inconnu.
export function deleteCategory(id) {
  return db.prepare('DELETE FROM vault_categories WHERE id = ?').run(id).changes > 0;
}

import { db } from './db.js';

const WORKSPACE_SELECT = `
  SELECT w.*, u.name AS created_by_name
  FROM workspaces w
  LEFT JOIN users u ON u.id = w.created_by
`;

function parseTags(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.map(String).map((s) => s.trim()).filter(Boolean) : [];
  } catch { return []; }
}

export function rowToWorkspace(r) {
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    color: r.color,
    icon: r.icon,
    startDate: r.start_date,
    endDate: r.end_date,
    tags: parseTags(r.tags),
    status: r.status,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'projet';
}

export function uniqueSlug(base) {
  let slug = base;
  let n = 2;
  while (db.prepare(`SELECT 1 FROM workspaces WHERE slug = ?`).get(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export function findBySlug(slug) {
  const row = db.prepare(`${WORKSPACE_SELECT} WHERE w.slug = ?`).get(slug);
  return rowToWorkspace(row);
}

export function findById(id) {
  const row = db.prepare(`${WORKSPACE_SELECT} WHERE w.id = ?`).get(id);
  return rowToWorkspace(row);
}

export function listAll() {
  const rows = db.prepare(`${WORKSPACE_SELECT} ORDER BY w.status, w.name`).all();
  return rows.map(rowToWorkspace);
}

export function listForUser(userId) {
  const rows = db.prepare(`
    ${WORKSPACE_SELECT}
    INNER JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ?
    ORDER BY w.status, w.name
  `).all(userId);
  return rows.map(rowToWorkspace);
}

export function isMember(workspaceId, userId) {
  return !!db
    .prepare(`SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?`)
    .get(workspaceId, userId);
}

// True if the user can act inside the given workspace — admins can act in any
// workspace; members must be in the workspace_members list. Used to guard
// fields that pin a user to a workspace (e.g. feature.assignee_id) so a
// member can't pollute the board by assigning a card to someone with no
// access to it.
export function canAccessWorkspace(workspaceId, userId) {
  const u = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId);
  if (!u) return false;
  if (u.role === 'admin') return true;
  return isMember(workspaceId, userId);
}

export function listMemberIds(workspaceId) {
  return db
    .prepare(`SELECT user_id FROM workspace_members WHERE workspace_id = ?`)
    .all(workspaceId)
    .map((r) => r.user_id);
}

// Replaces the membership list of a workspace. Admin-only at the route layer.
// Note: an empty `userIds` is allowed and leaves the workspace with no
// members — admins still retain full access (resolveWorkspace bypasses the
// member check for them), so an empty list never produces an unreachable
// workspace.
export function setMembers(workspaceId, userIds) {
  const ids = [...new Set((userIds || []).map(Number).filter(Number.isFinite))];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM workspace_members WHERE workspace_id = ?`).run(workspaceId);
    const ins = db.prepare(`INSERT OR IGNORE INTO workspace_members (workspace_id, user_id) VALUES (?, ?)`);
    for (const uid of ids) {
      const exists = db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(uid);
      if (exists) ins.run(workspaceId, uid);
    }
  });
  tx();
}

export function createWorkspace(input, createdBy) {
  const {
    name,
    slug: requestedSlug,
    description = '',
    color = '#c9a8e8',
    icon = '🎮',
    startDate = null,
    endDate = null,
    tags = [],
    status = 'active',
    memberIds = [],
  } = input || {};

  if (!name || !name.trim()) throw new Error('missing_name');

  const baseSlug = requestedSlug ? slugify(requestedSlug) : slugify(name);
  const slug = uniqueSlug(baseSlug);

  const result = db.prepare(`
    INSERT INTO workspaces
      (slug, name, description, color, icon, start_date, end_date, tags, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug, name.trim(), (description || '').trim(),
    color, icon,
    parseUnix(startDate), parseUnix(endDate),
    JSON.stringify(Array.isArray(tags) ? tags : []),
    status === 'archived' ? 'archived' : 'active',
    createdBy,
  );

  setMembers(result.lastInsertRowid, memberIds);
  return findById(result.lastInsertRowid);
}

export function updateWorkspace(id, input) {
  const existing = findById(id);
  if (!existing) return null;

  const {
    name, slug, description, color, icon, startDate, endDate, tags, status, memberIds,
  } = input || {};

  let newSlug = existing.slug;
  if (slug && slug !== existing.slug) {
    newSlug = uniqueSlug(slugify(slug));
  }

  db.prepare(`
    UPDATE workspaces SET
      slug        = ?,
      name        = COALESCE(?, name),
      description = COALESCE(?, description),
      color       = COALESCE(?, color),
      icon        = COALESCE(?, icon),
      start_date  = ?,
      end_date    = ?,
      tags        = COALESCE(?, tags),
      status      = COALESCE(?, status),
      updated_at  = strftime('%s','now')
    WHERE id = ?
  `).run(
    newSlug,
    name ?? null,
    description ?? null,
    color ?? null,
    icon ?? null,
    startDate !== undefined ? parseUnix(startDate) : existing.startDate,
    endDate !== undefined ? parseUnix(endDate) : existing.endDate,
    Array.isArray(tags) ? JSON.stringify(tags) : null,
    status && ['active', 'archived'].includes(status) ? status : null,
    id,
  );
  if (Array.isArray(memberIds)) setMembers(id, memberIds);
  return findById(id);
}

export function deleteWorkspace(id) {
  return db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id).changes > 0;
}

function parseUnix(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? Math.floor(n / 1000) : null;
}

/**
 * Boot-time migration:
 *   - If there are orphan rows (NULL workspace_id) in features/meetings/
 *     documents/builds, move them all into a "Projet principal" workspace,
 *     adding every existing user as a member.
 *   - If there is no workspace at all and at least one user, also create an
 *     empty "Projet principal" for a better first-run UX.
 */
export function migrateOrphansToDefault() {
  const orphanCount =
    db.prepare(`SELECT COUNT(*) AS n FROM features WHERE workspace_id IS NULL`).get().n +
    db.prepare(`SELECT COUNT(*) AS n FROM meetings WHERE workspace_id IS NULL`).get().n +
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE workspace_id IS NULL`).get().n +
    db.prepare(`SELECT COUNT(*) AS n FROM builds WHERE workspace_id IS NULL`).get().n;

  const wsCount = db.prepare(`SELECT COUNT(*) AS n FROM workspaces`).get().n;
  const userCount = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;

  if (orphanCount === 0 && wsCount > 0) return null;
  if (orphanCount === 0 && userCount === 0) return null; // fresh install without users, skip

  let defaultWs = db.prepare(`SELECT * FROM workspaces WHERE slug = 'projet-principal'`).get();
  if (!defaultWs) {
    const r = db.prepare(`
      INSERT INTO workspaces (slug, name, description, color, icon, status)
      VALUES ('projet-principal', 'Projet principal', 'Projet par défaut.', '#c9a8e8', '🎮', 'active')
    `).run();
    defaultWs = db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(r.lastInsertRowid);
    const allUsers = db.prepare(`SELECT id FROM users`).all();
    const ins = db.prepare(`INSERT OR IGNORE INTO workspace_members (workspace_id, user_id) VALUES (?, ?)`);
    for (const u of allUsers) ins.run(defaultWs.id, u.id);
  }

  if (orphanCount > 0) {
    const tx = db.transaction(() => {
      db.prepare(`UPDATE features   SET workspace_id = ? WHERE workspace_id IS NULL`).run(defaultWs.id);
      db.prepare(`UPDATE meetings   SET workspace_id = ? WHERE workspace_id IS NULL`).run(defaultWs.id);
      db.prepare(`UPDATE documents  SET workspace_id = ? WHERE workspace_id IS NULL`).run(defaultWs.id);
      db.prepare(`UPDATE builds     SET workspace_id = ? WHERE workspace_id IS NULL`).run(defaultWs.id);
    });
    tx();
  }

  return { orphansMoved: orphanCount, workspaceId: defaultWs.id, workspaceSlug: defaultWs.slug };
}

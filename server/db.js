import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Public-site collections (kept as JSON-blob tables — schema-flexible)
const PUBLIC_COLLECTIONS = ['projects', 'tracks', 'education', 'experience', 'currently'];

export function migrate() {
  // ── Public collections ──
  for (const name of PUBLIC_COLLECTIONS) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${name} (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        position   INTEGER NOT NULL DEFAULT 0,
        data       TEXT    NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${name}_position ON ${name}(position);`);
  }

  // ── Users ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','member')),
      ical_token    TEXT,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('users', 'ical_token', 'TEXT');
  ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;`);

  // ── Workspaces (team projects) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#c9a8e8',
      icon        TEXT NOT NULL DEFAULT '🎮',
      start_date  INTEGER,
      end_date    INTEGER,
      tags        TEXT NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);`);

  // ── Per-project workspace data ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT,
      size          INTEGER NOT NULL,
      notes         TEXT DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('documents', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      version       TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'alpha',
      filename      TEXT,
      original_name TEXT,
      mime_type     TEXT,
      size          INTEGER,
      external_url  TEXT,
      notes         TEXT DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      released_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('builds', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_builds_workspace ON builds(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'backlog',
      priority     TEXT NOT NULL DEFAULT 'medium',
      assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      due_date     INTEGER,
      tags         TEXT NOT NULL DEFAULT '[]',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_status_pos ON features(status, position);`);
  // Backfill columns on pre-existing installs (must run before indexes that reference new columns)
  ensureColumn('features', 'due_date', 'INTEGER');
  ensureColumn('features', 'tags', `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn('features', 'subtasks', `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn('features', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_due_date ON features(due_date);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_workspace ON features(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      starts_at    INTEGER NOT NULL,
      ends_at      INTEGER,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('meetings', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meetings_workspace ON meetings(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(target_type, target_id, document_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_target ON attachments(target_type, target_id);`);

  // ── Site-wide settings (key/value JSON, e.g. public-page section order) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Revoked JWTs (blocklist) ──
  // Logging out, deleting a user, or otherwise wanting to invalidate a session
  // before its 7-day TTL stores the token's `jti` here. requireAuth rejects
  // any token whose jti is present. Rows are pruned on every check past their
  // expiry so the table stays bounded.
  db.exec(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti        TEXT PRIMARY KEY,
      user_id    INTEGER,
      expires_at INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);`);

  // ── Persistent rate-limit counters (login brute-force protection) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key        TEXT    NOT NULL,
      window_end INTEGER NOT NULL,
      hits       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_end)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rl_window ON rate_limit_hits(window_end);`);
}

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// ── Generic JSON-blob CRUD (public collections) ──
export function listAll(collection) {
  const rows = db.prepare(`SELECT id, position, data FROM ${collection} ORDER BY position ASC, id ASC`).all();
  return rows.map((r) => ({ id: r.id, position: r.position, ...JSON.parse(r.data) }));
}

export function getOne(collection, id) {
  const row = db.prepare(`SELECT id, position, data FROM ${collection} WHERE id = ?`).get(id);
  if (!row) return null;
  return { id: row.id, position: row.position, ...JSON.parse(row.data) };
}

export function insert(collection, data, position = null) {
  const { id, position: _pos, ...rest } = data || {};
  const pos = position ?? (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM ${collection}`).get().n);
  const result = db
    .prepare(`INSERT INTO ${collection} (position, data) VALUES (?, ?)`)
    .run(pos, JSON.stringify(rest));
  return getOne(collection, result.lastInsertRowid);
}

export function update(collection, id, data) {
  const existing = getOne(collection, id);
  if (!existing) return null;
  const { id: _i, position: _p, ...payload } = { ...existing, ...data };
  const newPos = data.position ?? existing.position;
  db.prepare(
    `UPDATE ${collection}
     SET position = ?, data = ?, updated_at = strftime('%s','now')
     WHERE id = ?`,
  ).run(newPos, JSON.stringify(payload), id);
  return getOne(collection, id);
}

export function remove(collection, id) {
  return db.prepare(`DELETE FROM ${collection} WHERE id = ?`).run(id).changes > 0;
}

export function reorder(collection, orderedIds) {
  const stmt = db.prepare(`UPDATE ${collection} SET position = ? WHERE id = ?`);
  const tx = db.transaction((ids) => { ids.forEach((id, idx) => stmt.run(idx, id)); });
  tx(orderedIds);
  return listAll(collection);
}

export function count(collection) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${collection}`).get().n;
}

export const COLLECTIONS = PUBLIC_COLLECTIONS;

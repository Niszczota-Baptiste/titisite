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

const COLLECTIONS = ['projects', 'tracks', 'education', 'experience', 'currently'];

export function migrate() {
  for (const name of COLLECTIONS) {
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
}

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
  const tx = db.transaction((ids) => {
    ids.forEach((id, idx) => stmt.run(idx, id));
  });
  tx(orderedIds);
  return listAll(collection);
}

export function count(collection) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${collection}`).get().n;
}

export { COLLECTIONS };

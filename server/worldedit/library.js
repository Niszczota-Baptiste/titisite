/* eslint-disable security/detect-non-literal-fs-filename --
   Les chemins sont uploadPath(<UUID>.we.gz) : noms de fichiers générés
   (randomUUID), jamais d'entrée utilisateur brute. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { uploadPath } from '../uploads.js';
import { schemToBlob, blobToSchem } from './schematicFormats.js';

// Bibliothèque de schematics scopée par workspace : un presse-papier (Schematic)
// est persisté sur disque (palette + indices gzip) + une ligne de métadonnées.

const MAX_PER_WORKSPACE = Number(process.env.WORLDEDIT_SCHEM_MAX || 200);

function countNonAir(schem) {
  let n = 0;
  for (const b of schem.data) if (b && b.Name !== 'minecraft:air') n++;
  return n;
}

export function saveSchematic({ workspaceId, name, schem, userId = null }) {
  const existing = db.prepare('SELECT COUNT(*) c FROM worldedit_schematics WHERE workspace_id = ?').get(workspaceId).c;
  if (existing >= MAX_PER_WORKSPACE) throw new Error('library_full');
  const file = `${crypto.randomUUID()}.we.gz`;
  fs.writeFileSync(uploadPath(file), schemToBlob(schem));
  const info = db.prepare(`
    INSERT INTO worldedit_schematics (workspace_id, name, size_x, size_y, size_z, block_count, data_file, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(workspaceId, String(name || 'schematic').slice(0, 80), schem.sx, schem.sy, schem.sz, countNonAir(schem), file, userId);
  return getSchematic(workspaceId, info.lastInsertRowid);
}

const toMeta = (r) => (r ? {
  id: r.id, name: r.name, sx: r.size_x, sy: r.size_y, sz: r.size_z,
  blockCount: r.block_count, createdAt: r.created_at,
} : null);

export function listSchematics(workspaceId) {
  return db.prepare('SELECT * FROM worldedit_schematics WHERE workspace_id = ? ORDER BY id DESC').all(workspaceId).map(toMeta);
}

function rawSchematic(workspaceId, id) {
  return db.prepare('SELECT * FROM worldedit_schematics WHERE id = ? AND workspace_id = ?').get(Number(id), workspaceId);
}

export function getSchematic(workspaceId, id) {
  return toMeta(rawSchematic(workspaceId, id));
}

export function loadSchematicClip(workspaceId, id) {
  const r = rawSchematic(workspaceId, id);
  if (!r) throw new Error('not_found');
  return blobToSchem(fs.readFileSync(uploadPath(r.data_file)));
}

export function deleteSchematic(workspaceId, id) {
  const r = rawSchematic(workspaceId, id);
  if (!r) throw new Error('not_found');
  try { fs.unlinkSync(uploadPath(r.data_file)); } catch { /* déjà absent */ }
  db.prepare('DELETE FROM worldedit_schematics WHERE id = ?').run(r.id);
  return true;
}

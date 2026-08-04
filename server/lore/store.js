import { db } from '../db.js';
import { TERMINAL_STATUSES } from './enums.js';
import { uniqueSlug } from '../slugify.js';
import { safeUnlink } from '../uploads.js';

// Couche d'accès DB du module Lore. Tout passe par des prepared statements ;
// la validation des entrées utilisateur vit dans routes/lore.js, ici on ne
// fait que lire/écrire. La table FTS (lore_fts) est synchronisée EXPLICITEMENT
// par les fonctions de ce fichier — si une écriture contourne le store, la
// recherche décroche.

// ── FTS ─────────────────────────────────────────────────────────────────────

function ftsUpsert(kind, refId, title, body) {
  db.prepare(`DELETE FROM lore_fts WHERE kind = ? AND ref_id = ?`).run(kind, refId);
  db.prepare(`INSERT INTO lore_fts (kind, ref_id, title, body) VALUES (?, ?, ?, ?)`)
    .run(kind, refId, title || '', body || '');
}

function ftsDelete(kind, refId) {
  db.prepare(`DELETE FROM lore_fts WHERE kind = ? AND ref_id = ?`).run(kind, refId);
}

// Requête utilisateur → syntaxe MATCH sûre : chaque terme est mis entre
// guillemets (les opérateurs FTS5 de l'utilisateur deviennent du texte) avec
// un joker de préfixe. « kota nost » → « "kota"* "nost"* ».
export function ftsQuery(q) {
  const terms = String(q || '').split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}

// ── Mappers ─────────────────────────────────────────────────────────────────

function rowToEntry(r) {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    bodyMd: r.body_md,
    entryType: r.entry_type,
    x: r.coord_x,
    y: r.coord_y,
    z: r.coord_z,
    dimension: r.dimension,
    monde: r.monde,
    isCanon: r.is_canon === 1,
    peupleId: r.peuple_id,
    peupleName: r.peuple_name ?? undefined,
    discoveredAt: r.discovered_at,
    authorId: r.author_id,
    authorName: r.author_name ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToHypothesis(r) {
  return {
    id: r.id,
    title: r.title,
    bodyMd: r.body_md,
    status: r.status,
    confidence: r.confidence,
    createdBy: r.created_by,
    authorName: r.author_name ?? undefined,
    resolvedAt: r.resolved_at,
    resolutionNote: r.resolution_note,
    supportsCount: r.supports_count ?? undefined,
    contradictsCount: r.contradicts_count ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMedia(r) {
  return {
    id: r.id,
    entryId: r.entry_id,
    hypothesisId: r.hypothesis_id,
    url: `/api/lore/media/file/${r.filename}`,
    thumbUrl: r.thumb_filename ? `/api/lore/media/file/${r.thumb_filename}` : null,
    originalName: r.original_name,
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    size: r.size,
    caption: r.caption,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

function rowToMap(r) {
  return {
    id: r.id,
    name: r.name,
    dimension: r.dimension,
    monde: r.monde,
    imageUrl: r.image_filename ? `/api/lore/media/file/${r.image_filename}` : null,
    imgXLeft: r.img_x_left,
    imgXRight: r.img_x_right,
    imgZBottom: r.img_z_bottom,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Tags ────────────────────────────────────────────────────────────────────

export function listTags() {
  return db.prepare(`
    SELECT t.id, t.name, t.color, COUNT(et.entry_id) AS used
    FROM lore_tags t
    LEFT JOIN lore_entry_tags et ON et.tag_id = t.id
    GROUP BY t.id ORDER BY t.name COLLATE NOCASE
  `).all();
}

export function createTag(name, color) {
  try {
    const info = db.prepare(`INSERT INTO lore_tags (name, color) VALUES (?, ?)`)
      .run(name, color || '#c9a8e8');
    return db.prepare(`SELECT id, name, color, 0 AS used FROM lore_tags WHERE id = ?`)
      .get(info.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return null; // 409 côté route
    throw err;
  }
}

export function updateTag(id, { name, color }) {
  const existing = db.prepare(`SELECT * FROM lore_tags WHERE id = ?`).get(id);
  if (!existing) return undefined;
  try {
    db.prepare(`UPDATE lore_tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?`)
      .run(name ?? null, color ?? null, id);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return null;
    throw err;
  }
  return db.prepare(`SELECT id, name, color FROM lore_tags WHERE id = ?`).get(id);
}

export function deleteTag(id) {
  return db.prepare(`DELETE FROM lore_tags WHERE id = ?`).run(id).changes > 0;
}

// Remplace les tags d'une entrée par la liste de NOMS donnée (upsert par nom,
// insensible à la casse — le premier orthographe rencontré fait foi).
export function setEntryTags(entryId, names) {
  const wanted = [];
  const seen = new Set();
  for (const raw of names || []) {
    const name = String(raw || '').trim().slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let tag = db.prepare(`SELECT id FROM lore_tags WHERE name = ? COLLATE NOCASE`).get(name);
    if (!tag) {
      const info = db.prepare(`INSERT INTO lore_tags (name) VALUES (?)`).run(name);
      tag = { id: info.lastInsertRowid };
    }
    wanted.push(tag.id);
  }
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM lore_entry_tags WHERE entry_id = ?`).run(entryId);
    const ins = db.prepare(`INSERT OR IGNORE INTO lore_entry_tags (entry_id, tag_id) VALUES (?, ?)`);
    for (const tagId of wanted) ins.run(entryId, tagId);
  });
  tx();
}

function tagsForEntries(ids) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT et.entry_id, t.id, t.name, t.color
    FROM lore_entry_tags et JOIN lore_tags t ON t.id = et.tag_id
    WHERE et.entry_id IN (${placeholders})
    ORDER BY t.name COLLATE NOCASE
  `).all(...ids);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.entry_id)) map.set(r.entry_id, []);
    map.get(r.entry_id).push({ id: r.id, name: r.name, color: r.color });
  }
  return map;
}

// ── Entrées ─────────────────────────────────────────────────────────────────

const ENTRY_SELECT = `
  SELECT e.*, u.name AS author_name, p.name AS peuple_name
  FROM lore_entries e
  LEFT JOIN users u ON u.id = e.author_id
  LEFT JOIN lore_peuples p ON p.id = e.peuple_id
`;

// Filtres combinables : type, dimension, canon (0/1), tag (id), q (FTS),
// rectangle géographique x1/z1/x2/z2. Les fragments SQL sont des constantes du
// code — seules les VALEURS passent en paramètres.
export function listEntries(filters = {}) {
  const where = [];
  const params = [];
  if (filters.type) { where.push(`e.entry_type = ?`); params.push(filters.type); }
  if (filters.dimension) { where.push(`e.dimension = ?`); params.push(filters.dimension); }
  if (filters.monde) { where.push(`e.monde = ?`); params.push(filters.monde); }
  if (filters.peuple) { where.push(`e.peuple_id = ?`); params.push(filters.peuple); }
  if (filters.canon !== undefined) { where.push(`e.is_canon = ?`); params.push(filters.canon ? 1 : 0); }
  if (filters.tag) {
    where.push(`EXISTS (SELECT 1 FROM lore_entry_tags et WHERE et.entry_id = e.id AND et.tag_id = ?)`);
    params.push(filters.tag);
  }
  if (filters.q) {
    const match = ftsQuery(filters.q);
    if (!match) return [];
    where.push(`e.id IN (SELECT ref_id FROM lore_fts WHERE kind = 'entry' AND lore_fts MATCH ?)`);
    params.push(match);
  }
  if (filters.x1 !== undefined && filters.x2 !== undefined
      && filters.z1 !== undefined && filters.z2 !== undefined) {
    where.push(`e.coord_x IS NOT NULL AND e.coord_z IS NOT NULL
      AND e.coord_x BETWEEN ? AND ? AND e.coord_z BETWEEN ? AND ?`);
    params.push(
      Math.min(filters.x1, filters.x2), Math.max(filters.x1, filters.x2),
      Math.min(filters.z1, filters.z2), Math.max(filters.z1, filters.z2),
    );
  }
  const sql = `${ENTRY_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.updated_at DESC, e.id DESC`;
  const rows = db.prepare(sql).all(...params);
  const tags = tagsForEntries(rows.map((r) => r.id));
  return rows.map((r) => ({ ...rowToEntry(r), tags: tags.get(r.id) || [] }));
}

export function entryExists(id) {
  return !!db.prepare(`SELECT 1 FROM lore_entries WHERE id = ?`).get(id);
}

// Fiche complète : entrée + tags + médias + liens sortants/entrants (avec le
// titre de l'autre bout) + les hypothèses où elle sert de preuve.
export function getEntry(id) {
  const row = db.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id);
  if (!row) return null;
  const entry = rowToEntry(row);
  entry.tags = tagsForEntries([row.id]).get(row.id) || [];
  entry.media = db.prepare(`SELECT * FROM lore_media WHERE entry_id = ? ORDER BY id`)
    .all(id).map(rowToMedia);
  entry.linksOut = db.prepare(`
    SELECT l.*, e2.title AS other_title, e2.slug AS other_slug, e2.entry_type AS other_type
    FROM lore_links l JOIN lore_entries e2 ON e2.id = l.to_entry_id
    WHERE l.from_entry_id = ? ORDER BY l.id
  `).all(id).map((l) => ({
    id: l.id, entryId: l.to_entry_id, title: l.other_title, slug: l.other_slug,
    entryType: l.other_type, relationType: l.relation_type, note: l.note,
  }));
  entry.linksIn = db.prepare(`
    SELECT l.*, e2.title AS other_title, e2.slug AS other_slug, e2.entry_type AS other_type
    FROM lore_links l JOIN lore_entries e2 ON e2.id = l.from_entry_id
    WHERE l.to_entry_id = ? ORDER BY l.id
  `).all(id).map((l) => ({
    id: l.id, entryId: l.from_entry_id, title: l.other_title, slug: l.other_slug,
    entryType: l.other_type, relationType: l.relation_type, note: l.note,
  }));
  entry.dialogues = db.prepare(`
    SELECT d.id, d.texte, d.quest_name, d.position, d.created_at
    FROM lore_dialogues d WHERE d.entry_id = ? ORDER BY d.position, d.id
  `).all(id).map((r) => ({
    id: r.id, texte: r.texte, questName: r.quest_name, position: r.position, createdAt: r.created_at,
  }));
  entry.evidenceOf = db.prepare(`
    SELECT ev.id, ev.stance, ev.note, h.id AS hypothesis_id, h.title, h.status
    FROM lore_evidence ev JOIN lore_hypotheses h ON h.id = ev.hypothesis_id
    WHERE ev.entry_id = ? ORDER BY ev.id
  `).all(id).map((r) => ({
    id: r.id, hypothesisId: r.hypothesis_id, title: r.title, status: r.status,
    stance: r.stance, note: r.note,
  }));
  return entry;
}

export function getEntryBySlug(slug) {
  const row = db.prepare(`SELECT id FROM lore_entries WHERE slug = ?`).get(slug);
  return row ? getEntry(row.id) : null;
}

export function createEntry(d, userId) {
  const slug = uniqueSlug('lore_entries', d.title);
  const info = db.prepare(`
    INSERT INTO lore_entries
      (title, slug, body_md, entry_type, coord_x, coord_y, coord_z, dimension,
       monde, peuple_id, is_canon, discovered_at, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.title, slug, d.bodyMd || '', d.entryType || 'observation',
    d.x ?? null, d.y ?? null, d.z ?? null, d.dimension || 'overworld',
    d.monde || 'nostra', d.peupleId ?? null,
    d.isCanon ? 1 : 0, d.discoveredAt ?? null, userId ?? null,
  );
  const id = info.lastInsertRowid;
  if (d.tags) setEntryTags(id, d.tags);
  snapshotRevision('entry', id, d.bodyMd || '', userId);
  ftsUpsert('entry', id, d.title, d.bodyMd || '');
  return getEntry(id);
}

// Mise à jour partielle : seules les clés présentes changent. Le slug reste
// stable (les liens [[...]] et URLs y survivent) ; une révision n'est
// snapshotée que si le body_md change réellement.
export function updateEntry(id, d, userId) {
  const existing = db.prepare(`SELECT * FROM lore_entries WHERE id = ?`).get(id);
  if (!existing) return null;
  const next = {
    title: d.title ?? existing.title,
    body_md: d.bodyMd ?? existing.body_md,
    entry_type: d.entryType ?? existing.entry_type,
    coord_x: d.x !== undefined ? d.x : existing.coord_x,
    coord_y: d.y !== undefined ? d.y : existing.coord_y,
    coord_z: d.z !== undefined ? d.z : existing.coord_z,
    dimension: d.dimension ?? existing.dimension,
    monde: d.monde ?? existing.monde,
    peuple_id: d.peupleId !== undefined ? d.peupleId : existing.peuple_id,
    is_canon: d.isCanon !== undefined ? (d.isCanon ? 1 : 0) : existing.is_canon,
    discovered_at: d.discoveredAt !== undefined ? d.discoveredAt : existing.discovered_at,
  };
  db.prepare(`
    UPDATE lore_entries SET
      title = ?, body_md = ?, entry_type = ?, coord_x = ?, coord_y = ?, coord_z = ?,
      dimension = ?, monde = ?, peuple_id = ?, is_canon = ?, discovered_at = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    next.title, next.body_md, next.entry_type, next.coord_x, next.coord_y, next.coord_z,
    next.dimension, next.monde, next.peuple_id, next.is_canon, next.discovered_at, id,
  );
  if (d.tags) setEntryTags(id, d.tags);
  if (d.bodyMd !== undefined && d.bodyMd !== existing.body_md) {
    snapshotRevision('entry', id, d.bodyMd, userId);
  }
  if (next.title !== existing.title || next.body_md !== existing.body_md) {
    ftsUpsert('entry', id, next.title, next.body_md);
  }
  return getEntry(id);
}

export function deleteEntry(id) {
  const existing = db.prepare(`SELECT 1 FROM lore_entries WHERE id = ?`).get(id);
  if (!existing) return false;
  const files = db.prepare(`SELECT filename, thumb_filename FROM lore_media WHERE entry_id = ?`).all(id);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM lore_entries WHERE id = ?`).run(id); // cascade: tags, liens, preuves, médias
    db.prepare(`DELETE FROM lore_revisions WHERE target_type = 'entry' AND target_id = ?`).run(id);
    ftsDelete('entry', id);
  });
  tx();
  for (const f of files) { safeUnlink(f.filename); safeUnlink(f.thumb_filename); }
  return true;
}

// ── Liens entre entrées ─────────────────────────────────────────────────────

export function createLink({ fromEntryId, toEntryId, relationType, note }, userId) {
  try {
    const info = db.prepare(`
      INSERT INTO lore_links (from_entry_id, to_entry_id, relation_type, note, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(fromEntryId, toEntryId, relationType, note || '', userId ?? null);
    return db.prepare(`SELECT * FROM lore_links WHERE id = ?`).get(info.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return null; // 409 côté route
    throw err;
  }
}

export function deleteLink(id) {
  return db.prepare(`DELETE FROM lore_links WHERE id = ?`).run(id).changes > 0;
}

// ── Hypothèses ──────────────────────────────────────────────────────────────

const HYPOTHESIS_SELECT = `
  SELECT h.*, u.name AS author_name,
    (SELECT COUNT(*) FROM lore_evidence ev WHERE ev.hypothesis_id = h.id AND ev.stance = 'supports') AS supports_count,
    (SELECT COUNT(*) FROM lore_evidence ev WHERE ev.hypothesis_id = h.id AND ev.stance = 'contradicts') AS contradicts_count
  FROM lore_hypotheses h LEFT JOIN users u ON u.id = h.created_by
`;

export function listHypotheses(filters = {}) {
  const where = [];
  const params = [];
  if (filters.status) { where.push(`h.status = ?`); params.push(filters.status); }
  const sql = `${HYPOTHESIS_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY h.updated_at DESC, h.id DESC`;
  return db.prepare(sql).all(...params).map(rowToHypothesis);
}

export function hypothesisExists(id) {
  return !!db.prepare(`SELECT 1 FROM lore_hypotheses WHERE id = ?`).get(id);
}

export function getHypothesis(id) {
  const row = db.prepare(`${HYPOTHESIS_SELECT} WHERE h.id = ?`).get(id);
  if (!row) return null;
  const h = rowToHypothesis(row);
  h.evidence = db.prepare(`
    SELECT ev.*, e.title, e.slug, e.entry_type, e.coord_x, e.coord_y, e.coord_z, e.dimension
    FROM lore_evidence ev JOIN lore_entries e ON e.id = ev.entry_id
    WHERE ev.hypothesis_id = ? ORDER BY ev.id
  `).all(id).map((r) => ({
    id: r.id, entryId: r.entry_id, stance: r.stance, note: r.note,
    entry: {
      id: r.entry_id, title: r.title, slug: r.slug, entryType: r.entry_type,
      x: r.coord_x, y: r.coord_y, z: r.coord_z, dimension: r.dimension,
    },
  }));
  h.media = db.prepare(`SELECT * FROM lore_media WHERE hypothesis_id = ? ORDER BY id`)
    .all(id).map(rowToMedia);
  return h;
}

export function createHypothesis(d, userId) {
  const status = d.status || 'open';
  // Une hypothèse créée directement close (cas du seed) est résolue d'emblée.
  const resolvedAt = TERMINAL_STATUSES.includes(status) ? Math.floor(Date.now() / 1000) : null;
  const info = db.prepare(`
    INSERT INTO lore_hypotheses (title, body_md, status, confidence, created_by, resolved_at, resolution_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(d.title, d.bodyMd || '', status, d.confidence ?? 50, userId ?? null, resolvedAt, d.resolutionNote || '');
  const id = info.lastInsertRowid;
  snapshotRevision('hypothesis', id, d.bodyMd || '', userId);
  ftsUpsert('hypothesis', id, d.title, d.bodyMd || '');
  return getHypothesis(id);
}

// Les règles de transition (note obligatoire pour un statut terminal) sont
// vérifiées dans la route ; ici on pose resolved_at en entrant dans un statut
// terminal et on l'efface en revenant à open/testing — la note, elle, reste
// (c'est la trace de la piste morte, jamais effacée automatiquement).
export function updateHypothesis(id, d, userId) {
  const existing = db.prepare(`SELECT * FROM lore_hypotheses WHERE id = ?`).get(id);
  if (!existing) return null;
  const status = d.status ?? existing.status;
  const wasTerminal = TERMINAL_STATUSES.includes(existing.status);
  const isTerminal = TERMINAL_STATUSES.includes(status);
  let resolvedAt = existing.resolved_at;
  if (isTerminal && !wasTerminal) resolvedAt = Math.floor(Date.now() / 1000);
  if (!isTerminal) resolvedAt = null;
  const next = {
    title: d.title ?? existing.title,
    body_md: d.bodyMd ?? existing.body_md,
    confidence: d.confidence ?? existing.confidence,
    resolution_note: d.resolutionNote ?? existing.resolution_note,
  };
  db.prepare(`
    UPDATE lore_hypotheses SET
      title = ?, body_md = ?, status = ?, confidence = ?, resolved_at = ?,
      resolution_note = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(next.title, next.body_md, status, next.confidence, resolvedAt, next.resolution_note, id);
  if (d.bodyMd !== undefined && d.bodyMd !== existing.body_md) {
    snapshotRevision('hypothesis', id, d.bodyMd, userId);
  }
  if (next.title !== existing.title || next.body_md !== existing.body_md) {
    ftsUpsert('hypothesis', id, next.title, next.body_md);
  }
  return getHypothesis(id);
}

export function deleteHypothesis(id) {
  const existing = db.prepare(`SELECT 1 FROM lore_hypotheses WHERE id = ?`).get(id);
  if (!existing) return false;
  const files = db.prepare(`SELECT filename, thumb_filename FROM lore_media WHERE hypothesis_id = ?`).all(id);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM lore_hypotheses WHERE id = ?`).run(id); // cascade: preuves, médias
    db.prepare(`DELETE FROM lore_revisions WHERE target_type = 'hypothesis' AND target_id = ?`).run(id);
    ftsDelete('hypothesis', id);
  });
  tx();
  for (const f of files) { safeUnlink(f.filename); safeUnlink(f.thumb_filename); }
  return true;
}

// ── Preuves ─────────────────────────────────────────────────────────────────

export function addEvidence({ hypothesisId, entryId, stance, note }, userId) {
  try {
    const info = db.prepare(`
      INSERT INTO lore_evidence (hypothesis_id, entry_id, stance, note, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(hypothesisId, entryId, stance, note || '', userId ?? null);
    return db.prepare(`SELECT * FROM lore_evidence WHERE id = ?`).get(info.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return null; // déjà liée → 409
    throw err;
  }
}

export function updateEvidence(id, { stance, note }) {
  const existing = db.prepare(`SELECT * FROM lore_evidence WHERE id = ?`).get(id);
  if (!existing) return null;
  db.prepare(`UPDATE lore_evidence SET stance = COALESCE(?, stance), note = COALESCE(?, note) WHERE id = ?`)
    .run(stance ?? null, note ?? null, id);
  return db.prepare(`SELECT * FROM lore_evidence WHERE id = ?`).get(id);
}

export function deleteEvidence(id) {
  return db.prepare(`DELETE FROM lore_evidence WHERE id = ?`).run(id).changes > 0;
}

// ── Révisions ───────────────────────────────────────────────────────────────

export function snapshotRevision(targetType, targetId, bodyMd, userId) {
  db.prepare(`
    INSERT INTO lore_revisions (target_type, target_id, body_md, author_id)
    VALUES (?, ?, ?, ?)
  `).run(targetType, targetId, bodyMd, userId ?? null);
}

export function listRevisions(targetType, targetId) {
  return db.prepare(`
    SELECT r.id, r.body_md, r.author_id, u.name AS author_name, r.created_at
    FROM lore_revisions r LEFT JOIN users u ON u.id = r.author_id
    WHERE r.target_type = ? AND r.target_id = ? ORDER BY r.id DESC
  `).all(targetType, targetId).map((r) => ({
    id: r.id, bodyMd: r.body_md, authorId: r.author_id,
    authorName: r.author_name ?? undefined, createdAt: r.created_at,
  }));
}

// ── Médias ──────────────────────────────────────────────────────────────────

export function insertMedia(d) {
  const info = db.prepare(`
    INSERT INTO lore_media
      (entry_id, hypothesis_id, filename, thumb_filename, original_name,
       mime_type, width, height, size, caption, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.entryId ?? null, d.hypothesisId ?? null, d.filename, d.thumbFilename ?? null,
    d.originalName || '', d.mimeType || null, d.width ?? null, d.height ?? null,
    d.size ?? 0, d.caption || '', d.uploadedBy ?? null,
  );
  return rowToMedia(db.prepare(`SELECT * FROM lore_media WHERE id = ?`).get(info.lastInsertRowid));
}

export function getMediaRaw(id) {
  return db.prepare(`SELECT * FROM lore_media WHERE id = ?`).get(id);
}

export function updateMediaCaption(id, caption) {
  const existing = db.prepare(`SELECT * FROM lore_media WHERE id = ?`).get(id);
  if (!existing) return null;
  db.prepare(`UPDATE lore_media SET caption = ? WHERE id = ?`).run(caption, id);
  return rowToMedia(db.prepare(`SELECT * FROM lore_media WHERE id = ?`).get(id));
}

export function deleteMedia(id) {
  const row = db.prepare(`SELECT filename, thumb_filename FROM lore_media WHERE id = ?`).get(id);
  if (!row) return false;
  db.prepare(`DELETE FROM lore_media WHERE id = ?`).run(id);
  safeUnlink(row.filename);
  safeUnlink(row.thumb_filename);
  return true;
}

// Le service de fichiers (/media/file/:f) ne sert que les noms connus en base :
// pièces jointes (pleine taille ou miniature) et fonds de carte.
export function mediaFilenameKnown(filename) {
  return !!(
    db.prepare(`SELECT 1 FROM lore_media WHERE filename = ? OR thumb_filename = ?`).get(filename, filename)
    || db.prepare(`SELECT 1 FROM lore_maps WHERE image_filename = ?`).get(filename)
    || db.prepare(`SELECT 1 FROM lore_map_tiles WHERE filename = ?`).get(filename)
  );
}

// ── Cartes (fonds calibrés) ────────────────────────────────────────────────

export function listMaps() {
  return db.prepare(`SELECT * FROM lore_maps ORDER BY position, id`).all().map(rowToMap);
}

export function getMapRaw(id) {
  return db.prepare(`SELECT * FROM lore_maps WHERE id = ?`).get(id);
}

export function createMap(d) {
  const pos = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM lore_maps`).get().n;
  const info = db.prepare(`
    INSERT INTO lore_maps (name, dimension, monde, img_x_left, img_x_right, img_z_bottom, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(d.name, d.dimension || 'overworld', d.monde || 'nostra', d.imgXLeft ?? null, d.imgXRight ?? null, d.imgZBottom ?? null, pos);
  return rowToMap(db.prepare(`SELECT * FROM lore_maps WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateMap(id, d) {
  const existing = getMapRaw(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE lore_maps SET
      name = COALESCE(?, name), dimension = COALESCE(?, dimension),
      img_x_left = ?, img_x_right = ?, img_z_bottom = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    d.name ?? null, d.dimension ?? null,
    d.imgXLeft !== undefined ? d.imgXLeft : existing.img_x_left,
    d.imgXRight !== undefined ? d.imgXRight : existing.img_x_right,
    d.imgZBottom !== undefined ? d.imgZBottom : existing.img_z_bottom,
    id,
  );
  return rowToMap(db.prepare(`SELECT * FROM lore_maps WHERE id = ?`).get(id));
}

export function setMapImage(id, filename) {
  const existing = getMapRaw(id);
  if (!existing) return null;
  db.prepare(`UPDATE lore_maps SET image_filename = ?, updated_at = strftime('%s','now') WHERE id = ?`)
    .run(filename, id);
  if (existing.image_filename) safeUnlink(existing.image_filename);
  return rowToMap(db.prepare(`SELECT * FROM lore_maps WHERE id = ?`).get(id));
}

export function deleteMap(id) {
  const existing = getMapRaw(id);
  if (!existing) return false;
  const tiles = db.prepare(`SELECT filename FROM lore_map_tiles WHERE map_id = ?`).all(id);
  db.prepare(`DELETE FROM lore_maps WHERE id = ?`).run(id); // cascade lore_map_tiles
  if (existing.image_filename) safeUnlink(existing.image_filename);
  for (const t of tiles) safeUnlink(t.filename);
  return true;
}

// ── Tuiles (grille des cartes Minecraft, niveaux 0 et 2) ────────────────────

function rowToTile(r) {
  return {
    id: r.id, mapId: r.map_id, zoom: r.zoom, tileX: r.tile_x, tileZ: r.tile_z,
    url: `/api/lore/media/file/${r.filename}`,
    uploadedBy: r.uploaded_by, updatedAt: r.updated_at,
  };
}

// Trié du niveau le plus grossier au plus fin : le client empile dans l'ordre
// reçu, la couche de détail se pose donc naturellement au-dessus de l'atlas.
export function listTiles(mapId) {
  return db.prepare(`SELECT * FROM lore_map_tiles WHERE map_id = ? ORDER BY zoom DESC, id`)
    .all(mapId).map(rowToTile);
}

// Upsert par (carte, niveau, tuile) : ré-uploader une case remplace son image
// — l'ancien fichier est supprimé du disque. Le niveau fait partie de la clé :
// déposer un 512 n'écrase donc jamais les 128 qu'il recouvre, et inversement.
export function upsertTile(mapId, zoom, tileX, tileZ, filename, userId) {
  const existing = db.prepare(
    `SELECT * FROM lore_map_tiles WHERE map_id = ? AND zoom = ? AND tile_x = ? AND tile_z = ?`,
  ).get(mapId, zoom, tileX, tileZ);
  if (existing) {
    db.prepare(`
      UPDATE lore_map_tiles SET filename = ?, uploaded_by = ?, updated_at = strftime('%s','now')
      WHERE id = ?
    `).run(filename, userId ?? null, existing.id);
    safeUnlink(existing.filename);
    return rowToTile(db.prepare(`SELECT * FROM lore_map_tiles WHERE id = ?`).get(existing.id));
  }
  const info = db.prepare(`
    INSERT INTO lore_map_tiles (map_id, zoom, tile_x, tile_z, filename, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(mapId, zoom, tileX, tileZ, filename, userId ?? null);
  return rowToTile(db.prepare(`SELECT * FROM lore_map_tiles WHERE id = ?`).get(info.lastInsertRowid));
}

export function deleteTile(id) {
  const row = db.prepare(`SELECT filename FROM lore_map_tiles WHERE id = ?`).get(id);
  if (!row) return false;
  db.prepare(`DELETE FROM lore_map_tiles WHERE id = ?`).run(id);
  safeUnlink(row.filename);
  return true;
}

// ── Peuples & dialogues des PNJ ─────────────────────────────────────────────

function rowToPeuple(r) {
  return {
    id: r.id, name: r.name, color: r.color, descriptionMd: r.description_md,
    pnjCount: r.pnj_count ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listPeuples() {
  return db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM lore_entries e WHERE e.peuple_id = p.id) AS pnj_count
    FROM lore_peuples p ORDER BY p.name COLLATE NOCASE
  `).all().map(rowToPeuple);
}

export function peupleExists(id) {
  return !!db.prepare(`SELECT 1 FROM lore_peuples WHERE id = ?`).get(id);
}

export function createPeuple(d) {
  const info = db.prepare(`
    INSERT INTO lore_peuples (name, color, description_md) VALUES (?, ?, ?)
  `).run(d.name, d.color || '#7be3a8', d.descriptionMd || '');
  return rowToPeuple(db.prepare(`SELECT * FROM lore_peuples WHERE id = ?`).get(info.lastInsertRowid));
}

export function updatePeuple(id, d) {
  const existing = db.prepare(`SELECT * FROM lore_peuples WHERE id = ?`).get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE lore_peuples SET
      name = COALESCE(?, name), color = COALESCE(?, color),
      description_md = COALESCE(?, description_md), updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(d.name ?? null, d.color ?? null, d.descriptionMd ?? null, id);
  return rowToPeuple(db.prepare(`SELECT * FROM lore_peuples WHERE id = ?`).get(id));
}

export function deletePeuple(id) {
  // Les PNJ rattachés repassent à « sans peuple » (FK SET NULL).
  return db.prepare(`DELETE FROM lore_peuples WHERE id = ?`).run(id).changes > 0;
}

export function addDialogue(entryId, d, userId) {
  const pos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM lore_dialogues WHERE entry_id = ?`,
  ).get(entryId).n;
  const info = db.prepare(`
    INSERT INTO lore_dialogues (entry_id, texte, quest_name, position, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(entryId, d.texte, d.questName || '', pos, userId ?? null);
  const r = db.prepare(`SELECT * FROM lore_dialogues WHERE id = ?`).get(info.lastInsertRowid);
  return { id: r.id, texte: r.texte, questName: r.quest_name, position: r.position, createdAt: r.created_at };
}

export function updateDialogue(id, d) {
  const existing = db.prepare(`SELECT * FROM lore_dialogues WHERE id = ?`).get(id);
  if (!existing) return null;
  db.prepare(`UPDATE lore_dialogues SET texte = COALESCE(?, texte), quest_name = COALESCE(?, quest_name) WHERE id = ?`)
    .run(d.texte ?? null, d.questName ?? null, id);
  const r = db.prepare(`SELECT * FROM lore_dialogues WHERE id = ?`).get(id);
  return { id: r.id, texte: r.texte, questName: r.quest_name, position: r.position, createdAt: r.created_at };
}

export function deleteDialogue(id) {
  return db.prepare(`DELETE FROM lore_dialogues WHERE id = ?`).run(id).changes > 0;
}

// ── Vues transverses ────────────────────────────────────────────────────────

// Format léger pour la carte : uniquement les entrées géolocalisées, avec la
// miniature de leur première image (aperçu au survol du marqueur).
export function mapPoints({ monde, dimension } = {}) {
  const where = [`e.coord_x IS NOT NULL`, `e.coord_z IS NOT NULL`];
  const params = [];
  if (monde) { where.push(`e.monde = ?`); params.push(monde); }
  if (dimension) { where.push(`e.dimension = ?`); params.push(dimension); }
  return db.prepare(`
    SELECT e.id, e.title, e.slug, e.entry_type, e.coord_x, e.coord_y, e.coord_z,
           e.dimension, e.monde,
           (SELECT COALESCE(m.thumb_filename, m.filename) FROM lore_media m
            WHERE m.entry_id = e.id ORDER BY m.id LIMIT 1) AS thumb
    FROM lore_entries e WHERE ${where.join(' AND ')} ORDER BY e.id
  `).all(...params).map((r) => ({
    id: r.id, title: r.title, slug: r.slug, entryType: r.entry_type,
    x: r.coord_x, y: r.coord_y, z: r.coord_z, dimension: r.dimension, monde: r.monde,
    thumbUrl: r.thumb ? `/api/lore/media/file/${r.thumb}` : null,
  }));
}

// ── Tracés d'enquête (lignes / polygones sur la carte) ─────────────────────

function rowToShape(r) {
  let points = [];
  try { points = JSON.parse(r.points); } catch { /* tracé corrompu → vide */ }
  return {
    id: r.id, dimension: r.dimension, monde: r.monde, name: r.name, color: r.color,
    closed: r.closed === 1, points, createdBy: r.created_by, createdAt: r.created_at,
  };
}

export function listShapes({ monde, dimension } = {}) {
  const where = [];
  const params = [];
  if (monde) { where.push(`monde = ?`); params.push(monde); }
  if (dimension) { where.push(`dimension = ?`); params.push(dimension); }
  const rows = db.prepare(
    `SELECT * FROM lore_shapes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY id`,
  ).all(...params);
  return rows.map(rowToShape);
}

export function createShape(d, userId) {
  const info = db.prepare(`
    INSERT INTO lore_shapes (dimension, monde, name, color, closed, points, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(d.dimension, d.monde || 'nostra', d.name, d.color, d.closed ? 1 : 0, JSON.stringify(d.points), userId ?? null);
  return rowToShape(db.prepare(`SELECT * FROM lore_shapes WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateShape(id, d) {
  const existing = db.prepare(`SELECT * FROM lore_shapes WHERE id = ?`).get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE lore_shapes SET
      name = COALESCE(?, name), color = COALESCE(?, color),
      closed = COALESCE(?, closed), points = COALESCE(?, points)
    WHERE id = ?
  `).run(
    d.name ?? null, d.color ?? null,
    d.closed === undefined ? null : (d.closed ? 1 : 0),
    d.points === undefined ? null : JSON.stringify(d.points),
    id,
  );
  return rowToShape(db.prepare(`SELECT * FROM lore_shapes WHERE id = ?`).get(id));
}

export function deleteShape(id) {
  return db.prepare(`DELETE FROM lore_shapes WHERE id = ?`).run(id).changes > 0;
}

// Recherche unifiée entrées + hypothèses, classée par pertinence bm25, avec
// un extrait du corps. Les colonnes de lore_fts : kind(0) ref_id(1) title(2)
// body(3) — le snippet vise le body.
export function searchLore(q, limit = 50) {
  const match = ftsQuery(q);
  if (!match) return [];
  const hits = db.prepare(`
    SELECT kind, ref_id, snippet(lore_fts, 3, '«', '»', '…', 12) AS snip
    FROM lore_fts WHERE lore_fts MATCH ? ORDER BY bm25(lore_fts) LIMIT ?
  `).all(match, limit);
  const out = [];
  for (const h of hits) {
    if (h.kind === 'entry') {
      const e = db.prepare(`SELECT id, title, slug, entry_type FROM lore_entries WHERE id = ?`).get(h.ref_id);
      if (e) out.push({ kind: 'entry', id: e.id, title: e.title, slug: e.slug, entryType: e.entry_type, snippet: h.snip });
    } else {
      const hyp = db.prepare(`SELECT id, title, status FROM lore_hypotheses WHERE id = ?`).get(h.ref_id);
      if (hyp) out.push({ kind: 'hypothesis', id: hyp.id, title: hyp.title, status: hyp.status, snippet: h.snip });
    }
  }
  return out;
}

// Nœuds + arêtes pour la vue réseau : entrées reliées (lore_links) et
// hypothèses avec leurs preuves (lore_evidence).
export function graphData() {
  const entries = db.prepare(`
    SELECT id, title, slug, entry_type, dimension,
           (coord_x IS NOT NULL AND coord_z IS NOT NULL) AS has_coords
    FROM lore_entries
  `).all().map((r) => ({
    kind: 'entry', id: r.id, title: r.title, slug: r.slug,
    entryType: r.entry_type, dimension: r.dimension, hasCoords: r.has_coords === 1,
  }));
  const hypotheses = db.prepare(`SELECT id, title, status, confidence FROM lore_hypotheses`)
    .all().map((r) => ({ kind: 'hypothesis', id: r.id, title: r.title, status: r.status, confidence: r.confidence }));
  const links = db.prepare(`SELECT id, from_entry_id, to_entry_id, relation_type, note FROM lore_links`)
    .all().map((r) => ({
      kind: 'link', id: r.id, fromEntryId: r.from_entry_id, toEntryId: r.to_entry_id,
      relationType: r.relation_type, note: r.note,
    }));
  const evidence = db.prepare(`SELECT id, hypothesis_id, entry_id, stance FROM lore_evidence`)
    .all().map((r) => ({
      kind: 'evidence', id: r.id, hypothesisId: r.hypothesis_id, entryId: r.entry_id, stance: r.stance,
    }));
  return { nodes: [...entries, ...hypotheses], edges: [...links, ...evidence] };
}

// Export JSON complet — tout ce qui constitue l'enquête, y compris les fils de
// commentaires (table globale `comments`) et l'historique des révisions.
export function exportAll() {
  const entries = listEntries();
  const media = db.prepare(`SELECT * FROM lore_media ORDER BY id`).all().map(rowToMedia);
  const links = db.prepare(`SELECT * FROM lore_links ORDER BY id`).all().map((r) => ({
    id: r.id, fromEntryId: r.from_entry_id, toEntryId: r.to_entry_id,
    relationType: r.relation_type, note: r.note, createdAt: r.created_at,
  }));
  const hypotheses = listHypotheses().map((h) => getHypothesis(h.id));
  const comments = db.prepare(`
    SELECT c.id, c.target_type, c.target_id, c.body, c.created_at, u.name AS author_name
    FROM comments c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.target_type IN ('lore_entry', 'lore_hypothesis') ORDER BY c.id
  `).all().map((r) => ({
    id: r.id, targetType: r.target_type, targetId: r.target_id,
    body: r.body, authorName: r.author_name, createdAt: r.created_at,
  }));
  const revisions = db.prepare(`SELECT * FROM lore_revisions ORDER BY id`).all().map((r) => ({
    id: r.id, targetType: r.target_type, targetId: r.target_id,
    bodyMd: r.body_md, authorId: r.author_id, createdAt: r.created_at,
  }));
  const dialogues = db.prepare(`SELECT * FROM lore_dialogues ORDER BY entry_id, position, id`)
    .all().map((r) => ({
      id: r.id, entryId: r.entry_id, texte: r.texte, questName: r.quest_name,
      position: r.position, createdAt: r.created_at,
    }));
  const tiles = db.prepare(`SELECT * FROM lore_map_tiles ORDER BY id`).all().map(rowToTile);
  return {
    exportedAt: Math.floor(Date.now() / 1000),
    entries, hypotheses, links, media,
    tags: listTags(), maps: listMaps(), shapes: listShapes(),
    peuples: listPeuples(), dialogues, tiles, comments, revisions,
  };
}

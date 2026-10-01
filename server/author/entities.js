import { db } from '../db.js';
import { KIND_FIELDS, KIND_TABLE, KINDS, own, relationMeta } from './enums.js';
import { insertRevision, lastSnapshotAt, shouldSnapshot } from './revisions.js';
import { countChars, countWords, ftsQuery, normalize } from './text.js';
import { AuthorValidationError, asId, cleanTagNames, cleanText, validateFields } from './validate.js';

// Couche d'accès DB des éléments de l'atelier d'auteur. Toutes les fonctions
// prennent le projectId : une requête ne sort JAMAIS du projet résolu par
// resolveAuthorProject (lui-même borné au propriétaire). Les noms de colonnes
// interpolés viennent exclusivement des tables de enums.js.
//
// La table FTS (author_fts, rowid = id de l'élément) est synchronisée
// EXPLICITEMENT ici : une écriture qui contournerait ce fichier ferait décrocher
// la recherche.

export const nowS = () => Math.floor(Date.now() / 1000);
export const mediaUrl = (f) => (f ? `/api/author/media/${f}` : null);

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Colonnes légères renvoyées par les listes (jamais les longs textes).
const LIST_COLS = {
  character: ['story_role', 'nickname', 'first_name'],
  place: ['category_id'],
  lore: ['category_id'],
  event: ['timeline_id', 'sort_key', 'end_sort_key', 'date_label', 'importance'],
  chapter: ['act_id', 'position', 'status', 'word_count', 'char_count', 'target_words', 'content_updated_at'],
  note: ['status', 'priority', 'category', 'note_date', 'inbox', 'position'],
};

// Colonnes calculées/de rangement exposées en plus des champs éditables.
const EXTRA_COLS = {
  chapter: ['act_id', 'position', 'word_count', 'char_count', 'content_updated_at'],
  place: ['map_media_id'],
};

// ── Mappers ─────────────────────────────────────────────────────────────────

export function mediaFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    entityId: r.entity_id,
    url: mediaUrl(r.filename),
    thumbUrl: mediaUrl(r.thumb_filename || r.filename),
    originalName: r.original_name,
    width: r.width,
    height: r.height,
    size: r.size,
    caption: r.caption,
    position: r.position,
    createdAt: r.created_at,
  };
}

function baseFromRow(r) {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    body: r.body,
    icon: r.icon,
    color: r.color,
    isFavorite: r.is_favorite === 1,
    revision: r.revision,
    lastOpenedAt: r.last_opened_at,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function kindRow(kind, id) {
  const table = KIND_TABLE[kind];
  if (!table) return null;
  return db.prepare(`SELECT * FROM ${table} WHERE entity_id = ?`).get(id) || null;
}

function kindFieldsFromRow(kind, row) {
  const out = {};
  if (!row) return out;
  for (const def of KIND_FIELDS[kind] || []) {
    const v = row[def.col];
    out[def.key] = def.type === 'bool' ? v === 1 : v;
  }
  for (const col of EXTRA_COLS[kind] || []) out[camel(col)] = row[col];
  return out;
}

// ── Lecture de référence ────────────────────────────────────────────────────

// Élément vivant (hors corbeille) du projet, ou null. Sert à valider toute
// référence entrante (lien, tâche, nœud de tableau, épingle…).
export function liveEntity(projectId, id) {
  const n = asId(id);
  if (!n) return null;
  return db.prepare(`SELECT id, kind, title FROM author_entities WHERE id = ? AND project_id = ? AND deleted_at IS NULL`)
    .get(n, projectId) || null;
}

export function chapterNumbers(projectId) {
  const rows = db.prepare(`
    SELECT e.id FROM author_entities e
    JOIN author_chapters c ON c.entity_id = e.id
    LEFT JOIN author_acts a ON a.id = c.act_id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
    ORDER BY (c.act_id IS NULL), a.position, c.position, e.id
  `).all(projectId);
  return new Map(rows.map((r, i) => [r.id, i + 1]));
}

export function tagsFor(ids) {
  const map = new Map();
  if (ids.length === 0) return map;
  // Par paquets : la limite de variables SQLite (32 766) est loin, mais une
  // liste de 500 éléments reste une seule requête.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db.prepare(`
      SELECT et.entity_id, t.id, t.name, t.color FROM author_entity_tags et
      JOIN author_tags t ON t.id = et.tag_id
      WHERE et.entity_id IN (${chunk.map(() => '?').join(',')})
      ORDER BY t.name COLLATE NOCASE
    `).all(...chunk);
    for (const r of rows) {
      if (!map.has(r.entity_id)) map.set(r.entity_id, []);
      map.get(r.entity_id).push({ id: r.id, name: r.name, color: r.color });
    }
  }
  return map;
}

function aliasesFor(id) {
  return db.prepare(`SELECT id, alias, kind, note FROM author_aliases WHERE entity_id = ? ORDER BY id`).all(id);
}

export function relationLabel(kind, direction, custom) {
  if (custom) return custom;
  const meta = relationMeta(kind);
  if (!meta) return kind;
  if (meta.symmetric || direction === 'out') return meta.label;
  return meta.reverse || meta.label;
}

export function linksFor(projectId, id) {
  const numbers = chapterNumbers(projectId);
  const rows = db.prepare(`
    SELECT l.id, l.kind, l.label, l.note, l.created_at, 'out' AS dir,
           e.id AS o_id, e.kind AS o_kind, e.title AS o_title, e.icon AS o_icon, e.color AS o_color
    FROM author_links l JOIN author_entities e ON e.id = l.to_id
    WHERE l.from_id = ? AND e.deleted_at IS NULL
    UNION ALL
    SELECT l.id, l.kind, l.label, l.note, l.created_at, 'in' AS dir,
           e.id, e.kind, e.title, e.icon, e.color
    FROM author_links l JOIN author_entities e ON e.id = l.from_id
    WHERE l.to_id = ? AND e.deleted_at IS NULL
  `).all(id, id);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    direction: relationMeta(r.kind)?.symmetric ? 'both' : r.dir,
    label: relationLabel(r.kind, r.dir, r.label),
    customLabel: r.label,
    note: r.note,
    createdAt: r.created_at,
    other: {
      id: r.o_id, kind: r.o_kind, title: r.o_title, icon: r.o_icon, color: r.o_color,
      number: r.o_kind === 'chapter' ? numbers.get(r.o_id) ?? null : undefined,
    },
  }));
}

// Fiche complète : champs communs + champs du type + tout ce qui la relie au
// reste du projet (relations dans les deux sens, tâches, tableaux, médias).
export function getEntity(projectId, id, { withDeleted = false } = {}) {
  const row = db.prepare(`SELECT * FROM author_entities WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row || (!withDeleted && row.deleted_at)) return null;
  const out = baseFromRow(row);
  Object.assign(out, kindFieldsFromRow(row.kind, kindRow(row.kind, id)));
  out.tags = tagsFor([id]).get(id) || [];
  out.aliases = aliasesFor(id);
  out.links = linksFor(projectId, id);
  out.media = db.prepare(`SELECT * FROM author_media WHERE entity_id = ? ORDER BY position, id`).all(id).map(mediaFromRow);
  out.cover = row.cover_media_id
    ? mediaFromRow(db.prepare(`SELECT * FROM author_media WHERE id = ?`).get(row.cover_media_id))
    : null;
  out.tasks = db.prepare(`
    SELECT id, title, done, due_date, priority FROM author_tasks WHERE entity_id = ? ORDER BY done, position, id
  `).all(id).map((t) => ({ id: t.id, title: t.title, done: t.done === 1, dueDate: t.due_date, priority: t.priority }));
  out.boards = db.prepare(`
    SELECT DISTINCT b.id, b.title FROM author_board_nodes n JOIN author_boards b ON b.id = n.board_id
    WHERE n.entity_id = ? ORDER BY b.title COLLATE NOCASE
  `).all(id);
  if (row.kind === 'chapter') {
    out.number = chapterNumbers(projectId).get(id) ?? null;
    const act = out.actId ? db.prepare(`SELECT id, title FROM author_acts WHERE id = ?`).get(out.actId) : null;
    out.actTitle = act?.title ?? null;
  }
  if (row.kind === 'place') {
    out.map = out.mapMediaId
      ? mediaFromRow(db.prepare(`SELECT * FROM author_media WHERE id = ?`).get(out.mapMediaId))
      : null;
    // L'image de carte a sa propre section : pas de doublon dans la galerie.
    if (out.mapMediaId) out.media = out.media.filter((m) => m.id !== out.mapMediaId);
  }
  return out;
}

export function conflictPayload(projectId, id) {
  const entity = getEntity(projectId, id);
  return {
    error: 'conflict',
    serverRevision: entity?.revision ?? null,
    updatedAt: entity?.updatedAt ?? null,
    entity,
  };
}

// ── Listes ──────────────────────────────────────────────────────────────────

const SORTS = {
  updated: 'e.updated_at DESC, e.id DESC',
  created: 'e.created_at DESC, e.id DESC',
  title: 'e.title COLLATE NOCASE, e.id',
  opened: 'e.last_opened_at DESC, e.id DESC',
};

export function listEntities(projectId, opts = {}) {
  const kind = opts.kind && KINDS.includes(opts.kind) ? opts.kind : null;
  const where = ['e.project_id = ?'];
  const params = [projectId];
  where.push(opts.trashed ? 'e.deleted_at IS NOT NULL' : 'e.deleted_at IS NULL');
  let join = '';
  let cols = '';
  if (kind) {
    where.push('e.kind = ?');
    params.push(kind);
    join = `LEFT JOIN ${KIND_TABLE[kind]} k ON k.entity_id = e.id`;
    cols = LIST_COLS[kind].map((c) => `, k.${c} AS k_${c}`).join('');
  } else if (Array.isArray(opts.kinds) && opts.kinds.length) {
    const ks = opts.kinds.filter((k) => KINDS.includes(k));
    if (ks.length) {
      where.push(`e.kind IN (${ks.map(() => '?').join(',')})`);
      params.push(...ks);
    }
  }
  if (opts.q) {
    const match = ftsQuery(opts.q);
    if (match) {
      where.push(`e.id IN (SELECT rowid FROM author_fts WHERE author_fts MATCH ? AND project_id = ?)`);
      params.push(match, projectId);
    }
  }
  if (opts.tagId) {
    where.push('EXISTS (SELECT 1 FROM author_entity_tags et WHERE et.entity_id = e.id AND et.tag_id = ?)');
    params.push(opts.tagId);
  }
  if (opts.favorite) where.push('e.is_favorite = 1');
  if (kind && (kind === 'place' || kind === 'lore') && opts.categoryId !== undefined) {
    if (opts.categoryId === null) where.push('k.category_id IS NULL');
    else { where.push('k.category_id = ?'); params.push(opts.categoryId); }
  }
  if (kind && (kind === 'chapter' || kind === 'note') && opts.status) {
    where.push('k.status = ?');
    params.push(opts.status);
  }
  if (kind === 'note' && opts.inbox !== undefined) {
    where.push('k.inbox = ?');
    params.push(opts.inbox ? 1 : 0);
  }
  if (kind === 'event' && opts.timelineId !== undefined) {
    if (opts.timelineId === null) where.push('k.timeline_id IS NULL');
    else { where.push('k.timeline_id = ?'); params.push(opts.timelineId); }
  }

  let order = own(SORTS, opts.sort) || SORTS.updated;
  if (opts.sort === 'position' && kind === 'note') order = 'k.position, e.id';
  if (opts.sort === 'date' && kind === 'event') order = '(k.sort_key IS NULL), k.sort_key, e.id';
  if (opts.sort === 'opened') where.push('e.last_opened_at IS NOT NULL');

  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 1000);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const whereSql = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS n FROM author_entities e ${join} WHERE ${whereSql}`).get(...params).n;
  const rows = db.prepare(`
    SELECT e.id, e.kind, e.title, e.summary, substr(e.body, 1, 240) AS body_head, e.icon, e.color, e.is_favorite, e.revision,
           e.created_at, e.updated_at, e.last_opened_at, e.deleted_at,
           m.filename AS cover_file, m.thumb_filename AS cover_thumb,
           (SELECT COUNT(*) FROM author_links l WHERE l.from_id = e.id)
             + (SELECT COUNT(*) FROM author_links l WHERE l.to_id = e.id) AS link_count
           ${cols}
    FROM author_entities e
    LEFT JOIN author_media m ON m.id = e.cover_media_id
    ${join}
    WHERE ${whereSql}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const tags = tagsFor(rows.map((r) => r.id));
  const numbers = kind === 'chapter' || !kind ? chapterNumbers(projectId) : null;
  let items = rows.map((r) => {
    const item = {
      id: r.id,
      kind: r.kind,
      title: r.title,
      // Sans résumé, le début du texte en tient lieu (idées capturées d'un jet).
      summary: r.summary
        ? (r.summary.length > 280 ? `${r.summary.slice(0, 280)}…` : r.summary)
        : (r.body_head.length >= 240 ? `${r.body_head}…` : r.body_head),
      icon: r.icon,
      color: r.color,
      isFavorite: r.is_favorite === 1,
      revision: r.revision,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastOpenedAt: r.last_opened_at,
      deletedAt: r.deleted_at,
      coverUrl: mediaUrl(r.cover_thumb || r.cover_file),
      linkCount: r.link_count,
      tags: tags.get(r.id) || [],
    };
    if (kind) {
      for (const c of LIST_COLS[kind]) {
        const v = r[`k_${c}`];
        item[camel(c)] = c === 'inbox' ? v === 1 : v;
      }
    }
    if (r.kind === 'chapter' && numbers) item.number = numbers.get(r.id) ?? null;
    return item;
  });
  if (opts.sort === 'position' && kind === 'chapter') {
    items = items.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  }
  return { items, total, limit, offset };
}

// ── FTS ─────────────────────────────────────────────────────────────────────

export function ftsSync(id) {
  db.prepare(`DELETE FROM author_fts WHERE rowid = ?`).run(id);
  const e = db.prepare(`SELECT * FROM author_entities WHERE id = ?`).get(id);
  if (!e || e.deleted_at) return;
  const parts = [e.summary, e.body];
  const k = kindRow(e.kind, id);
  for (const def of KIND_FIELDS[e.kind] || []) {
    if (def.fts && k && k[def.col]) parts.push(String(k[def.col]));
  }
  for (const a of aliasesFor(id)) parts.push(a.alias);
  for (const t of tagsFor([id]).get(id) || []) parts.push(`#${t.name}`);
  db.prepare(`INSERT INTO author_fts (rowid, entity_id, project_id, kind, title, body) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, id, e.project_id, e.kind, e.title, parts.filter(Boolean).join('\n'));
}

// Marqueurs de surlignage : caractères de contrôle que le client découpe en
// éléments React <mark> — jamais de HTML dans la réponse.
export const MARK_OPEN = '\u0002';
export const MARK_CLOSE = '\u0003';

export function searchEntities(projectId, q, { kinds = [], tagId = null, limit = 30 } = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const kindList = kinds.filter((k) => KINDS.includes(k));
  const kindSql = kindList.length ? `AND e.kind IN (${kindList.map(() => '?').join(',')})` : '';
  const tagSql = tagId ? 'AND EXISTS (SELECT 1 FROM author_entity_tags et WHERE et.entity_id = e.id AND et.tag_id = ?)' : '';
  const extra = [...kindList, ...(tagId ? [tagId] : [])];
  let rows = [];
  const match = ftsQuery(query);
  if (match) {
    rows = db.prepare(`
      SELECT e.id, e.kind, e.title, e.icon, e.color, e.summary,
             snippet(author_fts, 4, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 14) AS snip,
             bm25(author_fts, 0.0, 0.0, 0.0, 10.0, 1.0) AS rank
      FROM author_fts f JOIN author_entities e ON e.id = f.rowid
      WHERE author_fts MATCH ? AND f.project_id = ? AND e.deleted_at IS NULL ${kindSql} ${tagSql}
      ORDER BY rank LIMIT ?
    `).all(match, projectId, ...extra, lim);
  }
  // Repli sur le titre (requête d'un caractère, ou ponctuation que FTS ignore).
  if (rows.length === 0) {
    rows = db.prepare(`
      SELECT e.id, e.kind, e.title, e.icon, e.color, e.summary, '' AS snip, 0 AS rank
      FROM author_entities e
      WHERE e.project_id = ? AND e.deleted_at IS NULL AND e.title LIKE ? ESCAPE '\\' ${kindSql} ${tagSql}
      ORDER BY e.updated_at DESC LIMIT ?
    `).all(projectId, `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, ...extra, lim);
  }
  // Un titre exact passe devant, puis un titre qui commence par la requête :
  // chercher « Valcendre » doit d'abord proposer le lieu Valcendre, pas
  // « Retour à Valcendre » (bm25 seul les classe à égalité).
  const nq = normalize(query);
  const titleRank = (t) => { const n = normalize(t); return n === nq ? 0 : n.startsWith(nq) ? 1 : n.includes(nq) ? 2 : 3; };
  rows = rows.map((r, i) => ({ r, i, k: titleRank(r.title) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.r);
  const numbers = chapterNumbers(projectId);
  const tags = tagsFor(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    icon: r.icon,
    color: r.color,
    snippet: r.snip || (r.summary || '').slice(0, 160),
    number: r.kind === 'chapter' ? numbers.get(r.id) ?? null : undefined,
    tags: tags.get(r.id) || [],
  }));
}

// ── Tags & alias ────────────────────────────────────────────────────────────

export function setEntityTags(projectId, entityId, names) {
  const ids = [];
  for (const name of cleanTagNames(names)) {
    let tag = db.prepare(`SELECT id FROM author_tags WHERE project_id = ? AND name = ? COLLATE NOCASE`).get(projectId, name);
    if (!tag) {
      const info = db.prepare(`INSERT INTO author_tags (project_id, name) VALUES (?, ?)`).run(projectId, name);
      tag = { id: info.lastInsertRowid };
    }
    ids.push(tag.id);
  }
  db.prepare(`DELETE FROM author_entity_tags WHERE entity_id = ?`).run(entityId);
  const ins = db.prepare(`INSERT OR IGNORE INTO author_entity_tags (entity_id, tag_id) VALUES (?, ?)`);
  for (const tagId of ids) ins.run(entityId, tagId);
}

export function cleanAliases(list) {
  if (!Array.isArray(list)) throw new AuthorValidationError('invalid_aliases', 'aliases');
  if (list.length > 50) throw new AuthorValidationError('too_many_aliases', 'aliases');
  const out = [];
  for (const raw of list) {
    const a = raw && typeof raw === 'object' ? raw : { alias: raw };
    const alias = cleanText(a.alias, 200, 'aliases', { trim: true });
    if (!alias) continue;
    const kind = a.kind === 'ancien_nom' ? 'ancien_nom' : 'alias';
    out.push({ alias, kind, note: cleanText(a.note, 500, 'aliases') });
  }
  return out;
}

function setAliases(entityId, aliases) {
  db.prepare(`DELETE FROM author_aliases WHERE entity_id = ?`).run(entityId);
  const ins = db.prepare(`INSERT INTO author_aliases (entity_id, alias, kind, note) VALUES (?, ?, ?, ?)`);
  for (const a of aliases) ins.run(entityId, a.alias, a.kind, a.note);
}

// ── Création / mise à jour ──────────────────────────────────────────────────

function nextPosition(table, whereSql, params) {
  return db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM ${table} WHERE ${whereSql}`).get(...params).n;
}

function chapterPositionNext(projectId, actId) {
  return nextPosition(
    'author_chapters',
    `entity_id IN (SELECT id FROM author_entities WHERE project_id = ?) AND act_id IS ?`,
    [projectId, actId],
  );
}

function notePositionNext(projectId) {
  return db.prepare(`
    SELECT COALESCE(MIN(n.position), 1) - 1 AS p FROM author_notes n
    JOIN author_entities e ON e.id = n.entity_id WHERE e.project_id = ?
  `).get(projectId).p;
}

function maybeSnapshot(id, field, prev, next, t) {
  if (shouldSnapshot(prev, next, lastSnapshotAt(id, field), t)) insertRevision(id, field, prev);
}

export function createEntity(projectId, kind, input = {}) {
  if (!KINDS.includes(kind)) throw new AuthorValidationError('invalid_kind', 'kind');
  const { common, specific } = validateFields(kind, input, projectId, { partial: false });
  const tags = input.tags !== undefined ? cleanTagNames(input.tags) : null;
  const aliases = input.aliases !== undefined ? cleanAliases(input.aliases) : null;
  let actId = null;
  if (kind === 'chapter' && input.actId !== undefined && input.actId !== null) {
    actId = asId(input.actId);
    if (!actId || !db.prepare(`SELECT 1 FROM author_acts WHERE id = ? AND project_id = ?`).get(actId, projectId)) {
      throw new AuthorValidationError('invalid_act', 'actId');
    }
  }
  const t = nowS();
  let id;
  db.transaction(() => {
    const cols = Object.keys(common);
    const info = db.prepare(`
      INSERT INTO author_entities (project_id, kind, ${cols.join(', ')}, created_at, updated_at)
      VALUES (?, ?, ${cols.map(() => '?').join(', ')}, ?, ?)
    `).run(projectId, kind, ...cols.map((c) => common[c]), t, t);
    id = Number(info.lastInsertRowid);

    const extra = { ...specific };
    if (kind === 'chapter') {
      extra.act_id = actId;
      extra.position = chapterPositionNext(projectId, actId);
      if (extra.content) {
        extra.word_count = countWords(extra.content);
        extra.char_count = countChars(extra.content);
        extra.content_updated_at = t;
      }
    }
    if (kind === 'note') extra.position = notePositionNext(projectId);
    const kcols = Object.keys(extra);
    db.prepare(`
      INSERT INTO ${KIND_TABLE[kind]} (entity_id${kcols.map((c) => `, ${c}`).join('')})
      VALUES (?${kcols.map(() => ', ?').join('')})
    `).run(id, ...kcols.map((c) => extra[c]));

    if (tags) setEntityTags(projectId, id, tags);
    if (aliases) setAliases(id, aliases);
    ftsSync(id);
  })();
  return getEntity(projectId, id);
}

// PUT partiel protégé par révision (compare-and-swap) : seules les clés
// présentes sont écrites. Révision périmée → { conflict } avec l'état serveur
// complet, pour que le client fusionne champ par champ plutôt que d'écraser.
export function updateEntity(projectId, id, input = {}, { force = false, skipSnapshot = false } = {}) {
  const row = db.prepare(`SELECT * FROM author_entities WHERE id = ? AND project_id = ? AND deleted_at IS NULL`)
    .get(id, projectId);
  if (!row) return { notFound: true };
  if (!force && Number(input.revision) !== row.revision) {
    return { conflict: conflictPayload(projectId, id) };
  }
  const { common, specific, keys } = validateFields(row.kind, input, projectId, { partial: true });
  const tags = input.tags !== undefined ? cleanTagNames(input.tags) : null;
  const aliases = input.aliases !== undefined ? cleanAliases(input.aliases) : null;
  if (keys.length === 0 && tags === null && aliases === null) {
    return { entity: getEntity(projectId, id) };
  }
  const t = nowS();
  db.transaction(() => {
    if ('body' in common && !skipSnapshot) maybeSnapshot(id, 'body', row.body, common.body, t);
    if (row.kind === 'chapter' && 'content' in specific) {
      const prev = db.prepare(`SELECT content FROM author_chapters WHERE entity_id = ?`).get(id)?.content || '';
      if (prev !== specific.content) {
        if (!skipSnapshot) maybeSnapshot(id, 'content', prev, specific.content, t);
        specific.word_count = countWords(specific.content);
        specific.char_count = countChars(specific.content);
        specific.content_updated_at = t;
      }
    }
    const cols = Object.keys(common);
    db.prepare(`
      UPDATE author_entities SET ${cols.map((c) => `${c} = ?, `).join('')}revision = revision + 1, updated_at = ?
      WHERE id = ?
    `).run(...cols.map((c) => common[c]), t, id);
    const kcols = Object.keys(specific);
    if (kcols.length) {
      db.prepare(`UPDATE ${KIND_TABLE[row.kind]} SET ${kcols.map((c) => `${c} = ?`).join(', ')} WHERE entity_id = ?`)
        .run(...kcols.map((c) => specific[c]), id);
    }
    if (tags) setEntityTags(projectId, id, tags);
    if (aliases) setAliases(id, aliases);
    ftsSync(id);
  })();
  return { entity: getEntity(projectId, id) };
}

// ── Gestes structurels ─────────────────────────────────────────────────────
// Favori et « ouvert récemment » ne sont pas des champs de formulaire : ils ne
// font pas bouger la révision (une fiche ouverte ailleurs ne doit pas entrer
// en conflit parce qu'on a cliqué sur ⭐).

export function setFavorite(projectId, id, value) {
  return db.prepare(`UPDATE author_entities SET is_favorite = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL`)
    .run(value ? 1 : 0, id, projectId).changes > 0;
}

export function markVisited(projectId, id) {
  return db.prepare(`UPDATE author_entities SET last_opened_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL`)
    .run(nowS(), id, projectId).changes > 0;
}

// Kanban : la colonne cible et son ordre complet. Une carte qui change de
// colonne change de statut (champ de fiche → révision +1) ; les autres ne
// bougent que de position.
export function reorderNotes(projectId, status, ids, { inbox = false } = {}) {
  const t = nowS();
  const rows = db.prepare(`
    SELECT e.id, n.status, n.inbox FROM author_entities e JOIN author_notes n ON n.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId);
  const known = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) if (!known.has(id)) throw new AuthorValidationError('unknown_note', 'ids');
  db.transaction(() => {
    ids.forEach((id, i) => {
      const cur = known.get(id);
      const wantInbox = inbox ? 1 : 0;
      if (cur.status !== status || cur.inbox !== wantInbox) {
        db.prepare(`UPDATE author_notes SET status = ?, inbox = ?, position = ? WHERE entity_id = ?`).run(status, wantInbox, i, id);
        db.prepare(`UPDATE author_entities SET revision = revision + 1, updated_at = ? WHERE id = ?`).run(t, id);
      } else {
        db.prepare(`UPDATE author_notes SET position = ? WHERE entity_id = ?`).run(i, id);
      }
    });
  })();
}

// Chronologie : glisser un événement change sa date (champ de fiche).
export function moveEvent(projectId, id, { sortKey, endSortKey, timelineId }) {
  const ent = liveEntity(projectId, id);
  if (!ent || ent.kind !== 'event') return false;
  const { specific } = validateFields('event', {
    ...(sortKey !== undefined ? { sortKey } : {}),
    ...(endSortKey !== undefined ? { endSortKey } : {}),
    ...(timelineId !== undefined ? { timelineId } : {}),
  }, projectId, { partial: true });
  const cols = Object.keys(specific);
  if (!cols.length) return true;
  db.transaction(() => {
    db.prepare(`UPDATE author_events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE entity_id = ?`)
      .run(...cols.map((c) => specific[c]), id);
    db.prepare(`UPDATE author_entities SET revision = revision + 1, updated_at = ? WHERE id = ?`).run(nowS(), id);
  })();
  return true;
}

// ── Corbeille ───────────────────────────────────────────────────────────────

export function trashEntity(projectId, id) {
  const ok = db.prepare(`UPDATE author_entities SET deleted_at = ? WHERE id = ? AND project_id = ? AND deleted_at IS NULL`)
    .run(nowS(), id, projectId).changes > 0;
  if (ok) ftsSync(id);
  return ok;
}

export function restoreEntity(projectId, id) {
  const ok = db.prepare(`UPDATE author_entities SET deleted_at = NULL WHERE id = ? AND project_id = ? AND deleted_at IS NOT NULL`)
    .run(id, projectId).changes > 0;
  if (ok) ftsSync(id);
  return ok;
}

// Suppression définitive — seulement depuis la corbeille. Les médias de
// l'élément restent dans la médiathèque du projet (FK SET NULL) : une image
// posée sur un tableau ne disparaît pas avec la fiche.
export function purgeEntity(projectId, id) {
  const ok = db.prepare(`DELETE FROM author_entities WHERE id = ? AND project_id = ? AND deleted_at IS NOT NULL`)
    .run(id, projectId).changes > 0;
  if (ok) db.prepare(`DELETE FROM author_fts WHERE rowid = ?`).run(id);
  return ok;
}

// Index léger de tout le projet (titres + alias) : résolution des liens
// [[Nom]] dans les textes et autocomplétion de l'éditeur, sans charger les
// fiches. Les anciens noms résolvent aussi (vers l'élément renommé).
export function entityIndex(projectId) {
  const numbers = chapterNumbers(projectId);
  const rows = db.prepare(`
    SELECT id, kind, title, icon, color FROM author_entities
    WHERE project_id = ? AND deleted_at IS NULL ORDER BY title COLLATE NOCASE
  `).all(projectId);
  const byId = new Map(rows.map((r) => [r.id, {
    id: r.id, kind: r.kind, title: r.title, icon: r.icon, color: r.color, aliases: [],
    number: r.kind === 'chapter' ? numbers.get(r.id) ?? null : undefined,
  }]));
  for (const a of db.prepare(`
    SELECT a.entity_id, a.alias FROM author_aliases a JOIN author_entities e ON e.id = a.entity_id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId)) byId.get(a.entity_id)?.aliases.push(a.alias);
  return [...byId.values()];
}

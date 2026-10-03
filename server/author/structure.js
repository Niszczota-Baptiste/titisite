import { db } from '../db.js';
import { safeUnlink } from '../uploads.js';
import { CATEGORY_DOMAINS, DEFAULT_CATEGORIES, DEFAULT_TIMELINES } from './enums.js';
import { chapterNumbers, liveEntity, nowS } from './entities.js';
import { AuthorValidationError, asId, cleanColor, cleanText } from './validate.js';

// Ce qui structure un projet autour des éléments : le projet lui-même, ses
// catégories configurables, ses lignes de temps, ses actes et moments forts
// (le plan), ses tâches et les épingles posées sur les cartes de lieux.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Projets ─────────────────────────────────────────────────────────────────

export function projectFromRow(r) {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    targetWords: r.target_words,
    color: r.color,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listProjects(ownerId) {
  return db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM author_entities e WHERE e.project_id = p.id AND e.deleted_at IS NULL) AS entity_count,
      (SELECT COALESCE(SUM(c.word_count), 0) FROM author_chapters c JOIN author_entities e ON e.id = c.entity_id
        WHERE e.project_id = p.id AND e.deleted_at IS NULL) AS words
    FROM author_projects p WHERE p.owner_id = ? ORDER BY p.updated_at DESC, p.id DESC
  `).all(ownerId).map((r) => ({ ...projectFromRow(r), entityCount: r.entity_count, words: r.words }));
}

function projectInput(input, { partial }) {
  const out = {};
  if (!partial || input.title !== undefined) out.title = cleanText(input.title, 200, 'title', { trim: true, required: true });
  if (input.subtitle !== undefined) out.subtitle = cleanText(input.subtitle, 300, 'subtitle', { trim: true });
  if (input.description !== undefined) out.description = cleanText(input.description, 20_000, 'description');
  if (input.color !== undefined) out.color = cleanColor(input.color) || '#c9a8e8';
  if (input.targetWords !== undefined) {
    if (input.targetWords === null || input.targetWords === '') out.target_words = null;
    else {
      const n = Number(input.targetWords);
      if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new AuthorValidationError('invalid_number', 'targetWords');
      out.target_words = n;
    }
  }
  return out;
}

// Un nouveau projet arrive avec les catégories et lignes de temps par défaut :
// tout est modifiable ensuite, mais l'écran n'est jamais vide.
export function createProject(ownerId, input = {}) {
  const fields = projectInput(input, { partial: false });
  let id;
  db.transaction(() => {
    const cols = Object.keys(fields);
    const info = db.prepare(`
      INSERT INTO author_projects (owner_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
    `).run(ownerId, ...cols.map((c) => fields[c]));
    id = Number(info.lastInsertRowid);
    const insCat = db.prepare(`INSERT INTO author_categories (project_id, domain, name, icon, position) VALUES (?, ?, ?, ?, ?)`);
    for (const domain of CATEGORY_DOMAINS) {
      DEFAULT_CATEGORIES[domain].forEach(([name, icon], i) => insCat.run(id, domain, name, icon, i));
    }
    const insTl = db.prepare(`INSERT INTO author_timelines (project_id, name, color, position) VALUES (?, ?, ?, ?)`);
    DEFAULT_TIMELINES.forEach(([name, color], i) => insTl.run(id, name, color, i));
  })();
  return projectFromRow(db.prepare(`SELECT * FROM author_projects WHERE id = ?`).get(id));
}

export function updateProject(projectId, input = {}) {
  const fields = projectInput(input, { partial: true });
  const cols = Object.keys(fields);
  if (cols.length) {
    db.prepare(`UPDATE author_projects SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...cols.map((c) => fields[c]), nowS(), projectId);
  }
  return projectFromRow(db.prepare(`SELECT * FROM author_projects WHERE id = ?`).get(projectId));
}

export function touchProject(projectId) {
  db.prepare(`UPDATE author_projects SET updated_at = ? WHERE id = ?`).run(nowS(), projectId);
}

// Suppression définitive d'un projet entier : les fichiers des médias sont
// effacés du disque avant que la cascade n'emporte leurs lignes.
export function deleteProject(projectId) {
  const files = db.prepare(`SELECT filename, thumb_filename FROM author_media WHERE project_id = ?`).all(projectId);
  db.transaction(() => {
    db.prepare(`DELETE FROM author_fts WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM author_projects WHERE id = ?`).run(projectId);
  })();
  for (const f of files) { safeUnlink(f.filename); if (f.thumb_filename) safeUnlink(f.thumb_filename); }
}

// ── Catégories ──────────────────────────────────────────────────────────────

export function listCategories(projectId) {
  return db.prepare(`
    SELECT c.*, (
      SELECT COUNT(*) FROM author_entities e
      LEFT JOIN author_places p ON p.entity_id = e.id
      LEFT JOIN author_lore l ON l.entity_id = e.id
      WHERE e.deleted_at IS NULL AND (p.category_id = c.id OR l.category_id = c.id)
    ) AS used
    FROM author_categories c WHERE c.project_id = ? ORDER BY c.domain, c.position, c.id
  `).all(projectId).map((r) => ({
    id: r.id, domain: r.domain, name: r.name, icon: r.icon, color: r.color, position: r.position, used: r.used,
  }));
}

export function createCategory(projectId, input = {}) {
  const domain = CATEGORY_DOMAINS.includes(input.domain) ? input.domain : null;
  if (!domain) throw new AuthorValidationError('invalid_domain', 'domain');
  const name = cleanText(input.name, 80, 'name', { trim: true, required: true });
  if (db.prepare(`SELECT 1 FROM author_categories WHERE project_id = ? AND domain = ? AND name = ? COLLATE NOCASE`).get(projectId, domain, name)) {
    return null;
  }
  const position = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM author_categories WHERE project_id = ? AND domain = ?`)
    .get(projectId, domain).n;
  const info = db.prepare(`INSERT INTO author_categories (project_id, domain, name, icon, color, position) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(projectId, domain, name, cleanText(input.icon, 16, 'icon', { trim: true }), cleanColor(input.color) || '#c9a8e8', position);
  return listCategories(projectId).find((c) => c.id === Number(info.lastInsertRowid));
}

export function updateCategory(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_categories WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return undefined;
  const name = input.name !== undefined ? cleanText(input.name, 80, 'name', { trim: true, required: true }) : row.name;
  const icon = input.icon !== undefined ? cleanText(input.icon, 16, 'icon', { trim: true }) : row.icon;
  const color = input.color !== undefined ? (cleanColor(input.color) || row.color) : row.color;
  const position = input.position !== undefined ? Number(input.position) | 0 : row.position;
  try {
    db.prepare(`UPDATE author_categories SET name = ?, icon = ?, color = ?, position = ? WHERE id = ?`).run(name, icon, color, position, id);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return null;
    throw err;
  }
  return listCategories(projectId).find((c) => c.id === id);
}

export function deleteCategory(projectId, id) {
  return db.prepare(`DELETE FROM author_categories WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

// ── Lignes de temps ────────────────────────────────────────────────────────

export function listTimelines(projectId) {
  return db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM author_events ev JOIN author_entities e ON e.id = ev.entity_id
                 WHERE ev.timeline_id = t.id AND e.deleted_at IS NULL) AS used
    FROM author_timelines t WHERE t.project_id = ? ORDER BY t.position, t.id
  `).all(projectId).map((r) => ({
    id: r.id, name: r.name, description: r.description, color: r.color, position: r.position, used: r.used,
  }));
}

export function createTimeline(projectId, input = {}) {
  const name = cleanText(input.name, 120, 'name', { trim: true, required: true });
  const position = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM author_timelines WHERE project_id = ?`).get(projectId).n;
  const info = db.prepare(`INSERT INTO author_timelines (project_id, name, description, color, position) VALUES (?, ?, ?, ?, ?)`)
    .run(projectId, name, cleanText(input.description, 2000, 'description'), cleanColor(input.color) || '#c9a8e8', position);
  return listTimelines(projectId).find((t) => t.id === Number(info.lastInsertRowid));
}

export function updateTimeline(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_timelines WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  db.prepare(`UPDATE author_timelines SET name = ?, description = ?, color = ?, position = ? WHERE id = ?`).run(
    input.name !== undefined ? cleanText(input.name, 120, 'name', { trim: true, required: true }) : row.name,
    input.description !== undefined ? cleanText(input.description, 2000, 'description') : row.description,
    input.color !== undefined ? (cleanColor(input.color) || row.color) : row.color,
    input.position !== undefined ? Number(input.position) | 0 : row.position,
    id,
  );
  return listTimelines(projectId).find((t) => t.id === id);
}

export function deleteTimeline(projectId, id) {
  return db.prepare(`DELETE FROM author_timelines WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

// ── Actes, moments forts, plan ─────────────────────────────────────────────

function actFromRow(r) {
  return { id: r.id, title: r.title, summary: r.summary, color: r.color, position: r.position };
}

export function createAct(projectId, input = {}) {
  const title = cleanText(input.title, 200, 'title', { trim: true, required: true });
  const position = db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM author_acts WHERE project_id = ?`).get(projectId).n;
  const info = db.prepare(`INSERT INTO author_acts (project_id, title, summary, color, position) VALUES (?, ?, ?, ?, ?)`)
    .run(projectId, title, cleanText(input.summary, 5000, 'summary'), cleanColor(input.color) || '#c9a8e8', position);
  return actFromRow(db.prepare(`SELECT * FROM author_acts WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateAct(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_acts WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  db.prepare(`UPDATE author_acts SET title = ?, summary = ?, color = ?, updated_at = ? WHERE id = ?`).run(
    input.title !== undefined ? cleanText(input.title, 200, 'title', { trim: true, required: true }) : row.title,
    input.summary !== undefined ? cleanText(input.summary, 5000, 'summary') : row.summary,
    input.color !== undefined ? (cleanColor(input.color) || row.color) : row.color,
    nowS(), id,
  );
  return actFromRow(db.prepare(`SELECT * FROM author_acts WHERE id = ?`).get(id));
}

// Supprimer un acte ne supprime pas ses chapitres : ils passent « hors actes »
// (FK SET NULL), en fin de plan.
export function deleteAct(projectId, id) {
  return db.prepare(`DELETE FROM author_acts WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

function beatFromRow(r) {
  return {
    type: 'beat', id: r.id, actId: r.act_id, position: r.position, title: r.title, summary: r.summary,
    color: r.color, eventId: r.event_id, eventTitle: r.event_title ?? null,
  };
}

function beatInput(projectId, input, { partial }) {
  const out = {};
  if (!partial || input.title !== undefined) out.title = cleanText(input.title, 200, 'title', { trim: true, required: true });
  if (input.summary !== undefined) out.summary = cleanText(input.summary, 5000, 'summary');
  if (input.color !== undefined) out.color = cleanColor(input.color) || '#e8c86a';
  if (input.eventId !== undefined) {
    if (input.eventId === null || input.eventId === '') out.event_id = null;
    else {
      const ev = liveEntity(projectId, input.eventId);
      if (!ev || ev.kind !== 'event') throw new AuthorValidationError('invalid_event', 'eventId');
      out.event_id = ev.id;
    }
  }
  if (input.actId !== undefined) {
    if (input.actId === null) out.act_id = null;
    else {
      const actId = asId(input.actId);
      if (!actId || !db.prepare(`SELECT 1 FROM author_acts WHERE id = ? AND project_id = ?`).get(actId, projectId)) {
        throw new AuthorValidationError('invalid_act', 'actId');
      }
      out.act_id = actId;
    }
  }
  return out;
}

const BEAT_SELECT = `
  SELECT b.*, e.title AS event_title FROM author_beats b
  LEFT JOIN author_entities e ON e.id = b.event_id AND e.deleted_at IS NULL
`;

export function createBeat(projectId, input = {}) {
  const fields = beatInput(projectId, input, { partial: false });
  fields.position = db.prepare(`
    SELECT MAX(
      (SELECT COALESCE(MAX(position), -1) FROM author_beats WHERE project_id = ? AND act_id IS ?),
      (SELECT COALESCE(MAX(c.position), -1) FROM author_chapters c JOIN author_entities e ON e.id = c.entity_id
        WHERE e.project_id = ? AND c.act_id IS ?)
    ) + 1 AS n
  `).get(projectId, fields.act_id ?? null, projectId, fields.act_id ?? null).n;
  const cols = Object.keys(fields);
  const info = db.prepare(`INSERT INTO author_beats (project_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`)
    .run(projectId, ...cols.map((c) => fields[c]));
  return beatFromRow(db.prepare(`${BEAT_SELECT} WHERE b.id = ?`).get(info.lastInsertRowid));
}

export function updateBeat(projectId, id, input = {}) {
  if (!db.prepare(`SELECT 1 FROM author_beats WHERE id = ? AND project_id = ?`).get(id, projectId)) return null;
  const fields = beatInput(projectId, input, { partial: true });
  const cols = Object.keys(fields);
  if (cols.length) {
    db.prepare(`UPDATE author_beats SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...cols.map((c) => fields[c]), nowS(), id);
  }
  return beatFromRow(db.prepare(`${BEAT_SELECT} WHERE b.id = ?`).get(id));
}

export function deleteBeat(projectId, id) {
  return db.prepare(`DELETE FROM author_beats WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

// Le plan : actes ordonnés, chacun avec ses chapitres et moments forts dans un
// même espace de positions ; la colonne `actId: null` (« Hors actes ») ferme la
// marche. La numérotation des chapitres en découle (chapterNumbers).
export function getPlan(projectId) {
  const acts = db.prepare(`SELECT * FROM author_acts WHERE project_id = ? ORDER BY position, id`).all(projectId).map(actFromRow);
  const numbers = chapterNumbers(projectId);
  const chapters = db.prepare(`
    SELECT e.id, e.title, e.summary, e.color, e.icon, e.revision, e.updated_at, c.act_id, c.position, c.status,
           c.word_count, c.target_words, c.content_updated_at, c.validated_at
    FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId).map((r) => ({
    type: 'chapter', id: r.id, title: r.title, summary: r.summary, color: r.color, icon: r.icon,
    actId: r.act_id, position: r.position, status: r.status, wordCount: r.word_count,
    targetWords: r.target_words, number: numbers.get(r.id) ?? null, revision: r.revision,
    updatedAt: r.updated_at, contentUpdatedAt: r.content_updated_at, validatedAt: r.validated_at,
  }));
  const beats = db.prepare(`${BEAT_SELECT} WHERE b.project_id = ?`).all(projectId).map(beatFromRow);
  const sortItems = (a, b) => a.position - b.position || (a.type === b.type ? a.id - b.id : (a.type === 'chapter' ? -1 : 1));
  const column = (actId) => [...chapters, ...beats].filter((it) => (it.actId ?? null) === actId).sort(sortItems);
  return {
    acts: acts.map((a) => ({ ...a, items: column(a.id) })),
    unassigned: column(null),
  };
}

// Applique un nouveau rangement : `columns` = [{ actId, items: [{type, id}] }],
// `actOrder` = ids des actes dans l'ordre. Tout est vérifié avant la moindre
// écriture (un id étranger au projet, un doublon → 422, rien n'est touché).
export function savePlan(projectId, input = {}) {
  const columns = Array.isArray(input.columns) ? input.columns : [];
  const actIds = new Set(db.prepare(`SELECT id FROM author_acts WHERE project_id = ?`).all(projectId).map((r) => r.id));
  const chapterIds = new Set(db.prepare(`
    SELECT e.id FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id WHERE e.project_id = ?
  `).all(projectId).map((r) => r.id));
  const beatIds = new Set(db.prepare(`SELECT id FROM author_beats WHERE project_id = ?`).all(projectId).map((r) => r.id));
  const seen = new Set();
  const writes = [];
  for (const col of columns) {
    const actId = col?.actId === null || col?.actId === undefined ? null : asId(col.actId);
    if (actId === undefined || (actId !== null && !actIds.has(actId))) throw new AuthorValidationError('invalid_act', 'columns');
    const items = Array.isArray(col.items) ? col.items : [];
    items.forEach((it, i) => {
      const id = asId(it?.id);
      const type = it?.type === 'beat' ? 'beat' : 'chapter';
      const pool = type === 'beat' ? beatIds : chapterIds;
      if (!id || !pool.has(id) || seen.has(`${type}:${id}`)) throw new AuthorValidationError('invalid_item', 'columns');
      seen.add(`${type}:${id}`);
      writes.push({ type, id, actId, position: i });
    });
  }
  let actOrder = null;
  if (input.actOrder !== undefined) {
    if (!Array.isArray(input.actOrder)) throw new AuthorValidationError('invalid_act', 'actOrder');
    actOrder = input.actOrder.map(asId);
    if (actOrder.some((id) => !id || !actIds.has(id)) || new Set(actOrder).size !== actOrder.length) {
      throw new AuthorValidationError('invalid_act', 'actOrder');
    }
  }
  db.transaction(() => {
    const updCh = db.prepare(`UPDATE author_chapters SET act_id = ?, position = ? WHERE entity_id = ?`);
    const updBeat = db.prepare(`UPDATE author_beats SET act_id = ?, position = ? WHERE id = ?`);
    for (const w of writes) (w.type === 'beat' ? updBeat : updCh).run(w.actId, w.position, w.id);
    if (actOrder) {
      const upd = db.prepare(`UPDATE author_acts SET position = ? WHERE id = ?`);
      actOrder.forEach((id, i) => upd.run(i, id));
    }
  })();
  return getPlan(projectId);
}

// ── Tâches ──────────────────────────────────────────────────────────────────

function taskFromRow(r) {
  return {
    id: r.id, title: r.title, notes: r.notes, done: r.done === 1, doneAt: r.done_at, dueDate: r.due_date,
    priority: r.priority, position: r.position, createdAt: r.created_at, updatedAt: r.updated_at,
    entity: r.entity_id && r.e_title !== null
      ? { id: r.entity_id, kind: r.e_kind, title: r.e_title, icon: r.e_icon }
      : null,
  };
}

const TASK_SELECT = `
  SELECT t.*, e.kind AS e_kind, e.title AS e_title, e.icon AS e_icon
  FROM author_tasks t LEFT JOIN author_entities e ON e.id = t.entity_id AND e.deleted_at IS NULL
`;

export function listTasks(projectId, { done } = {}) {
  const where = done === undefined ? '' : `AND t.done = ${done ? 1 : 0}`;
  return db.prepare(`${TASK_SELECT} WHERE t.project_id = ? ${where} ORDER BY t.done, t.position, t.id LIMIT 2000`)
    .all(projectId).map(taskFromRow);
}

function taskInput(projectId, input, { partial }) {
  const out = {};
  if (!partial || input.title !== undefined) out.title = cleanText(input.title, 300, 'title', { trim: true, required: true });
  if (input.notes !== undefined) out.notes = cleanText(input.notes, 5000, 'notes');
  if (input.priority !== undefined) {
    const p = Number(input.priority);
    if (!Number.isInteger(p) || p < 0 || p > 3) throw new AuthorValidationError('invalid_number', 'priority');
    out.priority = p;
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate === null || input.dueDate === '') out.due_date = null;
    else if (typeof input.dueDate === 'string' && DATE_RE.test(input.dueDate)) out.due_date = input.dueDate;
    else throw new AuthorValidationError('invalid_date', 'dueDate');
  }
  if (input.entityId !== undefined) {
    if (input.entityId === null || input.entityId === '') out.entity_id = null;
    else {
      const ent = liveEntity(projectId, input.entityId);
      if (!ent) throw new AuthorValidationError('unknown_entity', 'entityId');
      out.entity_id = ent.id;
    }
  }
  if (input.done !== undefined) {
    out.done = input.done ? 1 : 0;
    out.done_at = input.done ? nowS() : null;
  }
  return out;
}

export function createTask(projectId, input = {}) {
  const fields = taskInput(projectId, input, { partial: false });
  fields.position = db.prepare(`SELECT COALESCE(MIN(position), 1) - 1 AS n FROM author_tasks WHERE project_id = ?`).get(projectId).n;
  const cols = Object.keys(fields);
  const info = db.prepare(`INSERT INTO author_tasks (project_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`)
    .run(projectId, ...cols.map((c) => fields[c]));
  return taskFromRow(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid));
}

export function updateTask(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_tasks WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  const fields = taskInput(projectId, input, { partial: true });
  // Recocher une tâche déjà faite ne réécrit pas sa date d'achèvement.
  if ('done' in fields && fields.done === row.done) { delete fields.done; delete fields.done_at; }
  const cols = Object.keys(fields);
  if (cols.length) {
    db.prepare(`UPDATE author_tasks SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...cols.map((c) => fields[c]), nowS(), id);
  }
  return taskFromRow(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id));
}

export function deleteTask(projectId, id) {
  return db.prepare(`DELETE FROM author_tasks WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

export function reorderTasks(projectId, ids) {
  if (!Array.isArray(ids)) throw new AuthorValidationError('invalid_ids', 'ids');
  const known = new Set(db.prepare(`SELECT id FROM author_tasks WHERE project_id = ?`).all(projectId).map((r) => r.id));
  const clean = ids.map(asId);
  if (clean.some((id) => !id || !known.has(id))) throw new AuthorValidationError('invalid_ids', 'ids');
  db.transaction(() => {
    const upd = db.prepare(`UPDATE author_tasks SET position = ? WHERE id = ?`);
    clean.forEach((id, i) => upd.run(i, id));
  })();
}

// ── Épingles de carte ──────────────────────────────────────────────────────

function pinFromRow(r) {
  return {
    id: r.id, placeId: r.place_id, x: r.x, y: r.y, label: r.label, color: r.color,
    target: r.target_id && r.t_title !== null ? { id: r.target_id, kind: r.t_kind, title: r.t_title, icon: r.t_icon } : null,
  };
}

const PIN_SELECT = `
  SELECT p.*, e.kind AS t_kind, e.title AS t_title, e.icon AS t_icon
  FROM author_map_pins p LEFT JOIN author_entities e ON e.id = p.target_id AND e.deleted_at IS NULL
`;

export function listPins(projectId, placeId) {
  return db.prepare(`${PIN_SELECT} WHERE p.project_id = ? AND p.place_id = ? ORDER BY p.id`).all(projectId, placeId).map(pinFromRow);
}

function frac(v, field) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new AuthorValidationError('invalid_coords', field);
  return n;
}

export function createPin(projectId, placeId, input = {}) {
  const place = liveEntity(projectId, placeId);
  if (!place || place.kind !== 'place') return null;
  let targetId = null;
  if (input.targetId !== undefined && input.targetId !== null && input.targetId !== '') {
    const t = liveEntity(projectId, input.targetId);
    if (!t) throw new AuthorValidationError('unknown_entity', 'targetId');
    targetId = t.id;
  }
  const info = db.prepare(`
    INSERT INTO author_map_pins (project_id, place_id, target_id, x, y, label, color) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, place.id, targetId, frac(input.x, 'x'), frac(input.y, 'y'),
    cleanText(input.label, 120, 'label', { trim: true }), cleanColor(input.color) || '#e8c86a');
  return pinFromRow(db.prepare(`${PIN_SELECT} WHERE p.id = ?`).get(info.lastInsertRowid));
}

export function updatePin(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_map_pins WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  let targetId = row.target_id;
  if (input.targetId !== undefined) {
    if (input.targetId === null || input.targetId === '') targetId = null;
    else {
      const t = liveEntity(projectId, input.targetId);
      if (!t) throw new AuthorValidationError('unknown_entity', 'targetId');
      targetId = t.id;
    }
  }
  db.prepare(`UPDATE author_map_pins SET x = ?, y = ?, label = ?, color = ?, target_id = ? WHERE id = ?`).run(
    input.x !== undefined ? frac(input.x, 'x') : row.x,
    input.y !== undefined ? frac(input.y, 'y') : row.y,
    input.label !== undefined ? cleanText(input.label, 120, 'label', { trim: true }) : row.label,
    input.color !== undefined ? (cleanColor(input.color) || row.color) : row.color,
    targetId, id,
  );
  return pinFromRow(db.prepare(`${PIN_SELECT} WHERE p.id = ?`).get(id));
}

export function deletePin(projectId, id) {
  return db.prepare(`DELETE FROM author_map_pins WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

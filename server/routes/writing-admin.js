import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { safeUnlink } from '../uploads.js';
import { uniqueSlug } from '../slugify.js';
import {
  mapChapter, mapCharacter, mapMedia, mapProjectCard, mapTerm, mapWorkCard, mapZone,
} from './writing.js';

// All routes here are admin-only. Mounted at /api/writing.
export const writingAdminRouter = Router();
writingAdminRouter.use(requireAuth, requireRole('admin'));

const STATUS = new Set(['brouillon', 'wip', 'termine']);
const MEDIA_TYPE = new Set(['screenshot', 'schema', 'carte']);
const AMBIENT = new Set(['none', 'petals', 'leaves', 'snow', 'embers', 'fireflies', 'notes', 'wind', 'waves', 'fireworks']);
// World-map allowlists — mirrored client-side in src/components/writing/map/presets.js.
const BIOMES = new Set([
  'plaines', 'tournesols', 'foret', 'bouleaux', 'foret_sombre', 'cerisiers', 'jungle', 'bambou',
  'taiga', 'taiga_enneigee', 'neige', 'pics_geles', 'montagne', 'collines', 'savane', 'desert',
  'badlands', 'marais', 'mangrove', 'champignons', 'plage', 'ocean', 'toundra',
  'neant', 'foret_pourpre', 'foret_biscornue', 'vallee_ames', 'basalte', 'end', 'volcan',
]);
const MARKERS = new Set([
  '', 'royaume', 'capitale', 'cite', 'village', 'forteresse', 'temple', 'port', 'ruine',
  'antre', 'montagne', 'foret', 'ile', 'personnage', 'livre', 'lieu',
]);
const BUILDINGS = new Set([
  'tour', 'maison', 'donjon', 'temple', 'cristal', 'arbre', 'ruine', 'phare', 'tente', 'monolithe',
  'pagode', 'hanok', 'pavillon', 'porte',
]);
const ZONE_KINDS = new Set(['work', 'character', 'glossary', 'libre']);
// Terrain JSON is engine data, not markup: stored as-is after a structural
// check, normalized/clamped by the client engine at render time.
const MAX_TERRAIN_BYTES = 120 * 1024;
const MAX_WORLD_TERRAIN_BYTES = 1536 * 1024;

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const statusOf = (v, fb = 'brouillon') => (STATUS.has(v) ? v : fb);
const ambientOf = (v, fb = 'none') => (AMBIENT.has(v) ? v : fb);
const cleanTags = (v) => (Array.isArray(v)
  ? [...new Set(v.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 40)))].slice(0, 12)
  : []);

const nextSort = (table, where = '', params = []) =>
  db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table} ${where}`).get(...params).n;

function reorderTable(table, order) {
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction((ids) => ids.forEach((id, i) => stmt.run(i, Number(id))));
  tx(Array.isArray(order) ? order : []);
}

const projectExists = (id) => Boolean(db.prepare('SELECT 1 FROM writing_projects WHERE id = ?').get(id));

// Shared meta fields for projects + works (same shape).
function metaInsert(table, extra, body) {
  const b = body || {};
  const slug = uniqueSlug(table, b.slug || b.title);
  const cols = ['slug', 'title', 'title_kr', 'subtitle', 'description', 'status', 'accent_color', 'cover_image', 'tags', 'ambient_effect', 'is_published', 'sort_order', ...Object.keys(extra)];
  const vals = [
    slug, b.title.trim(), str(b.titleKr), str(b.subtitle), str(b.description),
    statusOf(b.status), str(b.accentColor, '#c9a8e8'), str(b.coverImage),
    JSON.stringify(cleanTags(b.tags)), ambientOf(b.ambientEffect), b.isPublished ? 1 : 0,
    nextSort(table, Object.keys(extra).length ? `WHERE ${Object.keys(extra)[0]} = ?` : '', Object.values(extra)),
    ...Object.values(extra),
  ];
  const ph = cols.map(() => '?').join(', ');
  return db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph})`).run(...vals);
}

function metaUpdate(table, id, ex, body) {
  const b = body || {};
  const title = b.title === undefined ? ex.title : str(b.title).trim();
  if (!title) return { error: 'missing_title' };
  const slug = b.slug === undefined || !str(b.slug).trim() ? ex.slug : uniqueSlug(table, b.slug, { excludeId: id });
  db.prepare(`
    UPDATE ${table} SET
      slug = ?, title = ?, title_kr = ?, subtitle = ?, description = ?,
      status = ?, accent_color = ?, cover_image = ?, tags = ?, ambient_effect = ?, is_published = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    slug, title,
    b.titleKr === undefined ? ex.title_kr : str(b.titleKr),
    b.subtitle === undefined ? ex.subtitle : str(b.subtitle),
    b.description === undefined ? ex.description : str(b.description),
    b.status === undefined ? ex.status : statusOf(b.status, ex.status),
    b.accentColor === undefined ? ex.accent_color : str(b.accentColor, ex.accent_color),
    b.coverImage === undefined ? ex.cover_image : str(b.coverImage),
    b.tags === undefined ? ex.tags : JSON.stringify(cleanTags(b.tags)),
    b.ambientEffect === undefined ? ex.ambient_effect : ambientOf(b.ambientEffect, ex.ambient_effect),
    b.isPublished === undefined ? ex.is_published : (b.isPublished ? 1 : 0),
    id,
  );
  return { ok: true };
}

// ── Projects ─────────────────────────────────────────────────────────────────
writingAdminRouter.get('/projects', (_req, res) => {
  const rows = db.prepare('SELECT * FROM writing_projects ORDER BY sort_order, id').all();
  res.json(rows.map((p) => ({
    ...mapProjectCard(p),
    bookCount: db.prepare('SELECT COUNT(*) AS n FROM writing_works WHERE project_id = ?').get(p.id).n,
  })));
});

writingAdminRouter.get('/projects/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM writing_projects WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const books = db.prepare('SELECT * FROM writing_works WHERE project_id = ? ORDER BY sort_order, id').all(id).map(entryWithCounts);
  const characters = db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order, name').all(id).map(mapCharacter);
  const glossary = db.prepare('SELECT * FROM glossary_terms WHERE project_id = ? ORDER BY sort_order, id').all(id).map(mapTerm);
  res.json({ ...mapProjectCard(p), books, characters, glossary });
});

writingAdminRouter.post('/projects', (req, res) => {
  if (!str(req.body?.title).trim()) return res.status(400).json({ error: 'missing_title' });
  const r = metaInsert('writing_projects', {}, req.body);
  if (req.body.hasGlossary !== undefined) {
    db.prepare('UPDATE writing_projects SET has_glossary = ? WHERE id = ?').run(req.body.hasGlossary ? 1 : 0, r.lastInsertRowid);
  }
  res.status(201).json(mapProjectCard(db.prepare('SELECT * FROM writing_projects WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/projects/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_projects WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const out = metaUpdate('writing_projects', id, ex, req.body);
  if (out.error) return res.status(400).json(out);
  if (req.body.hasGlossary !== undefined) {
    db.prepare('UPDATE writing_projects SET has_glossary = ? WHERE id = ?').run(req.body.hasGlossary ? 1 : 0, id);
  }
  if (req.body.mapBiome !== undefined && BIOMES.has(req.body.mapBiome)) {
    db.prepare('UPDATE writing_projects SET map_biome = ? WHERE id = ?').run(req.body.mapBiome, id);
  }
  if (req.body.mapTerrain !== undefined) {
    const t = req.body.mapTerrain;
    const valid = t === null || (typeof t === 'object' && !Array.isArray(t));
    if (!valid) return res.status(400).json({ error: 'invalid_terrain' });
    const json = t === null ? '' : JSON.stringify(t);
    if (json.length > MAX_TERRAIN_BYTES) return res.status(400).json({ error: 'terrain_too_large' });
    db.prepare('UPDATE writing_projects SET map_terrain = ? WHERE id = ?').run(json, id);
  }
  res.json(mapProjectCard(db.prepare('SELECT * FROM writing_projects WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/projects/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM writing_projects WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

writingAdminRouter.post('/projects/reorder', (req, res) => {
  reorderTable('writing_projects', req.body?.order);
  res.json(db.prepare('SELECT * FROM writing_projects ORDER BY sort_order, id').all().map(mapProjectCard));
});

// ── Works = typed entries in a project tree ──────────────────────────────────
// Would moving `id` under `newParent` create a cycle? (newParent is id itself
// or one of its descendants.)
function wouldCycle(id, newParentId) {
  let cur = newParentId;
  const guard = new Set();
  while (cur && !guard.has(cur)) {
    if (cur === id) return true;
    guard.add(cur);
    cur = db.prepare('SELECT parent_id FROM writing_works WHERE id = ?').get(cur)?.parent_id;
  }
  return false;
}

// Apply the entry-tree fields (type / content / parent) — kept out of the
// shared meta helpers since projects don't have them. Returns an error string
// or null.
function applyEntryFields(id, projectId, body) {
  if (body.type !== undefined) {
    db.prepare('UPDATE writing_works SET type = ? WHERE id = ?').run(str(body.type).trim().slice(0, 40) || 'Livre', id);
  }
  if (body.content !== undefined) {
    db.prepare('UPDATE writing_works SET content = ? WHERE id = ?').run(str(body.content), id);
  }
  if (body.parentId !== undefined) {
    let pid = body.parentId === null || body.parentId === '' ? null : Number(body.parentId);
    if (pid != null) {
      const parent = db.prepare('SELECT id, project_id FROM writing_works WHERE id = ?').get(pid);
      if (!parent || parent.project_id !== projectId || pid === id || wouldCycle(id, pid)) return 'invalid_parent';
    }
    db.prepare('UPDATE writing_works SET parent_id = ? WHERE id = ?').run(pid, id);
  }
  if (body.audioTrackId !== undefined) {
    db.prepare('UPDATE writing_works SET audio_track_id = ? WHERE id = ?').run(loadTrackId(body.audioTrackId), id);
  }
  if (body.mapBiome !== undefined && BIOMES.has(body.mapBiome)) {
    db.prepare('UPDATE writing_works SET map_biome = ? WHERE id = ?').run(body.mapBiome, id);
  }
  if (body.mapTerrain !== undefined) {
    const t = body.mapTerrain;
    if (t !== null && (typeof t !== 'object' || Array.isArray(t))) return 'invalid_terrain';
    const json = t === null ? '' : JSON.stringify(t);
    if (json.length > MAX_TERRAIN_BYTES) return 'terrain_too_large';
    db.prepare('UPDATE writing_works SET map_terrain = ? WHERE id = ?').run(json, id);
  }
  if (body.linkedCharacters !== undefined) {
    const clean = (Array.isArray(body.linkedCharacters) ? body.linkedCharacters : [])
      .map((l) => ({ id: Number(l.id), note: typeof l.note === 'string' ? l.note.slice(0, 120) : '' }))
      .filter((l) => db.prepare('SELECT 1 FROM characters WHERE id = ? AND project_id = ?').get(l.id, projectId));
    db.prepare('UPDATE writing_works SET linked_characters = ? WHERE id = ?').run(JSON.stringify(clean), id);
  }
  return null;
}

function entryWithCounts(w) {
  return {
    ...mapWorkCard(w),
    chapterCount: db.prepare('SELECT COUNT(*) AS n FROM writing_chapters WHERE work_id = ?').get(w.id).n,
    childCount: db.prepare('SELECT COUNT(*) AS n FROM writing_works WHERE parent_id = ?').get(w.id).n,
  };
}

writingAdminRouter.get('/works/:id(\\d+)', (req, res) => {
  const w = db.prepare('SELECT * FROM writing_works WHERE id = ?').get(Number(req.params.id));
  if (!w) return res.status(404).json({ error: 'not_found' });
  const chapters = db.prepare('SELECT * FROM writing_chapters WHERE work_id = ? ORDER BY sort_order, id')
    .all(w.id).map((c) => mapChapter(c, { withMedia: true }));
  const media = db.prepare('SELECT * FROM writing_media WHERE work_id = ? AND chapter_id IS NULL ORDER BY sort_order, id')
    .all(w.id).map(mapMedia);
  const children = db.prepare('SELECT * FROM writing_works WHERE parent_id = ? ORDER BY sort_order, id').all(w.id).map(entryWithCounts);
  res.json({ ...mapWorkCard(w), chapters, media, children });
});

writingAdminRouter.post('/projects/:id(\\d+)/works', (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectExists(projectId)) return res.status(404).json({ error: 'not_found' });
  if (!str(req.body?.title).trim()) return res.status(400).json({ error: 'missing_title' });
  const r = metaInsert('writing_works', { project_id: projectId }, req.body);
  const err = applyEntryFields(r.lastInsertRowid, projectId, req.body);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(mapWorkCard(db.prepare('SELECT * FROM writing_works WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/works/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_works WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const out = metaUpdate('writing_works', id, ex, req.body);
  if (out.error) return res.status(400).json(out);
  const err = applyEntryFields(id, ex.project_id, req.body);
  if (err) return res.status(400).json({ error: err });
  res.json(mapWorkCard(db.prepare('SELECT * FROM writing_works WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/works/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM writing_works WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

writingAdminRouter.post('/projects/:id(\\d+)/works/reorder', (req, res) => {
  reorderTable('writing_works', req.body?.order);
  res.json(db.prepare('SELECT * FROM writing_works WHERE project_id = ? ORDER BY sort_order, id')
    .all(Number(req.params.id)).map(mapWorkCard));
});

// ── Chapters ─────────────────────────────────────────────────────────────────
function loadTrackId(v) {
  if (v === null || v === undefined || v === '') return null;
  const id = Number(v);
  if (!Number.isInteger(id)) return null;
  return db.prepare('SELECT id FROM tracks WHERE id = ?').get(id) ? id : null;
}

writingAdminRouter.post('/works/:id(\\d+)/chapters', (req, res) => {
  const workId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM writing_works WHERE id = ?').get(workId)) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const r = db.prepare(`
    INSERT INTO writing_chapters (work_id, number, title, title_kr, content, audio_track_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(workId, str(b.number), str(b.title), str(b.titleKr), str(b.content), loadTrackId(b.audioTrackId),
    nextSort('writing_chapters', 'WHERE work_id = ?', [workId]));
  res.status(201).json(mapChapter(db.prepare('SELECT * FROM writing_chapters WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/chapters/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_chapters WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  db.prepare(`
    UPDATE writing_chapters SET number = ?, title = ?, title_kr = ?, content = ?, audio_track_id = ?,
      updated_at = strftime('%s','now') WHERE id = ?
  `).run(
    b.number === undefined ? ex.number : str(b.number),
    b.title === undefined ? ex.title : str(b.title),
    b.titleKr === undefined ? ex.title_kr : str(b.titleKr),
    b.content === undefined ? ex.content : str(b.content),
    b.audioTrackId === undefined ? ex.audio_track_id : loadTrackId(b.audioTrackId),
    id,
  );
  res.json(mapChapter(db.prepare('SELECT * FROM writing_chapters WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/chapters/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM writing_chapters WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

writingAdminRouter.post('/works/:id(\\d+)/chapters/reorder', (req, res) => {
  reorderTable('writing_chapters', req.body?.order);
  res.json(db.prepare('SELECT * FROM writing_chapters WHERE work_id = ? ORDER BY sort_order, id')
    .all(Number(req.params.id)).map((c) => mapChapter(c)));
});

// ── Media (image already uploaded via /api/images) ───────────────────────────
const imageExists = (filename) => Boolean(db.prepare('SELECT 1 FROM project_images WHERE filename = ?').get(filename));

writingAdminRouter.post('/media', (req, res) => {
  const b = req.body || {};
  const filename = str(b.filename).trim();
  if (!filename || !imageExists(filename)) return res.status(400).json({ error: 'unknown_image' });
  const type = MEDIA_TYPE.has(b.type) ? b.type : 'screenshot';
  const workId = b.workId ? Number(b.workId) : null;
  const chapterId = b.chapterId ? Number(b.chapterId) : null;
  if (!workId && !chapterId) return res.status(400).json({ error: 'missing_owner' });
  const where = chapterId ? 'WHERE chapter_id = ?' : 'WHERE work_id = ? AND chapter_id IS NULL';
  const r = db.prepare('INSERT INTO writing_media (work_id, chapter_id, type, filename, caption, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(workId, chapterId, type, filename, str(b.caption), nextSort('writing_media', where, [chapterId || workId]));
  res.status(201).json(mapMedia(db.prepare('SELECT * FROM writing_media WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/media/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_media WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  db.prepare('UPDATE writing_media SET type = ?, caption = ? WHERE id = ?').run(
    b.type !== undefined && MEDIA_TYPE.has(b.type) ? b.type : ex.type,
    b.caption === undefined ? ex.caption : str(b.caption), id,
  );
  res.json(mapMedia(db.prepare('SELECT * FROM writing_media WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/media/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_media WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM writing_media WHERE id = ?').run(id);
  if (!db.prepare('SELECT 1 FROM writing_media WHERE filename = ?').get(ex.filename)) {
    db.prepare('DELETE FROM project_images WHERE filename = ?').run(ex.filename);
    safeUnlink(ex.filename);
  }
  res.status(204).end();
});

writingAdminRouter.post('/media/reorder', (req, res) => {
  reorderTable('writing_media', req.body?.order);
  res.status(204).end();
});

// ── Characters (scoped to a project) ─────────────────────────────────────────
writingAdminRouter.get('/projects/:id(\\d+)/characters', (req, res) => {
  res.json(db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order, name').all(Number(req.params.id)).map(mapCharacter));
});

writingAdminRouter.post('/projects/:id(\\d+)/characters', (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectExists(projectId)) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (!str(b.name).trim()) return res.status(400).json({ error: 'missing_name' });
  const slug = uniqueSlug('characters', b.slug || b.name);
  const relations = Array.isArray(b.relations) ? JSON.stringify(b.relations) : '[]';
  const r = db.prepare(`
    INSERT INTO characters (project_id, slug, name, name_kr, role, bio, avatar_image, relations, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, slug, b.name.trim(), str(b.nameKr), str(b.role), str(b.bio), str(b.avatarImage), relations,
    nextSort('characters', 'WHERE project_id = ?', [projectId]));
  res.status(201).json(mapCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/characters/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const name = b.name === undefined ? ex.name : str(b.name).trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const slug = b.slug === undefined || !str(b.slug).trim() ? ex.slug : uniqueSlug('characters', b.slug, { excludeId: id });
  db.prepare(`
    UPDATE characters SET slug = ?, name = ?, name_kr = ?, role = ?, bio = ?, avatar_image = ?, relations = ?,
      updated_at = strftime('%s','now') WHERE id = ?
  `).run(
    slug, name,
    b.nameKr === undefined ? ex.name_kr : str(b.nameKr),
    b.role === undefined ? ex.role : str(b.role),
    b.bio === undefined ? ex.bio : str(b.bio),
    b.avatarImage === undefined ? ex.avatar_image : str(b.avatarImage),
    b.relations === undefined ? ex.relations : (Array.isArray(b.relations) ? JSON.stringify(b.relations) : ex.relations),
    id,
  );
  res.json(mapCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/characters/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM characters WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

writingAdminRouter.post('/projects/:id(\\d+)/characters/reorder', (req, res) => {
  reorderTable('characters', req.body?.order);
  res.json(db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order, name').all(Number(req.params.id)).map(mapCharacter));
});

// ── Glossary (scoped to a project) ───────────────────────────────────────────
writingAdminRouter.get('/projects/:id(\\d+)/glossary', (req, res) => {
  res.json(db.prepare('SELECT * FROM glossary_terms WHERE project_id = ? ORDER BY sort_order, id').all(Number(req.params.id)).map(mapTerm));
});

writingAdminRouter.post('/projects/:id(\\d+)/glossary', (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectExists(projectId)) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (!str(b.termKr).trim()) return res.status(400).json({ error: 'missing_term' });
  const r = db.prepare('INSERT INTO glossary_terms (project_id, term_kr, romanization, meaning, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, b.termKr.trim(), str(b.romanization), str(b.meaning), nextSort('glossary_terms', 'WHERE project_id = ?', [projectId]));
  res.status(201).json(mapTerm(db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/glossary/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const termKr = b.termKr === undefined ? ex.term_kr : str(b.termKr).trim();
  if (!termKr) return res.status(400).json({ error: 'missing_term' });
  db.prepare('UPDATE glossary_terms SET term_kr = ?, romanization = ?, meaning = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = ?').run(
    termKr,
    b.romanization === undefined ? ex.romanization : str(b.romanization),
    b.meaning === undefined ? ex.meaning : str(b.meaning),
    id,
  );
  res.json(mapTerm(db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/glossary/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM glossary_terms WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

writingAdminRouter.post('/projects/:id(\\d+)/glossary/reorder', (req, res) => {
  reorderTable('glossary_terms', req.body?.order);
  res.json(db.prepare('SELECT * FROM glossary_terms WHERE project_id = ? ORDER BY sort_order, id').all(Number(req.params.id)).map(mapTerm));
});

// ── World maps (giant 2D atlases) + zones ────────────────────────────────────
const clamp = (v, min, max, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};

const mapWorldmap = (r) => ({
  id: r.id, projectId: r.project_id, name: r.name,
  terrain: (() => { try { return r.terrain ? JSON.parse(r.terrain) : null; } catch { return null; } })(),
  sortOrder: r.sort_order,
});

writingAdminRouter.get('/projects/:id(\\d+)/worldmaps', (req, res) => {
  if (!projectExists(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.json(db.prepare('SELECT * FROM writing_worldmaps WHERE project_id = ? ORDER BY sort_order, id')
    .all(Number(req.params.id)).map(mapWorldmap));
});

writingAdminRouter.post('/projects/:id(\\d+)/worldmaps', (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectExists(projectId)) return res.status(404).json({ error: 'not_found' });
  const name = str(req.body?.name).trim().slice(0, 60) || 'Surface';
  const r = db.prepare('INSERT INTO writing_worldmaps (project_id, name, sort_order) VALUES (?, ?, ?)')
    .run(projectId, name, nextSort('writing_worldmaps', 'WHERE project_id = ?', [projectId]));
  res.status(201).json(mapWorldmap(db.prepare('SELECT * FROM writing_worldmaps WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/worldmaps/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_worldmaps WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (b.name !== undefined) {
    const name = str(b.name).trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'missing_name' });
    db.prepare("UPDATE writing_worldmaps SET name = ?, updated_at = strftime('%s','now') WHERE id = ?").run(name, id);
  }
  if (b.terrain !== undefined) {
    const t = b.terrain;
    if (t !== null && (typeof t !== 'object' || Array.isArray(t))) return res.status(400).json({ error: 'invalid_terrain' });
    const json = t === null ? '' : JSON.stringify(t);
    if (json.length > MAX_WORLD_TERRAIN_BYTES) return res.status(400).json({ error: 'terrain_too_large' });
    db.prepare("UPDATE writing_worldmaps SET terrain = ?, updated_at = strftime('%s','now') WHERE id = ?").run(json, id);
  }
  res.json(mapWorldmap(db.prepare('SELECT * FROM writing_worldmaps WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/worldmaps/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM writing_worldmaps WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// The zone's target must exist and belong to the same project (no cross-
// universe leak through the map). Returns the validated id or undefined.
function zoneTarget(kind, targetId, projectId) {
  if (kind === 'libre') return null;
  const id = Number(targetId);
  if (!Number.isInteger(id)) return undefined;
  // eslint-disable-next-line security/detect-object-injection -- kind is allowlisted by ZONE_KINDS before reaching here
  const table = { work: 'writing_works', character: 'characters', glossary: 'glossary_terms' }[kind];
  return db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND project_id = ?`).get(id, projectId) ? id : undefined;
}

// Accepts plain ids (legacy) or { to, style } objects; stores the normalized
// object form, restricted to zones living on the same map (same worldmap /
// same work / same legacy project scope).
function cleanConnections(v, scope, selfId) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const c of v) {
    const to = Number(typeof c === 'object' && c !== null ? c.to : c);
    if (!Number.isInteger(to) || to === selfId || seen.has(to)) continue;
    const peer = scope.worldmapId
      ? db.prepare('SELECT 1 FROM writing_map_zones WHERE id = ? AND worldmap_id = ?').get(to, scope.worldmapId)
      : scope.workId
        ? db.prepare('SELECT 1 FROM writing_map_zones WHERE id = ? AND work_id = ?').get(to, scope.workId)
        : db.prepare('SELECT 1 FROM writing_map_zones WHERE id = ? AND project_id = ? AND worldmap_id IS NULL AND work_id IS NULL').get(to, scope.projectId);
    if (!peer) continue;
    seen.add(to);
    out.push({ to, style: c?.style === 'arc' ? 'arc' : 'route' });
    if (out.length >= 12) break;
  }
  return out;
}

const adminZone = (id) => {
  const r = db.prepare('SELECT * FROM writing_map_zones WHERE id = ?').get(id);
  const slug = db.prepare('SELECT slug FROM writing_projects WHERE id = ?').get(r.project_id)?.slug || '';
  return mapZone(r, slug, { publicOnly: false });
};

// World maps span up to 1280 cells; local voxel maps stay within ±40.
const posLimit = (scope) => (scope.worldmapId ? 640 : 40);

function createZone(res, body, scope) {
  const b = body || {};
  const kind = ZONE_KINDS.has(b.kind) ? b.kind : 'libre';
  const targetId = zoneTarget(kind, b.targetId, scope.projectId);
  if (targetId === undefined) return res.status(400).json({ error: 'invalid_target' });
  if (kind === 'libre' && !str(b.title).trim()) return res.status(400).json({ error: 'missing_title' });
  const lim = posLimit(scope);
  const r = db.prepare(`
    INSERT INTO writing_map_zones
      (project_id, worldmap_id, work_id, kind, target_id, marker, title, subtitle, description,
       content, cover_image, category, tags, date, link, x, z, scale, rotation, building,
       connections, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scope.projectId, scope.worldmapId || null, scope.workId || null, kind, targetId,
    MARKERS.has(b.marker) ? b.marker : '',
    str(b.title).trim(), str(b.subtitle), str(b.description),
    str(b.content), str(b.coverImage), str(b.category).slice(0, 40),
    JSON.stringify(cleanTags(b.tags)), str(b.date).slice(0, 40), str(b.link).slice(0, 500),
    clamp(b.x, -lim, lim, 0), clamp(b.z, -lim, lim, 0),
    clamp(b.scale, 0.5, 2.2, 1), clamp(b.rotation, -Math.PI, Math.PI, 0),
    BUILDINGS.has(b.building) ? b.building : 'tour',
    JSON.stringify(cleanConnections(b.connections, scope, 0)),
    nextSort('writing_map_zones', scope.worldmapId ? 'WHERE worldmap_id = ?' : scope.workId ? 'WHERE work_id = ?' : 'WHERE project_id = ?',
      [scope.worldmapId || scope.workId || scope.projectId]),
  );
  res.status(201).json(adminZone(r.lastInsertRowid));
}

const listZones = (res, where, param, projectId) => {
  const slug = db.prepare('SELECT slug FROM writing_projects WHERE id = ?').get(projectId)?.slug || '';
  res.json(db.prepare(`SELECT * FROM writing_map_zones WHERE ${where} ORDER BY sort_order, id`).all(param)
    .map((z) => mapZone(z, slug, { publicOnly: false })).filter(Boolean));
};

// Legacy project-level zones (pre-hierarchy installs).
writingAdminRouter.get('/projects/:id(\\d+)/map-zones', (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectExists(projectId)) return res.status(404).json({ error: 'not_found' });
  listZones(res, 'project_id = ? AND worldmap_id IS NULL AND work_id IS NULL', projectId, projectId);
});

writingAdminRouter.post('/projects/:id(\\d+)/map-zones', (req, res) => {
  const projectId = Number(req.params.id);
  if (!projectExists(projectId)) return res.status(404).json({ error: 'not_found' });
  createZone(res, req.body, { projectId });
});

// World-map POI.
writingAdminRouter.get('/worldmaps/:id(\\d+)/zones', (req, res) => {
  const wm = db.prepare('SELECT * FROM writing_worldmaps WHERE id = ?').get(Number(req.params.id));
  if (!wm) return res.status(404).json({ error: 'not_found' });
  listZones(res, 'worldmap_id = ?', wm.id, wm.project_id);
});

writingAdminRouter.post('/worldmaps/:id(\\d+)/zones', (req, res) => {
  const wm = db.prepare('SELECT * FROM writing_worldmaps WHERE id = ?').get(Number(req.params.id));
  if (!wm) return res.status(404).json({ error: 'not_found' });
  createZone(res, req.body, { projectId: wm.project_id, worldmapId: wm.id });
});

// Local-map zones of a work (cité, région…).
writingAdminRouter.get('/works/:id(\\d+)/map-zones', (req, res) => {
  const w = db.prepare('SELECT id, project_id FROM writing_works WHERE id = ?').get(Number(req.params.id));
  if (!w) return res.status(404).json({ error: 'not_found' });
  listZones(res, 'work_id = ?', w.id, w.project_id);
});

writingAdminRouter.post('/works/:id(\\d+)/map-zones', (req, res) => {
  const w = db.prepare('SELECT id, project_id FROM writing_works WHERE id = ?').get(Number(req.params.id));
  if (!w) return res.status(404).json({ error: 'not_found' });
  createZone(res, req.body, { projectId: w.project_id, workId: w.id });
});

writingAdminRouter.put('/map-zones/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_map_zones WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const scope = { projectId: ex.project_id, worldmapId: ex.worldmap_id, workId: ex.work_id };
  const lim = posLimit(scope);
  const kind = b.kind === undefined ? ex.kind : (ZONE_KINDS.has(b.kind) ? b.kind : ex.kind);
  const targetId = b.kind === undefined && b.targetId === undefined
    ? ex.target_id
    : zoneTarget(kind, b.targetId === undefined ? ex.target_id : b.targetId, ex.project_id);
  if (targetId === undefined) return res.status(400).json({ error: 'invalid_target' });
  db.prepare(`
    UPDATE writing_map_zones SET
      kind = ?, target_id = ?, marker = ?, title = ?, subtitle = ?, description = ?, content = ?,
      cover_image = ?, category = ?, tags = ?, date = ?, link = ?,
      x = ?, z = ?, scale = ?, rotation = ?, building = ?, connections = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    kind, targetId,
    b.marker === undefined ? ex.marker : (MARKERS.has(b.marker) ? b.marker : ex.marker),
    b.title === undefined ? ex.title : str(b.title).trim(),
    b.subtitle === undefined ? ex.subtitle : str(b.subtitle),
    b.description === undefined ? ex.description : str(b.description),
    b.content === undefined ? ex.content : str(b.content),
    b.coverImage === undefined ? ex.cover_image : str(b.coverImage),
    b.category === undefined ? ex.category : str(b.category).slice(0, 40),
    b.tags === undefined ? ex.tags : JSON.stringify(cleanTags(b.tags)),
    b.date === undefined ? ex.date : str(b.date).slice(0, 40),
    b.link === undefined ? ex.link : str(b.link).slice(0, 500),
    b.x === undefined ? ex.x : clamp(b.x, -lim, lim, ex.x),
    b.z === undefined ? ex.z : clamp(b.z, -lim, lim, ex.z),
    b.scale === undefined ? ex.scale : clamp(b.scale, 0.5, 2.2, ex.scale),
    b.rotation === undefined ? ex.rotation : clamp(b.rotation, -Math.PI, Math.PI, ex.rotation),
    b.building === undefined ? ex.building : (BUILDINGS.has(b.building) ? b.building : ex.building),
    b.connections === undefined ? ex.connections : JSON.stringify(cleanConnections(b.connections, scope, id)),
    id,
  );
  res.json(adminZone(id));
});

writingAdminRouter.delete('/map-zones/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ok = db.prepare('DELETE FROM writing_map_zones WHERE id = ?').run(id).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  // Drop dangling references from the remaining zones' connections (handles
  // both the legacy plain-id form and the { to, style } form).
  const refOf = (c) => (typeof c === 'object' && c !== null ? Number(c.to) : Number(c));
  for (const z of db.prepare('SELECT id, connections FROM writing_map_zones').all()) {
    let conns = [];
    try { conns = JSON.parse(z.connections || '[]'); } catch { conns = []; }
    if (Array.isArray(conns) && conns.some((c) => refOf(c) === id)) {
      db.prepare('UPDATE writing_map_zones SET connections = ? WHERE id = ?')
        .run(JSON.stringify(conns.filter((c) => refOf(c) !== id)), z.id);
    }
  }
  res.status(204).end();
});

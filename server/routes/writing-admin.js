import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { safeUnlink } from '../uploads.js';
import { uniqueSlug } from '../slugify.js';
import {
  mapChapter, mapCharacter, mapMedia, mapTerm, mapWorkCard,
} from './writing.js';

// All routes here are admin-only. Mounted at /api/writing.
export const writingAdminRouter = Router();
writingAdminRouter.use(requireAuth, requireRole('admin'));

const WORK_STATUS = new Set(['brouillon', 'wip', 'termine']);
const MEDIA_TYPE = new Set(['screenshot', 'schema', 'carte']);

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const nextSort = (table, where = '', params = []) =>
  db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table} ${where}`).get(...params).n;

// Reorder helper shared by every ordered list. `table` is always a hardcoded
// caller constant, never request data.
function reorderTable(table, order) {
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  const tx = db.transaction((ids) => ids.forEach((id, i) => stmt.run(i, Number(id))));
  tx(Array.isArray(order) ? order : []);
}

// ── Works ────────────────────────────────────────────────────────────────────
writingAdminRouter.get('/works', (_req, res) => {
  const rows = db.prepare('SELECT * FROM writing_works ORDER BY sort_order, id').all();
  res.json(rows.map((w) => ({
    ...mapWorkCard(w),
    chapterCount: db.prepare('SELECT COUNT(*) AS n FROM writing_chapters WHERE work_id = ?').get(w.id).n,
  })));
});

writingAdminRouter.get('/works/:id(\\d+)', (req, res) => {
  const work = db.prepare('SELECT * FROM writing_works WHERE id = ?').get(Number(req.params.id));
  if (!work) return res.status(404).json({ error: 'not_found' });
  const chapters = db.prepare('SELECT * FROM writing_chapters WHERE work_id = ? ORDER BY sort_order, id')
    .all(work.id).map((c) => mapChapter(c, { withMedia: true }));
  const characterIds = db.prepare('SELECT character_id FROM work_characters WHERE work_id = ?')
    .all(work.id).map((r) => r.character_id);
  const media = db.prepare('SELECT * FROM writing_media WHERE work_id = ? AND chapter_id IS NULL ORDER BY sort_order, id')
    .all(work.id).map(mapMedia);
  res.json({ ...mapWorkCard(work), chapters, characterIds, media });
});

writingAdminRouter.post('/works', (req, res) => {
  const b = req.body || {};
  if (!str(b.title).trim()) return res.status(400).json({ error: 'missing_title' });
  const status = WORK_STATUS.has(b.status) ? b.status : 'brouillon';
  const slug = uniqueSlug('writing_works', b.slug || b.title);
  const r = db.prepare(`
    INSERT INTO writing_works
      (slug, title, title_kr, subtitle, description, status, accent_color, cover_image, is_published, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug, b.title.trim(), str(b.titleKr), str(b.subtitle), str(b.description),
    status, str(b.accentColor, '#c9a8e8'), str(b.coverImage),
    b.isPublished ? 1 : 0, nextSort('writing_works'),
  );
  const work = db.prepare('SELECT * FROM writing_works WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json(mapWorkCard(work));
});

writingAdminRouter.put('/works/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_works WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const title = b.title === undefined ? ex.title : str(b.title).trim();
  if (!title) return res.status(400).json({ error: 'missing_title' });
  const status = b.status === undefined ? ex.status : (WORK_STATUS.has(b.status) ? b.status : ex.status);
  const slug = b.slug === undefined || !str(b.slug).trim()
    ? ex.slug
    : uniqueSlug('writing_works', b.slug, { excludeId: id });
  db.prepare(`
    UPDATE writing_works SET
      slug = ?, title = ?, title_kr = ?, subtitle = ?, description = ?,
      status = ?, accent_color = ?, cover_image = ?, is_published = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    slug, title,
    b.titleKr === undefined ? ex.title_kr : str(b.titleKr),
    b.subtitle === undefined ? ex.subtitle : str(b.subtitle),
    b.description === undefined ? ex.description : str(b.description),
    status,
    b.accentColor === undefined ? ex.accent_color : str(b.accentColor, ex.accent_color),
    b.coverImage === undefined ? ex.cover_image : str(b.coverImage),
    b.isPublished === undefined ? ex.is_published : (b.isPublished ? 1 : 0),
    id,
  );
  res.json(mapWorkCard(db.prepare('SELECT * FROM writing_works WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/works/:id(\\d+)', (req, res) => {
  const ok = db.prepare('DELETE FROM writing_works WHERE id = ?').run(Number(req.params.id)).changes > 0;
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

writingAdminRouter.post('/works/reorder', (req, res) => {
  reorderTable('writing_works', req.body?.order);
  res.json(db.prepare('SELECT * FROM writing_works ORDER BY sort_order, id').all().map(mapWorkCard));
});

// ── Work ↔ character links (replace the whole set) ───────────────────────────
writingAdminRouter.put('/works/:id(\\d+)/characters', (req, res) => {
  const workId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM writing_works WHERE id = ?').get(workId)) {
    return res.status(404).json({ error: 'not_found' });
  }
  const ids = Array.isArray(req.body?.characterIds) ? req.body.characterIds.map(Number) : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM work_characters WHERE work_id = ?').run(workId);
    const ins = db.prepare('INSERT OR IGNORE INTO work_characters (work_id, character_id) VALUES (?, ?)');
    for (const cid of ids) {
      if (db.prepare('SELECT 1 FROM characters WHERE id = ?').get(cid)) ins.run(workId, cid);
    }
  });
  tx();
  res.json({ characterIds: db.prepare('SELECT character_id FROM work_characters WHERE work_id = ?').all(workId).map((r) => r.character_id) });
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
  if (!db.prepare('SELECT 1 FROM writing_works WHERE id = ?').get(workId)) {
    return res.status(404).json({ error: 'not_found' });
  }
  const b = req.body || {};
  const r = db.prepare(`
    INSERT INTO writing_chapters (work_id, number, title, title_kr, content, audio_track_id, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    workId, str(b.number), str(b.title), str(b.titleKr), str(b.content),
    loadTrackId(b.audioTrackId), nextSort('writing_chapters', 'WHERE work_id = ?', [workId]),
  );
  res.status(201).json(mapChapter(db.prepare('SELECT * FROM writing_chapters WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/chapters/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_chapters WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  db.prepare(`
    UPDATE writing_chapters SET
      number = ?, title = ?, title_kr = ?, content = ?, audio_track_id = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
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
  const rows = db.prepare('SELECT * FROM writing_chapters WHERE work_id = ? ORDER BY sort_order, id')
    .all(Number(req.params.id)).map((c) => mapChapter(c));
  res.json(rows);
});

// ── Media (image already uploaded via /api/images) ───────────────────────────
function imageExists(filename) {
  return Boolean(db.prepare('SELECT 1 FROM project_images WHERE filename = ?').get(filename));
}

writingAdminRouter.post('/media', (req, res) => {
  const b = req.body || {};
  const filename = str(b.filename).trim();
  if (!filename || !imageExists(filename)) return res.status(400).json({ error: 'unknown_image' });
  const type = MEDIA_TYPE.has(b.type) ? b.type : 'screenshot';
  const workId = b.workId ? Number(b.workId) : null;
  const chapterId = b.chapterId ? Number(b.chapterId) : null;
  if (!workId && !chapterId) return res.status(400).json({ error: 'missing_owner' });
  const where = chapterId ? 'WHERE chapter_id = ?' : 'WHERE work_id = ? AND chapter_id IS NULL';
  const r = db.prepare(`
    INSERT INTO writing_media (work_id, chapter_id, type, filename, caption, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workId, chapterId, type, filename, str(b.caption),
    nextSort('writing_media', where, [chapterId || workId]));
  res.status(201).json(mapMedia(db.prepare('SELECT * FROM writing_media WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/media/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_media WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  db.prepare('UPDATE writing_media SET type = ?, caption = ? WHERE id = ?').run(
    b.type !== undefined && MEDIA_TYPE.has(b.type) ? b.type : ex.type,
    b.caption === undefined ? ex.caption : str(b.caption),
    id,
  );
  res.json(mapMedia(db.prepare('SELECT * FROM writing_media WHERE id = ?').get(id)));
});

writingAdminRouter.delete('/media/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM writing_media WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  // Dedicated image — remove the underlying file + project_images row too so we
  // don't accumulate orphans in uploads/.
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

// ── Characters ───────────────────────────────────────────────────────────────
writingAdminRouter.get('/characters', (_req, res) => {
  res.json(db.prepare('SELECT * FROM characters ORDER BY sort_order, name').all().map(mapCharacter));
});

writingAdminRouter.post('/characters', (req, res) => {
  const b = req.body || {};
  if (!str(b.name).trim()) return res.status(400).json({ error: 'missing_name' });
  const slug = uniqueSlug('characters', b.slug || b.name);
  const relations = Array.isArray(b.relations) ? JSON.stringify(b.relations) : '[]';
  const r = db.prepare(`
    INSERT INTO characters (slug, name, name_kr, role, bio, avatar_image, relations, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, b.name.trim(), str(b.nameKr), str(b.role), str(b.bio), str(b.avatarImage),
    relations, nextSort('characters'));
  res.status(201).json(mapCharacter(db.prepare('SELECT * FROM characters WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/characters/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const name = b.name === undefined ? ex.name : str(b.name).trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const slug = b.slug === undefined || !str(b.slug).trim()
    ? ex.slug
    : uniqueSlug('characters', b.slug, { excludeId: id });
  db.prepare(`
    UPDATE characters SET slug = ?, name = ?, name_kr = ?, role = ?, bio = ?, avatar_image = ?, relations = ?,
      updated_at = strftime('%s','now')
    WHERE id = ?
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

writingAdminRouter.post('/characters/reorder', (req, res) => {
  reorderTable('characters', req.body?.order);
  res.json(db.prepare('SELECT * FROM characters ORDER BY sort_order, name').all().map(mapCharacter));
});

// ── Glossary ─────────────────────────────────────────────────────────────────
writingAdminRouter.get('/glossary', (_req, res) => {
  res.json(db.prepare('SELECT * FROM glossary_terms ORDER BY sort_order, id').all().map(mapTerm));
});

writingAdminRouter.post('/glossary', (req, res) => {
  const b = req.body || {};
  if (!str(b.termKr).trim()) return res.status(400).json({ error: 'missing_term' });
  const r = db.prepare(`
    INSERT INTO glossary_terms (term_kr, romanization, meaning, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(b.termKr.trim(), str(b.romanization), str(b.meaning), nextSort('glossary_terms'));
  res.status(201).json(mapTerm(db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(r.lastInsertRowid)));
});

writingAdminRouter.put('/glossary/:id(\\d+)', (req, res) => {
  const id = Number(req.params.id);
  const ex = db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(id);
  if (!ex) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const termKr = b.termKr === undefined ? ex.term_kr : str(b.termKr).trim();
  if (!termKr) return res.status(400).json({ error: 'missing_term' });
  db.prepare(`
    UPDATE glossary_terms SET term_kr = ?, romanization = ?, meaning = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
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

writingAdminRouter.post('/glossary/reorder', (req, res) => {
  reorderTable('glossary_terms', req.body?.order);
  res.json(db.prepare('SELECT * FROM glossary_terms ORDER BY sort_order, id').all().map(mapTerm));
});

import { Router } from 'express';
import { db, getOne } from '../db.js';

// ── Row → API mappers (shared with the admin router) ─────────────────────────
function parseTags(raw) {
  try { const t = JSON.parse(raw || '[]'); return Array.isArray(t) ? t : []; } catch { return []; }
}

export function mapProjectCard(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, titleKr: r.title_kr, subtitle: r.subtitle,
    description: r.description, status: r.status, accentColor: r.accent_color,
    coverImage: r.cover_image, tags: parseTags(r.tags), ambientEffect: r.ambient_effect || 'none',
    isPublished: r.is_published === 1, sortOrder: r.sort_order,
  };
}

export function mapWorkCard(r) {
  return {
    id: r.id, projectId: r.project_id, slug: r.slug, title: r.title, titleKr: r.title_kr,
    subtitle: r.subtitle, description: r.description, status: r.status, accentColor: r.accent_color,
    coverImage: r.cover_image, tags: parseTags(r.tags), ambientEffect: r.ambient_effect || 'none',
    isPublished: r.is_published === 1, sortOrder: r.sort_order,
  };
}

export function mapMedia(r) {
  return {
    id: r.id, workId: r.work_id, chapterId: r.chapter_id, type: r.type,
    filename: r.filename, url: `/api/images/${r.filename}`, caption: r.caption, sortOrder: r.sort_order,
  };
}

function mapTrack(trackId) {
  if (!trackId) return null;
  const tr = getOne('tracks', trackId);
  if (!tr) return null;
  return { id: tr.id, title: tr.title, genre: tr.genre, filename: tr.filename || null };
}

export function mapChapter(r, { withMedia = false } = {}) {
  const out = {
    id: r.id, workId: r.work_id, number: r.number, title: r.title, titleKr: r.title_kr,
    content: r.content, audioTrackId: r.audio_track_id, track: mapTrack(r.audio_track_id), sortOrder: r.sort_order,
  };
  if (withMedia) {
    out.media = db.prepare('SELECT * FROM writing_media WHERE chapter_id = ? ORDER BY sort_order, id').all(r.id).map(mapMedia);
  }
  return out;
}

export function mapCharacter(r) {
  let relations = [];
  try { relations = JSON.parse(r.relations || '[]'); } catch { relations = []; }
  return {
    id: r.id, projectId: r.project_id, slug: r.slug, name: r.name, nameKr: r.name_kr,
    role: r.role, bio: r.bio, avatarImage: r.avatar_image, relations, sortOrder: r.sort_order,
  };
}

export function mapTerm(r) {
  return { id: r.id, projectId: r.project_id, termKr: r.term_kr, romanization: r.romanization, meaning: r.meaning, sortOrder: r.sort_order };
}

// Project-scoped helpers reused by reader + project endpoints.
function projectCharacters(projectId) {
  return db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order, name').all(projectId).map(mapCharacter);
}
function projectGlossary(projectId) {
  return db.prepare('SELECT * FROM glossary_terms WHERE project_id = ? ORDER BY sort_order, id').all(projectId).map(mapTerm);
}

// ── Public reading API (no auth), mounted at /api/ecriture ───────────────────
export const ecritureRouter = Router();

// GET /api/ecriture — published projects (home / library cards)
ecritureRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM writing_projects WHERE is_published = 1 ORDER BY sort_order, id').all();
  res.json(rows.map((p) => ({
    ...mapProjectCard(p),
    bookCount: db.prepare('SELECT COUNT(*) AS n FROM writing_works WHERE project_id = ? AND is_published = 1').get(p.id).n,
  })));
});

// GET /api/ecriture/:project — project landing: books + characters + glossary
ecritureRouter.get('/:project', (req, res) => {
  const p = db.prepare('SELECT * FROM writing_projects WHERE slug = ? AND is_published = 1').get(req.params.project);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const books = db.prepare('SELECT * FROM writing_works WHERE project_id = ? AND is_published = 1 ORDER BY sort_order, id')
    .all(p.id).map(mapWorkCard);
  res.json({ ...mapProjectCard(p), books, characters: projectCharacters(p.id), glossary: projectGlossary(p.id) });
});

// GET /api/ecriture/:project/personnages/:slug — a character of the project
ecritureRouter.get('/:project/personnages/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM writing_projects WHERE slug = ? AND is_published = 1').get(req.params.project);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const c = db.prepare('SELECT * FROM characters WHERE project_id = ? AND slug = ?').get(p.id, req.params.slug);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json({ ...mapCharacter(c), project: { slug: p.slug, title: p.title, accentColor: p.accent_color } });
});

// GET /api/ecriture/:project/:work — a book for reading mode
ecritureRouter.get('/:project/:work', (req, res) => {
  const p = db.prepare('SELECT * FROM writing_projects WHERE slug = ? AND is_published = 1').get(req.params.project);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const w = db.prepare('SELECT * FROM writing_works WHERE project_id = ? AND slug = ? AND is_published = 1')
    .get(p.id, req.params.work);
  if (!w) return res.status(404).json({ error: 'not_found' });

  const chapters = db.prepare('SELECT * FROM writing_chapters WHERE work_id = ? ORDER BY sort_order, id')
    .all(w.id).map((c) => mapChapter(c, { withMedia: true }));
  const media = db.prepare('SELECT * FROM writing_media WHERE work_id = ? AND chapter_id IS NULL ORDER BY sort_order, id')
    .all(w.id).map(mapMedia);

  res.json({
    ...mapWorkCard(w),
    project: { slug: p.slug, title: p.title, accentColor: p.accent_color },
    chapters,
    media,
    characters: projectCharacters(p.id),
    glossary: projectGlossary(p.id),
  });
});

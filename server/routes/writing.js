import { Router } from 'express';
import { db, getOne } from '../db.js';

// ── Row → API mappers (shared with the admin router) ─────────────────────────
export function mapWorkCard(r) {
  let tags = [];
  try { tags = JSON.parse(r.tags || '[]'); } catch { tags = []; }
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    titleKr: r.title_kr,
    subtitle: r.subtitle,
    description: r.description,
    status: r.status,
    accentColor: r.accent_color,
    coverImage: r.cover_image,
    tags,
    ambientEffect: r.ambient_effect || 'none',
    isPublished: r.is_published === 1,
    sortOrder: r.sort_order,
  };
}

export function mapMedia(r) {
  return {
    id: r.id,
    workId: r.work_id,
    chapterId: r.chapter_id,
    type: r.type,
    filename: r.filename,
    url: `/api/images/${r.filename}`,
    caption: r.caption,
    sortOrder: r.sort_order,
  };
}

// Resolve the chapter's linked OST track from the existing `tracks` collection.
// Only the fields the reading-mode player needs are exposed; null if the track
// was deleted or has no audio file yet.
function mapTrack(trackId) {
  if (!trackId) return null;
  const tr = getOne('tracks', trackId);
  if (!tr) return null;
  return { id: tr.id, title: tr.title, genre: tr.genre, filename: tr.filename || null };
}

export function mapChapter(r, { withMedia = false } = {}) {
  const out = {
    id: r.id,
    workId: r.work_id,
    number: r.number,
    title: r.title,
    titleKr: r.title_kr,
    content: r.content,
    audioTrackId: r.audio_track_id,
    track: mapTrack(r.audio_track_id),
    sortOrder: r.sort_order,
  };
  if (withMedia) {
    out.media = db.prepare('SELECT * FROM writing_media WHERE chapter_id = ? ORDER BY sort_order, id')
      .all(r.id).map(mapMedia);
  }
  return out;
}

export function mapCharacter(r) {
  let relations = [];
  try { relations = JSON.parse(r.relations || '[]'); } catch { relations = []; }
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameKr: r.name_kr,
    role: r.role,
    bio: r.bio,
    avatarImage: r.avatar_image,
    relations,
    sortOrder: r.sort_order,
  };
}

export function mapTerm(r) {
  return {
    id: r.id,
    termKr: r.term_kr,
    romanization: r.romanization,
    meaning: r.meaning,
    sortOrder: r.sort_order,
  };
}

// ── Public reading API (no auth) ─────────────────────────────────────────────
export const ecritureRouter = Router();

// GET /api/ecriture — published works (library cards)
ecritureRouter.get('/', (_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM writing_works WHERE is_published = 1 ORDER BY sort_order, id',
  ).all();
  res.json(rows.map(mapWorkCard));
});

// GET /api/ecriture/:slug — full published work for reading mode
ecritureRouter.get('/:slug', (req, res) => {
  const work = db.prepare('SELECT * FROM writing_works WHERE slug = ? AND is_published = 1')
    .get(req.params.slug);
  if (!work) return res.status(404).json({ error: 'not_found' });

  const chapters = db.prepare('SELECT * FROM writing_chapters WHERE work_id = ? ORDER BY sort_order, id')
    .all(work.id)
    .map((c) => mapChapter(c, { withMedia: true }));

  const characters = db.prepare(`
    SELECT c.* FROM characters c
    JOIN work_characters wc ON wc.character_id = c.id
    WHERE wc.work_id = ?
    ORDER BY c.sort_order, c.name
  `).all(work.id).map(mapCharacter);

  const media = db.prepare('SELECT * FROM writing_media WHERE work_id = ? AND chapter_id IS NULL ORDER BY sort_order, id')
    .all(work.id).map(mapMedia);

  res.json({ ...mapWorkCard(work), chapters, characters, media });
});

// ── Public character sheets (no auth) ────────────────────────────────────────
export const personnagesRouter = Router();

// GET /api/personnages — index of characters that appear in at least one
// published work. Characters tied only to drafts stay hidden so unreleased
// worldbuilding doesn't leak.
personnagesRouter.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT c.* FROM characters c
    JOIN work_characters wc ON wc.character_id = c.id
    JOIN writing_works w ON w.id = wc.work_id AND w.is_published = 1
    ORDER BY c.sort_order, c.name
  `).all();
  res.json(rows.map(mapCharacter));
});

// GET /api/personnages/:slug — character + the published works they appear in.
// 404 if the character isn't in any published work yet.
personnagesRouter.get('/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const works = db.prepare(`
    SELECT w.slug, w.title, w.accent_color FROM writing_works w
    JOIN work_characters wc ON wc.work_id = w.id
    WHERE wc.character_id = ? AND w.is_published = 1
    ORDER BY w.sort_order, w.id
  `).all(c.id).map((w) => ({ slug: w.slug, title: w.title, accentColor: w.accent_color }));
  if (!works.length) return res.status(404).json({ error: 'not_found' });
  res.json({ ...mapCharacter(c), works });
});

// ── Public glossary (no auth) ────────────────────────────────────────────────
export const lexiqueRouter = Router();

// GET /api/lexique — Korean glossary terms
lexiqueRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM glossary_terms ORDER BY sort_order, id').all();
  res.json(rows.map(mapTerm));
});

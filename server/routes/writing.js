import { Router } from 'express';
import { db, getOne } from '../db.js';

// ── Row → API mappers (shared with the admin router) ─────────────────────────
function parseTags(raw) {
  try { const t = JSON.parse(raw || '[]'); return Array.isArray(t) ? t : []; } catch { return []; }
}

function parseTerritory(raw) {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    return t && Array.isArray(t.points) && t.points.length >= 3 ? t : null;
  } catch { return null; }
}

function parseTerrain(raw) {
  if (!raw) return null;
  try { const t = JSON.parse(raw); return t && typeof t === 'object' && !Array.isArray(t) ? t : null; } catch { return null; }
}

export function mapProjectCard(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, titleKr: r.title_kr, subtitle: r.subtitle,
    description: r.description, status: r.status, accentColor: r.accent_color,
    coverImage: r.cover_image, tags: parseTags(r.tags), ambientEffect: r.ambient_effect || 'none',
    hasGlossary: r.has_glossary === 1, mapBiome: r.map_biome || 'plaines',
    mapTerrain: parseTerrain(r.map_terrain),
    isPublished: r.is_published === 1, sortOrder: r.sort_order,
  };
}

export function mapWorkCard(r) {
  let linked = [];
  try { linked = JSON.parse(r.linked_characters || '[]'); } catch { linked = []; }
  return {
    id: r.id, projectId: r.project_id, parentId: r.parent_id, slug: r.slug,
    title: r.title, titleKr: r.title_kr, type: r.type || 'Livre',
    subtitle: r.subtitle, description: r.description, content: r.content || '',
    status: r.status, accentColor: r.accent_color,
    coverImage: r.cover_image, tags: parseTags(r.tags), ambientEffect: r.ambient_effect || 'none',
    audioTrackId: r.audio_track_id, track: mapTrack(r.audio_track_id),
    linkedCharacters: Array.isArray(linked) ? linked : [],
    mapBiome: r.map_biome || 'plaines', mapTerrain: parseTerrain(r.map_terrain),
    isPublished: r.is_published === 1, sortOrder: r.sort_order,
  };
}

// Resolve [{id,note}] links to full character cards (for the reader page).
function resolveLinkedCharacters(linked) {
  return (Array.isArray(linked) ? linked : []).map((l) => {
    const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(l.id);
    if (!c) return null;
    return { id: c.id, slug: c.slug, name: c.name, nameKr: c.name_kr, role: c.role, avatarImage: c.avatar_image, note: l.note || '' };
  }).filter(Boolean);
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
    // Used by the admin editor's localStorage autosave to decide whether a
    // local draft is newer than the server copy.
    updatedAt: r.updated_at,
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

// ── World-map zones ───────────────────────────────────────────────────────────
const countWords = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);

// Connections are stored as [{ to, style }] (style: 'route' | 'arc'); plain
// ids from older rows are normalized to routes.
function parseConnections(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    if (!Array.isArray(a)) return [];
    return a.map((c) => (typeof c === 'number'
      ? { to: c, style: 'route', via: [] }
      : {
        to: Number(c?.to),
        style: c?.style === 'arc' ? 'arc' : 'route',
        via: Array.isArray(c?.via)
          ? c.via.filter((p) => Array.isArray(p) && p.length === 2)
            .slice(0, 24).map(([x, z]) => [Number(x) || 0, Number(z) || 0])
          : [],
      }))
      .filter((c) => Number.isInteger(c.to));
  } catch { return []; }
}

// A zone row → API shape. Linked kinds resolve their target's fields; the
// zone's own non-empty fields override them. Returns null when a publicly
// rendered zone points at an unpublished/deleted target (publicOnly).
export function mapZone(r, projectSlug, { publicOnly = true } = {}) {
  const zone = {
    id: r.id, projectId: r.project_id, worldmapId: r.worldmap_id, workId: r.work_id,
    kind: r.kind, targetId: r.target_id, marker: r.marker || '',
    territory: parseTerritory(r.territory),
    title: r.title, subtitle: r.subtitle, description: r.description, content: r.content,
    coverImage: r.cover_image, category: r.category, tags: parseTags(r.tags),
    date: r.date, link: r.link,
    x: r.x, z: r.z, scale: r.scale, rotation: r.rotation, building: r.building,
    connections: parseConnections(r.connections), sortOrder: r.sort_order, stats: null,
  };
  if (r.kind === 'work' && r.target_id) {
    const w = db.prepare('SELECT * FROM writing_works WHERE id = ?').get(r.target_id);
    if (!w || (publicOnly && w.is_published !== 1)) return null;
    const chapters = db.prepare('SELECT content FROM writing_chapters WHERE work_id = ?').all(w.id);
    const words = countWords(w.content) + chapters.reduce((n, c) => n + countWords(c.content), 0);
    zone.title ||= w.title;
    zone.subtitle ||= w.subtitle;
    zone.description ||= w.description;
    zone.coverImage ||= w.cover_image;
    zone.category ||= w.type || 'Livre';
    if (!zone.tags.length) zone.tags = parseTags(w.tags);
    zone.link ||= `/projets/ecriture/${projectSlug}/${w.slug}`;
    zone.stats = {
      chapters: chapters.length,
      words,
      readingMin: words ? Math.max(1, Math.round(words / 200)) : 0,
      updatedAt: w.updated_at,
    };
  } else if (r.kind === 'character' && r.target_id) {
    const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(r.target_id);
    if (!c) return null;
    zone.title ||= c.name;
    zone.subtitle ||= c.name_kr;
    zone.description ||= c.bio;
    zone.coverImage ||= c.avatar_image;
    zone.category ||= c.role || 'Personnage';
    zone.link ||= `/projets/ecriture/${projectSlug}/personnages/${c.slug}`;
  } else if (r.kind === 'glossary' && r.target_id) {
    const g = db.prepare('SELECT * FROM glossary_terms WHERE id = ?').get(r.target_id);
    if (!g) return null;
    zone.title ||= g.term_kr;
    zone.subtitle ||= g.romanization;
    zone.description ||= g.meaning;
    zone.category ||= 'Lexique';
  }
  return zone;
}

// Resolve + prune a set of zone rows for one map (world or local).
function resolveZones(rows, projectSlug, publicOnly) {
  const zones = rows.map((z) => mapZone(z, projectSlug, { publicOnly })).filter(Boolean);
  const alive = new Set(zones.map((z) => z.id));
  for (const z of zones) z.connections = z.connections.filter((c) => alive.has(c.to) && c.to !== z.id);
  return zones;
}

// A project's world maps (giant 2D atlases) with their POI.
export function projectWorldmaps(p, { publicOnly = true } = {}) {
  return db.prepare('SELECT * FROM writing_worldmaps WHERE project_id = ? ORDER BY sort_order, id').all(p.id)
    .map((wm) => ({
      id: wm.id, name: wm.name, terrain: parseTerrain(wm.terrain),
      zones: resolveZones(
        db.prepare('SELECT * FROM writing_map_zones WHERE worldmap_id = ? ORDER BY sort_order, id').all(wm.id),
        p.slug, publicOnly,
      ),
    }));
}

// A work's local voxel map (shown on its reader page when zones exist).
export function workMap(w, projectSlug, { publicOnly = true } = {}) {
  return {
    biome: w.map_biome || 'plaines',
    terrain: parseTerrain(w.map_terrain),
    zones: resolveZones(
      db.prepare('SELECT * FROM writing_map_zones WHERE work_id = ? ORDER BY sort_order, id').all(w.id),
      projectSlug, publicOnly,
    ),
  };
}

// Legacy project-level map (pre « monde → cité » hierarchy): zones attached
// directly to the project. Kept so old data still renders if no worldmap
// exists yet.
export function projectMap(p, { publicOnly = true } = {}) {
  const rows = db.prepare('SELECT * FROM writing_map_zones WHERE project_id = ? AND worldmap_id IS NULL AND work_id IS NULL ORDER BY sort_order, id').all(p.id);
  return {
    biome: p.map_biome || 'plaines',
    terrain: parseTerrain(p.map_terrain),
    zones: resolveZones(rows, p.slug, publicOnly),
  };
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

// Published direct children of an entry (or top-level when parentId is null),
// each annotated with how many published children it has (a "container").
function publishedEntries(projectId, parentId) {
  const rows = parentId == null
    ? db.prepare('SELECT * FROM writing_works WHERE project_id = ? AND parent_id IS NULL AND is_published = 1 ORDER BY sort_order, id').all(projectId)
    : db.prepare('SELECT * FROM writing_works WHERE parent_id = ? AND is_published = 1 ORDER BY sort_order, id').all(parentId);
  return rows.map((w) => ({
    ...mapWorkCard(w),
    childCount: db.prepare('SELECT COUNT(*) AS n FROM writing_works WHERE parent_id = ? AND is_published = 1').get(w.id).n,
  }));
}

// GET /api/ecriture/:project — project landing: top-level entries + characters + glossary
ecritureRouter.get('/:project', (req, res) => {
  const p = db.prepare('SELECT * FROM writing_projects WHERE slug = ? AND is_published = 1').get(req.params.project);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const glossary = p.has_glossary ? projectGlossary(p.id) : [];
  res.json({
    ...mapProjectCard(p),
    entries: publishedEntries(p.id, null),
    characters: projectCharacters(p.id),
    glossary,
    worldmaps: projectWorldmaps(p),
    map: projectMap(p),
  });
});

// GET /api/ecriture/:project/personnages/:slug — a character of the project
ecritureRouter.get('/:project/personnages/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM writing_projects WHERE slug = ? AND is_published = 1').get(req.params.project);
  if (!p) return res.status(404).json({ error: 'not_found' });
  const c = db.prepare('SELECT * FROM characters WHERE project_id = ? AND slug = ?').get(p.id, req.params.slug);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json({ ...mapCharacter(c), project: { slug: p.slug, title: p.title, accentColor: p.accent_color } });
});

// GET /api/ecriture/:project/:work — an entry for reading mode: its own lore
// content + chapters + media, its published child entries (to navigate deeper),
// and the ancestor breadcrumb.
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

  // Ancestor breadcrumb (only published ancestors), nearest-last.
  const trail = [];
  let cur = w.parent_id;
  const guard = new Set();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const a = db.prepare('SELECT id, slug, title, parent_id, is_published FROM writing_works WHERE id = ?').get(cur);
    if (!a || !a.is_published) break;
    trail.unshift({ slug: a.slug, title: a.title });
    cur = a.parent_id;
  }

  const card = mapWorkCard(w);
  res.json({
    ...card,
    project: { slug: p.slug, title: p.title, accentColor: p.accent_color },
    trail,
    chapters,
    media,
    children: publishedEntries(p.id, w.id),
    map: workMap(w, p.slug),
    linkedCharacters: resolveLinkedCharacters(card.linkedCharacters),
    characters: projectCharacters(p.id),
    glossary: p.has_glossary ? projectGlossary(p.id) : [],
  });
});

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

// eslint-disable-next-line security/detect-non-literal-fs-filename -- DB_PATH comes from env/default, not user input
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Public-site collections (kept as JSON-blob tables — schema-flexible)
const PUBLIC_COLLECTIONS = ['projects', 'photos', 'tracks', 'education', 'experience', 'currently'];

export function migrate() {
  // ── Public collections ──
  for (const name of PUBLIC_COLLECTIONS) {
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

  // ── Users ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','member')),
      ical_token    TEXT,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('users', 'ical_token', 'TEXT');
  ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  // Email digest opt-in. Defaults to 'off' so existing installs send nothing
  // until the user explicitly enables it.
  ensureColumn('users', 'digest_frequency', `TEXT NOT NULL DEFAULT 'off' CHECK (digest_frequency IN ('off','daily','weekly'))`);
  ensureColumn('users', 'digest_last_sent_at', 'INTEGER');
  // Per-member access flag for the /stairs section. Admins always have access
  // regardless of this column; for members it must be explicitly enabled.
  ensureColumn('users', 'can_view_stairs', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;`);

  // ── Workspaces (team projects) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#c9a8e8',
      icon        TEXT NOT NULL DEFAULT '🎮',
      start_date  INTEGER,
      end_date    INTEGER,
      tags        TEXT NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);`);
  ensureColumn('workspaces', 'is_minecraft', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);`);

  // ── Per-project workspace data ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT,
      size          INTEGER NOT NULL,
      notes         TEXT DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('documents', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      version       TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'alpha',
      filename      TEXT,
      original_name TEXT,
      mime_type     TEXT,
      size          INTEGER,
      external_url  TEXT,
      notes         TEXT DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      released_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('builds', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_builds_workspace ON builds(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'backlog',
      priority     TEXT NOT NULL DEFAULT 'medium',
      assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      due_date     INTEGER,
      tags         TEXT NOT NULL DEFAULT '[]',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_status_pos ON features(status, position);`);
  // Backfill columns on pre-existing installs (must run before indexes that reference new columns)
  ensureColumn('features', 'due_date', 'INTEGER');
  ensureColumn('features', 'tags', `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn('features', 'subtasks', `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn('features', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_due_date ON features(due_date);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_workspace ON features(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      starts_at    INTEGER NOT NULL,
      ends_at      INTEGER,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('meetings', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meetings_workspace ON meetings(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_resources (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 0,
      notes        TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_resources_workspace ON minecraft_resources(workspace_id, position);`);
  ensureColumn('minecraft_resources', 'category', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('minecraft_resources', 'rarity',   "TEXT NOT NULL DEFAULT 'Commun'");
  ensureColumn('minecraft_resources', 'favorite',  'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(target_type, target_id, document_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_target ON attachments(target_type, target_id);`);

  // ── Site-wide settings (key/value JSON, e.g. public-page section order) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Revoked JWTs (blocklist) ──
  // Logging out, deleting a user, or otherwise wanting to invalidate a session
  // before its 7-day TTL stores the token's `jti` here. requireAuth rejects
  // any token whose jti is present. Rows are pruned on every check past their
  // expiry so the table stays bounded.
  db.exec(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti        TEXT PRIMARY KEY,
      user_id    INTEGER,
      expires_at INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);`);

  // ── Persistent rate-limit counters (login brute-force protection) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key        TEXT    NOT NULL,
      window_end INTEGER NOT NULL,
      hits       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_end)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rl_window ON rate_limit_hits(window_end);`);

  // ── Stairs (private shared catalogue, gated by users.can_view_stairs) ──
  // GPS coordinates are required so every entry can land on the map; country/
  // region/city are filled by Nominatim reverse geocoding (server/routes/stairs)
  // and may be edited manually if the lookup fails.
  db.exec(`
    CREATE TABLE IF NOT EXISTS stairs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      notes           TEXT NOT NULL DEFAULT '',
      step_count      INTEGER NOT NULL,
      step_height_cm  REAL,
      large_steps     INTEGER NOT NULL DEFAULT 0,
      lat             REAL NOT NULL,
      lng             REAL NOT NULL,
      country         TEXT NOT NULL DEFAULT '',
      region          TEXT NOT NULL DEFAULT '',
      city            TEXT NOT NULL DEFAULT '',
      encountered_at  INTEGER NOT NULL,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stairs_country ON stairs(country, region);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stairs_encountered_at ON stairs(encountered_at);`);

  // ── Page views (privacy-friendly site analytics) ──
  // No cookie, no raw IP. `visitor_hash` is a daily-rotating salted digest of
  // ip+ua so we can count unique visitors per day without storing PII — it's
  // irreversible and changes every midnight, so it can't track someone across
  // days. See server/routes/analytics.js.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      path         TEXT NOT NULL,
      referrer     TEXT NOT NULL DEFAULT '',
      device       TEXT NOT NULL DEFAULT 'desktop',
      country      TEXT NOT NULL DEFAULT '',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_created ON pageviews(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_path ON pageviews(path);`);
  ensureColumn('pageviews', 'browser', "TEXT NOT NULL DEFAULT ''");

  // ── Interaction events (link clicks, track plays, project views, contact) ──
  // Same privacy model as pageviews: daily-rotating visitor_hash, no PII.
  // `name` is one of a fixed allowlist (server/routes/analytics.js), `label`
  // is the specific target (social network, track title, project name…).
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      label        TEXT NOT NULL DEFAULT '',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);`);

  // ── Page timings (dwell time + scroll depth, RGPD-friendly) ──
  // One row per end-of-visit beacon. `duration_ms` is the *active* time only
  // (paused while the tab is hidden, capped server-side). `scroll_pct` is the
  // furthest 0..100 scroll position reached. Same daily-rotating visitor_hash
  // as pageviews — no PII, no cross-day tracking possible.
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_timings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      path         TEXT NOT NULL,
      duration_ms  INTEGER NOT NULL,
      scroll_pct   INTEGER NOT NULL DEFAULT 0,
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_timings_created ON page_timings(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_timings_path ON page_timings(path);`);

  // ── Link clicks (enriched: internal nav, writing zone, outbound) ──
  // Captures cross-page navigation initiated from the writing zone (chapter ↔
  // book ↔ project), plus outbound links. `to_host` is empty for same-origin
  // navigations; for outbound it stores the hostname only (no path/query =
  // no PII tokens). Same privacy model as pageviews.
  db.exec(`
    CREATE TABLE IF NOT EXISTS link_clicks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_path    TEXT NOT NULL,
      to_path      TEXT NOT NULL DEFAULT '',
      to_host      TEXT NOT NULL DEFAULT '',
      kind         TEXT NOT NULL DEFAULT 'internal',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_clicks_created ON link_clicks(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_clicks_from ON link_clicks(from_path);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_clicks_kind ON link_clicks(kind, created_at);`);

  // ── First seen of each path (powers "new pages" dashboard section) ──
  // Captures the very first time a given public path was viewed. Back-filled
  // on first migration from the existing `pageviews` table so pre-existing
  // installs don't lose history.
  db.exec(`
    CREATE TABLE IF NOT EXISTS path_first_seen (
      path          TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL
    );
  `);
  // One-shot backfill: seed first_seen_at from the earliest pageview per path.
  const fsCount = db.prepare(`SELECT COUNT(*) AS n FROM path_first_seen`).get().n;
  if (fsCount === 0) {
    db.exec(`
      INSERT OR IGNORE INTO path_first_seen (path, first_seen_at)
      SELECT path, MIN(created_at) FROM pageviews GROUP BY path
    `);
  }

  // ── Project images (portfolio pages hero + screenshots) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_images (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filename      TEXT    NOT NULL UNIQUE,
      original_name TEXT,
      mime_type     TEXT,
      size          INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Writing space (RP / worldbuilding) ──────────────────────────────────────
  // Three content levels: a *project* (a universe, e.g. « Nostra », shown on the
  // home page) owns *works* (its books / « livres ») which own ordered chapters.
  // Each chapter may point at an existing music track (FK to `tracks` — its PK is
  // a plain integer). Characters and the glossary are scoped to a project
  // (unique to it). No audio is stored here; the reader streams the full file via
  // /api/audio/:filename. Images reuse the project_images pipeline, so
  // writing_media only references the on-disk UUID filename — never a raw path.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      title_kr     TEXT NOT NULL DEFAULT '',
      subtitle     TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','wip','termine')),
      accent_color TEXT NOT NULL DEFAULT '#c9a8e8',
      cover_image  TEXT NOT NULL DEFAULT '',
      tags         TEXT NOT NULL DEFAULT '[]',
      ambient_effect TEXT NOT NULL DEFAULT 'none',
      has_glossary INTEGER NOT NULL DEFAULT 1,
      is_published INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_projects_sort ON writing_projects(sort_order);`);
  // Per-project toggle for the Korean glossary feature (not every universe uses it).
  ensureColumn('writing_projects', 'has_glossary', 'INTEGER NOT NULL DEFAULT 1');

  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_works (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      title_kr     TEXT NOT NULL DEFAULT '',
      subtitle     TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','wip','termine')),
      accent_color TEXT NOT NULL DEFAULT '#c9a8e8',
      cover_image  TEXT NOT NULL DEFAULT '',
      tags         TEXT NOT NULL DEFAULT '[]',
      ambient_effect TEXT NOT NULL DEFAULT 'none',
      is_published INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_works_sort ON writing_works(sort_order);`);
  // Columns added across releases (safe on pre-existing installs).
  ensureColumn('writing_works', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('writing_works', 'ambient_effect', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn('writing_works', 'project_id', 'INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE');
  // Tree of typed entries within a project: a work can be nested under another
  // work (parent_id), carries a free `type` (Livre, Chapitre, Lettre, Ville,
  // Cité, Monde, Région, Lore…) and an optional `content` for direct lore text
  // (shown above its chapters/children).
  ensureColumn('writing_works', 'parent_id', 'INTEGER REFERENCES writing_works(id) ON DELETE CASCADE');
  ensureColumn('writing_works', 'type', "TEXT NOT NULL DEFAULT 'Livre'");
  ensureColumn('writing_works', 'content', "TEXT NOT NULL DEFAULT ''");
  // Optional OST for the element's own lore content, and characters linked to
  // the element with a free note (e.g. "Auteur : Nielas") — JSON [{id,note}].
  ensureColumn('writing_works', 'audio_track_id', 'INTEGER REFERENCES tracks(id) ON DELETE SET NULL');
  ensureColumn('writing_works', 'linked_characters', "TEXT NOT NULL DEFAULT '[]'");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_works_project ON writing_works(project_id, sort_order);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_works_parent ON writing_works(parent_id, sort_order);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_chapters (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id        INTEGER NOT NULL REFERENCES writing_works(id) ON DELETE CASCADE,
      number         TEXT NOT NULL DEFAULT '',
      title          TEXT NOT NULL DEFAULT '',
      title_kr       TEXT NOT NULL DEFAULT '',
      content        TEXT NOT NULL DEFAULT '',
      audio_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_chapters_work ON writing_chapters(work_id, sort_order);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      name_kr      TEXT NOT NULL DEFAULT '',
      role         TEXT NOT NULL DEFAULT '',
      bio          TEXT NOT NULL DEFAULT '',
      avatar_image TEXT NOT NULL DEFAULT '',
      relations    TEXT NOT NULL DEFAULT '[]',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('characters', 'project_id', 'INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id, sort_order);`);

  // Media (screenshots / schemas / maps) attached to a work or a chapter.
  // `filename` is the UUID produced by the shared image uploader and must match
  // a project_images row to be served — same anti-leak guard as audio/images.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_media (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id    INTEGER REFERENCES writing_works(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES writing_chapters(id) ON DELETE CASCADE,
      type       TEXT NOT NULL DEFAULT 'screenshot' CHECK (type IN ('screenshot','schema','carte')),
      filename   TEXT NOT NULL,
      caption    TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_media_work ON writing_media(work_id, sort_order);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_media_chapter ON writing_media(chapter_id, sort_order);`);

  // Korean glossary for the reading-mode tooltips ({{kr:…}} tokens), per project.
  db.exec(`
    CREATE TABLE IF NOT EXISTS glossary_terms (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE,
      term_kr      TEXT NOT NULL,
      romanization TEXT NOT NULL DEFAULT '',
      meaning      TEXT NOT NULL DEFAULT '',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('glossary_terms', 'project_id', 'INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_glossary_project ON glossary_terms(project_id, sort_order);`);

  // Interactive 3D world map of a project (« Carte du monde »). Each zone is a
  // clickable building on the project's island. A zone either *links* an
  // existing entity of the project (kind work/character/glossary + target_id —
  // its title/cover/description are resolved at read time, no double entry) or
  // is free-form (kind 'libre', all fields its own). Non-empty own fields
  // always override the resolved ones. `connections` is a JSON array of other
  // zone ids of the same project (drawn as arcs). The biome preset lives on
  // writing_projects.map_biome; the map only renders when zones exist.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_map_zones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL DEFAULT 'libre' CHECK (kind IN ('work','character','glossary','libre')),
      target_id   INTEGER,
      title       TEXT NOT NULL DEFAULT '',
      subtitle    TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT '',
      tags        TEXT NOT NULL DEFAULT '[]',
      date        TEXT NOT NULL DEFAULT '',
      link        TEXT NOT NULL DEFAULT '',
      x           REAL NOT NULL DEFAULT 0,
      z           REAL NOT NULL DEFAULT 0,
      scale       REAL NOT NULL DEFAULT 1,
      rotation    REAL NOT NULL DEFAULT 0,
      building    TEXT NOT NULL DEFAULT 'tour',
      connections TEXT NOT NULL DEFAULT '[]',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_project ON writing_map_zones(project_id, sort_order);`);
  // Map hierarchy (« monde → cité ») :
  // - a project owns *world maps* (writing_worldmaps — giant 2D atlases with
  //   POI), several per project (Surface, Profondeurs…) ;
  // - each work (Cité, Région…) can carry its own local voxel map
  //   (writing_works.map_biome/map_terrain) shown on its reader page ;
  // - zones are scoped by `worldmap_id` (world POI, 2D marker) or `work_id`
  //   (local-map building). Rows with neither are pre-hierarchy leftovers.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_worldmaps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL DEFAULT 'Surface',
      terrain    TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worldmaps_project ON writing_worldmaps(project_id, sort_order);`);
  ensureColumn('writing_map_zones', 'worldmap_id', 'INTEGER REFERENCES writing_worldmaps(id) ON DELETE CASCADE');
  ensureColumn('writing_map_zones', 'work_id', 'INTEGER REFERENCES writing_works(id) ON DELETE CASCADE');
  ensureColumn('writing_map_zones', 'marker', "TEXT NOT NULL DEFAULT ''");
  // Territory polygon owned by a world-map POI (JSON { color, points:[[x,z]…] },
  // drawn as a tinted area + dashed border around its capital/city).
  ensureColumn('writing_map_zones', 'territory', "TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_worldmap ON writing_map_zones(worldmap_id, sort_order);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_work ON writing_map_zones(work_id, sort_order);`);
  ensureColumn('writing_works', 'map_biome', "TEXT NOT NULL DEFAULT 'plaines'");
  ensureColumn('writing_works', 'map_terrain', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('writing_projects', 'map_biome', "TEXT NOT NULL DEFAULT 'plaines'");
  // Free-form terrain description (JSON: regions/rivers/lakes/paths/biomes…)
  // consumed by the voxel engine client-side — see docs/carte-3d.md. Editing
  // it never requires touching the engine code.
  ensureColumn('writing_projects', 'map_terrain', "TEXT NOT NULL DEFAULT ''");

  // One-time migration for installs created before the project layer existed:
  // gather orphan works/characters/glossary under a single default project so
  // nothing is lost. Runs only while orphans exist (guarded), then never again.
  const orphans = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM writing_works   WHERE project_id IS NULL) AS w,
      (SELECT COUNT(*) FROM characters      WHERE project_id IS NULL) AS c,
      (SELECT COUNT(*) FROM glossary_terms  WHERE project_id IS NULL) AS g
  `).get();
  if (orphans.w || orphans.c || orphans.g) {
    let proj = db.prepare('SELECT id FROM writing_projects ORDER BY sort_order, id LIMIT 1').get();
    if (!proj) {
      const r = db.prepare(`
        INSERT INTO writing_projects (slug, title, subtitle, status, is_published, sort_order)
        VALUES ('univers', 'Mon univers', 'Univers à renommer', 'wip', 1, 0)
      `).run();
      proj = { id: r.lastInsertRowid };
    }
    db.prepare('UPDATE writing_works  SET project_id = ? WHERE project_id IS NULL').run(proj.id);
    db.prepare('UPDATE characters     SET project_id = ? WHERE project_id IS NULL').run(proj.id);
    db.prepare('UPDATE glossary_terms SET project_id = ? WHERE project_id IS NULL').run(proj.id);
  }
}

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// ── Generic JSON-blob CRUD (public collections) ──
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
  const tx = db.transaction((ids) => { ids.forEach((id, idx) => stmt.run(idx, id)); });
  tx(orderedIds);
  return listAll(collection);
}

export function count(collection) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${collection}`).get().n;
}

export const COLLECTIONS = PUBLIC_COLLECTIONS;

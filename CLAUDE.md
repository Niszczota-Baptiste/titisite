# CLAUDE.md — context for Claude Code

This file is read automatically at session start. Keep it concise; details
that change every commit belong in code or in `README.md`.

## What this repo is

Single-process Node app:
- **Front** : Vite + React 18 (SPA, no SSR), 3 routes top-level (`/`, `/admin`, `/project/*`).
- **Back** : Express + better-sqlite3 (`data.sqlite`), JWT auth, multer uploads.
- In **prod** the Express server serves both `/api/*` and the built `dist/` SPA.
- In **dev** Vite proxies `/api/*` to `http://localhost:3001` so requests are same-origin.

## Conventions

- Public-site collections (`projects`, `tracks`, `education`, `experience`,
  `currently`) use a **JSON-blob table per name** (`server/db.js#listAll/insert/update/remove/reorder`).
  CRUD UI uses `ItemList` (`src/components/admin/ItemList.jsx`) — pass
  `renderForm` and `renderPreview`.
- Workspace data (`features`, `meetings`, `documents`, `builds`) is **scoped
  by workspace_id**. Mounted under `/api/workspaces/:slug/{...}` behind
  `resolveWorkspace` middleware (`server/middleware/scope.js`) so the route
  handler always has `req.workspace` and never serves cross-workspace rows.
- The **writing space** (RP / worldbuilding) is **relational** (not JSON-blob)
  and has three content levels: `writing_projects` (a universe, e.g. « Nostra »,
  shown on the home page) → `writing_works` (its books / « livres ») →
  `writing_chapters` (`audio_track_id` FKs the `tracks` collection — the OST flag
  lives in the track JSON blob). `characters` and `glossary_terms` are
  **scoped by `project_id`** (unique to a project); `writing_media` reuses the
  `/api/images` pipeline (stores the UUID filename, never a path). Public read:
  `/api/ecriture` (projects), `/api/ecriture/:project` (books + characters +
  glossary), `/api/ecriture/:project/:work` (reader), `/api/ecriture/:project/
  personnages/:slug`. Admin CRUD under `/api/writing/*` (`server/routes/
  writing.js` + `writing-admin.js`). Reading mode at
  `/projets/ecriture/:project/:work` streams the **full** audio file (the 30s cap
  is client-only in `Music.jsx`). Per-work/project ambient effects live in
  `src/components/writing/AmbientEffect.jsx`. Chapter Markdown supports
  `[[perso:slug|Label]]` and `{{kr:terme}}` tokens, rendered by the in-house,
  XSS-safe renderer in `src/components/writing/markdown.jsx` (no
  `dangerouslySetInnerHTML`, no markdown dependency). Maps are two-level
  (`src/components/writing/map/`, see `docs/carte-3d.md`): **worldmaps**
  (`writing_worldmaps`, giant pannable 2D atlases with tiered POI markers,
  Minecraft-style biomes, on the project page) and **local voxel maps** per
  work (`writing_works.map_biome`/`map_terrain`, three.js lazy-loaded 3D +
  auto-generated 2D, on the reader page). `writing_map_zones` rows are scoped
  by `worldmap_id` or `work_id` and either link an existing
  work/character/glossary term (content resolved at read time) or are
  free-form.
- Frontend API calls go through `src/api/client.js`. Use `api.ws(slug).x`
  helpers for scoped resources and `api.ecriture.*` / `api.writing.*` for the
  writing space, never hand-build URLs.
- **Contact form**: `contact_messages` table, public `POST /api/contact`
  (honeypot field `website`, 5/min/IP rate-limit, SMTP notify best-effort),
  admin inbox under the same router (`server/routes/contact.js`,
  `api.contact.*`), « Messages » tab in the dashboard.
- **Workspace activity badges**: `workspace_members.last_seen_at` +
  scoped `GET /api/workspaces/:slug/activity-count` (and `POST …/seen`),
  consumed by `ProjectLayout` tabs and `Home` cards
  (`api.ws(slug).activityCount()/markSeen()`).
- **Minecraft workspaces** (flag `is_minecraft`): the « ⛏️ Minecraft » tab is an
  inventory tracker scoped by `workspace_id` (`minecraft_resources`),
  organizable into `minecraft_chests` (`chest_id`, world + X/Y/Z + note;
  delete = `SET NULL` → « Non rangé »). Item icons come from a **bundled codex**
  (`public/codex/` Minefield ≈2000 + `public/codex/vanilla/` 1.18.2 778) loaded
  by `src/data/minefieldCatalog.js` (fetched at runtime, not in the JS bundle).
  A chest can be filled from a screenshot: `POST …/minecraft/scan-screenshot`
  reads it with Claude vision (`server/minecraftVision.js`, **optional** — needs
  `ANTHROPIC_API_KEY`, model `MINECRAFT_VISION_MODEL`), then the user validates a
  draft and `POST …/minecraft/chests/:id/apply` (`replace`|`merge`). All under
  `server/routes/minecraft.js` + `api.ws(slug).minecraft.*`.
- **Imported builds + WorldEdit** (`minecraft_blueprints`, workspace-scoped):
  `.mca`/`region.zip` imported → parsed to a **sparse artifact** (`data_file`)
  for the 3D viewer; the **source file is kept** (`source_file`) so the server
  can transform the real region files. The **WorldEdit engine** (`server/anvil/`
  read+write, `server/worldedit/`) applies mirror/rotate/translate/replace/set/
  copy-paste with correct **block-state** rewrites on a **non-destructive
  staging copy** under `uploads/worldedit/<id>/` (per-op undo snapshots,
  `worldedit_audit` log, `.mca`/`.zip` export). API under both
  `…/blueprints/:id/worldedit/*` (JWT) and `/api/worldedit/shared/:token/*`
  (scoped share link). Roles **owner/editor/viewer**; scoped links in
  `blueprint_shares` (`view`/`edit` + expiry + revoke), managed by the owner,
  opened at `/we/:token`. UI in `src/components/project/builds/` (`WorldEditPanel`,
  `SharesPanel`). Block-state table + invariants are in `docs/worldedit.md`. The
  Anvil round-trip is **lossless** (unmodified chunks re-emitted byte-for-byte).
- **Music playback** is global: `src/music/MusicPlayerContext.jsx` owns the
  single `<audio>` (30 s public clip cap) and `MiniPlayer.jsx` floats across
  routes — hidden on /admin and in the reader, which pauses it (ReaderAudio
  streams the full file there). `Music.jsx` is just a consumer.
- **Quest tracker** (« Quêtes » — Nostra/Minefield) is a **global** module (not
  workspace-scoped): a few authorised members share one quest DB and each ticks
  **their own** completion. Read gated by `users.can_view_quests`, edit by
  `can_edit_quests` (admins bypass; both surfaced on `/auth/me`). Relational
  tables (`factions`/`faction_tiers`, `quest_chains`, `quests`, `quest_edges`,
  `quest_inputs`/`quest_rewards`/`quest_prerequisites`, `quest_map_points`,
  `quest_completions`, plus user-defined `quest_groups` + `quest_group_items`
  many-to-many, and standalone `quest_map_pois`) in `db.js#migrate`. Back under `/api/quests`
  (`server/routes/quests.js` read+complete, `quests-admin.js` edit,
  `server/quests/` helpers); front `src/components/quests/*` + page `/quetes`,
  API via `api.quests.*`. **No reputation score is stored** (in-game) —
  factions/tiers are a reference and rewards only *document* gains. Item lines
  reuse the **codex** catalogue (`CodexPicker`, `ref_code` = codex id, no FK).
  **Recurring reset is a pure function of `period_key`** (07:00 Europe/Paris,
  `server/quests/period.js`) — no cron, no DB mutation, replayable/self-healing.
  **Cockpit MF integration is PULL**: a secret per-user `cockpit_token`
  (iCal-style) serves `GET /api/quests/cockpit/:token.json` for the user's local
  Python app to poll (opt-in `wants_quest_reminders`). Map points are raw X/Y/Z
  on a neutral editable grid (`QuestMap.jsx`); a « Carte » tab
  (`QuestWorldMap.jsx`, pan/zoom) aggregates every quest's points plus
  **standalone POIs** (`quest_map_pois` — buildings, farm zones…, add-by-clicking
  for editors). **Groups** (`quest_groups`) are a
  free organizational axis on top of factions/chains — a quest can be in several.
  A discreet `/quetes` link lives in the public-site `Footer`. See `docs/quetes.md`.
- **SEO**: `GET /sitemap.xml` is generated from the DB
  (`server/routes/sitemap.js`); per-route meta via
  `src/hooks/usePageMeta.js`. Reader prefs (font size/width/theme) live in
  `src/components/writing/ReaderSettings.jsx` (CSS vars `--reader-*`).
- **Autosave drafts**: `src/hooks/useDraft.js` (5 s debounce, localStorage)
  + `DraftBanner` in `admin/ui.jsx` — used by the chapter editor and
  FeatureModal; drafts are purged on successful save and only offered when
  newer than the server `updatedAt`.
- Components imports: prefer the existing primitives in
  `src/components/admin/ui.jsx` (Button, Field, Input, Textarea) and
  `src/components/project/shared.jsx` (Section, Modal, Tag, Avatar,
  formatDate, …).
- Mobile: there is a `useIsMobile(bp)` hook (`src/hooks/useIsMobile.js`).
  Most layouts use the breakpoint 720px (project) or 860px (home).
- Filenames on disk are UUID + sanitized extension. The original name is
  kept in the DB for `Content-Disposition` only.

## Auth

- Stateful session via **HttpOnly cookie** named `titisite_session`
  (`SameSite=Strict`, `Secure` in prod). Set in
  `server/auth.js#setSessionCookie`, cleared by
  `clearSessionCookie`. **Never store the JWT in localStorage.**
- `requireAuth` reads the cookie first, then falls back to
  `Authorization: Bearer` for non-browser callers.
- Roles: `admin` (full access) and `member` (project workspaces they're a
  member of). `requireRole(...roles)` is a middleware composable.
- Frontend: `src/auth/AuthContext.jsx` boots from cached user info, then
  verifies via `GET /auth/me`. The cookie is the source of truth — the
  `localStorage` user copy is just for UI hydration.
- iCal feed (`/api/calendar/:token.ics`) uses a **separate per-user token**
  in the URL (no cookie auth). Token rotatable via
  `POST /api/me/ical-token/rotate`.

## Security caps already in place

- `express-rate-limit` on `/api/auth/login` (10/min/IP, only counts failed
  attempts), `/api/audio/:filename` (60/min), `/api/calendar/:token.ics`
  (30/min), `/api/contact` (5/min).
- `/api/images/:f` and `/api/audio/:f` send
  `Cache-Control: immutable` (filenames are UUIDs — replacing a file always
  changes the URL).
- Graceful shutdown: SIGTERM/SIGINT → `server.close()` with a 30 s force
  exit. Analytics beacons older than 7 days are purged at boot;
  `JWT_SECRET` is mandatory (also salts the analytics visitor hash).
- Audio endpoint cross-checks the filename against the `tracks` table —
  uploaded documents/builds in `uploads/` cannot leak through it.
- Three multer uploaders (`server/uploads.js`):
  `uploadDocument` (50 MB, doc/image/text MIME),
  `uploadAudio` (100 MB, audio MIME),
  `uploadBuild` (1 GB, archives + native packages).
  Both extension and MIME must be in the allowlist; rejections return 415.
- `app.set('trust proxy', 1)` so rate limits see the real client behind a
  reverse proxy.
- CORS: `credentials: true`, `origin: false` in prod (same-origin), `true`
  in dev (Vite proxy).

## Commands

```bash
npm install
npm run dev          # backend (3001) + Vite (5173) in parallel
npm run build        # vite build → dist/
npm start            # NODE_ENV=production, single Express process
```

`.env.example` lists every var. Required: `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `MEMBER_EMAIL`, `MEMBER_PASSWORD`. Optional:
`ANTHROPIC_API_KEY` (+ `MINECRAFT_VISION_MODEL`) enables the Minecraft
chest-screenshot reader — without it that flow falls back to manual entry.
First boot creates the DB at `DB_PATH` (default `./data.sqlite`) and seeds:
- the two users from env (bcrypt hashed),
- public-site content from `src/data/*.js`,
- a `Projet principal` workspace with both users as members.

## When fixing things

- Run `npm run build` before claiming a UI change works — it catches syntax
  errors that the dev server papers over.
- For backend changes that touch endpoints, do a curl smoke test with
  `data.sqlite` removed first, so seeding runs fresh.
- Don't `git add -A` blindly — `data.sqlite*`, `uploads/`, `dist/`,
  `.env`, `.claude/` are all in `.gitignore` for good reasons.
- `npm install` is fine; never run `npm audit fix --force`.
- The user owns the data files in `src/data/*.js` (their CV/portfolio
  content). Don't reformat or "clean up" their copy without an explicit
  ask. They occasionally edit them by hand and we rebase on top.

## Things that have bitten us before

- **localStorage tokens**: was the original auth, removed for XSS reasons.
  If you ever see `getToken()` / `setToken()` reappear in `client.js`, that's
  a regression — auth is cookie-only now.
- **Public file leak**: `/api/audio/:filename` used to serve any file in
  `uploads/`. It now requires the filename to belong to a `tracks` row.
- **DB-prepared statements at module top level** crash if they reference
  tables created in `migrate()`. Lazy-prepare them inside the handler (see
  `trackByFilename` in `server/index.js`).
- **i18n dropped keys**: `src/data/i18n.js` is hand-edited. A missing
  `music:` (or any other) key on a language variant causes Rollup to choke
  on parse with a misleading line number. Sanity-check the structure when
  any data file commit lands.

## Where to add things

| Add… | …in |
|---|---|
| New section in admin dashboard | `src/components/admin/Dashboard.jsx` (`TABS` array) + new file in `editors/` |
| New per-workspace tab | `src/components/project/ProjectLayout.jsx` (`TABS`) + new file in `project/` + route in `src/pages/Project.jsx` |
| New scoped API resource | new file in `server/routes/` with `Router({ mergeParams: true })`, then mount under the `scoped` router in `server/index.js` |
| New public-site collection | append to `PUBLIC_COLLECTIONS` in `server/db.js`, create `src/data/<name>.js`, add seed mapping in `server/seed.js`, write the section + its admin editor |
| New public setting | use the existing `site_settings` k/v table — see `server/routes/settings.js` |
| New writing-space field/resource | add the column/table in `server/db.js#migrate`, the mapper + route in `server/routes/writing.js` (public) / `writing-admin.js` (admin), an `api.*` helper in `src/api/client.js`, then the editor in `src/components/admin/editors/writing/` and reader UI in `src/components/writing/` |
| New 3D-map biome/building | `src/components/writing/map/presets.js` (+ the mesh in `buildings.jsx` for a building), then the matching allowlist in `server/routes/writing-admin.js` — see `docs/carte-3d.md` |

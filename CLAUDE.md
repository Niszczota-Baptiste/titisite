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
  draft and `POST …/minecraft/chests/:id/apply` (`replace`|`merge`). A
  « Ressources wanted » wishlist card (`minecraft_wanted`, workspace-scoped)
  sits above the chests: priority 1–3 (sorted, done last), progress computed
  client-side from the inventory by normalized name, checkbox when the wanted
  quantity is collected, optional `assigned_to` (member-validated like the
  Kanban assignee; « À moi / Non assignés » filter). `POST …/wanted/bulk`
  merges by normalized name (goal = max, priority = highest, done rows
  reopened) — fed by the « manquant → wanted » buttons of the craft
  calculator and the blueprint BOM. Sibling workspace-scoped modules, all in
  `server/routes/minecraft.js` + `api.ws(slug).minecraft.*`:
  `minecraft_stock_history` (one point per name_norm/day upserted on every
  inventory mutation, absent names drop to 0, boot purge 400 d → « 📈
  Tendances » sparklines in the Résumé, which also shows a « 👥 Qui a fait
  quoi » per-member contributions card), `minecraft_gear` (« ⚔️ Stuff
  nommé » panel on the chests page: renamed tools + free-text enchants,
  owner member or common, stored chest or on-body), `minecraft_villagers` +
  `minecraft_villager_trades` (🧑‍🌾 page: profession, coords, trades with
  normal price + per-player discounted price `discount_user_id`), and
  `minecraft_map_pois` (🗺️ project map, `ProjectMap.jsx`) and `minecraft_maps`
  (named maps per world with a default view + calibrated 2D background image,
  like `quest_maps` — same UX as the quest map: map selector, image opacity,
  grid toggle, Recentrer, 💾 Vue par défaut; base worlds are synthetic
  always-present maps). `minecraft_sketches` (✏️ Schémas, `Sketches.jsx`:
  freehand vector drawing — strokes as 0..1 fractions — over a screenshot or
  blank sheet; canvas editor with palette/width/eraser/undo). `workspace_threads`
  (💬 Discussions/RP, `Discussions.jsx`: RP/lore + discussion threads,
  pinnable, comments reuse the `comments` table with `target_type = 'thread'`
  gated by workspace membership in `comments.js`). `custom_recipes.type` also
  accepts `'brewing'` (⚗️ no grid, free ingredient list in the admin editor).
  **Minefield craft engine** (`server/craft/` + `server/routes/craft.js`):
  the real server recipe dump lives at `server/data/recipes_minefield.json`
  (**CONFIDENTIAL** — gitignored, deploy by hand like `data.sqlite`; never in
  `public/` or `src/data/`), loaded in memory at first use; only recipes
  `enabled && visible && !deprecated` are used. Namespaced ids resolve to the
  codex (`minefield:` → `public/codex/codex.json`, `minecraft:` →
  `src/data/codex_vanilla.json`, with cross-namespace fallback). Endpoints all
  behind `requireAuth` (`api.craft.*`): `GET /api/craft/recipes` (paginated
  search + crafter facet — never the whole dump), `GET /api/craft/recipe/:itemId`,
  `POST /api/craft/plan { item, qty, workspace?, choices? }` — server-side
  recursive tree (Minefield > admin `custom_recipes` > vanilla, cycles cut,
  default = least-deep viable recipe; pure-cycle families peel their base
  material — `_ingot` & co — into a raw leaf whose reverse recipes stay
  forceable via `choices`, incl. the special `'raw'` value), crossed with the
  workspace's chests (FIFO rows → consume/missing/surplus + per-chest
  breakdown). `CraftCalculator.jsx` consumes it (grid 3×3 from the dump's
  `"row,col"` grid, station badge, alternative picker) and still applies via
  `ws.minecraft.craftApply`.
  Member-scoped image upload: `POST …/minecraft/upload-image` reuses the
  sharp/WebP pipeline (`server/images.js`, extracted from `routes/images.js`
  whose `POST /api/images` stays admin-only) so project members can add map
  backgrounds and sketch screenshots. `ImageUploadField` takes an optional
  `uploadFn` to target it.
  A second flag `minecraft_only` (« Projet 100 % Minecraft » in
  `WorkspacesEditor`, implies `is_minecraft` at read time) hides the classic
  tabs (Vue d'ensemble → Réunions) and splits the Minecraft page into
  separate tabs: 📊 Résumé (`MinecraftResume.jsx` — stats, wanted progress,
  latest additions, computed client-side), 📦 Coffres (`/minecraft`),
  🎯 Wanted, 🗺️ Carte (`ProjectMap.jsx`), 🧑‍🌾 Villageois (`Villagers.jsx`),
  ✏️ Schémas (`Sketches.jsx`), 💬 Discussions (`Discussions.jsx`),
  🏗️ Builds 3D, 🧮 Calculateur (`MinecraftTab mode=…`) + a
  📜 Quêtes tab-link to `/quetes` and a 🗝️ Salle des coffres one to
  `/atelier-coffres`; mixed projects reach Carte/Villageois/
  Schémas/Discussions via tool-links in the ⛏️ Minecraft action bar. `tabsFor`/`projectHome`/
  `MINECRAFT_ONLY_TABS` in `ProjectLayout.jsx` drive the tab bar; hidden-tab
  URLs redirect to `/resume`, where Home cards and the switcher also land.
  Mixed projects keep the single ⛏️ Minecraft page (`mode="full"`).
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
  A **screenshot → carte en blocs** entry point (`POST …/blueprints/mapart`,
  `MapArtForm` in `BuildsView.jsx`, `ws.blueprints.fromImage`) creates a NEW flat
  build directly from an image at a chosen **map grid** (each Minecraft map =
  128×128 blocks: 1×1, 2×1, 3×3…), as a vertical **mur** or a flat **sol**. It
  resizes with sharp, maps each pixel to the nearest **flat map-color block**
  (`mapColors.js#imageToMapBlocks`), then reuses the blank-build path
  (`staging.js#buildPlaneFromNames`: `blankRegions` + `RegionStore` + `deriveSparse`)
  so the result is a first-class build — visible in the 3D generator, with a BOM,
  WorldEdit-editable and `.mca`-exportable (walls are capped at 3 maps tall by the
  world height → `too_tall`).
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
  many-to-many, standalone `quest_map_pois`, and `quest_maps`) in
  `db.js#migrate`. Back under `/api/quests`
  (`server/routes/quests.js` read+complete, `quests-admin.js` edit,
  `server/quests/` helpers); front `src/components/quests/*` + page `/quetes`,
  API via `api.quests.*`. **No reputation score is stored** (in-game) —
  factions/tiers are a reference and rewards only *document* gains. Item lines
  reuse the **codex** catalogue (`CodexPicker`, `ref_code` = codex id, no FK).
  **Unique items** (`quest_custom_items`, « 📦 Items » tab in `/quetes`): the
  server's item catalogue — géodes, monnaies, renamed gear. Started life as
  "a renamed codex item"; **extended in place** into a first-class entity
  (slug, lore, rarity, category, faction, price + currency, openable, tags) so
  no id moved and the existing `ref_code = 'custom:<id>'` references keep
  resolving. Items exist **without any quest**. They're merged into the picker
  catalogue via `customCatalogEntries()` (`src/data/minefieldCatalog.js`) both
  in `/quetes` and in the projects' Minecraft tab (chest autocomplete + icons),
  and the stock endpoint matches them by normalized **custom name** so a chest
  row named after the item is tracked.
  Around them: `unique_item_rarities` (ordered, editable in-app — a table, not
  an enum), `loot_entries` (a container's loot table: result is a unique item
  FK / codex id / PA / reputation / free text, quantity range, probability +
  its provenance), `loot_observations` (per-member opening log → empirical
  rates with a Wilson 95 % interval), `unique_item_sources` (manual sources
  only). `quest_rewards` carry optional
  `probabilite`/`probabilite_source`/`quantite_min`/`quantite_max` — NULL
  probability = guaranteed line (unchanged), set = part of the quest's random
  draw (« rien, ou 1–3 géodes »), so `potentialGains` is now weighted by
  expectation. `quests.categorie` (`recolte|craft|achat|pvp|autre`) drives list
  facets + sections; a craft quest's **ingredients stay in `quest_inputs` and
  its result in `quest_rewards`** (only station/3×3 grid/mastery are new
  columns), so chest lookup and the cockpit feed work on crafts for free;
  `quest_offers`/`quest_offer_lines` carry n purchase offers per quest, payable
  in PA or in items. `GET /unique-items/:id/sources` **derives** every way to
  obtain an item (and every use of it) from those relations — nothing is
  re-entered; catalogue counts are 8 GROUP BY queries, never N+1. Loot maths
  (expected value, « vendre ou ouvrir ? » verdict, Wilson) are pure functions in
  `src/components/quests/items/loot.js`, tested in `test/loot-math.test.js`:
  results with no known price are **excluded** (their share is shown) rather
  than counted as zero, and no exchange rate is ever invented between
  currencies. Extensible lists live in `server/quests/enums.js` — the two
  `categorie` columns deliberately have **no CHECK** (a SQLite CHECK can't be
  extended without rebuilding the table). See `docs/quetes.md`.
  **Recurring reset is a pure function of `period_key`** (07:00 Europe/Paris,
  `server/quests/period.js`) — no cron, no DB mutation, replayable/self-healing.
  **Cockpit MF integration is PULL**: a secret per-user `cockpit_token`
  (iCal-style) serves `GET /api/quests/cockpit/:token.json` for the user's local
  Python app to poll (opt-in `wants_quest_reminders`). The feed carries
  inputs/rewards/mapPoints per quest, a **personal** `wanted` list
  (`cockpit_items`, per-user — NOT the group `minecraft_wanted`) and a
  per-user follow filter (`cockpit_quest_follows`: no row = send everything).
  The cockpit is **admin-only** and lives ONLY in the dashboard (« 🛰️ Cockpit »
  tab, `CockpitEditor`): `/api/me/cockpit-token*`, `/api/me/quest-reminders`
  and `/api/me/cockpit/*` all require role `admin`, the token feed 404s for
  non-admin tokens, and `/admin` rejects non-admin members entirely
  (`server/routes/cockpit-me.js`, `api.cockpit.*`). The `/quetes` banner has
  no cockpit button — instead a « ⛏️ ← Retour au projet » link back to the
  origin project's Minecraft tab (`QuestsLink` passes `?projet=<slug>`,
  kept in sessionStorage).
  `GET /api/quests/quests/:id/stock` links quest item inputs to the Minecraft
  inventories of the caller's accessible workspaces (normalized-name match via
  `server/codex.js`; chest + world + coords per location) — surfaced in
  `QuestDetail` as « Où trouver dans les coffres ». Map points are raw X/Y/Z
  on a neutral editable grid (`QuestMap.jsx`); a « Carte » tab
  (`QuestWorldMap.jsx`, pan/zoom) aggregates every quest's points plus
  **standalone POIs** (`quest_map_pois` — buildings, farm zones…, add-by-clicking
  for editors), across **multiple named maps** (`quest_maps`, each with its own
  editable centre/span since a world isn't always at 0,0, and an optional real
  2D **background image** reusing the `/api/images` pipeline, calibrated to world
  coords via `img_center_x/z`+`img_span`). Points/POIs are
  scoped by `map_id` (NULL resolves to the default/first map). **Groups**
  (`quest_groups`) are a
  free organizational axis on top of factions/chains — a quest can be in several.
  The `/quetes` entry point is a « 📜 Quêtes » link in the Minecraft tab of
  projects (`QuestsLink` in `src/components/project/Minecraft.jsx`) — NOT in
  the public-site footer. See `docs/quetes.md`.
- **Atelier « Salle des coffres »** (`/atelier-coffres`, `docs/salle-des-coffres.md`)
  is a **design** tool for a Minefield vault room *and its storage layout* — a
  schematic, not a builder and **not an inventory**: no decoration block
  anywhere, and **no quantity is ever stored**. The only container is
  Minefield's **coffre sans fond**: a 1×1×1 block of **72 slots** openable from
  anywhere, so chests have no kind, no facing, no pair and no reachability
  constraint. A chest may be *dedicated* to one or more codex items — a storage
  designation (« la redstone va ici »), never a stock. Global module gated by
  `users.can_view_vault` (admins bypass), but a plan is only visible to its
  owner and the accounts it is explicitly shared with — **no admin bypass
  there**, and an inaccessible plan answers 404.
  Tables: `vault_plans` (scalar metadata + `data` JSON document + `revision`),
  `vault_plan_shares`, `vault_plan_versions` (snapshots freeze document +
  dims + a copy of the categories used), `vault_categories` (**global**,
  seeded from the codex's 9 Minefield categories — vanilla entries have no
  `categorie`, hence an editable table). Document = `floors` (non-overlapping
  Y slices) / `zones` (rect **+ their own `yMin`/`yMax` inside the floor**, so a
  zone is a volume — « 100×5×100 » — plus categories, manual `reservedSlots`
  and the `reserved` update-buffer flag) / `chests` (`x/y/z` + `items`, codex
  ids without quantity) / `circulation` (couloir/escalier/entree). The **Mur**
  tool drags one line and raises it across every level of the zone (500 chests
  in one gesture); a zone's fiche fills its whole volume and distributes a
  category's items over its free chests — that's the « plan dans le plan », and
  the « 📒 Rangement » tab turns it into a searchable index (item → zone, floor,
  exact coordinates, CSV export). `server/vault/validate.js` renormalizes on
  every write **and read** (it doubles as the migration off the old
  single/double model) and 422s only on *structural* breakage; design defects
  (chest outside its zone or levels, overlapping zones, item filed twice,
  isolated floor…) are non-blocking warnings, otherwise a plan being edited
  would become unsaveable mid-autosave. Saving is an atomic
  CAS (`UPDATE … WHERE id = ? AND revision = ?`) → **409** with
  `{ updatedBy, updatedAt, serverRevision }`, autosave pauses and the modal
  offers Recharger / Écraser (`force: true`). Capacity is structural only
  (chests × 72 vs the zone's manual reserve), computed twice on purpose:
  `server/vault/capacity.js` for plan summaries, `src/components/vault/capacity.js`
  for per-zone/per-category figures and warnings. Front: `src/pages/Atelier.jsx`
  + `src/components/vault/*` (native 2D canvas, homemade SVG logic map, lazy
  three.js volume view) + `useVaultPlan.js` (2 s autosave, keepalive flush,
  revision handling). Entry point: the « 🗝️ Salle des coffres » link of a
  project's ⛏️ Minecraft tab (`?projet=<slug>` for the way back).
- **Lore « Nostra »** (`/lore`, `docs/lore.md`) is a **global** investigation
  module (like quests): gated by `users.can_view_lore` (single flag = read AND
  write, admins bypass), relational `lore_*` tables, API under `/api/lore`
  (`server/routes/lore.js` + `server/lore/{store,geo,enums}.js`), front in
  `src/components/lore/` + page `src/pages/Lore.jsx`. Key invariants:
  **north = decreasing Z** — all bearing math lives in `server/lore/geo.js`
  (tested), the map's origin mode consumes `GET /geo/ring` and the client does
  NO trigonometry; geography is scoped by **`monde`** (nostra/novum) ×
  `dimension`, so every map/points/shapes/ring query carries both; the map
  background is collaborative **128×128 tiles** (`lore_map_tiles`) on the real
  Minecraft map grid — tile (i,j) covers `[i·128-64, i·128+64)`, re-uploading a
  tile replaces it, and tiles are kept keyed by their map id client-side so a
  world switch can never frame on the previous world's tiles; `lore_fts` (FTS5, first in the repo) is synced explicitly
  by the store; media are WebP-recompressed (decode failure = 415) and served
  ONLY via `/api/lore/media/file/:f` behind the gate — never statically;
  terminal hypothesis statuses (confirmed/refuted/**abandoned**) require a
  `resolution_note`, and dead pistes stay browsable (folded by default);
  comments reuse the global `comments` table (`lore_entry`/`lore_hypothesis`);
  a **PNJ is an entry** of type `pnj` with a `peuple_id` (`lore_peuples`) and
  carries N `lore_dialogues` (free-text `quest_name` label, not a FK to the
  quest module); entry menu link (Minecraft tab) renders only when
  `canViewLore`, plus a « 🔍 Lore — carte » shortcut in the admin dashboard
  (`/lore?tab=…` deep-links a tab). Seed
  `server/seed-lore.js` = real survey data, idempotent, `SEED_LORE=off`.
  The **« 🛡 Admin » tab is role-`admin` only** (the `can_view_lore` flag is NOT
  enough) — surveillance of what investigators do: per-member counts + bytes
  uploaded, a media inventory sorted by weight (spot personal-photo dumping),
  and an **append-only journal** (`lore_audit`). The journal exists because
  everything else cascades: `auditLore` (`server/lore/audit.js`) is one
  middleware mounted before all handlers that **snapshots the label and the
  cascade cost before** the handler runs, so a deletion still says what it
  destroyed and who did it. Only 2xx are logged. Adding a mutating lore route
  means adding a line to its `ROUTES` table.
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
| New tool/field in the vault workshop | the field in `server/vault/validate.js#normalizeDoc` (it strips anything it doesn't know), then the tool in `src/components/vault/Toolbar.jsx` + its gesture in `PlanCanvas.jsx` + its fiche in `Inspector.jsx` — see `docs/salle-des-coffres.md` |
| New lore entry type / status / tab | `server/lore/enums.js` + visual meta in `src/components/lore/theme.js`; tabs via `TABS` in `src/pages/Lore.jsx` — see `docs/lore.md` |

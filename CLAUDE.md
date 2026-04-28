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
- Frontend API calls go through `src/api/client.js`. Use `api.ws(slug).x`
  helpers for scoped resources, never hand-build URLs.
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
  (30/min).
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
`ADMIN_PASSWORD`, `MEMBER_EMAIL`, `MEMBER_PASSWORD`. First boot creates the
DB at `DB_PATH` (default `./data.sqlite`) and seeds:
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

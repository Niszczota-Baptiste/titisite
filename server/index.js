import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireRole } from './auth.js';
import { COLLECTIONS } from './db.js';
import { resolveWorkspace } from './middleware/scope.js';
import { authRouter } from './routes/auth.js';
import { tracksRouter } from './routes/tracks.js';
import { buildsRouter } from './routes/builds.js';
import { calendarRouter } from './routes/calendar.js';
import { collectionRouter } from './routes/collection.js';
import { commentsRouter } from './routes/comments.js';
import { documentsRouter } from './routes/documents.js';
import { featuresRouter } from './routes/features.js';
import { meRouter } from './routes/me.js';
import { meetingsRouter } from './routes/meetings.js';
import { tagsRouter } from './routes/tags.js';
import { usersRouter } from './routes/users.js';
import { workspacesRouter } from './routes/workspaces.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: IS_PROD ? false : true, credentials: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, env: IS_PROD ? 'production' : 'development' }));

// Public audio streaming (portfolio music extracts served from the uploads dir)
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
app.get('/api/audio/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).end();
  res.sendFile(filename, { root: UPLOADS_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// Public ICS calendar feed (token-based, no auth header — phones subscribe to this)
app.use('/api/calendar', calendarRouter);

// Auth + users + tracks (tracks has its own router with audio upload support,
// so we skip the generic collection router for it below)
app.use('/api/auth',   authRouter);
app.use('/api/users',  usersRouter);
app.use('/api/tracks', tracksRouter);

// Other public-site collections (admin-only writes)
for (const name of COLLECTIONS.filter((n) => n !== 'tracks')) {
  app.use(`/api/${name}`, collectionRouter(name));
}

// Comments (global polymorphic)
app.use('/api/comments', commentsRouter);

// Current-user helpers (e.g. /api/me/events for the cross-project calendar)
app.use('/api/me', meRouter);

// Workspace CRUD
app.use('/api/workspaces', workspacesRouter);

// Per-workspace scoped routes: /api/workspaces/:slug/{features,meetings,documents,builds}
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, requireRole('admin', 'member'), resolveWorkspace);
scoped.use('/features',  featuresRouter);
scoped.use('/meetings',  meetingsRouter);
scoped.use('/documents', documentsRouter);
scoped.use('/builds',    buildsRouter);
scoped.use('/tags',      tagsRouter);
app.use('/api/workspaces/:slug', scoped);

if (IS_PROD) {
  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    console.warn('[server] dist/ not found — run `npm run build` before starting in production.');
  }
}

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  console.error('[server]', err);
  res.status(500).json({ error: 'internal_error' });
});

const boot = await seedIfEmpty();
if (boot.users?.length) {
  console.log('[seed] created users:', boot.users.map((u) => `${u.email} (${u.role})`).join(', '));
}
if (boot.workspaces) {
  console.log('[seed] workspace migration:', JSON.stringify(boot.workspaces));
}

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
});

server.headersTimeout = 60 * 60 * 1000;
server.requestTimeout = 0;

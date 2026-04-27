import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireRole } from './auth.js';
import { assertCanonicalOriginConfigured } from './canonicalUrl.js';
import { SqliteStore } from './rateLimitStore.js';
import { COLLECTIONS, db } from './db.js';
import { startDigestScheduler } from './digest.js';
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
import { settingsRouter } from './routes/settings.js';
import { summaryRouter } from './routes/summary.js';
import { tagsRouter } from './routes/tags.js';
import { usersRouter } from './routes/users.js';
import { workspacesRouter } from './routes/workspaces.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const IS_PROD = process.env.NODE_ENV === 'production';

// Fail fast if CANONICAL_ORIGIN is missing in prod — without it, generated
// iCal URLs would be derived from the (attacker-controlled) Host header.
assertCanonicalOriginConfigured();

const app = express();
// Trust the first reverse proxy so rate-limit + req.ip see the real client
app.set('trust proxy', 1);

// Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, …).
// CSP allows: same-origin everything, Google Fonts (CSS + woff), inline styles
// because the React tree relies on `style={}` props. HSTS only in prod (would
// break http://localhost in dev). crossOriginEmbedderPolicy is disabled so
// audio/image responses without CORP headers keep loading.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: IS_PROD
    ? { maxAge: 15552000, includeSubDomains: true }
    : false,
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
// In dev the SPA runs on Vite's port and proxies /api through, so the only
// origin we want to accept is the Vite dev server. In prod the SPA is served
// by the same Express, so CORS stays disabled.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({
  origin: IS_PROD ? false : DEV_ORIGINS,
  credentials: true,
}));

const rlMessage = (error) => ({ error });

// Cheap global cap on /api/* to blunt scraping / opportunistic DDoS. Endpoints
// that need a tighter (login, audio) or looser policy layer their own limiter
// on top — express-rate-limit composes correctly: each request increments
// every limiter that matches.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: rlMessage('rate_limited'),
});
app.use('/api/', apiLimiter);

// Brute-force shield on the login endpoint. Uses a SQLite-backed store so the
// counter survives server restarts and can't be reset by bouncing the process.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: rlMessage('too_many_attempts'),
  store: new SqliteStore(60_000),
});

// Audio streaming: 60 req / minute / IP
const audioLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: rlMessage('rate_limited'),
});

// Calendar feeds get polled by phones every few minutes; cap is generous
const calendarLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: rlMessage('rate_limited'),
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Public audio streaming. Two layers of defense beyond the rate limiter:
//   1. Filename regex prevents path traversal / weird chars.
//   2. The filename MUST belong to a row in the `tracks` table — we never
//      serve raw files from `uploads/`, only audio that's been deliberately
//      attached to a public track. Documents and game builds (sharing the
//      same on-disk directory) stay reachable only through their respective
//      authenticated download endpoints.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
// Lazy-prepared so it's created after migrate() has run on first boot.
let _trackByFilename;
const trackByFilename = (fn) => {
  if (!_trackByFilename) {
    _trackByFilename = db.prepare(
      `SELECT 1 FROM tracks WHERE json_extract(data, '$.filename') = ?`,
    );
  }
  return _trackByFilename.get(fn);
};
app.get('/api/audio/:filename', audioLimiter, (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).end();
  if (!trackByFilename(filename)) return res.status(404).end();
  res.sendFile(filename, { root: UPLOADS_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// Public ICS calendar feed (token-based, no auth header — phones subscribe to this)
app.use('/api/calendar', calendarLimiter, calendarRouter);

// Auth + users + tracks (tracks has its own router with audio upload support,
// so we skip the generic collection router for it below)
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',   authRouter);
app.use('/api/users',  usersRouter);
app.use('/api/tracks', tracksRouter);

// Other public-site collections (admin-only writes)
for (const name of COLLECTIONS.filter((n) => n !== 'tracks')) {
  app.use(`/api/${name}`, collectionRouter(name));
}

// Comments (global polymorphic)
app.use('/api/comments', commentsRouter);

// Site-wide settings (public read for sections order, admin write)
app.use('/api/settings', settingsRouter);

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
scoped.use('/summary',   summaryRouter);
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
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large' });
  }
  if (err && (err.code === 'MIME_NOT_ALLOWED' || err.code === 'EXTENSION_NOT_ALLOWED')) {
    return res.status(415).json({
      error: err.code === 'MIME_NOT_ALLOWED' ? 'mime_not_allowed' : 'extension_not_allowed',
      allowed: err.allowed,
    });
  }
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

// In production, bind only to loopback — Nginx is the public-facing entry
// point. Listening on 0.0.0.0 would expose port 3001 directly even before any
// firewall rule is applied, which is a defence-in-depth failure.
const BIND_HOST = IS_PROD ? '127.0.0.1' : '0.0.0.0';
const server = app.listen(PORT, BIND_HOST, () => {
  console.log(`[server] listening on http://${BIND_HOST}:${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
});

// Email digest scheduler — no-op if SMTP is not configured.
startDigestScheduler();

// Slowloris cap on header reads. 30 s is far more than any legitimate client
// needs and tight enough to drop pathological connections.
server.headersTimeout = 30 * 1000;
// Hard ceiling on a request from headers-done to body-end. Generous because
// uploadBuild allows up to 1 GB and slow uplinks exist; still finite so an
// abandoned upload can't pin a socket forever.
server.requestTimeout = 30 * 60 * 1000;

import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './db.js';
import { authRouter } from './routes/auth.js';
import { tracksRouter } from './routes/tracks.js';
import { buildsRouter } from './routes/builds.js';
import { collectionRouter } from './routes/collection.js';
import { commentsRouter } from './routes/comments.js';
import { documentsRouter } from './routes/documents.js';
import { featuresRouter } from './routes/features.js';
import { meetingsRouter } from './routes/meetings.js';
import { usersRouter } from './routes/users.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();

// JSON body limit only applies to JSON routes; multer handles multipart streaming separately.
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: IS_PROD ? false : true, credentials: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, env: IS_PROD ? 'production' : 'development' }));

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');

app.get('/api/audio/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).end();
  res.sendFile(filename, { root: UPLOADS_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.use('/api/tracks', tracksRouter);

app.use('/api/auth',      authRouter);
app.use('/api/users',     usersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/builds',    buildsRouter);
app.use('/api/features',  featuresRouter);
app.use('/api/meetings',  meetingsRouter);
app.use('/api/comments',  commentsRouter);

for (const name of COLLECTIONS.filter((n) => n !== 'tracks')) {
  app.use(`/api/${name}`, collectionRouter(name));
}

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
  console.error('[server]', err);
  res.status(500).json({ error: 'internal_error' });
});

const boot = await seedIfEmpty();
if (boot.users?.length) {
  console.log('[seed] created users:', boot.users.map((u) => `${u.email} (${u.role})`).join(', '));
}

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
});

// Allow long uploads (1 GB over slow networks)
server.headersTimeout = 60 * 60 * 1000;
server.requestTimeout = 0;

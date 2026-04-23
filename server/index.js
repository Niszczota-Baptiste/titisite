import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './db.js';
import { authRouter } from './routes/auth.js';
import { collectionRouter } from './routes/collection.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cors({ origin: IS_PROD ? false : true, credentials: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, env: IS_PROD ? 'production' : 'development' }));
app.use('/api/auth', authRouter);
for (const name of COLLECTIONS) {
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
  console.error('[server]', err);
  res.status(500).json({ error: 'internal_error' });
});

await seedIfEmpty();

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (${IS_PROD ? 'prod' : 'dev'})`);
});

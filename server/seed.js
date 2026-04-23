import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COLLECTIONS, count, insert, migrate } from './db.js';
import { ensureSeedUsers } from './users.js';
import { migrateOrphansToDefault } from './workspaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const SOURCES = {
  projects:   { file: 'projects.js',   key: 'projects' },
  tracks:     { file: 'tracks.js',     key: 'tracks' },
  education:  { file: 'education.js',  key: 'education' },
  experience: { file: 'experience.js', key: 'experience' },
  currently:  { file: 'currently.js',  key: 'currently' },
};

async function loadSource(file, key) {
  const mod = await import(pathToFileURL(path.join(DATA_DIR, file)).href);
  return mod[key] || [];
}

export async function seedIfEmpty({ force = false } = {}) {
  migrate();
  const results = { users: ensureSeedUsers() };

  for (const name of COLLECTIONS) {
    const existing = count(name);
    if (existing > 0 && !force) {
      results[name] = { skipped: true, existing };
      continue;
    }
    const items = await loadSource(SOURCES[name].file, SOURCES[name].key);
    items.forEach((item, idx) => insert(name, item, idx));
    results[name] = { inserted: items.length };
  }

  const wsMigration = migrateOrphansToDefault();
  if (wsMigration) results.workspaces = wsMigration;

  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const force = process.argv.includes('--force');
  seedIfEmpty({ force }).then((r) => {
    console.log('[seed]', JSON.stringify(r, null, 2));
    process.exit(0);
  });
}

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COLLECTIONS, count, insert, migrate } from './db.js';
import { ensureSeedUsers } from './users.js';
import { seedWritingIfEmpty } from './seed-writing.js';
import { seedItemsIfEmpty } from './seed-items.js';
import { seedLoreIfEmpty } from './seed-lore.js';
import { seedQuestsIfEmpty } from './seed-quests.js';
import { seedUniqueItemsCatalogue } from './seed-unique-items.js';
import { seedVaultCategoriesIfEmpty } from './vault/seed-categories.js';
import { migrateOrphansToDefault } from './workspaces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const SOURCES = {
  projects:   { file: 'projects.js',   key: 'projects' },
  photos:     { file: 'photos.js',     key: 'photos' },
  tracks:     { file: 'tracks.js',     key: 'tracks' },
  education:  { file: 'education.js',  key: 'education' },
  experience: { file: 'experience.js', key: 'experience' },
  currently:  { file: 'currently.js',  key: 'currently' },
};

async function loadSource(file, key) {
  const mod = await import(pathToFileURL(path.join(DATA_DIR, file)).href);
  // eslint-disable-next-line security/detect-object-injection -- key and file come from SOURCES, a hardcoded module constant
  return mod[key] || [];
}

export async function seedIfEmpty({ force = false } = {}) {
  migrate();
  const results = { users: ensureSeedUsers() };

  for (const name of COLLECTIONS) {
    const existing = count(name);
    if (existing > 0 && !force) {
      // eslint-disable-next-line security/detect-object-injection -- name comes from COLLECTIONS, a hardcoded array
      results[name] = { skipped: true, existing };
      continue;
    }
    // eslint-disable-next-line security/detect-object-injection -- name comes from COLLECTIONS, a hardcoded array
    const items = await loadSource(SOURCES[name].file, SOURCES[name].key);
    items.forEach((item, idx) => insert(name, item, idx));
    // eslint-disable-next-line security/detect-object-injection -- name comes from COLLECTIONS, a hardcoded array
    results[name] = { inserted: items.length };
  }

  const wsMigration = migrateOrphansToDefault();
  if (wsMigration) results.workspaces = wsMigration;

  results.writing = seedWritingIfEmpty();
  results.quests = seedQuestsIfEmpty();
  // Raretés + géodes : idempotent par ligne (rareté par nom, item par slug), donc
  // rejoué à chaque boot sans écraser le catalogue — contrairement au seed de
  // démo des quêtes, court-circuité dès qu'une faction existe.
  results.uniqueItems = seedUniqueItemsCatalogue();
  results.vaultCategories = seedVaultCategoriesIfEmpty();
  // Lore « Nostra » : vraies données d'enquête (bâtiments, poèmes, hypothèses
  // avec leur statut réel) — court-circuité dès la première entrée existante.
  results.lore = seedLoreIfEmpty();
  // Base des items customs Minefield : les données réelles du document des
  // scribes. Idempotent ligne par ligne — une version ultérieure du document
  // ajoute ses items sans écraser ceux déjà retouchés en ligne.
  results.items = seedItemsIfEmpty();

  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const force = process.argv.includes('--force');
  seedIfEmpty({ force }).then((r) => {
    console.log('[seed]', JSON.stringify(r, null, 2));
    process.exit(0);
  });
}

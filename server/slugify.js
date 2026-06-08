import { db } from './db.js';

// Turn a free-text title into a URL-safe slug. Strips diacritics (Nielas ←
// Niélàs) and anything that isn't a-z/0-9, collapses runs of '-'. Falls back to
// a short random token if the input has no usable characters (e.g. only Korean).
export function slugify(input) {
  const base = String(input || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || `item-${Math.random().toString(36).slice(2, 8)}`;
}

// Ensure the slug is unique within `table`, appending -2, -3… on collision.
// `table` is a hardcoded caller constant, never user input.
export function uniqueSlug(table, desired, { excludeId = null } = {}) {
  const slug = slugify(desired);
  const exists = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`);
  let n = 1;
  let candidate = slug;
  while (exists.get(candidate, excludeId ?? -1)) {
    n += 1;
    candidate = `${slug}-${n}`;
  }
  return candidate;
}

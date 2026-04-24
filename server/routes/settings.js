import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

export const settingsRouter = Router();

// Default section list for the public homepage. "hero" is implicit and always
// rendered first; the rest is reorderable + can be hidden.
export const DEFAULT_PUBLIC_SECTIONS = [
  { id: 'projects',   visible: true },
  { id: 'music',      visible: true },
  { id: 'about',      visible: true },
  { id: 'education',  visible: true },
  { id: 'experience', visible: true },
  { id: 'current',    visible: true },
  { id: 'contact',    visible: true },
];

const ALLOWED_IDS = new Set(DEFAULT_PUBLIC_SECTIONS.map((s) => s.id));

function readKey(key) {
  const row = db.prepare(`SELECT value FROM site_settings WHERE key = ?`).get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function writeKey(key, value) {
  db.prepare(`
    INSERT INTO site_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%s','now')
  `).run(key, JSON.stringify(value));
}

function normalizeSections(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const out = [];
  for (const s of input) {
    if (!s || typeof s !== 'object') continue;
    const id = String(s.id || '');
    if (!ALLOWED_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, visible: !!s.visible });
  }
  // Append any missing sections at the bottom, hidden, so we never accidentally
  // drop a section the admin hasn't seen yet (e.g. after adding a new one).
  for (const def of DEFAULT_PUBLIC_SECTIONS) {
    if (!seen.has(def.id)) out.push({ id: def.id, visible: false });
  }
  return out;
}

// Public read: anyone (the public site needs this to render in the right order)
settingsRouter.get('/public-sections', (_req, res) => {
  const stored = readKey('public_sections');
  const sections = normalizeSections(stored) || DEFAULT_PUBLIC_SECTIONS.slice();
  res.json({ sections });
});

// Admin write
settingsRouter.put(
  '/public-sections',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const sections = normalizeSections(req.body?.sections);
    if (!sections) return res.status(400).json({ error: 'invalid_sections' });
    writeKey('public_sections', sections);
    res.json({ sections });
  },
);

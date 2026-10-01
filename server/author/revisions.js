import { db } from '../db.js';
import { countWords } from './text.js';

// Historique des champs longs (contenu d'un chapitre, corps d'un élément).
// Règle des snapshots AUTOMATIQUES : on fige la version PRÉCÉDENTE avant
// d'écrire la nouvelle quand
//   - aucun snapshot n'existe encore (la première retouche garde l'original),
//   - le dernier date de plus de 10 min (une séance d'écriture = un point),
//   - ou la modification est importante (≥ 200 mots retirés, ou plus de 30 %
//     du texte disparu) — un « tout sélectionner + coller » se rattrape.
// Les snapshots manuels (étiquetés) ne sont jamais purgés ; les automatiques
// sont plafonnés par champ.

export const AUTO_INTERVAL_S = 600;
export const AUTO_KEEP = 80;

export function shouldSnapshot(prev, next, lastAt, nowS) {
  const before = String(prev || '');
  if (before === String(next || '') || !before.trim()) return false;
  if (!lastAt) return true;
  if (nowS - lastAt >= AUTO_INTERVAL_S) return true;
  const a = countWords(before);
  const b = countWords(next);
  if (a - b >= 200) return true;
  if (a >= 50 && b < a * 0.7) return true;
  return false;
}

export function lastSnapshotAt(entityId, field) {
  const r = db.prepare(`SELECT created_at FROM author_revisions WHERE entity_id = ? AND field = ? ORDER BY id DESC LIMIT 1`)
    .get(entityId, field);
  return r?.created_at ?? null;
}

export function insertRevision(entityId, field, body, { label = '', manual = false } = {}) {
  const info = db.prepare(`
    INSERT INTO author_revisions (entity_id, field, body, word_count, label, manual)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entityId, field, body, countWords(body), label, manual ? 1 : 0);
  if (!manual) {
    db.prepare(`
      DELETE FROM author_revisions
      WHERE entity_id = ? AND field = ? AND manual = 0 AND id NOT IN (
        SELECT id FROM author_revisions WHERE entity_id = ? AND field = ? AND manual = 0
        ORDER BY id DESC LIMIT ?
      )
    `).run(entityId, field, entityId, field, AUTO_KEEP);
  }
  return info.lastInsertRowid;
}

export function listRevisions(entityId, field) {
  return db.prepare(`
    SELECT id, field, word_count, label, manual, created_at, length(body) AS size
    FROM author_revisions WHERE entity_id = ? AND (? IS NULL OR field = ?)
    ORDER BY id DESC LIMIT 300
  `).all(entityId, field ?? null, field ?? null).map((r) => ({
    id: r.id, field: r.field, wordCount: r.word_count, label: r.label,
    manual: r.manual === 1, createdAt: r.created_at, size: r.size,
  }));
}

export function getRevision(entityId, revisionId) {
  const r = db.prepare(`SELECT * FROM author_revisions WHERE id = ? AND entity_id = ?`).get(revisionId, entityId);
  if (!r) return null;
  return {
    id: r.id, field: r.field, body: r.body, wordCount: r.word_count, label: r.label,
    manual: r.manual === 1, createdAt: r.created_at,
  };
}

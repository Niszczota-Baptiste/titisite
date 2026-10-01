import { db } from '../db.js';
import { relationMeta } from './enums.js';
import { chapterNumbers, ftsSync, liveEntity, relationLabel } from './entities.js';
import { AuthorValidationError, cleanColor, cleanText } from './validate.js';

// Relations entre éléments (author_links) + tags du projet + données du graphe.

// ── Relations ───────────────────────────────────────────────────────────────

function linkFromRow(r) {
  return {
    id: r.id, fromId: r.from_id, toId: r.to_id, kind: r.kind, label: r.label, note: r.note,
    createdAt: r.created_at,
  };
}

export function createLink(projectId, input = {}) {
  const from = liveEntity(projectId, input.fromId);
  const to = liveEntity(projectId, input.toId);
  if (!from || !to) throw new AuthorValidationError('unknown_entity', from ? 'toId' : 'fromId');
  if (from.id === to.id) throw new AuthorValidationError('self_link', 'toId');
  const kind = String(input.kind || 'lie_a');
  const meta = relationMeta(kind);
  if (!meta) throw new AuthorValidationError('invalid_relation', 'kind');
  const label = cleanText(input.label, 80, 'label', { trim: true });
  const note = cleanText(input.note, 2000, 'note');
  // Relation symétrique : une seule ligne quel que soit le sens de saisie
  // (A ami de B == B ami de A), sinon la contrainte UNIQUE laisserait passer
  // le doublon inversé.
  let [a, b] = [from.id, to.id];
  if (meta.symmetric && a > b) [a, b] = [b, a];
  const existing = db.prepare(`SELECT * FROM author_links WHERE from_id = ? AND to_id = ? AND kind = ?`).get(a, b, kind);
  if (existing) return { link: linkFromRow(existing), existed: true };
  const info = db.prepare(`
    INSERT INTO author_links (project_id, from_id, to_id, kind, label, note) VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, a, b, kind, label, note);
  return { link: linkFromRow(db.prepare(`SELECT * FROM author_links WHERE id = ?`).get(info.lastInsertRowid)) };
}

export function updateLink(projectId, id, input = {}) {
  const row = db.prepare(`SELECT * FROM author_links WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!row) return null;
  const label = input.label !== undefined ? cleanText(input.label, 80, 'label', { trim: true }) : row.label;
  const note = input.note !== undefined ? cleanText(input.note, 2000, 'note') : row.note;
  let kind = row.kind;
  if (input.kind !== undefined) {
    if (!relationMeta(input.kind)) throw new AuthorValidationError('invalid_relation', 'kind');
    kind = input.kind;
  }
  try {
    db.prepare(`UPDATE author_links SET label = ?, note = ?, kind = ? WHERE id = ?`).run(label, note, kind, id);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new AuthorValidationError('duplicate_link', 'kind');
    throw err;
  }
  return linkFromRow(db.prepare(`SELECT * FROM author_links WHERE id = ?`).get(id));
}

export function deleteLink(projectId, id) {
  return db.prepare(`DELETE FROM author_links WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

// ── Graphe ──────────────────────────────────────────────────────────────────
// Nœuds = éléments vivants (hors idées par défaut : le graphe sert l'univers),
// arêtes = relations dont les deux bouts sont vivants.
export function graphData(projectId, { kinds = null } = {}) {
  const kindSql = kinds && kinds.length ? `AND e.kind IN (${kinds.map(() => '?').join(',')})` : '';
  const nodes = db.prepare(`
    SELECT e.id, e.kind, e.title, e.icon, e.color, e.is_favorite,
           COALESCE(p.category_id, lo.category_id) AS category_id
    FROM author_entities e
    LEFT JOIN author_places p ON p.entity_id = e.id
    LEFT JOIN author_lore lo ON lo.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL ${kindSql}
    ORDER BY e.id LIMIT 3000
  `).all(projectId, ...(kinds || []));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = db.prepare(`
    SELECT l.id, l.from_id, l.to_id, l.kind, l.label FROM author_links l WHERE l.project_id = ?
  `).all(projectId).filter((l) => ids.has(l.from_id) && ids.has(l.to_id));
  const numbers = chapterNumbers(projectId);
  return {
    nodes: nodes.map((n) => ({
      id: n.id, kind: n.kind, title: n.title, icon: n.icon, color: n.color,
      isFavorite: n.is_favorite === 1, categoryId: n.category_id,
      number: n.kind === 'chapter' ? numbers.get(n.id) ?? null : undefined,
    })),
    edges: edges.map((l) => ({
      id: l.id, from: l.from_id, to: l.to_id, kind: l.kind,
      label: relationLabel(l.kind, 'out', l.label),
      symmetric: !!relationMeta(l.kind)?.symmetric,
    })),
  };
}

// ── Tags ────────────────────────────────────────────────────────────────────

export function listTags(projectId) {
  return db.prepare(`
    SELECT t.id, t.name, t.color, COUNT(e.id) AS used
    FROM author_tags t
    LEFT JOIN author_entity_tags et ON et.tag_id = t.id
    LEFT JOIN author_entities e ON e.id = et.entity_id AND e.deleted_at IS NULL
    WHERE t.project_id = ?
    GROUP BY t.id ORDER BY t.name COLLATE NOCASE
  `).all(projectId);
}

export function createTag(projectId, input = {}) {
  const name = cleanText(input.name, 60, 'name', { trim: true, required: true }).replace(/^#/, '');
  const color = cleanColor(input.color) || '#c9a8e8';
  if (db.prepare(`SELECT 1 FROM author_tags WHERE project_id = ? AND name = ? COLLATE NOCASE`).get(projectId, name)) {
    return null; // 409
  }
  const info = db.prepare(`INSERT INTO author_tags (project_id, name, color) VALUES (?, ?, ?)`).run(projectId, name, color);
  return { id: info.lastInsertRowid, name, color, used: 0 };
}

// Renommer vers un nom déjà pris FUSIONNE les deux tags (les éléments du tag
// renommé rejoignent l'existant) — c'est ce qu'on veut en nettoyant « Magie »
// et « magie ». La réponse le signale.
// Le nom des tags est indexé (« #magie ») : renommer/fusionner/supprimer
// réindexe les éléments concernés.
function resyncTagged(tagId) {
  for (const r of db.prepare(`SELECT entity_id FROM author_entity_tags WHERE tag_id = ?`).all(tagId)) ftsSync(r.entity_id);
}

export function updateTag(projectId, id, input = {}) {
  const tag = db.prepare(`SELECT * FROM author_tags WHERE id = ? AND project_id = ?`).get(id, projectId);
  if (!tag) return null;
  const color = input.color !== undefined ? (cleanColor(input.color) || tag.color) : tag.color;
  const name = input.name !== undefined
    ? cleanText(input.name, 60, 'name', { trim: true, required: true }).replace(/^#/, '')
    : tag.name;
  const other = db.prepare(`SELECT * FROM author_tags WHERE project_id = ? AND name = ? COLLATE NOCASE AND id <> ?`)
    .get(projectId, name, id);
  if (other) {
    db.transaction(() => {
      db.prepare(`INSERT OR IGNORE INTO author_entity_tags (entity_id, tag_id) SELECT entity_id, ? FROM author_entity_tags WHERE tag_id = ?`)
        .run(other.id, id);
      db.prepare(`DELETE FROM author_tags WHERE id = ?`).run(id);
    })();
    resyncTagged(other.id);
    return { merged: true, tag: { id: other.id, name: other.name, color: other.color } };
  }
  db.prepare(`UPDATE author_tags SET name = ?, color = ? WHERE id = ?`).run(name, color, id);
  if (name !== tag.name) resyncTagged(id);
  return { merged: false, tag: { id, name, color } };
}

export function deleteTag(projectId, id) {
  const tagged = db.prepare(`SELECT entity_id FROM author_entity_tags WHERE tag_id = ?`).all(id);
  const ok = db.prepare(`DELETE FROM author_tags WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
  if (ok) for (const r of tagged) ftsSync(r.entity_id);
  return ok;
}

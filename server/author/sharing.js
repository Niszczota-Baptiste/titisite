import { db } from '../db.js';
import { getBoard, listBoards } from './boards.js';
import {
  CHAPTER_STATUSES, GUEST_KINDS, SHARE_ROLES, VALIDATED_STATUS,
} from './enums.js';
import { chapterNumbers, getEntity, listEntities, liveEntity, nowS } from './entities.js';
import { bookProgress } from './overview.js';
import { listPins } from './structure.js';
import { cleanSnippet, nameKey, scrubWikiLinks } from './text.js';
import { AuthorValidationError, cleanText } from './validate.js';

export { scrubWikiLinks };

// Lectures INVITÉES de l'atelier d'auteur + gestion des partages et des
// commentaires. Règle unique : un invité ne voit que GUEST_KINDS (liste
// blanche, la boîte à idées en est absente), et chaque fonction ici applique
// ce filtre elle-même — les routes invitées n'appellent jamais une lecture
// « propriétaire » brute sans repasser par ce fichier.
//
//   omniscient : tout le livre sauf les idées, les tâches, la corbeille,
//                l'historique, la cohérence et les tableaux non partagés ;
//   lecteur    : les chapitres « terminés » ET validés, rien d'autre.

const IN_GUEST = `(${GUEST_KINDS.map((k) => `'${k}'`).join(',')})`;

// ── Liens [[Nom]] vers une idée ─────────────────────────────────────────────
// Le texte d'une fiche peut contenir [[Titre d'une idée|libellé]] : la cible
// est le titre de l'idée. scrubWikiLinks (text.js) la remplace par le texte
// affiché — le libellé, ou le nom tel qu'écrit, déjà visible dans la prose.
//
// Noms (titres + alias, corbeille comprise) des éléments privés, moins ceux
// qu'un élément visible porte aussi (le lien résout alors vers lui).
export function hiddenNames(projectId) {
  const visible = new Set();
  const hidden = new Set();
  for (const r of db.prepare(`
    SELECT e.title AS name, e.kind, e.deleted_at FROM author_entities e WHERE e.project_id = ?
    UNION ALL
    SELECT a.alias, e.kind, e.deleted_at FROM author_aliases a JOIN author_entities e ON e.id = a.entity_id
    WHERE e.project_id = ?
  `).all(projectId, projectId)) {
    if (GUEST_KINDS.includes(r.kind)) { if (!r.deleted_at) visible.add(nameKey(r.name)); } else hidden.add(nameKey(r.name));
  }
  for (const n of visible) hidden.delete(n);
  return hidden;
}

// Extrait de recherche : searchEntities l'a déjà réduit à du texte lisible
// (liens → texte affiché) ; on retire en plus une cible coupée en fin
// d'extrait, qui pourrait être le titre d'une idée.
export function scrubSnippet(text) {
  return cleanSnippet(text, { dropCutTarget: true });
}

function scrubObject(obj, hidden) {
  for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') obj[k] = scrubWikiLinks(v, hidden);
  return obj;
}

// ── Projet vu par un invité ─────────────────────────────────────────────────

export function guestProject(row, access) {
  const base = {
    id: row.id, title: row.title, subtitle: row.subtitle, color: row.color,
    access, ownerName: row.owner_name || null,
  };
  if (access !== 'omniscient') return base;
  return {
    ...base, description: row.description, targetWords: row.target_words,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// ── Éléments ────────────────────────────────────────────────────────────────

export function guestList(projectId, opts) {
  const out = listEntities(projectId, { ...opts, trashed: false, allowKinds: GUEST_KINDS });
  const hidden = hiddenNames(projectId);
  for (const it of out.items) it.summary = scrubWikiLinks(it.summary, hidden);
  return out;
}

// Fiche complète, privée de ce qui n'appartient qu'au propriétaire : relations
// vers une idée, tâches, tableaux non partagés.
export function guestEntity(projectId, id) {
  const ent = getEntity(projectId, id);
  if (!ent || !GUEST_KINDS.includes(ent.kind)) return null;
  const hidden = hiddenNames(projectId);
  ent.links = ent.links.filter((l) => GUEST_KINDS.includes(l.other.kind)).map((l) => scrubObject(l, hidden));
  delete ent.tasks;
  const shared = new Set(db.prepare(`SELECT id FROM author_boards WHERE project_id = ? AND shared = 1`).all(projectId).map((b) => b.id));
  ent.boards = ent.boards.filter((b) => shared.has(b.id));
  ent.media = ent.media.map((m) => scrubObject(m, hidden));
  return scrubObject(ent, hidden);
}

// ── Tableau de bord invité ──────────────────────────────────────────────────

export function guestOverview(projectId) {
  const counts = Object.fromEntries(GUEST_KINDS.map((k) => [k, 0]));
  for (const r of db.prepare(`
    SELECT kind, COUNT(*) AS n FROM author_entities
    WHERE project_id = ? AND deleted_at IS NULL AND kind IN ${IN_GUEST} GROUP BY kind
  `).all(projectId)) counts[r.kind] = r.n;

  const chapters = db.prepare(`
    SELECT e.id, e.title, c.status, c.word_count, c.content_updated_at, c.validated_at
    FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId);
  const byStatus = Object.fromEntries(CHAPTER_STATUSES.map((s) => [s, 0]));
  for (const c of chapters) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const words = chapters.reduce((a, c) => a + c.word_count, 0);
  const numbers = chapterNumbers(projectId);
  const last = chapters.filter((c) => c.content_updated_at).sort((a, b) => b.content_updated_at - a.content_updated_at)[0];
  const target = db.prepare(`SELECT target_words FROM author_projects WHERE id = ?`).get(projectId)?.target_words ?? null;

  return {
    counts,
    chapters: {
      total: chapters.length,
      byStatus,
      words,
      targetWords: target,
      progress: bookProgress(chapters),
      wordProgress: target ? Math.min(1, words / target) : null,
      validated: chapters.filter((c) => c.status === VALIDATED_STATUS && c.validated_at).length,
    },
    lastChapter: last
      ? { id: last.id, title: last.title, number: numbers.get(last.id) ?? null, updatedAt: last.content_updated_at, status: last.status, wordCount: last.word_count }
      : null,
    recentUpdated: guestList(projectId, { sort: 'updated', limit: 12 }).items,
    boards: db.prepare(`SELECT COUNT(*) AS n FROM author_boards WHERE project_id = ? AND shared = 1`).get(projectId).n,
    comments: commentCounts(projectId, { guest: true }),
  };
}

// ── Tags ────────────────────────────────────────────────────────────────────
// Un tag que seules des idées portent n'existe pas pour l'invité (son nom
// suffirait à trahir un thème de la boîte à idées).
export function guestTags(projectId) {
  return db.prepare(`
    SELECT t.id, t.name, t.color, COUNT(e.id) AS used
    FROM author_tags t
    JOIN author_entity_tags et ON et.tag_id = t.id
    JOIN author_entities e ON e.id = et.entity_id AND e.deleted_at IS NULL AND e.kind IN ${IN_GUEST}
    WHERE t.project_id = ?
    GROUP BY t.id HAVING COUNT(e.id) > 0 ORDER BY t.name COLLATE NOCASE
  `).all(projectId);
}

// ── Tableaux blancs (partagés seulement) ────────────────────────────────────

// Un nœud est visible s'il ne pointe ni vers une idée (même à la corbeille)
// ni vers une image rangée sur une idée.
const VISIBLE_NODE = `
  FROM author_board_nodes n
  LEFT JOIN author_entities e ON e.id = n.entity_id
  LEFT JOIN author_media m ON m.id = n.media_id
  LEFT JOIN author_entities me ON me.id = m.entity_id
  WHERE n.board_id = ? AND (n.entity_id IS NULL OR e.kind IN ${IN_GUEST})
    AND (m.entity_id IS NULL OR me.kind IN ${IN_GUEST})
`;

export function guestBoards(projectId) {
  const count = db.prepare(`SELECT COUNT(*) AS n ${VISIBLE_NODE}`);
  return listBoards(projectId).filter((b) => b.shared).map((b) => ({ ...b, nodeCount: count.get(b.id).n }));
}

export function guestBoard(projectId, id) {
  const shared = db.prepare(`SELECT 1 FROM author_boards WHERE id = ? AND project_id = ? AND shared = 1`).get(id, projectId);
  if (!shared) return null;
  const board = getBoard(projectId, id);
  if (!board) return null;
  const keep = new Set(db.prepare(`SELECT n.id ${VISIBLE_NODE}`).all(id).map((r) => r.id));
  const hidden = hiddenNames(projectId);
  board.nodes = board.nodes.filter((n) => keep.has(n.id)).map((n) => {
    const out = scrubObject(n, hidden);
    if (out.entity) out.entity = scrubObject({ ...out.entity }, hidden);
    return out;
  });
  board.edges = board.edges.filter((e) => keep.has(e.from) && keep.has(e.to)).map((e) => scrubObject(e, hidden));
  return board;
}

// ── Cartes ──────────────────────────────────────────────────────────────────

export function guestPins(projectId, placeId) {
  const place = liveEntity(projectId, placeId);
  if (!place || place.kind !== 'place') return null;
  const privateTargets = new Set(db.prepare(`
    SELECT p.id FROM author_map_pins p JOIN author_entities e ON e.id = p.target_id
    WHERE p.project_id = ? AND p.place_id = ? AND e.kind NOT IN ${IN_GUEST}
  `).all(projectId, place.id).map((r) => r.id));
  const hidden = hiddenNames(projectId);
  return listPins(projectId, place.id).filter((p) => !privateTargets.has(p.id)).map((p) => scrubObject(p, hidden));
}

// ── Médias ──────────────────────────────────────────────────────────────────
// Fichier servi à un invité : partage omniscient actif sur le projet du
// média, ET le média est montré quelque part où l'invité a accès — rangé sur
// un élément visible vivant, ou posé sur un tableau partagé. Un nom de
// fichier deviné ou glané ailleurs ne suffit pas.
export function mediaFileShared(filename, userId) {
  return !!db.prepare(`
    SELECT 1 FROM author_media m
    JOIN author_project_shares s ON s.project_id = m.project_id AND s.user_id = ? AND s.role = 'omniscient'
    JOIN author_projects p ON p.id = m.project_id
    JOIN users o ON o.id = p.owner_id AND o.role = 'admin' AND o.can_author = 1
    LEFT JOIN author_entities e ON e.id = m.entity_id
    WHERE (m.filename = ? OR m.thumb_filename = ?)
      AND (
        (m.entity_id IS NOT NULL AND e.deleted_at IS NULL AND e.kind IN ${IN_GUEST})
        OR (m.entity_id IS NULL AND EXISTS (
          SELECT 1 FROM author_board_nodes n JOIN author_boards b ON b.id = n.board_id
          WHERE n.media_id = m.id AND b.shared = 1
        ))
      )
  `).get(userId, filename, filename);
}

// ── Liseuse (rôle lecteur) ──────────────────────────────────────────────────
// Un chapitre n'existe pour le lecteur que « terminé » ET validé. Rien d'autre
// ne sort : ni résumé (notes de travail), ni acte, ni statut — le titre et le
// texte, liens [[…]] réduits à leur texte affiché.

const READABLE = `
  FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id
  WHERE e.project_id = ? AND e.deleted_at IS NULL AND c.status = '${VALIDATED_STATUS}' AND c.validated_at IS NOT NULL
`;

export function readerChapters(projectId) {
  const numbers = chapterNumbers(projectId);
  return db.prepare(`SELECT e.id, e.title, c.word_count, c.validated_at ${READABLE}`).all(projectId)
    .map((r) => ({ id: r.id, number: numbers.get(r.id) ?? null, title: r.title, wordCount: r.word_count, validatedAt: r.validated_at }))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
}

export function readerChapter(projectId, id) {
  const list = readerChapters(projectId);
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const row = db.prepare(`SELECT c.content ${READABLE} AND e.id = ?`).get(projectId, id);
  if (!row) return null;
  const pick = (c) => (c ? { id: c.id, number: c.number, title: c.title } : null);
  return { ...list[i], content: scrubWikiLinks(row.content, null), prev: pick(list[i - 1]), next: pick(list[i + 1]) };
}

// Validation par le propriétaire : seulement un chapitre « terminé ». Le
// déclencheur SQL la retire dès que le statut repart en arrière.
export function setChapterValidation(projectId, id, value) {
  const ent = liveEntity(projectId, id);
  if (!ent || ent.kind !== 'chapter') return { notFound: true };
  const status = db.prepare(`SELECT status FROM author_chapters WHERE entity_id = ?`).get(ent.id)?.status;
  if (value && status !== VALIDATED_STATUS) throw new AuthorValidationError('not_finished', 'status');
  db.prepare(`UPDATE author_chapters SET validated_at = ? WHERE entity_id = ?`).run(value ? nowS() : null, ent.id);
  return { validatedAt: db.prepare(`SELECT validated_at FROM author_chapters WHERE entity_id = ?`).get(ent.id).validated_at };
}

// ── Partages (propriétaire) ─────────────────────────────────────────────────

function shareFromRow(r) {
  return {
    userId: r.user_id, name: r.name, email: r.email, accountRole: r.account_role, role: r.role,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const SHARE_SELECT = `
  SELECT s.*, u.name, u.email, u.role AS account_role
  FROM author_project_shares s JOIN users u ON u.id = s.user_id
`;

export function listShares(projectId) {
  return db.prepare(`${SHARE_SELECT} WHERE s.project_id = ? ORDER BY u.name COLLATE NOCASE`).all(projectId).map(shareFromRow);
}

function cleanRole(role) {
  if (!SHARE_ROLES.includes(role)) throw new AuthorValidationError('invalid_value', 'role');
  return role;
}

// Partage avec un compte EXISTANT (créé dans Administration → Utilisateurs),
// désigné par son e-mail. Re-partager change le rôle.
export function upsertShare(projectId, ownerId, input = {}) {
  const role = cleanRole(input.role);
  const email = cleanText(input.email, 254, 'email', { trim: true, required: true }).toLowerCase();
  const user = db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).get(email);
  if (!user) throw new AuthorValidationError('unknown_user', 'email');
  if (user.id === ownerId) throw new AuthorValidationError('self_share', 'email');
  const existed = !!db.prepare(`SELECT 1 FROM author_project_shares WHERE project_id = ? AND user_id = ?`).get(projectId, user.id);
  db.prepare(`
    INSERT INTO author_project_shares (project_id, user_id, role) VALUES (?, ?, ?)
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role, updated_at = strftime('%s','now')
  `).run(projectId, user.id, role);
  return {
    created: !existed,
    share: shareFromRow(db.prepare(`${SHARE_SELECT} WHERE s.project_id = ? AND s.user_id = ?`).get(projectId, user.id)),
  };
}

export function updateShare(projectId, userId, input = {}) {
  const role = cleanRole(input.role);
  const n = db.prepare(`
    UPDATE author_project_shares SET role = ?, updated_at = strftime('%s','now') WHERE project_id = ? AND user_id = ?
  `).run(role, projectId, userId).changes;
  return n ? shareFromRow(db.prepare(`${SHARE_SELECT} WHERE s.project_id = ? AND s.user_id = ?`).get(projectId, userId)) : null;
}

export function deleteShare(projectId, userId) {
  return db.prepare(`DELETE FROM author_project_shares WHERE project_id = ? AND user_id = ?`).run(projectId, userId).changes > 0;
}

// ── Commentaires ────────────────────────────────────────────────────────────
// Sur un élément visible, ou sur le livre entier (entity_id NULL). Le
// propriétaire lit tout, répond, marque « traité », supprime ; l'omniscient
// lit les fils des éléments qu'il voit, écrit, corrige et supprime les siens.

const COMMENT_SELECT = `
  SELECT c.*, u.name AS author_name, e.kind AS e_kind, e.title AS e_title, e.deleted_at AS e_deleted
  FROM author_comments c
  JOIN author_projects p ON p.id = c.project_id
  LEFT JOIN users u ON u.id = c.author_id
  LEFT JOIN author_entities e ON e.id = c.entity_id
`;
const GUEST_COMMENT = `(c.entity_id IS NULL OR (e.deleted_at IS NULL AND e.kind IN ${IN_GUEST}))`;

function commentFromRow(r, { viewerId, ownerId, numbers }) {
  return {
    id: r.id,
    entityId: r.entity_id,
    entity: r.entity_id
      ? {
        id: r.entity_id, kind: r.e_kind, title: r.e_title, deleted: !!r.e_deleted,
        number: r.e_kind === 'chapter' ? numbers.get(r.entity_id) ?? null : undefined,
      }
      : null,
    authorId: r.author_id,
    authorName: r.author_name || 'Compte supprimé',
    byOwner: r.author_id !== null && r.author_id === ownerId,
    mine: r.author_id !== null && r.author_id === viewerId,
    body: r.body,
    quote: r.quote,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function ownerOf(projectId) {
  return db.prepare(`SELECT owner_id FROM author_projects WHERE id = ?`).get(projectId)?.owner_id ?? null;
}

// « À traiter » (propriétaire) = non traité ET écrit par quelqu'un d'autre :
// ses propres réponses ne lui reviennent pas comme du travail.
const TO_HANDLE = `c.resolved_at IS NULL AND (c.author_id IS NULL OR c.author_id <> p.owner_id)`;

export function commentCounts(projectId, { guest = false } = {}) {
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN ${guest ? 'c.resolved_at IS NULL' : TO_HANDLE} THEN 1 ELSE 0 END) AS open
    FROM author_comments c
    JOIN author_projects p ON p.id = c.project_id
    LEFT JOIN author_entities e ON e.id = c.entity_id
    WHERE c.project_id = ? ${guest ? `AND ${GUEST_COMMENT}` : ''}
  `).get(projectId);
  return { total: r.total, open: r.open || 0 };
}

// `entityId` = fil d'un élément ; `general` = fil du livre ; sinon tout le
// projet (page « Commentaires »), le plus récent d'abord.
export function listComments(projectId, { entityId, general = false, open = false, guest = false, viewerId, limit } = {}) {
  const where = ['c.project_id = ?'];
  const params = [projectId];
  if (entityId !== undefined) { where.push('c.entity_id = ?'); params.push(entityId); }
  else if (general) where.push('c.entity_id IS NULL');
  if (open) where.push(guest ? 'c.resolved_at IS NULL' : TO_HANDLE);
  if (guest) where.push(GUEST_COMMENT);
  const thread = entityId !== undefined || general;
  const lim = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const rows = db.prepare(`
    ${COMMENT_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY c.created_at ${thread ? 'ASC' : 'DESC'}, c.id ${thread ? 'ASC' : 'DESC'} LIMIT ?
  `).all(...params, lim);
  const ctx = { viewerId, ownerId: ownerOf(projectId), numbers: chapterNumbers(projectId) };
  const hidden = guest ? hiddenNames(projectId) : null;
  return rows.map((r) => {
    const c = commentFromRow(r, ctx);
    // La citation vient du texte du chapitre : mêmes liens à neutraliser.
    if (hidden) c.quote = scrubWikiLinks(c.quote, hidden);
    return c;
  });
}

function commentRow(projectId, id, { guest }) {
  return db.prepare(`${COMMENT_SELECT} WHERE c.id = ? AND c.project_id = ? ${guest ? `AND ${GUEST_COMMENT}` : ''}`)
    .get(id, projectId) || null;
}

function oneComment(projectId, id, viewerId) {
  const row = commentRow(projectId, id, { guest: false });
  return row ? commentFromRow(row, { viewerId, ownerId: ownerOf(projectId), numbers: chapterNumbers(projectId) }) : null;
}

export function createComment(projectId, user, input = {}, { guest = false } = {}) {
  let entityId = null;
  if (input.entityId !== undefined && input.entityId !== null) {
    const ent = liveEntity(projectId, input.entityId);
    if (!ent || (guest && !GUEST_KINDS.includes(ent.kind))) return { notFound: true };
    entityId = ent.id;
  }
  const body = cleanText(input.body, 5000, 'body', { trim: true, required: true });
  const quote = entityId ? cleanText(input.quote, 600, 'quote', { trim: true }) : '';
  const info = db.prepare(`
    INSERT INTO author_comments (project_id, entity_id, author_id, body, quote) VALUES (?, ?, ?, ?, ?)
  `).run(projectId, entityId, user.id, body, quote);
  return { comment: oneComment(projectId, Number(info.lastInsertRowid), user.id) };
}

// Texte : seul son auteur le corrige. « Traité » : seul le propriétaire.
export function updateComment(projectId, user, id, input = {}, { guest = false } = {}) {
  const row = commentRow(projectId, id, { guest });
  if (!row) return { notFound: true };
  if (input.body !== undefined) {
    if (row.author_id !== user.id) return { forbidden: true };
    const body = cleanText(input.body, 5000, 'body', { trim: true, required: true });
    db.prepare(`UPDATE author_comments SET body = ?, updated_at = ? WHERE id = ?`).run(body, nowS(), id);
  }
  if (input.resolved !== undefined) {
    if (guest) return { forbidden: true };
    if (typeof input.resolved !== 'boolean') throw new AuthorValidationError('invalid_type', 'resolved');
    db.prepare(`UPDATE author_comments SET resolved_at = ?, resolved_by = ? WHERE id = ?`)
      .run(input.resolved ? nowS() : null, input.resolved ? user.id : null, id);
  }
  return { comment: oneComment(projectId, id, user.id) };
}

export function deleteComment(projectId, user, id, { guest = false } = {}) {
  const row = commentRow(projectId, id, { guest });
  if (!row) return { notFound: true };
  if (guest && row.author_id !== user.id) return { forbidden: true };
  db.prepare(`DELETE FROM author_comments WHERE id = ?`).run(id);
  return { ok: true };
}


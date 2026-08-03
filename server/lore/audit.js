// Journal d'audit du module Lore + agrégats de la page « 🛡 Admin ».
//
// Objectif : répondre à deux questions que la base seule ne sait pas trancher.
//   1. « Quelqu'un se sert-il du site comme d'un hébergeur d'images perso ? »
//      → poids et nombre de médias par membre, pièces jointes orphelines,
//        cadence d'upload.
//   2. « Quelqu'un supprime-t-il le travail des autres ? »
//      → il FAUT une trace qui survive à la suppression, puisque tout le module
//        est en cascade (supprimer une entrée efface médias, liens, preuves et
//        révisions, et unlink les fichiers).
//
// D'où le parti pris : un middleware unique qui observe les requêtes mutantes,
// plutôt que d'instrumenter les ~40 handlers un par un. Moins de code touché,
// donc moins de risque de régression, et impossible d'oublier une route.

import { db } from '../db.js';

let _insert;
export function recordAudit({ actorId, actorName, action, targetType, targetId, label, detail }) {
  if (!_insert) {
    _insert = db.prepare(`
      INSERT INTO lore_audit (actor_id, actor_name, action, target_type, target_id, label, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }
  _insert.run(
    actorId ?? null,
    String(actorName || '').slice(0, 120),
    action,
    targetType,
    targetId ?? null,
    String(label || '').slice(0, 200),
    JSON.stringify(detail || {}),
  );
}

// ── Instantanés pris AVANT le handler ───────────────────────────────────────
// Un DELETE réussi ne laisse rien à lire : on capture donc le titre et l'ampleur
// de la cascade pendant que les lignes existent encore.

const one = (sql, ...args) => db.prepare(sql).get(...args);

// Ce qu'une suppression d'entrée/hypothèse va emporter avec elle. C'est LE
// chiffre qui distingue « j'ai retiré ma note » de « j'ai vidé le dossier ».
function cascadeOf(column, id) {
  const media = one(
    `SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM lore_media WHERE ${column} = ?`,
    id,
  );
  const evidence = one(
    `SELECT COUNT(*) AS n FROM lore_evidence WHERE ${column} = ?`, id,
  );
  return { mediaCount: media.n, mediaBytes: media.bytes, evidenceCount: evidence.n };
}

function entrySnapshot(id) {
  const r = one(`SELECT title, entry_type, author_id FROM lore_entries WHERE id = ?`, id);
  if (!r) return null;
  const links = one(
    `SELECT COUNT(*) AS n FROM lore_links WHERE from_entry_id = ? OR to_entry_id = ?`, id, id,
  );
  return {
    label: r.title,
    detail: {
      entryType: r.entry_type,
      authorId: r.author_id,
      linkCount: links.n,
      ...cascadeOf('entry_id', id),
    },
  };
}

function hypothesisSnapshot(id) {
  const r = one(`SELECT title, status, created_by FROM lore_hypotheses WHERE id = ?`, id);
  if (!r) return null;
  return {
    label: r.title,
    detail: { status: r.status, authorId: r.created_by, ...cascadeOf('hypothesis_id', id) },
  };
}

function mediaSnapshot(id) {
  const r = one(`SELECT * FROM lore_media WHERE id = ?`, id);
  if (!r) return null;
  return {
    label: r.original_name || r.filename,
    detail: {
      filename: r.filename,
      mimeType: r.mime_type,
      size: r.size,
      width: r.width,
      height: r.height,
      uploadedBy: r.uploaded_by,
      entryId: r.entry_id,
      hypothesisId: r.hypothesis_id,
    },
  };
}

const simpleSnapshot = (sql, field) => (id) => {
  const r = one(sql, id);
  // eslint-disable-next-line security/detect-object-injection -- `field` vient de la table ROUTES (constante de module), jamais d'une requête
  return r ? { label: r[field], detail: {} } : null;
};

// ── Table des routes ────────────────────────────────────────────────────────
// [méthode, regex sur le chemin, action, type de cible, snapshot?]
// Le snapshot reçoit l'id capturé par le groupe 1 de la regex.

const ROUTES = [
  ['POST',   /^\/entries$/,                    'create', 'entry'],
  ['PUT',    /^\/entries\/(\d+)$/,             'update', 'entry',      entrySnapshot],
  ['DELETE', /^\/entries\/(\d+)$/,             'delete', 'entry',      entrySnapshot],
  ['POST',   /^\/entries\/(\d+)\/dialogues$/,  'create', 'dialogue',   entrySnapshot],
  ['PUT',    /^\/dialogues\/(\d+)$/,           'update', 'dialogue'],
  ['DELETE', /^\/dialogues\/(\d+)$/,           'delete', 'dialogue',
    simpleSnapshot(`SELECT substr(texte, 1, 80) AS t FROM lore_dialogues WHERE id = ?`, 't')],

  ['POST',   /^\/hypotheses$/,                 'create', 'hypothesis'],
  ['PUT',    /^\/hypotheses\/(\d+)$/,          'update', 'hypothesis', hypothesisSnapshot],
  ['DELETE', /^\/hypotheses\/(\d+)$/,          'delete', 'hypothesis', hypothesisSnapshot],
  ['POST',   /^\/hypotheses\/(\d+)\/evidence$/, 'create', 'evidence',  hypothesisSnapshot],
  ['PUT',    /^\/evidence\/(\d+)$/,            'update', 'evidence'],
  ['DELETE', /^\/evidence\/(\d+)$/,            'delete', 'evidence'],

  ['POST',   /^\/media$/,                      'create', 'media'],
  ['PUT',    /^\/media\/(\d+)$/,               'update', 'media',      mediaSnapshot],
  ['DELETE', /^\/media\/(\d+)$/,               'delete', 'media',      mediaSnapshot],

  ['POST',   /^\/links$/,                      'create', 'link'],
  ['DELETE', /^\/links\/(\d+)$/,               'delete', 'link'],

  ['POST',   /^\/tags$/,                       'create', 'tag'],
  ['PUT',    /^\/tags\/(\d+)$/,                'update', 'tag',
    simpleSnapshot(`SELECT name FROM lore_tags WHERE id = ?`, 'name')],
  ['DELETE', /^\/tags\/(\d+)$/,                'delete', 'tag',
    simpleSnapshot(`SELECT name FROM lore_tags WHERE id = ?`, 'name')],

  ['POST',   /^\/shapes$/,                     'create', 'shape'],
  ['PUT',    /^\/shapes\/(\d+)$/,              'update', 'shape',
    simpleSnapshot(`SELECT name FROM lore_shapes WHERE id = ?`, 'name')],
  ['DELETE', /^\/shapes\/(\d+)$/,              'delete', 'shape',
    simpleSnapshot(`SELECT name FROM lore_shapes WHERE id = ?`, 'name')],

  ['POST',   /^\/maps$/,                       'create', 'map'],
  ['PUT',    /^\/maps\/(\d+)$/,                'update', 'map',
    simpleSnapshot(`SELECT name FROM lore_maps WHERE id = ?`, 'name')],
  ['DELETE', /^\/maps\/(\d+)$/,                'delete', 'map',
    simpleSnapshot(`SELECT name FROM lore_maps WHERE id = ?`, 'name')],
  ['POST',   /^\/maps\/(\d+)\/image$/,         'update', 'map_image',
    simpleSnapshot(`SELECT name FROM lore_maps WHERE id = ?`, 'name')],
  ['POST',   /^\/maps\/(\d+)\/tiles$/,         'create', 'tile',
    simpleSnapshot(`SELECT name FROM lore_maps WHERE id = ?`, 'name')],
  ['DELETE', /^\/tiles\/(\d+)$/,               'delete', 'tile',
    simpleSnapshot(`SELECT filename FROM lore_map_tiles WHERE id = ?`, 'filename')],

  ['POST',   /^\/peuples$/,                    'create', 'peuple'],
  ['PUT',    /^\/peuples\/(\d+)$/,             'update', 'peuple',
    simpleSnapshot(`SELECT name FROM lore_peuples WHERE id = ?`, 'name')],
  ['DELETE', /^\/peuples\/(\d+)$/,             'delete', 'peuple',
    simpleSnapshot(`SELECT name FROM lore_peuples WHERE id = ?`, 'name')],
];

function matchRoute(method, path) {
  for (const [m, re, action, targetType, snapshot] of ROUTES) {
    if (m !== method) continue;
    const hit = re.exec(path);
    if (hit) return { action, targetType, snapshot, id: hit[1] ? Number(hit[1]) : null };
  }
  return null;
}

// Ce que la RÉPONSE apprend sur une création (l'id n'existe pas avant).
function fromResponse(targetType, body) {
  if (!body || typeof body !== 'object') return { id: null, label: '', detail: {} };
  if (targetType === 'media') {
    return {
      id: body.id ?? null,
      label: body.originalName || body.filename || '',
      detail: {
        filename: body.filename, mimeType: body.mimeType, size: body.size,
        width: body.width, height: body.height,
        entryId: body.entryId ?? null, hypothesisId: body.hypothesisId ?? null,
      },
    };
  }
  return {
    id: body.id ?? null,
    label: body.title || body.name || body.label || '',
    detail: {},
  };
}

/**
 * Middleware d'audit — à monter sur loreRouter APRÈS requireAuth/requireLoreView.
 * N'enregistre que les requêtes mutantes qui ont RÉUSSI (2xx) : une tentative
 * rejetée n'est pas une action, et journaliser les échecs noierait le signal.
 */
export function auditLore(req, res, next) {
  const hit = matchRoute(req.method, req.path);
  if (!hit) return next();

  // Instantané pris MAINTENANT : après le handler, la ligne peut avoir disparu.
  const before = hit.snapshot && hit.id != null ? hit.snapshot(hit.id) : null;

  let payload = null;
  const json = res.json.bind(res);
  res.json = (body) => { payload = body; return json(body); };

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    try {
      const created = hit.action === 'create' ? fromResponse(hit.targetType, payload) : null;
      recordAudit({
        actorId: req.user?.id ?? null,
        actorName: req.user?.name || req.user?.email || '',
        action: hit.action,
        targetType: hit.targetType,
        // En création l'id vient de la réponse ; sinon c'est celui de l'URL
        // (pour un sous-objet — dialogue, preuve, tuile — l'id d'URL est celui
        // du PARENT, conservé dans le détail pour ne pas mentir sur la cible).
        targetId: created ? created.id : hit.id,
        label: created ? created.label : (before?.label ?? ''),
        detail: {
          ...(before?.detail || {}),
          ...(created?.detail || {}),
          ...(created && hit.id != null ? { parentId: hit.id } : {}),
        },
      });
    } catch (e) {
      // Un journal qui casse la requête qu'il observe serait pire que pas de
      // journal du tout : on log et on laisse passer.
      console.error('[lore-audit]', e?.message || e);
    }
  });

  next();
}

// ── Agrégats de la page admin ───────────────────────────────────────────────

// Les commentaires du lore vivent dans la table GLOBALE `comments` (mêmes
// que les documents/features), reconnaissables à leur target_type.
export const LORE_COMMENT_TARGETS = ['lore_entry', 'lore_hypothesis'];
const COMMENT_SCOPE = `c.target_type IN ('lore_entry', 'lore_hypothesis')`;

const MEMBER_STATS = `
  SELECT
    u.id, u.name, u.email, u.role,
    (SELECT COUNT(*) FROM lore_entries    e WHERE e.author_id  = u.id) AS entries,
    (SELECT COUNT(*) FROM lore_hypotheses h WHERE h.created_by = u.id) AS hypotheses,
    (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND ${COMMENT_SCOPE}) AS comments,
    (SELECT COUNT(*) FROM lore_media      m WHERE m.uploaded_by = u.id) AS mediaCount,
    (SELECT COALESCE(SUM(size), 0) FROM lore_media m WHERE m.uploaded_by = u.id) AS mediaBytes,
    (SELECT COUNT(*) FROM lore_audit a WHERE a.actor_id = u.id AND a.action = 'delete') AS deletions,
    (SELECT MAX(created_at) FROM lore_audit a WHERE a.actor_id = u.id) AS lastActionAt
  FROM users u
  WHERE u.role = 'admin' OR u.can_view_lore = 1
  ORDER BY mediaBytes DESC, entries DESC
`;

export function memberStats() {
  return db.prepare(MEMBER_STATS).all().map((r) => ({
    id: r.id, name: r.name, email: r.email, role: r.role,
    entries: r.entries, hypotheses: r.hypotheses, comments: r.comments,
    mediaCount: r.mediaCount, mediaBytes: r.mediaBytes,
    deletions: r.deletions, lastActionAt: r.lastActionAt,
  }));
}

export function storageTotals() {
  const media = one(`SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM lore_media`);
  const tiles = one(`SELECT COUNT(*) AS n FROM lore_map_tiles`);
  const orphans = one(`
    SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM lore_media
    WHERE entry_id IS NULL AND hypothesis_id IS NULL
  `);
  const byType = db.prepare(`
    SELECT COALESCE(NULLIF(mime_type, ''), 'inconnu') AS mimeType,
           COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes
    FROM lore_media GROUP BY mimeType ORDER BY bytes DESC
  `).all();
  const comments = one(`SELECT COUNT(*) AS n FROM comments c WHERE ${COMMENT_SCOPE}`);
  const threads = one(`
    SELECT COUNT(*) AS n FROM (
      SELECT 1 FROM comments c WHERE ${COMMENT_SCOPE} GROUP BY c.target_type, c.target_id
    )
  `);
  return {
    mediaCount: media.n, mediaBytes: media.bytes,
    tileCount: tiles.n,
    orphanCount: orphans.n, orphanBytes: orphans.bytes,
    byType,
    commentCount: comments.n,
    threadCount: threads.n, // sujets ayant au moins un message
  };
}

/**
 * Les fils les plus actifs — quels sujets discutent, et où la discussion
 * s'emballe. Le titre est joint depuis l'entrée/l'hypothèse : un fil dont la
 * cible a été supprimée garde ses messages en base mais n'a plus de titre, on
 * le signale plutôt que de l'escamoter.
 */
export function commentThreads({ limit = 30 } = {}) {
  return db.prepare(`
    SELECT c.target_type, c.target_id,
           COUNT(*) AS n,
           MAX(c.created_at) AS lastAt,
           COUNT(DISTINCT c.author_id) AS participants,
           e.title AS entry_title, h.title AS hypothesis_title
    FROM comments c
    LEFT JOIN lore_entries e    ON c.target_type = 'lore_entry'      AND e.id = c.target_id
    LEFT JOIN lore_hypotheses h ON c.target_type = 'lore_hypothesis' AND h.id = c.target_id
    WHERE ${COMMENT_SCOPE}
    GROUP BY c.target_type, c.target_id
    ORDER BY n DESC, lastAt DESC
    LIMIT ?
  `).all(Math.min(200, Math.max(1, limit))).map((r) => ({
    targetType: r.target_type,
    targetId: r.target_id,
    title: r.entry_title || r.hypothesis_title || null, // null = cible supprimée
    count: r.n,
    participants: r.participants,
    lastAt: r.lastAt,
  }));
}

// ── Commentaires : journalisation ───────────────────────────────────────────
// Les commentaires passent par /api/comments (routeur global), donc HORS du
// middleware auditLore monté sur /api/lore. Sans ce crochet, la discussion
// serait le seul pan du module invisible au journal — et « X a effacé le
// message de Y » est exactement le genre de nuisance que la page doit montrer.

export const isLoreCommentTarget = (t) => LORE_COMMENT_TARGETS.includes(t);

const PARENT_TITLE = {
  lore_entry: `SELECT title FROM lore_entries WHERE id = ?`,
  lore_hypothesis: `SELECT title FROM lore_hypotheses WHERE id = ?`,
};

/**
 * Journalise un commentaire de lore. `action` vaut 'create' ou 'delete'.
 * Ne lève jamais : le journal ne doit pas casser la publication d'un message.
 */
export function recordLoreComment({ action, targetType, targetId, commentId, body, user, authorId }) {
  try {
    if (!isLoreCommentTarget(targetType)) return;
    // eslint-disable-next-line security/detect-object-injection -- targetType est validé par isLoreCommentTarget contre une liste blanche
    const parent = one(PARENT_TITLE[targetType], targetId);
    recordAudit({
      actorId: user?.id ?? null,
      actorName: user?.name || user?.email || '',
      action,
      targetType: 'comment',
      targetId: commentId ?? null,
      // Le libellé est le SUJET : c'est ce qu'on lit dans le journal.
      label: parent?.title || `(sujet supprimé #${targetId})`,
      detail: {
        on: targetType,
        onId: targetId,
        excerpt: String(body || '').slice(0, 120),
        // Sur une suppression, dire si l'acteur effaçait le message d'un autre.
        ...(action === 'delete' && authorId != null
          ? { authorId, ofSomeoneElse: authorId !== (user?.id ?? null) }
          : {}),
      },
    });
  } catch (e) {
    console.error('[lore-audit:comment]', e?.message || e);
  }
}

/**
 * Tous les médias, du plus lourd au plus léger : la vue qui répond à
 * « stockage perso ou pièce d'enquête ? ». `target` dit à quoi le fichier est
 * rattaché — un média volumineux, sans légende et rattaché à rien est le profil
 * type du fichier perso déposé là.
 */
export function mediaInventory({ limit = 300 } = {}) {
  return db.prepare(`
    SELECT m.*, u.name AS uploader_name, u.email AS uploader_email,
           e.title AS entry_title, h.title AS hypothesis_title
    FROM lore_media m
    LEFT JOIN users u           ON u.id = m.uploaded_by
    LEFT JOIN lore_entries e    ON e.id = m.entry_id
    LEFT JOIN lore_hypotheses h ON h.id = m.hypothesis_id
    ORDER BY m.size DESC, m.id DESC
    LIMIT ?
  `).all(Math.min(1000, Math.max(1, limit))).map((r) => ({
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    mimeType: r.mime_type,
    size: r.size,
    width: r.width,
    height: r.height,
    caption: r.caption,
    uploadedBy: r.uploaded_by,
    uploaderName: r.uploader_name || '(compte supprimé)',
    uploaderEmail: r.uploader_email || '',
    createdAt: r.created_at,
    target: r.entry_id ? { kind: 'entry', id: r.entry_id, title: r.entry_title }
      : r.hypothesis_id ? { kind: 'hypothesis', id: r.hypothesis_id, title: r.hypothesis_title }
        : null,
  }));
}

export function listAudit({ actorId, action, targetType, limit = 200 } = {}) {
  const where = [];
  const args = [];
  if (Number.isFinite(actorId)) { where.push('a.actor_id = ?'); args.push(actorId); }
  if (action) { where.push('a.action = ?'); args.push(action); }
  if (targetType) { where.push('a.target_type = ?'); args.push(targetType); }
  const sql = `
    SELECT a.*, u.name AS current_name
    FROM lore_audit a
    LEFT JOIN users u ON u.id = a.actor_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?
  `;
  args.push(Math.min(1000, Math.max(1, limit)));
  return db.prepare(sql).all(...args).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    // Le nom figé prime : c'est celui qui avait cours au moment de l'action.
    actorName: r.actor_name || r.current_name || '(inconnu)',
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    label: r.label,
    detail: safeJson(r.detail),
    createdAt: r.created_at,
  }));
}

function safeJson(s) { try { return JSON.parse(s) ?? {}; } catch { return {}; } }

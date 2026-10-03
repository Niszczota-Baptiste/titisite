import { db } from '../db.js';
import {
  BOARD_ARROWS, BOARD_EDGE_STYLES, BOARD_MAX_NODES, BOARD_MAX_OPS, BOARD_NODE_KINDS, BOARD_SHAPES,
} from './enums.js';
import { liveEntity, mediaUrl, nowS } from './entities.js';
import { AuthorValidationError, asId, cleanColor, cleanText } from './validate.js';

// Tableau blanc : nœuds et flèches relationnels, modifiés par LOTS
// d'opérations. Chaque lot porte la révision sur laquelle il a été construit ;
// si le tableau a bougé ailleurs entre-temps (autre onglet, téléphone), le lot
// est refusé en entier (409) au lieu d'écraser silencieusement.

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const COORD_MAX = 1e7;

function boardFromRow(r) {
  return {
    id: r.id, title: r.title, description: r.description, revision: r.revision,
    view: { x: r.view_x, y: r.view_y, zoom: r.view_zoom },
    shared: r.shared === 1,
    nodeCount: r.node_count ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function listBoards(projectId) {
  return db.prepare(`
    SELECT b.*, (SELECT COUNT(*) FROM author_board_nodes n WHERE n.board_id = b.id) AS node_count
    FROM author_boards b WHERE b.project_id = ? ORDER BY b.updated_at DESC, b.id DESC
  `).all(projectId).map(boardFromRow);
}

export function boardRow(projectId, id) {
  return db.prepare(`SELECT * FROM author_boards WHERE id = ? AND project_id = ?`).get(id, projectId) || null;
}

export function createBoard(projectId, input = {}) {
  const title = cleanText(input.title, 200, 'title', { trim: true, required: true });
  const info = db.prepare(`INSERT INTO author_boards (project_id, title, description) VALUES (?, ?, ?)`)
    .run(projectId, title, cleanText(input.description, 2000, 'description'));
  return boardFromRow(db.prepare(`SELECT * FROM author_boards WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateBoardMeta(projectId, id, input = {}) {
  const row = boardRow(projectId, id);
  if (!row) return null;
  if (input.shared !== undefined && typeof input.shared !== 'boolean') throw new AuthorValidationError('invalid_type', 'shared');
  db.prepare(`UPDATE author_boards SET title = ?, description = ?, shared = ?, updated_at = ? WHERE id = ?`).run(
    input.title !== undefined ? cleanText(input.title, 200, 'title', { trim: true, required: true }) : row.title,
    input.description !== undefined ? cleanText(input.description, 2000, 'description') : row.description,
    input.shared !== undefined ? (input.shared ? 1 : 0) : row.shared,
    nowS(), id,
  );
  return boardFromRow(boardRow(projectId, id));
}

export function deleteBoard(projectId, id) {
  return db.prepare(`DELETE FROM author_boards WHERE id = ? AND project_id = ?`).run(id, projectId).changes > 0;
}

// Caméra : pas de révision (déplacer la vue n'est pas modifier le tableau).
export function setBoardView(projectId, id, view = {}) {
  const x = Number(view.x);
  const y = Number(view.y);
  const zoom = Number(view.zoom);
  if (![x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= COORD_MAX) || !(zoom >= 0.05 && zoom <= 8)) {
    throw new AuthorValidationError('invalid_view', 'view');
  }
  return db.prepare(`UPDATE author_boards SET view_x = ?, view_y = ?, view_zoom = ? WHERE id = ? AND project_id = ?`)
    .run(x, y, zoom, id, projectId).changes > 0;
}

function nodeFromRow(r) {
  return {
    id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, z: r.z, color: r.color, text: r.text,
    shape: r.shape, entityId: r.entity_id, mediaId: r.media_id,
    entity: r.entity_id && r.e_title !== null
      ? {
        id: r.entity_id, kind: r.e_kind, title: r.e_title, icon: r.e_icon, color: r.e_color,
        summary: (r.e_summary || '').slice(0, 220), coverUrl: mediaUrl(r.e_cover_thumb),
      }
      : null,
    media: r.media_id && r.m_file ? { id: r.media_id, url: mediaUrl(r.m_file), thumbUrl: mediaUrl(r.m_thumb || r.m_file), width: r.m_w, height: r.m_h } : null,
  };
}

export function getBoard(projectId, id) {
  const row = boardRow(projectId, id);
  if (!row) return null;
  const nodes = db.prepare(`
    SELECT n.*, e.kind AS e_kind, e.title AS e_title, e.icon AS e_icon, e.color AS e_color, e.summary AS e_summary,
           cm.thumb_filename AS e_cover_thumb,
           m.filename AS m_file, m.thumb_filename AS m_thumb, m.width AS m_w, m.height AS m_h
    FROM author_board_nodes n
    LEFT JOIN author_entities e ON e.id = n.entity_id AND e.deleted_at IS NULL
    LEFT JOIN author_media cm ON cm.id = e.cover_media_id
    LEFT JOIN author_media m ON m.id = n.media_id
    WHERE n.board_id = ? ORDER BY n.z, n.rowid
  `).all(id).map(nodeFromRow);
  const edges = db.prepare(`SELECT * FROM author_board_edges WHERE board_id = ?`).all(id).map((e) => ({
    id: e.id, from: e.from_node, to: e.to_node, label: e.label, color: e.color, style: e.style, arrow: e.arrow,
  }));
  return { ...boardFromRow(row), nodes, edges };
}

function num(v, field, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new AuthorValidationError('invalid_number', field);
  return n;
}

// Champs d'un nœud présents dans l'opération → colonnes validées.
function nodeFields(projectId, op) {
  const out = {};
  if (op.kind !== undefined) {
    if (!BOARD_NODE_KINDS.includes(op.kind)) throw new AuthorValidationError('invalid_node_kind', 'kind');
    out.kind = op.kind;
  }
  if (op.x !== undefined) out.x = num(op.x, 'x', -COORD_MAX, COORD_MAX);
  if (op.y !== undefined) out.y = num(op.y, 'y', -COORD_MAX, COORD_MAX);
  if (op.w !== undefined) out.w = num(op.w, 'w', 10, 20000);
  if (op.h !== undefined) out.h = num(op.h, 'h', 10, 20000);
  if (op.z !== undefined) out.z = Math.round(num(op.z, 'z', -1e6, 1e6));
  if (op.color !== undefined) out.color = cleanColor(op.color);
  if (op.text !== undefined) out.text = cleanText(op.text, 20_000, 'text');
  if (op.shape !== undefined) {
    if (!BOARD_SHAPES.includes(op.shape)) throw new AuthorValidationError('invalid_shape', 'shape');
    out.shape = op.shape;
  }
  if (op.entityId !== undefined) {
    if (op.entityId === null) out.entity_id = null;
    else {
      const ent = liveEntity(projectId, op.entityId);
      if (!ent) throw new AuthorValidationError('unknown_entity', 'entityId');
      out.entity_id = ent.id;
    }
  }
  if (op.mediaId !== undefined) {
    if (op.mediaId === null) out.media_id = null;
    else {
      const mid = asId(op.mediaId);
      if (!mid || !db.prepare(`SELECT 1 FROM author_media WHERE id = ? AND project_id = ?`).get(mid, projectId)) {
        throw new AuthorValidationError('unknown_media', 'mediaId');
      }
      out.media_id = mid;
    }
  }
  return out;
}

function edgeFields(op) {
  const out = {};
  if (op.from !== undefined) {
    if (typeof op.from !== 'string' || !ID_RE.test(op.from)) throw new AuthorValidationError('invalid_edge', 'from');
    out.from_node = op.from;
  }
  if (op.to !== undefined) {
    if (typeof op.to !== 'string' || !ID_RE.test(op.to)) throw new AuthorValidationError('invalid_edge', 'to');
    out.to_node = op.to;
  }
  if (op.label !== undefined) out.label = cleanText(op.label, 300, 'label');
  if (op.color !== undefined) out.color = cleanColor(op.color);
  if (op.style !== undefined) {
    if (!BOARD_EDGE_STYLES.includes(op.style)) throw new AuthorValidationError('invalid_style', 'style');
    out.style = op.style;
  }
  if (op.arrow !== undefined) {
    if (!BOARD_ARROWS.includes(op.arrow)) throw new AuthorValidationError('invalid_arrow', 'arrow');
    out.arrow = op.arrow;
  }
  return out;
}

// Applique un lot. `ops` = [{ op: 'node'|'deleteNode'|'edge'|'deleteEdge', id, ...champs }].
// 'node' / 'edge' créent l'objet s'il n'existe pas, sinon ne modifient que les
// champs fournis (un déplacement n'envoie que x/y). Tout ou rien.
export function applyBoardOps(projectId, boardId, baseRevision, ops) {
  const board = boardRow(projectId, boardId);
  if (!board) return { notFound: true };
  if (!Array.isArray(ops) || ops.length > BOARD_MAX_OPS) throw new AuthorValidationError('invalid_ops', 'ops');
  if (Number(baseRevision) !== board.revision) return { conflict: { error: 'conflict', revision: board.revision } };

  // Validation complète AVANT la transaction (les vérifications d'entités et
  // de médias lisent la base) ; l'écriture ne peut alors échouer que sur une
  // FK de flèche vers un nœud absent.
  const prepared = ops.map((op) => {
    if (!op || typeof op !== 'object' || typeof op.id !== 'string' || !ID_RE.test(op.id)) {
      throw new AuthorValidationError('invalid_op', 'id');
    }
    switch (op.op) {
      case 'node': return { type: 'node', id: op.id, fields: nodeFields(projectId, op) };
      case 'deleteNode': return { type: 'deleteNode', id: op.id };
      case 'edge': return { type: 'edge', id: op.id, fields: edgeFields(op) };
      case 'deleteEdge': return { type: 'deleteEdge', id: op.id };
      default: throw new AuthorValidationError('invalid_op', 'op');
    }
  });

  const nodeExists = db.prepare(`SELECT 1 FROM author_board_nodes WHERE board_id = ? AND id = ?`);
  const edgeExists = db.prepare(`SELECT 1 FROM author_board_edges WHERE board_id = ? AND id = ?`);
  try {
    db.transaction(() => {
      for (const p of prepared) {
        if (p.type === 'deleteNode') {
          db.prepare(`DELETE FROM author_board_nodes WHERE board_id = ? AND id = ?`).run(boardId, p.id);
        } else if (p.type === 'deleteEdge') {
          db.prepare(`DELETE FROM author_board_edges WHERE board_id = ? AND id = ?`).run(boardId, p.id);
        } else if (p.type === 'node') {
          const cols = Object.keys(p.fields);
          if (nodeExists.get(boardId, p.id)) {
            if (cols.length) {
              db.prepare(`UPDATE author_board_nodes SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE board_id = ? AND id = ?`)
                .run(...cols.map((c) => p.fields[c]), boardId, p.id);
            }
          } else {
            if (!p.fields.kind) throw new AuthorValidationError('invalid_node_kind', 'kind');
            db.prepare(`INSERT INTO author_board_nodes (board_id, id${cols.map((c) => `, ${c}`).join('')}) VALUES (?, ?${cols.map(() => ', ?').join('')})`)
              .run(boardId, p.id, ...cols.map((c) => p.fields[c]));
          }
        } else if (p.type === 'edge') {
          const cols = Object.keys(p.fields);
          if (edgeExists.get(boardId, p.id)) {
            if (cols.length) {
              db.prepare(`UPDATE author_board_edges SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE board_id = ? AND id = ?`)
                .run(...cols.map((c) => p.fields[c]), boardId, p.id);
            }
          } else {
            if (!p.fields.from_node || !p.fields.to_node) throw new AuthorValidationError('invalid_edge', 'from');
            db.prepare(`INSERT INTO author_board_edges (board_id, id${cols.map((c) => `, ${c}`).join('')}) VALUES (?, ?${cols.map(() => ', ?').join('')})`)
              .run(boardId, p.id, ...cols.map((c) => p.fields[c]));
          }
        }
      }
      const count = db.prepare(`SELECT COUNT(*) AS n FROM author_board_nodes WHERE board_id = ?`).get(boardId).n;
      if (count > BOARD_MAX_NODES) throw new AuthorValidationError('too_many_nodes', 'ops');
      db.prepare(`UPDATE author_boards SET revision = revision + 1, updated_at = ? WHERE id = ?`).run(nowS(), boardId);
    })();
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new AuthorValidationError('invalid_edge', 'from');
    throw err;
  }
  return { revision: boardRow(projectId, boardId).revision };
}

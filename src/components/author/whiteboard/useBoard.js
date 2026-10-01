import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthor } from '../context';

// État d'un tableau blanc + sauvegarde automatique par lots d'opérations.
//
// - Chaque modification (déplacer, écrire, relier…) met à jour l'écran tout de
//   suite et part dans une file : une opération par objet (la dernière gagne),
//   envoyée ~0,7 s après la dernière action avec la révision attendue.
// - 409 (tableau modifié depuis un autre appareil) : la file est gardée, rien
//   n'est écrasé ; l'utilisateur choisit « réappliquer mes changements » (les
//   opérations sont des écritures idempotentes, on les rejoue sur la version à
//   jour) ou « recharger ».
// - Annuler / rétablir : chaque geste enregistre l'état avant/après des objets
//   touchés ; annuler = rejouer « avant » comme de nouvelles opérations.

const FLUSH_MS = 700;
const HISTORY = 100;

const nodeOp = (n) => ({
  op: 'node', id: n.id, kind: n.kind, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
  z: n.z || 0, color: n.color || '', text: n.text || '', shape: n.shape || 'rect', entityId: n.entityId ?? null, mediaId: n.mediaId ?? null,
});
const edgeOp = (e) => ({
  op: 'edge', id: e.id, from: e.from, to: e.to, label: e.label || '', color: e.color || '', style: e.style || 'solid', arrow: e.arrow || 'end',
});
const ORDER = { node: 0, edge: 1, deleteEdge: 2, deleteNode: 3 };

export function useBoard(boardId) {
  const { pid, P, reportSave } = useAuthor();
  const [meta, setMeta] = useState(null);
  const [graph, setGraph] = useState({ nodes: new Map(), edges: new Map() });
  const [status, setStatusState] = useState('loading');
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(null);
  const g = useRef(graph);
  const rev = useRef(null);
  const pending = useRef(new Map());
  const inflight = useRef(false);
  const timer = useRef(null);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [, setHist] = useState(0);
  const conflictRef = useRef(false);
  conflictRef.current = conflict;
  const saveKey = `board:${boardId}`;

  const setStatus = useCallback((s) => { setStatusState(s); reportSave(saveKey, s); }, [reportSave, saveKey]);
  const commitGraph = (next) => { g.current = next; setGraph(next); };

  const load = useCallback(async () => {
    try {
      const b = await P.boards.get(boardId);
      rev.current = b.revision;
      setMeta({ id: b.id, title: b.title, description: b.description, view: b.view });
      commitGraph({ nodes: new Map(b.nodes.map((n) => [n.id, n])), edges: new Map(b.edges.map((e) => [e.id, e])) });
      setStatus('idle');
      setError(null);
      return b;
    } catch (err) { setError(err); setStatus('error'); return null; }
  }, [P, boardId, setStatus]);

  useEffect(() => {
    pending.current = new Map();
    undoStack.current = [];
    redoStack.current = [];
    load();
    return () => reportSave(saveKey, null);
  }, [load, reportSave, saveKey]);

  // ── File d'opérations ────────────────────────────────────────────────
  const flushRef = useRef(null);
  const schedule = useCallback((ms = FLUSH_MS) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current?.(), ms);
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inflight.current || conflictRef.current || pending.current.size === 0 || rev.current === null) return;
    // Nœuds créés avant les flèches qui les visent ; suppressions en dernier.
    const ops = [...pending.current.values()].sort((a, b) => ORDER[a.op] - ORDER[b.op]);
    const sent = new Map(pending.current);
    pending.current = new Map();
    inflight.current = true;
    setStatus('saving');
    try {
      const r = await P.boards.ops(boardId, rev.current, ops);
      rev.current = r.revision;
      setError(null);
      setStatus(pending.current.size ? 'dirty' : 'saved');
    } catch (err) {
      // Rien n'est perdu : les opérations non remplacées entre-temps reviennent dans la file.
      for (const [k, op] of sent) if (!pending.current.has(k)) pending.current.set(k, op);
      if (err.status === 409) { setConflict(true); setStatus('conflict'); }
      else { setError(err); setStatus('error'); if (!err.status || err.status >= 500 || err.status === 429) schedule(5000); }
    } finally {
      inflight.current = false;
      if (pending.current.size && !conflictRef.current) schedule();
    }
  }, [P, boardId, setStatus, schedule]);
  flushRef.current = flush;

  const queue = useCallback((key, op) => {
    pending.current.set(key, op);
    if (!conflictRef.current) { setStatus('dirty'); schedule(); }
  }, [schedule, setStatus]);

  // Applique des changements [{ type: 'node'|'edge', id, after }] (after null =
  // suppression) à l'écran et à la file ; `record` = entrée d'historique.
  const apply = useCallback((changes, { record = true, before = null } = {}) => {
    if (!changes.length) return;
    const nodes = new Map(g.current.nodes);
    const edges = new Map(g.current.edges);
    const hist = [];
    for (const c of changes) {
      const map = c.type === 'node' ? nodes : edges;
      const prev = before?.get(`${c.type}:${c.id}`) ?? map.get(c.id) ?? null;
      hist.push({ type: c.type, id: c.id, before: prev, after: c.after });
      if (c.after) map.set(c.id, c.after); else map.delete(c.id);
      if (c.type === 'node') queue(`n:${c.id}`, c.after ? nodeOp(c.after) : { op: 'deleteNode', id: c.id });
      else queue(`e:${c.id}`, c.after ? edgeOp(c.after) : { op: 'deleteEdge', id: c.id });
    }
    commitGraph({ nodes, edges });
    if (record) {
      undoStack.current.push(hist);
      if (undoStack.current.length > HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setHist((h) => h + 1);
    }
  }, [queue]);

  const upsertNodes = useCallback((list, opts) => apply(list.map((n) => ({ type: 'node', id: n.id, after: n })), opts), [apply]);
  const upsertEdges = useCallback((list, opts) => apply(list.map((e) => ({ type: 'edge', id: e.id, after: e })), opts), [apply]);

  // Supprimer des nœuds emporte leurs flèches (explicitement : l'historique
  // doit pouvoir les recréer).
  const deleteNodes = useCallback((ids) => {
    const set = new Set(ids);
    const changes = [];
    for (const e of g.current.edges.values()) if (set.has(e.from) || set.has(e.to)) changes.push({ type: 'edge', id: e.id, after: null });
    for (const id of set) if (g.current.nodes.has(id)) changes.push({ type: 'node', id, after: null });
    apply(changes);
  }, [apply]);
  const deleteEdges = useCallback((ids) => apply(ids.map((id) => ({ type: 'edge', id, after: null }))), [apply]);

  // Glissements : l'écran suit en direct (preview, sans file ni historique),
  // puis commit() enregistre un seul pas d'historique et une seule opération
  // par nœud déplacé.
  const preview = useCallback((list) => {
    const nodes = new Map(g.current.nodes);
    for (const n of list) nodes.set(n.id, n);
    commitGraph({ nodes, edges: g.current.edges });
  }, []);
  const commit = useCallback((list, beforeMap) => {
    apply(list.map((n) => ({ type: 'node', id: n.id, after: n })), { before: beforeMap });
  }, [apply]);

  const travel = useCallback((from, to, dir) => {
    const step = from.current.pop();
    if (!step) return;
    const changes = step.map((h) => ({ type: h.type, id: h.id, after: dir === 'undo' ? h.before : h.after }));
    // Recréer les nœuds avant leurs flèches, supprimer les flèches avant leurs nœuds.
    changes.sort((a, b) => {
      const rank = (c) => (c.after ? (c.type === 'node' ? 0 : 1) : (c.type === 'edge' ? 2 : 3));
      return rank(a) - rank(b);
    });
    apply(changes, { record: false });
    to.current.push(step);
    setHist((x) => x + 1);
  }, [apply]);
  const undo = useCallback(() => travel(undoStack, redoStack, 'undo'), [travel]);
  const redo = useCallback(() => travel(redoStack, undoStack, 'redo'), [travel]);

  // ── Conflit ─────────────────────────────────────────────────────────
  const reapply = useCallback(async () => {
    const mine = new Map(pending.current);
    const b = await load();
    if (!b) return;
    pending.current = mine;
    // Afficher la version serveur + mes changements par-dessus.
    const nodes = new Map(g.current.nodes);
    const edges = new Map(g.current.edges);
    for (const op of mine.values()) {
      if (op.op === 'node') nodes.set(op.id, { ...(nodes.get(op.id) || {}), ...op, entity: nodes.get(op.id)?.entity, media: nodes.get(op.id)?.media });
      if (op.op === 'deleteNode') nodes.delete(op.id);
      if (op.op === 'edge') edges.set(op.id, { ...op });
      if (op.op === 'deleteEdge') edges.delete(op.id);
    }
    commitGraph({ nodes, edges });
    setConflict(false);
    conflictRef.current = false;
    flushRef.current?.();
  }, [load]);
  const discard = useCallback(async () => {
    pending.current = new Map();
    undoStack.current = [];
    redoStack.current = [];
    setConflict(false);
    conflictRef.current = false;
    await load();
  }, [load]);

  // ── Caméra (sans révision) ──────────────────────────────────────────
  const viewTimer = useRef(null);
  const saveView = useCallback((cam) => {
    clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => {
      P.boards.view(boardId, { x: cam.x, y: cam.y, zoom: cam.k }).catch(() => {});
    }, 1500);
  }, [P, boardId]);

  const rename = useCallback(async (title) => {
    const b = await P.boards.update(boardId, { title });
    setMeta((m) => ({ ...m, title: b.title }));
  }, [P, boardId]);

  // Départ de la page / onglet caché : on pousse la file.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRef.current?.(); };
    // Fermeture d'onglet : envoi « keepalive » de la file (le navigateur le
    // borne à ~64 Ko — un lot plus gros repartira au prochain passage).
    const onLeave = () => {
      if (!pending.current.size || conflictRef.current || inflight.current || rev.current === null) return;
      const ops = [...pending.current.values()].sort((a, b) => ORDER[a.op] - ORDER[b.op]);
      const body = JSON.stringify({ baseRevision: rev.current, ops });
      if (body.length > 60_000) return;
      try {
        fetch(`/api/author/projects/${pid}/boards/${boardId}/ops`, {
          method: 'POST', credentials: 'include', keepalive: true, body,
          headers: { 'Content-Type': 'application/json', 'X-Author-Request': '1' },
        }).catch(() => {});
      } catch { /* l'onglet se ferme */ }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      clearTimeout(timer.current);
      clearTimeout(viewTimer.current);
      flushRef.current?.();
    };
  }, [pid, boardId]);

  return {
    meta, graph, nodesRef: g, status, error, conflict,
    upsertNodes, upsertEdges, deleteNodes, deleteEdges, preview, commit,
    undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0,
    flush, reapply, discard, saveView, rename, reload: load,
  };
}

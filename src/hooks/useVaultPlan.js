import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// Chargement + autosave d'un plan de salle des coffres.
//
// Collaboration asynchrone (pas de WebSocket) : on sauvegarde 2 s après la
// dernière modification, à la fermeture de l'onglet, ou à la demande. Chaque PUT
// porte la révision attendue ; si quelqu'un a sauvegardé entre-temps le serveur
// répond 409 et l'autosave se met en pause jusqu'à ce que l'utilisateur tranche
// (recharger / écraser).

const DEBOUNCE_MS = 2000;
const UNDO_LIMIT = 40;

const splitPlan = (p) => ({
  meta: {
    id: p.id, name: p.name, mcVersion: p.mcVersion, dims: p.dims, worldOrigin: p.worldOrigin,
    revision: p.revision, role: p.role, sharedWith: p.sharedWith, createdBy: p.createdBy,
    updatedBy: p.updatedBy, updatedByName: p.updatedByName, updatedAt: p.updatedAt, stats: p.stats,
  },
  doc: {
    floors: p.floors || [], zones: p.zones || [],
    chests: p.chests || [], circulation: p.circulation || [],
  },
});

export function useVaultPlan(id) {
  const [meta, setMeta] = useState(null);
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('loading'); // loading|idle|dirty|saving|saved|conflict|error
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const dirty = useRef(false);
  const saving = useRef(false);
  const latest = useRef({ meta: null, doc: null });
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  latest.current = { meta, doc };

  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError(null); setConflict(null);
    undoStack.current = []; redoStack.current = [];
    api.vault.get(id).then(
      (p) => {
        if (!alive) return;
        const s = splitPlan(p);
        setMeta(s.meta); setDoc(s.doc);
        dirty.current = false;
        setStatus('idle');
      },
      (e) => { if (alive) { setError(e.message); setStatus('error'); } },
    );
    return () => { alive = false; };
  }, [id]);

  // ── Sauvegarde ──────────────────────────────────────────────────────────

  const payload = useCallback(() => {
    const { meta: m, doc: d } = latest.current;
    if (!m || !d) return null;
    return {
      revision: m.revision,
      name: m.name,
      mcVersion: m.mcVersion,
      dims: m.dims,
      worldOrigin: m.worldOrigin,
      ...d,
    };
  }, []);

  const save = useCallback(async ({ force = false } = {}) => {
    const body = payload();
    if (!body || saving.current) return;
    saving.current = true;
    setStatus('saving');
    try {
      const fn = force ? api.vault.overwrite : api.vault.save;
      const saved = await fn(id, body);
      const s = splitPlan(saved);
      // Le document local reste la référence (l'utilisateur a pu continuer à
      // dessiner pendant la requête) : on ne réécrit que les métadonnées.
      setMeta((m) => ({ ...m, ...s.meta }));
      setSavedAt(Date.now());
      setConflict(null);
      dirty.current = false;
      setStatus('saved');
    } catch (e) {
      if (e.status === 409) {
        setConflict(e.body || {});
        setStatus('conflict');
      } else {
        setError(e.body?.detail ? `${e.message} (${e.body.detail})` : e.message);
        setStatus('error');
      }
    } finally {
      saving.current = false;
    }
  }, [id, payload]);

  // Autosave débouncé. Suspendu tant qu'un conflit n'est pas tranché — sinon on
  // rejouerait le 409 toutes les deux secondes.
  useEffect(() => {
    if (status !== 'dirty' || conflict) return undefined;
    const t = setTimeout(() => { save(); }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [status, conflict, save, doc, meta]);

  // Fermeture / passage en arrière-plan : on pousse ce qui n'est pas encore
  // parti, avec keepalive pour que la requête survive à l'unload.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current || conflict) return;
      const body = payload();
      if (!body) return;
      try {
        fetch(`/api/vault-plans/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {});
      } catch { /* onglet en train de mourir : rien à récupérer */ }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [id, conflict, payload]);

  // ── Édition ─────────────────────────────────────────────────────────────

  const pushUndo = useCallback((snapshot) => {
    undoStack.current.push(snapshot);
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  /** `mutate(doc) => nouveau doc` — renvoyer le même objet annule la modification. */
  const update = useCallback((mutate) => {
    setDoc((current) => {
      if (!current) return current;
      const next = mutate(current);
      if (!next || next === current) return current;
      pushUndo(current);
      dirty.current = true;
      setStatus('dirty');
      return next;
    });
  }, [pushUndo]);

  const patchMeta = useCallback((patch) => {
    setMeta((m) => {
      if (!m) return m;
      dirty.current = true;
      setStatus('dirty');
      return { ...m, ...patch };
    });
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setDoc((current) => {
      redoStack.current.push(current);
      return previous;
    });
    dirty.current = true;
    setStatus('dirty');
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setDoc((current) => {
      undoStack.current.push(current);
      return next;
    });
    dirty.current = true;
    setStatus('dirty');
  }, []);

  // ── Conflit ─────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    const p = await api.vault.get(id);
    const s = splitPlan(p);
    setMeta(s.meta); setDoc(s.doc);
    undoStack.current = []; redoStack.current = [];
    dirty.current = false;
    setConflict(null);
    setStatus('idle');
  }, [id]);

  const overwrite = useCallback(() => save({ force: true }), [save]);

  /** Filet de sécurité avant de trancher un conflit : le JSON local sur disque. */
  const downloadLocal = useCallback(() => {
    const body = payload();
    if (!body) return;
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(body.name || 'plan').replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [payload]);

  return {
    meta, doc, status, error, conflict, savedAt,
    setError,
    update, patchMeta, undo, redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    save, reload, overwrite, downloadLocal,
  };
}

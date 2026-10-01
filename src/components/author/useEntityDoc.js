import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthor } from './context';

// Chargement + sauvegarde automatique d'un élément (fiche, chapitre, idée).
//
// Garanties, dans l'ordre :
//   1. Chaque frappe est copiée dans localStorage (au-draft:<projet>:<id>)
//      AVANT tout réseau : un onglet tué, une batterie vide ou une coupure ne
//      perdent rien — au retour, un bandeau propose de restaurer.
//   2. Seuls les champs modifiés partent, avec la révision sur laquelle ils ont
//      été écrits (PUT partiel sous CAS).
//   3. 409 (modifié ailleurs : autre onglet, téléphone) → fusion champ par
//      champ : un champ que le serveur n'a pas touché garde ma valeur et la
//      sauvegarde repart seule ; seul un champ modifié DES DEUX CÔTÉS ouvre la
//      modale de conflit. Rien n'est jamais écrasé en silence.
//   4. Erreur réseau → état « erreur », nouvel essai toutes les 5 s, le
//      brouillon local reste en place.

const RETRY_MS = 5000;

// Parties d'une fiche qui ne sont PAS des champs de formulaire (relations,
// médias, tâches…) : on peut les rafraîchir sans toucher au brouillon.
const EXTRA_KEYS = ['links', 'media', 'cover', 'tasks', 'boards', 'map', 'mapMediaId', 'isFavorite', 'number', 'actId', 'actTitle', 'wordCount', 'charCount', 'contentUpdatedAt'];

function norm(key, v) {
  if (key === 'tags') return JSON.stringify((v || []).map((t) => (typeof t === 'string' ? t : t.name).toLowerCase()).sort());
  if (key === 'aliases') return JSON.stringify((v || []).map((a) => [a.alias, a.kind]));
  if (v === undefined || v === null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
const same = (key, a, b) => norm(key, a) === norm(key, b);

// Valeur envoyée au serveur pour une clé (les tags partent en noms).
function wire(key, v) {
  if (key === 'tags') return (v || []).map((t) => (typeof t === 'string' ? t : t.name));
  if (key === 'aliases') return (v || []).map((a) => ({ alias: a.alias, kind: a.kind, note: a.note || '' }));
  return v;
}

export function useEntityDoc(id, { debounce = 1200, onSaved } = {}) {
  const { pid, P, reportSave, bump, reloadTags } = useAuthor();
  const [base, setBase] = useState(null);
  const [draft, setDraft] = useState({});
  const [status, setStatusState] = useState('loading');
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [backup, setBackup] = useState(null);

  const baseRef = useRef(null);
  const draftRef = useRef({});
  const saving = useRef(false);
  const again = useRef(false);
  const timer = useRef(null);
  const backupTimer = useRef(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const saveRef = useRef(null);
  const conflictRef = useRef(null);
  conflictRef.current = conflict;
  const storageKey = `au-draft:${pid}:${id}`;
  const saveKey = `entity:${id}`;

  const setStatus = useCallback((s) => {
    setStatusState(s);
    reportSave(saveKey, s);
  }, [reportSave, saveKey]);

  const writeBackup = useCallback(() => {
    clearTimeout(backupTimer.current);
    backupTimer.current = setTimeout(() => {
      try {
        const fields = draftRef.current;
        if (Object.keys(fields).length === 0) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify({ fields, revision: baseRef.current?.revision, ts: Date.now() }));
      } catch { /* quota : le réseau reste la voie principale */ }
    }, 250);
  }, [storageKey]);

  const clearBackup = useCallback(() => {
    clearTimeout(backupTimer.current);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  // ── Chargement ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const e = await P.entities.get(id);
      baseRef.current = e;
      draftRef.current = {};
      setBase(e);
      setDraft({});
      setConflict(null);
      setStatus('idle');
      // Brouillon local plus récent que le serveur et différent → proposé.
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (raw?.fields && raw.ts > (e.updatedAt || 0) * 1000
          && Object.entries(raw.fields).some(([k, v]) => !same(k, v, e[k]))) setBackup(raw);
        else if (raw) localStorage.removeItem(storageKey);
      } catch { /* ignore */ }
      P.entities.visit(id).catch(() => {});
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [P, id, storageKey, setStatus]);

  useEffect(() => {
    setBase(null);
    setBackup(null);
    load();
    return () => reportSave(saveKey, null);
  }, [load, reportSave, saveKey]);

  // ── Sauvegarde ─────────────────────────────────────────────────────────
  const schedule = useCallback((ms = debounce) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveRef.current?.(); }, ms);
  }, [debounce]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (!baseRef.current) return;
    if (saving.current) { again.current = true; return; }
    const keys = Object.keys(draftRef.current);
    if (keys.length === 0) return;
    const sent = { ...draftRef.current };
    const body = { revision: baseRef.current.revision };
    for (const k of keys) body[k] = wire(k, sent[k]);
    saving.current = true;
    setStatus('saving');
    try {
      const res = await P.entities.update(id, body);
      const next = { ...draftRef.current };
      for (const k of keys) if (same(k, next[k], sent[k])) delete next[k];
      draftRef.current = next;
      baseRef.current = res;
      setBase(res);
      setDraft(next);
      setError(null);
      if (Object.keys(next).length === 0) { clearBackup(); setStatus('saved'); } else { writeBackup(); setStatus('dirty'); schedule(); }
      if ('tags' in sent) reloadTags();
      if ('title' in sent || 'status' in sent || 'categoryId' in sent || 'timelineId' in sent || 'sortKey' in sent) bump();
      onSavedRef.current?.(res);
    } catch (err) {
      if (err.status === 409 && err.body?.entity) {
        const server = err.body.entity;
        const old = baseRef.current;
        const next = { ...draftRef.current };
        const clash = [];
        for (const k of Object.keys(next)) {
          if (same(k, server[k], old[k])) continue;          // pas touché ailleurs → ma valeur
          if (same(k, server[k], next[k])) { delete next[k]; continue; } // même résultat
          clash.push(k);
        }
        baseRef.current = server;
        draftRef.current = next;
        setBase(server);
        setDraft(next);
        if (clash.length === 0) {
          saving.current = false;
          if (Object.keys(next).length) { setStatus('dirty'); schedule(0); } else { clearBackup(); setStatus('saved'); }
          return;
        }
        setConflict({ server, keys: clash });
        setStatus('conflict');
      } else {
        setError(err);
        setStatus('error');
        if (!err.status || err.status >= 500 || err.status === 429) schedule(RETRY_MS);
      }
    } finally {
      saving.current = false;
      if (again.current) { again.current = false; if (Object.keys(draftRef.current).length) schedule(0); }
    }
  }, [P, id, setStatus, clearBackup, writeBackup, schedule, reloadTags, bump]);
  saveRef.current = save;

  const setFields = useCallback((patch) => {
    if (!baseRef.current) return;
    const next = { ...draftRef.current };
    for (const [k, v] of Object.entries(patch)) {
      if (same(k, v, baseRef.current[k])) delete next[k];
      else next[k] = v;
    }
    draftRef.current = next;
    setDraft(next);
    writeBackup();
    if (Object.keys(next).length === 0) { clearTimeout(timer.current); setStatus('saved'); return; }
    if (!conflictRef.current) { setStatus('dirty'); schedule(); }
  }, [writeBackup, schedule, setStatus]);

  const setField = useCallback((k, v) => setFields({ [k]: v }), [setFields]);

  // ── Conflit ────────────────────────────────────────────────────────────
  // 'mine'   : j'écrase les champs en conflit (choix explicite, force: true).
  // 'theirs' : je prends la version serveur ; mes textes longs perdants partent
  //            d'abord en snapshot manuel (« Version locale — conflit »).
  const resolveConflict = useCallback(async (choice) => {
    const c = conflictRef.current;
    if (!c) return;
    if (choice === 'mine') {
      const body = { force: true };
      for (const [k, v] of Object.entries(draftRef.current)) body[k] = wire(k, v);
      setStatus('saving');
      try {
        const res = await P.entities.update(id, body);
        baseRef.current = res; draftRef.current = {};
        setBase(res); setDraft({}); setConflict(null); clearBackup(); setStatus('saved');
        onSavedRef.current?.(res);
      } catch (err) { setError(err); setStatus('error'); }
      return;
    }
    const kind = baseRef.current?.kind;
    for (const k of c.keys) {
      const revisable = k === 'body' || (k === 'content' && kind === 'chapter');
      const mine = draftRef.current[k];
      if (revisable && typeof mine === 'string' && mine.trim()) {
        try { await P.revisions.create(id, { field: k, body: mine, label: 'Version locale — conflit' }); } catch { /* best effort */ }
      }
    }
    const next = { ...draftRef.current };
    for (const k of c.keys) delete next[k];
    draftRef.current = next;
    setDraft(next);
    setConflict(null);
    if (Object.keys(next).length) { setStatus('dirty'); schedule(0); } else { clearBackup(); setStatus('saved'); }
  }, [P, id, setStatus, clearBackup, schedule]);

  // ── Brouillon local ────────────────────────────────────────────────────
  const restoreBackup = useCallback(() => {
    if (!backup) return;
    setBackup(null);
    setFields(backup.fields);
  }, [backup, setFields]);
  const discardBackup = useCallback(() => { setBackup(null); clearBackup(); }, [clearBackup]);

  // Fermeture d'onglet / passage en arrière-plan : envoi « keepalive » de ce
  // qui reste (limité à ~64 Ko par le navigateur — au-delà, le brouillon
  // localStorage prend le relais au prochain chargement).
  useEffect(() => {
    const flush = () => {
      const keys = Object.keys(draftRef.current);
      if (!keys.length || !baseRef.current || conflictRef.current) return;
      const body = { revision: baseRef.current.revision };
      for (const k of keys) body[k] = wire(k, draftRef.current[k]);
      try {
        fetch(`/api/author/projects/${pid}/entities/${id}`, {
          method: 'PUT', credentials: 'include', keepalive: true,
          headers: { 'Content-Type': 'application/json', 'X-Author-Request': '1' },
          body: JSON.stringify(body),
        }).catch(() => {});
      } catch { /* l'onglet meurt : le brouillon local reste */ }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') saveRef.current?.(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [pid, id]);

  // Démontage (navigation interne) : on pousse immédiatement.
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (Object.keys(draftRef.current).length && !conflictRef.current) saveRef.current?.();
  }, [id]);

  // Rafraîchit relations, médias, tâches… sans perdre une frappe en cours.
  const refresh = useCallback(async () => {
    try {
      const e = await P.entities.get(id);
      if (!baseRef.current) return;
      const next = { ...baseRef.current };
      for (const k of EXTRA_KEYS) next[k] = e[k];
      baseRef.current = next;
      setBase(next);
    } catch { /* la prochaine action rechargera */ }
  }, [P, id]);

  const doc = useMemo(() => (base ? { ...base, ...draft } : null), [base, draft]);

  return {
    doc, base, draft, status, error, conflict, backup,
    setField, setFields, save, reload: load, refresh, resolveConflict, restoreBackup, discardBackup,
    setBase: (e) => { baseRef.current = e; setBase(e); },
  };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { KIND_ORDER } from './kinds';
import { normTitle } from './markdown';
import { isNetworkError } from './offline/net.js';
import { withOffline } from './offline/offlineApi.js';
import { prefetchProject } from './offline/pack.js';

// Contexte d'un projet ouvert : client API borné au projet, référentiels
// (catégories, lignes de temps, tags), compteurs de la navigation, état global
// de sauvegarde, palette et capture rapide.
//
// `access` = 'owner' (propriétaire) ou 'omniscient' (invité en lecture) : le
// serveur ne sert à l'invité que des lectures filtrées, l'interface masque en
// plus tout geste d'écriture (`guest`) et la boîte à idées (`kindOrder`).

const AuthorCtx = createContext(null);

export function useAuthor() {
  const ctx = useContext(AuthorCtx);
  if (!ctx) throw new Error('useAuthor doit être utilisé dans <AuthorProvider>');
  return ctx;
}

// « Hors connexion » passe avant « en cours » : c'est l'état à connaître.
const SAVE_RANK = { conflict: 5, error: 4, offline: 3.5, saving: 3, dirty: 2, local: 1.5, saved: 1, idle: 0, loading: 0 };

// Recherche de secours sans réseau : titres et alias de l'index (la recherche
// plein texte vit sur le serveur).
export function localSearch(index, q, kinds) {
  const nq = normTitle(q);
  if (!nq) return [];
  const ks = kinds && kinds.length ? new Set(kinds) : null;
  return index
    .filter((e) => (!ks || ks.has(e.kind)) && (normTitle(e.title).includes(nq) || e.aliases.some((a) => normTitle(a).includes(nq))))
    .slice(0, 30)
    .map((e) => ({ ...e, snippet: e.aliases.length ? `Aussi : ${e.aliases.join(', ')}` : '', tags: [] }));
}

export function AuthorProvider({ pid, access = 'owner', children }) {
  const guest = access !== 'owner';
  const kindOrder = useMemo(() => (guest ? KIND_ORDER.filter((k) => k !== 'note') : KIND_ORDER), [guest]);
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  // Propriétaire : client capable de travailler sans réseau (créations et
  // idées mises en file, éléments temporaires sur l'appareil).
  const P = useMemo(() => (guest ? api.author.p(pid) : withOffline(api.author.p(pid), pid, () => uidRef.current)), [pid, guest]);
  const [project, setProject] = useState(null);
  const [categories, setCategories] = useState([]);
  const [timelines, setTimelines] = useState([]);
  const [tags, setTags] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // `version` monte à chaque mutation notable : les vues qui ont leurs propres
  // données (listes, plan, chronologie…) se rechargent en l'observant.
  const [version, setVersion] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  const reloadMeta = useCallback(async () => {
    const [proj, cats, tls, tg] = await Promise.all([P.get(), P.categories.list(), P.timelines.list(), P.tags.list()]);
    setProject(proj); setCategories(cats); setTimelines(tls); setTags(tg);
  }, [P]);

  const refreshCounts = useCallback(() => P.overview().then((o) => setCounts({
    ...o.counts, inbox: o.ideas?.inbox, ideasPending: o.ideas?.pending, tasks: o.tasks?.open,
    issues: o.issueCount, trash: o.trash, words: o.chapters.words, comments: o.comments?.open,
  })).catch(() => {}), [P]);

  // Livre disponible hors connexion (propriétaire) : une passe en arrière-plan
  // peu après l'ouverture, puis à la demande. Progression exposée à l'interface.
  const [pack, setPack] = useState({ running: false, done: 0, total: 0 });
  const packRunning = useRef(false);
  const refreshPack = useCallback(async ({ force = false } = {}) => {
    if (guest || packRunning.current) return null;
    packRunning.current = true;
    setPack({ running: true, done: 0, total: 0 });
    try {
      const info = await prefetchProject(P, pid, { force, onProgress: (p) => setPack({ running: true, ...p }) });
      setPack({ running: false, done: 0, total: 0, info });
      return info;
    } catch (err) {
      setPack({ running: false, done: 0, total: 0, error: err });
      return null;
    } finally {
      packRunning.current = false;
    }
  }, [P, pid, guest]);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    reloadMeta().catch((e) => { if (alive) setLoadError(e); });
    refreshCounts();
    return () => { alive = false; };
  }, [reloadMeta, refreshCounts]);

  // Première passe « hors connexion » quelques secondes après l'ouverture
  // (la dernière date de plus de 15 min).
  useEffect(() => {
    if (guest) return undefined;
    const t = setTimeout(() => {
      let last = 0;
      try { last = JSON.parse(localStorage.getItem(`au-pack:${pid}`) || 'null')?.at || 0; } catch { /* ignore */ }
      if (Date.now() - last > 15 * 60_000) refreshPack();
    }, 4000);
    return () => clearTimeout(t);
  }, [guest, pid, refreshPack]);

  const countsTimer = useRef(null);
  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    clearTimeout(countsTimer.current);
    countsTimer.current = setTimeout(refreshCounts, 600);
  }, [refreshCounts]);

  const reloadTags = useCallback(() => P.tags.list().then(setTags).catch(() => {}), [P]);

  // Index titres + alias de tout le projet : liens [[Nom]] et autocomplétion.
  const [index, setIndex] = useState([]);
  useEffect(() => { P.index().then(setIndex).catch(() => {}); }, [P, version]);
  const resolveMap = useMemo(() => {
    const m = new Map();
    for (const e of index) m.set(normTitle(e.title), e);
    for (const e of index) for (const a of e.aliases) if (!m.has(normTitle(a))) m.set(normTitle(a), e);
    return m;
  }, [index]);
  const resolve = useCallback((name) => resolveMap.get(normTitle(name)) || null, [resolveMap]);

  // Recherche partagée (palette, sélecteurs) : vide = éléments récents. Sans
  // réseau : titres et alias de l'index gardé sur l'appareil.
  const search = useCallback(async (q, kinds) => {
    const k = kinds && kinds.length ? kinds.join(',') : undefined;
    try {
      if (q && q.trim()) return await P.search(q.trim(), { kinds: k, limit: 30 });
      const opened = await P.entities.list({ sort: 'opened', limit: 12, kinds: k });
      if (opened.items.length) return opened.items;
      return (await P.entities.list({ sort: 'updated', limit: 12, kinds: k })).items;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return q && q.trim() ? localSearch(index, q, kinds) : [];
    }
  }, [P, index]);

  const createEntity = useCallback(async (kind, fields = {}) => {
    const e = await P.entities.create({ kind, ...fields });
    bump();
    if (fields.tags?.length) reloadTags();
    return e;
  }, [P, bump, reloadTags]);

  // ── État global de sauvegarde ──────────────────────────────────────────
  // Chaque éditeur déclare son état ; la barre du haut affiche le pire, et
  // l'onglet refuse de se fermer sans prévenir tant que tout n'est pas parti.
  const saves = useRef(new Map());
  const [saveState, setSaveState] = useState({ status: 'idle', at: null });
  const reportSave = useCallback((key, status) => {
    if (status === null) saves.current.delete(key);
    else saves.current.set(key, status);
    let worst = 'idle';
    for (const s of saves.current.values()) if ((SAVE_RANK[s] ?? 0) > (SAVE_RANK[worst] ?? 0)) worst = s;
    setSaveState((prev) => ({ status: worst, at: status === 'saved' ? Date.now() : prev.at }));
  }, []);

  useEffect(() => {
    const onBefore = (e) => {
      const risky = [...saves.current.values()].some((s) => ['dirty', 'saving', 'error', 'conflict'].includes(s));
      if (risky) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  const categoriesOf = useCallback((domain) => categories.filter((c) => c.domain === domain), [categories]);

  // Synchronisation terminée (créations/brouillons envoyés) : on relit.
  useEffect(() => {
    const onDone = () => bump();
    window.addEventListener('au-sync-done', onDone);
    return () => window.removeEventListener('au-sync-done', onDone);
  }, [bump]);

  const value = useMemo(() => ({
    pid, P, uid, access, guest, kindOrder, pack, refreshPack, project, setProject, categories, setCategories, categoriesOf, timelines, setTimelines, tags, reloadTags,
    counts, refreshCounts, version, bump, reloadMeta, loadError,
    search, createEntity, index, resolve,
    saveState, reportSave,
    paletteOpen, setPaletteOpen, captureOpen, setCaptureOpen,
  }), [pid, P, uid, access, guest, kindOrder, pack, refreshPack, project, categories, categoriesOf, timelines, tags, reloadTags, counts, refreshCounts, version, bump,
    reloadMeta, loadError, search, createEntity, index, resolve, saveState, reportSave, paletteOpen, captureOpen]);

  return <AuthorCtx.Provider value={value}>{children}</AuthorCtx.Provider>;
}

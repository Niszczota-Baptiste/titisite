import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { KIND_ORDER } from './kinds';
import { normTitle } from './markdown';

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

const SAVE_RANK = { conflict: 5, error: 4, saving: 3, dirty: 2, saved: 1, idle: 0, loading: 0 };

export function AuthorProvider({ pid, access = 'owner', children }) {
  const guest = access !== 'owner';
  const kindOrder = useMemo(() => (guest ? KIND_ORDER.filter((k) => k !== 'note') : KIND_ORDER), [guest]);
  const P = useMemo(() => api.author.p(pid), [pid]);
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

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    reloadMeta().catch((e) => { if (alive) setLoadError(e); });
    refreshCounts();
    return () => { alive = false; };
  }, [reloadMeta, refreshCounts]);

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

  // Recherche partagée (palette, sélecteurs) : vide = éléments récents.
  const search = useCallback(async (q, kinds) => {
    const k = kinds && kinds.length ? kinds.join(',') : undefined;
    if (q && q.trim()) return P.search(q.trim(), { kinds: k, limit: 30 });
    const opened = await P.entities.list({ sort: 'opened', limit: 12, kinds: k });
    if (opened.items.length) return opened.items;
    return (await P.entities.list({ sort: 'updated', limit: 12, kinds: k })).items;
  }, [P]);

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

  const value = useMemo(() => ({
    pid, P, access, guest, kindOrder, project, setProject, categories, setCategories, categoriesOf, timelines, setTimelines, tags, reloadTags,
    counts, refreshCounts, version, bump, reloadMeta, loadError,
    search, createEntity, index, resolve,
    saveState, reportSave,
    paletteOpen, setPaletteOpen, captureOpen, setCaptureOpen,
  }), [pid, P, access, guest, kindOrder, project, categories, categoriesOf, timelines, tags, reloadTags, counts, refreshCounts, version, bump,
    reloadMeta, loadError, search, createEntity, index, resolve, saveState, reportSave, paletteOpen, captureOpen]);

  return <AuthorCtx.Provider value={value}>{children}</AuthorCtx.Provider>;
}

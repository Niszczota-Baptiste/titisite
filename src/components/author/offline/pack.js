import { KIND_ORDER } from '../kinds';

// « Livre disponible hors connexion » : en ligne, on lit une fois chaque
// écran du livre pour que le service worker en garde la copie. Les adresses
// sont EXACTEMENT celles que demandent les pages (mêmes paramètres ; le
// service worker trie les paramètres, l'ordre est donc indifférent).
// Incrémental : une fiche n'est relue que si sa date de modification a changé
// (ou si la dernière passe complète date de plus d'un jour). Images : seules
// les miniatures et les cartes de lieux, pas les images en grand.

const KEY = (pid) => `au-pack:${pid}`;
const FULL_EVERY_MS = 86_400_000;
const MAX_MEDIA = 400;

export function packInfo(pid) {
  try { return JSON.parse(localStorage.getItem(KEY(pid)) || 'null'); } catch { return null; }
}

function savePack(pid, info) {
  try { localStorage.setItem(KEY(pid), JSON.stringify(info)); } catch { /* le cache du SW reste */ }
}

// Le service worker doit contrôler la page, sinon rien n'est mis de côté.
export async function offlineReady(timeoutMs = 15000) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return false;
  if (navigator.serviceWorker.controller) return true;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(!!navigator.serviceWorker.controller), timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true); }, { once: true });
  });
}

async function pool(tasks, size, onDone) {
  let i = 0;
  const worker = async () => {
    while (i < tasks.length) {
      const task = tasks[i];
      i += 1;
      try { await task(); } catch { /* une lecture ratée n'arrête pas la passe */ }
      onDone();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

export async function prefetchProject(P, pid, { onProgress = () => {}, force = false } = {}) {
  if (!(await offlineReady())) return { skipped: true };
  const prev = force ? null : packInfo(pid);
  const full = !prev || Date.now() - (prev.fullAt || 0) > FULL_EVERY_MS;

  // Écrans du livre (mêmes appels que les pages).
  const screens = [
    () => P.get(), () => P.overview(), () => P.index(), () => P.categories.list(), () => P.timelines.list(),
    () => P.tags.list(), () => P.plan.get(), () => P.boards.list(), () => P.tasks.list(), () => P.trash(),
    () => P.graph({ kinds: KIND_ORDER.join(',') }), () => P.graph({ kinds: 'character' }), () => P.consistency.get(),
    () => P.shares.list(), () => P.comments.list({ open: 1 }), () => P.comments.list({}), () => P.comments.list({ general: 1 }),
    () => P.entities.list({ sort: 'opened', limit: 12 }), () => P.entities.list({ sort: 'updated', limit: 12 }),
    () => P.entities.list({ kind: 'note', sort: 'position', limit: 1000 }),
    () => P.entities.list({ kind: 'event', sort: 'date', limit: 1000 }),
    ...['character', 'place', 'lore', 'event'].map((kind) => () => P.entities.list({
      kind, sort: kind === 'event' ? 'date' : 'updated', limit: 60, offset: 0,
    })),
    () => P.reader.list(),
  ];

  // Fiches : toutes au premier passage, puis seulement celles qui ont bougé.
  const all = (await P.entities.list({ sort: 'updated', limit: 1000 })).items;
  const seen = prev?.seen || {};
  const changed = all.filter((e) => full || seen[e.id] !== e.updatedAt);
  const media = new Set();
  const boards = (await P.boards.list().catch(() => [])) || [];

  const tasks = [
    ...screens,
    ...boards.map((b) => () => P.boards.get(b.id)),
    ...changed.map((e) => async () => {
      const ent = await P.entities.get(e.id);
      if (ent.cover?.thumbUrl) media.add(ent.cover.thumbUrl);
      for (const m of ent.media || []) if (m.thumbUrl) media.add(m.thumbUrl);
      if (ent.map?.url) media.add(ent.map.url);
      if (ent.kind === 'place') await P.pins.list(ent.id);
    }),
  ];
  for (const e of all) if (e.coverUrl) media.add(e.coverUrl);

  let done = 0;
  const total = () => tasks.length + Math.min(media.size, MAX_MEDIA);
  onProgress({ done, total: total() });
  await pool(tasks, 4, () => { done += 1; onProgress({ done, total: total() }); });
  const mediaTasks = [...media].slice(0, MAX_MEDIA).map((url) => () => fetch(url, { credentials: 'include' }));
  await pool(mediaTasks, 4, () => { done += 1; onProgress({ done, total: total() }); });

  const info = {
    at: Date.now(),
    fullAt: full ? Date.now() : prev.fullAt,
    count: all.length,
    seen: Object.fromEntries(all.map((e) => [e.id, e.updatedAt])),
  };
  savePack(pid, info);
  return info;
}

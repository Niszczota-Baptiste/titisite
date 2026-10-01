import { db } from '../db.js';
import { CHAPTER_STATUSES, CHAPTER_STATUS_WEIGHT, KINDS, NOTE_PENDING } from './enums.js';
import { chapterNumbers, listEntities } from './entities.js';
import { listTasks } from './structure.js';

// Tableau de bord : tout ce qu'il faut pour « reprendre là où j'en étais », en
// une requête HTTP (quelques agrégats SQL, aucune boucle N+1).

export function bookProgress(chapters) {
  if (chapters.length === 0) return 0;
  const sum = chapters.reduce((acc, c) => acc + (CHAPTER_STATUS_WEIGHT[c.status] ?? 0), 0);
  return sum / chapters.length;
}

export function overview(project, { issueCount = null } = {}) {
  const projectId = project.id;
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const r of db.prepare(`
    SELECT kind, COUNT(*) AS n FROM author_entities WHERE project_id = ? AND deleted_at IS NULL GROUP BY kind
  `).all(projectId)) counts[r.kind] = r.n;

  const chapters = db.prepare(`
    SELECT e.id, e.title, c.status, c.word_count, c.target_words, c.content_updated_at
    FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId);
  const byStatus = Object.fromEntries(CHAPTER_STATUSES.map((s) => [s, 0]));
  for (const c of chapters) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const words = chapters.reduce((a, c) => a + c.word_count, 0);

  const notes = db.prepare(`
    SELECT n.status, n.inbox FROM author_notes n JOIN author_entities e ON e.id = n.entity_id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId);
  const inbox = notes.filter((n) => n.inbox === 1).length;
  const pendingIdeas = notes.filter((n) => n.inbox !== 1 && NOTE_PENDING.includes(n.status)).length;

  const numbers = chapterNumbers(projectId);
  const lastChapter = chapters
    .filter((c) => c.content_updated_at)
    .sort((a, b) => b.content_updated_at - a.content_updated_at)[0] || null;

  const trash = db.prepare(`SELECT COUNT(*) AS n FROM author_entities WHERE project_id = ? AND deleted_at IS NOT NULL`).get(projectId).n;
  const linkCount = db.prepare(`SELECT COUNT(*) AS n FROM author_links WHERE project_id = ?`).get(projectId).n;
  const openTasks = listTasks(projectId, { done: false });

  // « À approfondir » : idées marquées à développer, et fiches squelettiques
  // (personnages/lieux/lore sans résumé ni corps).
  const toDevelop = listEntities(projectId, { kind: 'note', status: 'a_developper', inbox: false, sort: 'updated', limit: 6 }).items;
  const thin = db.prepare(`
    SELECT id, kind, title, icon FROM author_entities
    WHERE project_id = ? AND deleted_at IS NULL AND kind IN ('character','place','lore')
      AND summary = '' AND body = ''
    ORDER BY updated_at DESC LIMIT 6
  `).all(projectId);

  return {
    project,
    counts,
    links: linkCount,
    trash,
    chapters: {
      total: chapters.length,
      byStatus,
      words,
      targetWords: project.targetWords,
      progress: bookProgress(chapters),
      wordProgress: project.targetWords ? Math.min(1, words / project.targetWords) : null,
    },
    ideas: { inbox, pending: pendingIdeas },
    lastChapter: lastChapter
      ? { id: lastChapter.id, title: lastChapter.title, number: numbers.get(lastChapter.id) ?? null, updatedAt: lastChapter.content_updated_at, status: lastChapter.status, wordCount: lastChapter.word_count }
      : null,
    recentUpdated: listEntities(projectId, { sort: 'updated', limit: 10 }).items,
    recentOpened: listEntities(projectId, { sort: 'opened', limit: 8 }).items,
    favorites: listEntities(projectId, { favorite: true, sort: 'title', limit: 24 }).items,
    tasks: { open: openTasks.length, items: openTasks.slice(0, 8) },
    toDevelop,
    thin,
    issueCount,
  };
}

import { cleanMarks } from './marks.js';
import { db } from '../db.js';
import { KIND_TABLE, KINDS } from './enums.js';
import { chapterNumbers } from './entities.js';
import { getPlan, projectFromRow } from './structure.js';

// Exports du projet : une sauvegarde JSON complète (filet de sécurité
// indépendant du serveur — tout sauf les fichiers image et audio, listés par
// nom avec leur taille et leur empreinte) et le manuscrit Markdown des
// chapitres dans l'ordre du plan. Version 2 : nature du projet, idées
// musicales (kinds.sound), prises audio dans `media` (kind = 'audio') et leurs
// repères (`mediaMarkers`) ; une lecture écrite pour la version 1 reste valable
// (rien n'a été retiré ni renommé).

export function exportProject(projectId) {
  const project = projectFromRow(db.prepare(`SELECT * FROM author_projects WHERE id = ?`).get(projectId));
  const entities = db.prepare(`SELECT * FROM author_entities WHERE project_id = ? ORDER BY id`).all(projectId);
  const byKind = {};
  for (const kind of KINDS) {
    byKind[kind] = db.prepare(`
      SELECT k.* FROM ${KIND_TABLE[kind]} k JOIN author_entities e ON e.id = k.entity_id WHERE e.project_id = ?
    `).all(projectId);
  }
  const scoped = (table) => db.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY id`).all(projectId);
  const viaEntity = (table) => db.prepare(`
    SELECT t.* FROM ${table} t JOIN author_entities e ON e.id = t.entity_id WHERE e.project_id = ?
  `).all(projectId);
  return {
    format: 'titisite-author-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    project,
    entities,
    kinds: byKind,
    aliases: viaEntity('author_aliases'),
    entityTags: viaEntity('author_entity_tags'),
    revisions: viaEntity('author_revisions'),
    tags: scoped('author_tags'),
    links: scoped('author_links'),
    categories: scoped('author_categories'),
    timelines: scoped('author_timelines'),
    acts: scoped('author_acts'),
    beats: scoped('author_beats'),
    tasks: scoped('author_tasks'),
    media: scoped('author_media'),
    mediaMarkers: scoped('author_media_markers'),
    mapPins: scoped('author_map_pins'),
    boards: scoped('author_boards'),
    boardNodes: db.prepare(`SELECT n.* FROM author_board_nodes n JOIN author_boards b ON b.id = n.board_id WHERE b.project_id = ?`).all(projectId),
    boardEdges: db.prepare(`SELECT ed.* FROM author_board_edges ed JOIN author_boards b ON b.id = ed.board_id WHERE b.project_id = ?`).all(projectId),
    issueDismissals: db.prepare(`SELECT issue_key, reason, created_at FROM author_issue_dismissals WHERE project_id = ? ORDER BY issue_key`).all(projectId),
  };
}

// Manuscrit à lire ou à faire lire : sans les marques de travail (la sauvegarde
// JSON, elle, garde le texte tel qu'il est écrit).
export function exportManuscript(projectId) {
  const project = db.prepare(`SELECT title, subtitle FROM author_projects WHERE id = ?`).get(projectId);
  const plan = getPlan(projectId);
  const numbers = chapterNumbers(projectId);
  const content = new Map(db.prepare(`
    SELECT e.id, c.content FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId).map((r) => [r.id, r.content]));
  const out = [`# ${project.title}`];
  if (project.subtitle) out.push(`*${project.subtitle}*`);
  const writeItems = (items) => {
    for (const it of items) {
      if (it.type !== 'chapter') continue;
      out.push('', `## ${numbers.get(it.id) ?? ''}. ${it.title}`.replace(/^## \. /, '## '), '', cleanMarks(content.get(it.id) || '').trim());
    }
  };
  for (const act of plan.acts) {
    if (!act.items.some((i) => i.type === 'chapter')) continue;
    out.push('', `# ${act.title}`);
    writeItems(act.items);
  }
  writeItems(plan.unassigned);
  return `${out.join('\n')}\n`;
}

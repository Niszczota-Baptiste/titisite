import { db } from '../db.js';
import { chapterNumbers } from './entities.js';
import { normalize } from './text.js';

// Moteur de cohérence de l'univers. Architecture en deux temps :
//
//   1. loadWorld(projectId) lit UNE photographie du projet (éléments, alias,
//      chapitres + texte, événements datés, relations) ;
//   2. runRules(world) applique des règles PURES — fonctions (world) → issues —
//      testées sans base dans test/author-consistency.test.js.
//
// Ajouter une règle = ajouter une entrée à RULES. Chaque problème porte une
// `key` stable : l'ignorer (author_issue_dismissals) survit aux recalculs et ne
// touche à aucune donnée. Aucune règle ne modifie quoi que ce soit.

// ── Index de texte ──────────────────────────────────────────────────────────
// Chercher chaque nom dans chaque chapitre par expression régulière serait
// quadratique (éléments × chapitres × taille du texte). On normalise chaque
// chapitre une fois et on garde l'ensemble de ses mots : un nom d'un seul mot
// est un test d'appartenance ; un nom composé (« Jean-Luc », « Port Brume »)
// passe par includes() puis une vérification de frontières de mots.

const SPLIT_RE = /[^\p{L}\p{N}]+/u;
const NAME_SPLIT_RE = /[^\p{L}\p{N}]/u;

export function indexText(text) {
  const norm = normalize(text);
  return { norm, words: new Set(norm.split(SPLIT_RE).filter(Boolean)) };
}

const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);

export function mentions(index, name) {
  const n = normalize(name).trim();
  if (n.length < 3) return false;
  if (!NAME_SPLIT_RE.test(n)) return index.words.has(n);
  let from = 0;
  for (;;) {
    const at = index.norm.indexOf(n, from);
    if (at < 0) return false;
    if (!isWordChar(index.norm[at - 1]) && !isWordChar(index.norm[at + n.length])) return true;
    from = at + 1;
  }
}

// ── Règles ──────────────────────────────────────────────────────────────────

const byId = (list) => new Map(list.map((x) => [x.id, x]));
const chapterLabel = (c) => (c.number ? `ch. ${c.number}` : c.title);

// Noms sous lesquels un élément apparaît dans le texte (hors anciens noms).
export function namesOf(e) {
  const names = [e.title, e.firstName, e.nickname, ...(e.aliases || []).filter((a) => a.kind === 'alias').map((a) => a.alias)];
  return [...new Set(names.filter((s) => s && normalize(s).trim().length >= 3))];
}

function linkedPairs(links, kind, kindA, kindB, entities) {
  // Relations `kind` entre un élément de type A et un de type B, quel que soit
  // le sens dans lequel elles ont été saisies → [[idA, idB], …].
  const out = [];
  for (const l of links) {
    if (l.kind !== kind) continue;
    const f = entities.get(l.from);
    const t = entities.get(l.to);
    if (!f || !t) continue;
    if (f.kind === kindA && t.kind === kindB) out.push([f.id, t.id]);
    else if (f.kind === kindB && t.kind === kindA) out.push([t.id, f.id]);
  }
  return out;
}

export const RULES = [
  {
    id: 'ancien_nom',
    label: 'Ancien nom encore utilisé',
    run(world) {
      const issues = [];
      for (const e of world.entities) {
        for (const a of e.aliases || []) {
          if (a.kind !== 'ancien_nom' || normalize(a.alias) === normalize(e.title)) continue;
          const hits = world.chapters.filter((c) => mentions(c.index, a.alias));
          if (hits.length === 0) continue;
          issues.push({
            key: `ancien_nom:${e.id}:${normalize(a.alias)}`,
            severity: 'warning',
            title: `« ${a.alias} », ancien nom de ${e.title}, apparaît encore`,
            detail: `Dans : ${hits.map(chapterLabel).join(', ')}.`,
            entityIds: [e.id, ...hits.map((c) => c.id)],
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'apparition_anticipee',
    label: 'Personnage nommé avant sa première apparition',
    run(world) {
      const ents = byId(world.entities);
      const chapters = byId(world.chapters);
      const issues = [];
      const appearances = new Map();
      for (const [charId, chapId] of linkedPairs(world.links, 'apparait_dans', 'character', 'chapter', ents)) {
        const ch = chapters.get(chapId);
        if (!ch?.number) continue;
        appearances.set(charId, Math.min(appearances.get(charId) ?? Infinity, ch.number));
      }
      for (const [charId, first] of appearances) {
        const c = ents.get(charId);
        const names = namesOf(c);
        const early = world.chapters.filter((ch) => ch.number && ch.number < first && names.some((n) => mentions(ch.index, n)));
        if (early.length === 0) continue;
        issues.push({
          key: `apparition_anticipee:${charId}`,
          severity: 'warning',
          title: `${c.title} est nommé avant sa première apparition (ch. ${first})`,
          detail: `Mentionné dans : ${early.map(chapterLabel).join(', ')}.`,
          entityIds: [charId, ...early.map((ch) => ch.id)],
        });
      }
      return issues;
    },
  },
  {
    id: 'ubiquite',
    label: 'Personnage à deux endroits au même moment',
    run(world) {
      const ents = byId(world.entities);
      const events = byId(world.events);
      // Lieux englobants via « situé dans » : un événement à Port Brume et un
      // autre « dans le royaume » qui contient Port Brume ne s'excluent pas.
      const parents = new Map();
      for (const [child, parent] of linkedPairs(world.links, 'situe_dans', 'place', 'place', ents)) {
        if (!parents.has(child)) parents.set(child, []);
        parents.get(child).push(parent);
      }
      const ancestors = (id) => {
        const seen = new Set([id]);
        const stack = [id];
        while (stack.length) for (const p of parents.get(stack.pop()) || []) if (!seen.has(p)) { seen.add(p); stack.push(p); }
        return seen;
      };
      const compatible = (a, b) => ancestors(a).has(b) || ancestors(b).has(a);
      const placesOf = new Map();
      for (const [evId, placeId] of linkedPairs(world.links, 'se_deroule_a', 'event', 'place', ents)) {
        if (!placesOf.has(evId)) placesOf.set(evId, []);
        placesOf.get(evId).push(placeId);
      }
      const eventsOf = new Map();
      for (const [charId, evId] of linkedPairs(world.links, 'participe_a', 'character', 'event', ents)) {
        if (!eventsOf.has(charId)) eventsOf.set(charId, []);
        eventsOf.get(charId).push(evId);
      }
      const issues = [];
      for (const [charId, evIds] of eventsOf) {
        const dated = [...new Set(evIds)].map((id) => events.get(id)).filter((e) => e && e.sortKey !== null && placesOf.has(e.id));
        for (let i = 0; i < dated.length; i += 1) {
          for (let j = i + 1; j < dated.length; j += 1) {
            const a = dated[i];
            const b = dated[j];
            const overlap = a.sortKey <= (b.endSortKey ?? b.sortKey) && b.sortKey <= (a.endSortKey ?? a.sortKey);
            if (!overlap) continue;
            const ok = placesOf.get(a.id).some((pa) => placesOf.get(b.id).some((pb) => compatible(pa, pb)));
            if (ok) continue;
            const [x, y] = a.id < b.id ? [a, b] : [b, a];
            issues.push({
              key: `ubiquite:${charId}:${x.id}:${y.id}`,
              severity: 'warning',
              title: `${ents.get(charId).title} est à deux endroits au même moment`,
              detail: `« ${x.title} » et « ${y.title} » se chevauchent dans le temps mais se déroulent dans des lieux distincts.`,
              entityIds: [charId, x.id, y.id],
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'chronologie',
    label: 'Enchaînement chronologiquement impossible',
    run(world) {
      const ents = byId(world.entities);
      const events = byId(world.events);
      const issues = [];
      for (const l of world.links) {
        if (l.kind !== 'cause' && l.kind !== 'precede') continue;
        const a = events.get(l.from);
        const b = events.get(l.to);
        if (!a || !b || a.sortKey === null || b.sortKey === null) continue;
        const bad = l.kind === 'precede' ? a.sortKey >= b.sortKey : a.sortKey > b.sortKey;
        if (!bad) continue;
        issues.push({
          key: `chronologie:${l.id}`,
          severity: 'error',
          title: `« ${ents.get(a.id).title} » ${l.kind === 'cause' ? 'cause' : 'précède'} « ${ents.get(b.id).title} » mais arrive après`,
          detail: `${a.dateLabel || a.sortKey} → ${b.dateLabel || b.sortKey}.`,
          entityIds: [a.id, b.id],
        });
      }
      for (const e of world.events) {
        if (e.sortKey !== null && e.endSortKey !== null && e.endSortKey < e.sortKey) {
          issues.push({
            key: `fin_avant_debut:${e.id}`,
            severity: 'error',
            title: `« ${e.title} » se termine avant de commencer`,
            detail: `Début ${e.sortKey}, fin ${e.endSortKey}.`,
            entityIds: [e.id],
          });
        }
      }
      return issues;
    },
  },
  {
    id: 'contradiction',
    label: 'Éléments marqués comme contradictoires',
    run(world) {
      const ents = byId(world.entities);
      return world.links.filter((l) => l.kind === 'contredit' && ents.has(l.from) && ents.has(l.to)).map((l) => ({
        key: `contradiction:${l.id}`,
        severity: 'info',
        title: `« ${ents.get(l.from).title} » contredit « ${ents.get(l.to).title} »`,
        detail: l.note || 'Contradiction à trancher.',
        entityIds: [l.from, l.to],
      }));
    },
  },
  {
    id: 'chapitre_vide',
    label: 'Chapitre terminé sans texte',
    run(world) {
      return world.chapters.filter((c) => c.status === 'termine' && c.wordCount === 0).map((c) => ({
        key: `chapitre_vide:${c.id}`,
        severity: 'warning',
        title: `${chapterLabel(c)} « ${c.title} » est marqué terminé mais ne contient aucun texte`,
        detail: '',
        entityIds: [c.id],
      }));
    },
  },
  {
    // Mentions non reliées (à la Obsidian) : un nom présent dans le texte sans
    // relation correspondante. Simple suggestion, avec l'action de lien prête.
    id: 'mention_non_liee',
    label: 'Mention sans relation',
    run(world) {
      const linked = new Set();
      for (const l of world.links) { linked.add(`${l.from}:${l.to}`); linked.add(`${l.to}:${l.from}`); }
      const issues = [];
      for (const e of world.entities) {
        if (!['character', 'place', 'lore'].includes(e.kind)) continue;
        const names = namesOf(e);
        if (names.length === 0) continue;
        const hits = world.chapters.filter((c) => !linked.has(`${e.id}:${c.id}`) && names.some((n) => mentions(c.index, n)));
        if (hits.length === 0) continue;
        issues.push({
          key: `mention_non_liee:${e.id}:${hits.map((c) => c.id).join('-')}`,
          severity: 'info',
          title: `${e.title} est cité sans être relié`,
          detail: `Cité dans : ${hits.map(chapterLabel).join(', ')}.`,
          entityIds: [e.id, ...hits.map((c) => c.id)],
          suggestion: {
            kind: e.kind === 'character' ? 'apparait_dans' : e.kind === 'place' ? 'se_deroule_a' : 'mentionne',
            entityId: e.id,
            chapterIds: hits.map((c) => c.id),
          },
        });
      }
      return issues;
    },
  },
];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

export function runRules(world, rules = RULES) {
  const issues = [];
  for (const rule of rules) {
    for (const issue of rule.run(world)) issues.push({ ...issue, rule: rule.id, ruleLabel: rule.label });
  }
  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ── Lecture de la photographie ──────────────────────────────────────────────

export function loadWorld(projectId) {
  const entities = db.prepare(`
    SELECT e.id, e.kind, e.title, ch.first_name, ch.nickname
    FROM author_entities e LEFT JOIN author_characters ch ON ch.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId).map((r) => ({ id: r.id, kind: r.kind, title: r.title, firstName: r.first_name, nickname: r.nickname, aliases: [] }));
  const ents = byId(entities);
  for (const a of db.prepare(`
    SELECT a.entity_id, a.alias, a.kind FROM author_aliases a JOIN author_entities e ON e.id = a.entity_id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId)) ents.get(a.entity_id)?.aliases.push({ alias: a.alias, kind: a.kind });

  const numbers = chapterNumbers(projectId);
  const chapters = db.prepare(`
    SELECT e.id, e.title, c.status, c.word_count, c.content
    FROM author_entities e JOIN author_chapters c ON c.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId).map((r) => ({
    id: r.id, title: r.title, status: r.status, wordCount: r.word_count,
    number: numbers.get(r.id) ?? null, index: indexText(r.content),
  })).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));

  const events = db.prepare(`
    SELECT e.id, e.title, ev.sort_key, ev.end_sort_key, ev.timeline_id, ev.date_label
    FROM author_entities e JOIN author_events ev ON ev.entity_id = e.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL
  `).all(projectId).map((r) => ({
    id: r.id, title: r.title, sortKey: r.sort_key, endSortKey: r.end_sort_key, timelineId: r.timeline_id, dateLabel: r.date_label,
  }));

  const links = db.prepare(`SELECT id, from_id, to_id, kind, note FROM author_links WHERE project_id = ?`).all(projectId)
    .filter((l) => ents.has(l.from_id) && ents.has(l.to_id))
    .map((l) => ({ id: l.id, from: l.from_id, to: l.to_id, kind: l.kind, note: l.note }));

  return { entities, chapters, events, links };
}

// Mémo par projet : recalculé seulement quand quelque chose a bougé (dernière
// modification, nombre d'éléments, de relations, de problèmes ignorés).
const memo = new Map();

function versionKey(projectId) {
  const r = db.prepare(`
    SELECT
      (SELECT COALESCE(MAX(updated_at), 0) || ':' || COUNT(*) || ':' || COALESCE(SUM(deleted_at IS NOT NULL), 0)
         FROM author_entities WHERE project_id = ?) AS e,
      (SELECT COUNT(*) || ':' || COALESCE(MAX(id), 0) FROM author_links WHERE project_id = ?) AS l,
      (SELECT COUNT(*) FROM author_issue_dismissals WHERE project_id = ?) AS d,
      (SELECT COALESCE(MAX(updated_at), 0) || ':' || COUNT(*) FROM author_acts WHERE project_id = ?) AS a
  `).get(projectId, projectId, projectId, projectId);
  return `${r.e}|${r.l}|${r.d}|${r.a}`;
}

export function checkProject(projectId) {
  const key = versionKey(projectId);
  const hit = memo.get(projectId);
  if (hit && hit.key === key) return hit.result;
  const dismissed = new Set(db.prepare(`SELECT issue_key FROM author_issue_dismissals WHERE project_id = ?`).all(projectId).map((r) => r.issue_key));
  const all = runRules(loadWorld(projectId));
  const result = {
    issues: all.filter((i) => !dismissed.has(i.key)),
    dismissed: all.filter((i) => dismissed.has(i.key)),
    rules: RULES.map((r) => ({ id: r.id, label: r.label })),
  };
  memo.set(projectId, { key, result });
  return result;
}

// Gestes qui changent le résultat sans toucher aux dates de modification
// (réordonner le plan, ignorer un problème) : on jette le mémo.
export function invalidateConsistency(projectId) {
  memo.delete(projectId);
}

export function dismissIssue(projectId, key, value) {
  memo.delete(projectId);
  if (value) db.prepare(`INSERT OR IGNORE INTO author_issue_dismissals (project_id, issue_key) VALUES (?, ?)`).run(projectId, key);
  else db.prepare(`DELETE FROM author_issue_dismissals WHERE project_id = ? AND issue_key = ?`).run(projectId, key);
}

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import { UPLOADS_DIR, safeUnlink, uploadAuthorImage } from '../uploads.js';
import {
  isAuthor, requireAuthor, requireAuthorAccess, requireAuthorHeader, resolveAuthorAccess, sharedProjectsFor,
} from '../author/access.js';
import {
  applyBoardOps, createBoard, deleteBoard, getBoard, listBoards, setBoardView, updateBoardMeta,
} from '../author/boards.js';
import { checkProject, dismissIssue, invalidateConsistency } from '../author/consistency.js';
import {
  createEntity, entityIndex, getEntity, liveEntity, listEntities, markVisited, moveEvent, purgeEntity,
  reorderNotes, restoreEntity, searchEntities, setFavorite, trashEntity, updateEntity,
} from '../author/entities.js';
import { GUEST_KINDS, KINDS, NOTE_STATUSES, REVISION_FIELDS, own } from '../author/enums.js';
import { exportManuscript, exportProject } from '../author/export.js';
import {
  deleteMedia, insertMedia, listProjectMedia, mediaFileOwned, processAuthorImage, updateMedia,
} from '../author/media.js';
import { overview } from '../author/overview.js';
import {
  createLink, createTag, deleteLink, deleteTag, graphData, listTags, updateLink, updateTag,
} from '../author/relations.js';
import { getRevision, insertRevision, listRevisions } from '../author/revisions.js';
import {
  commentCounts, createComment, deleteComment, deleteShare, guestBoard, guestBoards, guestEntity, guestList,
  guestOverview, guestPins, guestProject, guestTags, hiddenNames, listComments, listShares, mediaFileShared,
  readerChapter, readerChapters, scrubSnippet, scrubWikiLinks, setChapterValidation, updateComment, updateShare,
  upsertShare,
} from '../author/sharing.js';
import {
  createAct, createBeat, createCategory, createPin, createProject, createTask, createTimeline,
  deleteAct, deleteBeat, deleteCategory, deletePin, deleteProject, deleteTask, deleteTimeline,
  getPlan, listCategories, listPins, listProjects, listTasks, listTimelines, projectFromRow,
  reorderTasks, savePlan, touchProject, updateAct, updateBeat, updateCategory, updatePin,
  updateProject, updateTask, updateTimeline,
} from '../author/structure.js';
import { AuthorValidationError, cleanText } from '../author/validate.js';

// Atelier d'auteur (« cerveau d'auteur ») — API privée du propriétaire, et
// lecture partagée pour ses invités.
//
// TOUT est derrière : requireAuth (cookie de session) → requireAuthorAccess
// (propriétaire = rôle admin + drapeau can_author sans outrepassement, OU
// compte invité avec un partage actif) → en-tête anti-CSRF sur les écritures
// → et, pour les données, resolveAuthorAccess (propriétaire du projet, ou
// partage sur CE projet, sinon 404). Le propriétaire est servi par le routeur
// `p`, les invités par le routeur `g` — deux routeurs distincts : une requête
// invitée n'atteint jamais un gestionnaire d'écriture du contenu. Aucune route
// publique, aucun fichier servi en statique. Cf. docs/atelier-auteur.md.

export const authorRouter = Router();

authorRouter.use(requireAuth, requireAuthorAccess, requireAuthorHeader);

// Limiteurs propres en plus du global /api/* (600/min). L'autosave de
// l'éditeur et du tableau blanc écrit souvent : plafond large mais fini.
const writeLimiter = rateLimit({
  windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited' },
});
const uploadLimiter = rateLimit({
  windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited' },
});
authorRouter.use((req, res, next) => (req.method === 'GET' ? next() : writeLimiter(req, res, next)));

// ── Petits utilitaires ──────────────────────────────────────────────────────

const idOf = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : -1; // -1 → aucune ligne → 404 propre
};

// Erreur de validation → 422 explicite (code + champ fautif) ; le reste part
// au gestionnaire d'erreurs global (500 générique, rien de divulgué).
const h = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof AuthorValidationError) {
      if (!res.headersSent) res.status(422).json({ error: err.code, field: err.field });
      return;
    }
    next(err);
  }
};

const notFound = (res) => res.status(404).json({ error: 'not_found' });

// ── Fichiers médias ─────────────────────────────────────────────────────────
// Double défense : nom de fichier contraint (pas de traversée) ET connu en base
// dans un projet de l'appelant. Cache privé (jamais partagé par un proxy).
authorRouter.get('/media/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^[\w-]+\.webp$/.test(filename)) return res.status(400).end();
  const allowed = (isAuthor(req.user) && mediaFileOwned(filename, req.user.id)) || mediaFileShared(filename, req.user.id);
  if (!allowed) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  return res.sendFile(filename, { root: UPLOADS_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

// ── Projets ─────────────────────────────────────────────────────────────────

// Les livres du propriétaire, puis ceux qu'on a partagés avec l'appelant.
authorRouter.get('/projects', (req, res) => {
  const own = isAuthor(req.user) ? listProjects(req.user.id).map((p) => ({ ...p, access: 'owner' })) : [];
  const shared = sharedProjectsFor(req.user.id).map((r) => ({
    id: r.id, title: r.title, subtitle: r.subtitle, color: r.color, access: r.share_role, ownerName: r.owner_name,
  }));
  res.json([...own, ...shared]);
});

authorRouter.post('/projects', requireAuthor, h((req, res) => {
  res.status(201).json(createProject(req.user.id, req.body || {}));
}));

const p = Router({ mergeParams: true }); // propriétaire
const g = Router({ mergeParams: true }); // invités (omniscient, lecteur)
authorRouter.use('/projects/:pid', resolveAuthorAccess, (req, res, next) => (req.access === 'owner' ? p : g)(req, res, next));

// Toute écriture réussie rafraîchit la date du projet (tri « récents »).
p.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => { if (res.statusCode < 300) touchProject(req.project.id); });
  }
  next();
});

p.get('/', (req, res) => res.json({ ...projectFromRow(req.project), access: 'owner' }));

p.put('/', h((req, res) => res.json(updateProject(req.project.id, req.body || {}))));

// Suppression d'un livre entier : le titre exact doit être retapé, côté
// serveur aussi — un clic égaré ou un appel forgé ne suffit pas.
p.delete('/', h((req, res) => {
  if (String(req.body?.confirmTitle ?? '') !== req.project.title) {
    return res.status(400).json({ error: 'confirmation_mismatch' });
  }
  deleteProject(req.project.id);
  return res.status(204).end();
}));

p.get('/overview', (req, res) => {
  let issueCount = null;
  try { issueCount = checkProject(req.project.id).issues.length; } catch { /* le tableau de bord reste servi */ }
  res.json({ ...overview(projectFromRow(req.project), { issueCount }), comments: commentCounts(req.project.id) });
});

// ── Éléments ────────────────────────────────────────────────────────────────

function listQuery(q) {
  const opts = {
    kind: KINDS.includes(q.kind) ? q.kind : undefined,
    q: q.q ? String(q.q).slice(0, 200) : undefined,
    tagId: q.tag ? idOf(q.tag) : undefined,
    favorite: q.favorite === '1',
    status: q.status ? String(q.status) : undefined,
    sort: q.sort ? String(q.sort) : undefined,
    limit: q.limit,
    offset: q.offset,
    trashed: q.trashed === '1',
  };
  if (q.kinds) opts.kinds = String(q.kinds).split(',');
  if (q.category !== undefined) opts.categoryId = q.category === 'none' ? null : idOf(q.category);
  if (q.timeline !== undefined) opts.timelineId = q.timeline === 'none' ? null : idOf(q.timeline);
  if (q.inbox !== undefined) opts.inbox = q.inbox === '1';
  return opts;
}

p.get('/entities', (req, res) => res.json(listEntities(req.project.id, listQuery(req.query))));

p.get('/index', (req, res) => res.json(entityIndex(req.project.id)));

p.post('/entities', h((req, res) => {
  const body = req.body || {};
  res.status(201).json(createEntity(req.project.id, String(body.kind || ''), body));
}));

p.get('/entities/:id', (req, res) => {
  const ent = getEntity(req.project.id, idOf(req.params.id), { withDeleted: req.query.trashed === '1' });
  return ent ? res.json(ent) : notFound(res);
});

// PUT partiel sous révision : 409 + état serveur si la fiche a bougé ailleurs.
// `force: true` n'est envoyé qu'après un choix explicite (« Écraser ») dans la
// modale de conflit.
p.put('/entities/:id', h((req, res) => {
  const body = req.body || {};
  const force = body.force === true;
  if (!force && !Number.isInteger(Number(body.revision))) return res.status(400).json({ error: 'missing_revision' });
  const result = updateEntity(req.project.id, idOf(req.params.id), body, { force });
  if (result.notFound) return notFound(res);
  if (result.conflict) return res.status(409).json(result.conflict);
  invalidateConsistency(req.project.id);
  return res.json(result.entity);
}));

// Supprimer = mettre à la corbeille (restaurable). La purge est un second geste.
p.delete('/entities/:id', (req, res) => (trashEntity(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));
p.post('/entities/:id/restore', (req, res) => (restoreEntity(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));
p.delete('/entities/:id/purge', (req, res) => (purgeEntity(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// Ouvrir un chapitre « terminé » au rôle lecteur (ou le retirer). Geste
// structurel : pas de révision. Quitter « terminé » retire la validation
// (déclencheur SQL, cf. schema.js).
p.put('/entities/:id/validation', h((req, res) => {
  if (typeof req.body?.value !== 'boolean') return res.status(422).json({ error: 'invalid_type', field: 'value' });
  const out = setChapterValidation(req.project.id, idOf(req.params.id), req.body.value);
  return out.notFound ? notFound(res) : res.json(out);
}));

p.post('/entities/:id/visit', (req, res) => (markVisited(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));
p.put('/entities/:id/favorite', (req, res) => (
  setFavorite(req.project.id, idOf(req.params.id), req.body?.value === true) ? res.status(204).end() : notFound(res)
));

// ── Historique ──────────────────────────────────────────────────────────────

function revisableField(entity, field) {
  const scope = own(REVISION_FIELDS, field);
  return !!scope && (scope === '*' || scope === entity.kind);
}

p.get('/entities/:id/revisions', (req, res) => {
  const ent = liveEntity(req.project.id, req.params.id);
  if (!ent) return notFound(res);
  return res.json(listRevisions(ent.id, req.query.field ? String(req.query.field) : null));
});

p.get('/entities/:id/revisions/:rid', (req, res) => {
  const ent = liveEntity(req.project.id, req.params.id);
  const rev = ent && getRevision(ent.id, idOf(req.params.rid));
  return rev ? res.json(rev) : notFound(res);
});

// Snapshot manuel. `body` fourni = conserver une version qui n'est pas celle du
// serveur (la version locale perdante d'un conflit, par exemple).
p.post('/entities/:id/revisions', h((req, res) => {
  const ent = getEntity(req.project.id, idOf(req.params.id));
  if (!ent) return notFound(res);
  const field = String(req.body?.field || (ent.kind === 'chapter' ? 'content' : 'body'));
  if (!revisableField(ent, field)) return res.status(422).json({ error: 'invalid_field', field: 'field' });
  const label = cleanText(req.body?.label, 120, 'label', { trim: true }) || 'Snapshot manuel';
  const body = req.body?.body !== undefined ? cleanText(req.body.body, 900_000, 'body') : String(ent[field] ?? '');
  const id = insertRevision(ent.id, field, body, { label, manual: true });
  return res.status(201).json(getRevision(ent.id, Number(id)));
}));

// Restaurer = la version actuelle part d'abord en snapshot (« Avant
// restauration »), puis la version choisie est réécrite. Rien n'est perdu.
p.post('/entities/:id/revisions/:rid/restore', h((req, res) => {
  const ent = getEntity(req.project.id, idOf(req.params.id));
  const rev = ent && getRevision(ent.id, idOf(req.params.rid));
  if (!rev) return notFound(res);
  const current = String(ent[rev.field] ?? '');
  if (current.trim() && current !== rev.body) {
    insertRevision(ent.id, rev.field, current, { label: 'Avant restauration', manual: true });
  }
  const result = updateEntity(req.project.id, ent.id, { [rev.field]: rev.body }, { force: true, skipSnapshot: true });
  invalidateConsistency(req.project.id);
  return res.json(result.entity);
}));

// ── Brainstorming ───────────────────────────────────────────────────────────

// Capture éclair : une ligne suffit. Première ligne → titre, le reste → corps ;
// l'idée atterrit dans l'inbox, à classer plus tard.
p.post('/notes/quick', h((req, res) => {
  const text = cleanText(req.body?.text, 100_000, 'text', { trim: true, required: true });
  const [first, ...rest] = text.split('\n');
  let title = first.trim();
  let body = rest.join('\n').trim();
  if (title.length > 120) {
    const cut = title.slice(0, 120);
    title = `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
    body = text;
  }
  const note = createEntity(req.project.id, 'note', {
    title, body, inbox: true, status: 'brute', tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
  });
  res.status(201).json(note);
}));

p.put('/notes/order', h((req, res) => {
  const status = String(req.body?.status || '');
  if (!NOTE_STATUSES.includes(status)) return res.status(422).json({ error: 'invalid_value', field: 'status' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(idOf) : null;
  if (!ids || ids.length > 5000) return res.status(422).json({ error: 'invalid_ids', field: 'ids' });
  reorderNotes(req.project.id, status, ids, { inbox: req.body?.inbox === true });
  return res.status(204).end();
}));

p.put('/events/:id/move', h((req, res) => {
  const ok = moveEvent(req.project.id, idOf(req.params.id), req.body || {});
  if (!ok) return notFound(res);
  invalidateConsistency(req.project.id);
  return res.json(getEntity(req.project.id, idOf(req.params.id)));
}));

// ── Recherche, graphe ───────────────────────────────────────────────────────

p.get('/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 200);
  const kinds = req.query.kinds ? String(req.query.kinds).split(',') : [];
  res.json(searchEntities(req.project.id, q, {
    kinds, tagId: req.query.tag ? idOf(req.query.tag) : null, limit: req.query.limit,
  }));
});

p.get('/graph', (req, res) => {
  const kinds = req.query.kinds ? String(req.query.kinds).split(',').filter((k) => KINDS.includes(k)) : null;
  res.json(graphData(req.project.id, { kinds }));
});

// ── Relations ───────────────────────────────────────────────────────────────

p.post('/links', h((req, res) => {
  const { link, existed } = createLink(req.project.id, req.body || {});
  invalidateConsistency(req.project.id);
  res.status(existed ? 200 : 201).json(link);
}));

p.put('/links/:id', h((req, res) => {
  const link = updateLink(req.project.id, idOf(req.params.id), req.body || {});
  invalidateConsistency(req.project.id);
  return link ? res.json(link) : notFound(res);
}));

p.delete('/links/:id', (req, res) => {
  invalidateConsistency(req.project.id);
  return deleteLink(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res);
});

// ── Tags ────────────────────────────────────────────────────────────────────

p.get('/tags', (req, res) => res.json(listTags(req.project.id)));
p.post('/tags', h((req, res) => {
  const tag = createTag(req.project.id, req.body || {});
  return tag ? res.status(201).json(tag) : res.status(409).json({ error: 'tag_exists' });
}));
p.put('/tags/:id', h((req, res) => {
  const out = updateTag(req.project.id, idOf(req.params.id), req.body || {});
  return out ? res.json(out) : notFound(res);
}));
p.delete('/tags/:id', (req, res) => (deleteTag(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// ── Catégories & lignes de temps ────────────────────────────────────────────

p.get('/categories', (req, res) => res.json(listCategories(req.project.id)));
p.post('/categories', h((req, res) => {
  const cat = createCategory(req.project.id, req.body || {});
  return cat ? res.status(201).json(cat) : res.status(409).json({ error: 'category_exists' });
}));
p.put('/categories/:id', h((req, res) => {
  const cat = updateCategory(req.project.id, idOf(req.params.id), req.body || {});
  if (cat === undefined) return notFound(res);
  return cat ? res.json(cat) : res.status(409).json({ error: 'category_exists' });
}));
p.delete('/categories/:id', (req, res) => (deleteCategory(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

p.get('/timelines', (req, res) => res.json(listTimelines(req.project.id)));
p.post('/timelines', h((req, res) => res.status(201).json(createTimeline(req.project.id, req.body || {}))));
p.put('/timelines/:id', h((req, res) => {
  const tl = updateTimeline(req.project.id, idOf(req.params.id), req.body || {});
  return tl ? res.json(tl) : notFound(res);
}));
p.delete('/timelines/:id', (req, res) => (deleteTimeline(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// ── Plan : actes, moments forts, ordre des chapitres ───────────────────────

p.get('/plan', (req, res) => res.json(getPlan(req.project.id)));
p.put('/plan', h((req, res) => {
  const plan = savePlan(req.project.id, req.body || {});
  invalidateConsistency(req.project.id);
  res.json(plan);
}));

p.post('/acts', h((req, res) => res.status(201).json(createAct(req.project.id, req.body || {}))));
p.put('/acts/:id', h((req, res) => {
  const act = updateAct(req.project.id, idOf(req.params.id), req.body || {});
  return act ? res.json(act) : notFound(res);
}));
p.delete('/acts/:id', (req, res) => {
  invalidateConsistency(req.project.id);
  return deleteAct(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res);
});

p.post('/beats', h((req, res) => res.status(201).json(createBeat(req.project.id, req.body || {}))));
p.put('/beats/:id', h((req, res) => {
  const beat = updateBeat(req.project.id, idOf(req.params.id), req.body || {});
  return beat ? res.json(beat) : notFound(res);
}));
p.delete('/beats/:id', (req, res) => (deleteBeat(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// ── Tâches ──────────────────────────────────────────────────────────────────

p.get('/tasks', (req, res) => {
  const done = req.query.done === undefined ? undefined : req.query.done === '1';
  res.json(listTasks(req.project.id, { done }));
});
p.post('/tasks', h((req, res) => res.status(201).json(createTask(req.project.id, req.body || {}))));
p.put('/tasks/order', h((req, res) => {
  reorderTasks(req.project.id, req.body?.ids);
  res.status(204).end();
}));
p.put('/tasks/:id', h((req, res) => {
  const task = updateTask(req.project.id, idOf(req.params.id), req.body || {});
  return task ? res.json(task) : notFound(res);
}));
p.delete('/tasks/:id', (req, res) => (deleteTask(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// ── Tableaux blancs ─────────────────────────────────────────────────────────

p.get('/boards', (req, res) => res.json(listBoards(req.project.id)));
p.post('/boards', h((req, res) => res.status(201).json(createBoard(req.project.id, req.body || {}))));
p.get('/boards/:id', (req, res) => {
  const board = getBoard(req.project.id, idOf(req.params.id));
  return board ? res.json(board) : notFound(res);
});
p.put('/boards/:id', h((req, res) => {
  const board = updateBoardMeta(req.project.id, idOf(req.params.id), req.body || {});
  return board ? res.json(board) : notFound(res);
}));
p.delete('/boards/:id', (req, res) => (deleteBoard(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));
p.post('/boards/:id/ops', h((req, res) => {
  const result = applyBoardOps(req.project.id, idOf(req.params.id), req.body?.baseRevision, req.body?.ops);
  if (result.notFound) return notFound(res);
  if (result.conflict) return res.status(409).json(result.conflict);
  return res.json(result);
}));
p.put('/boards/:id/view', h((req, res) => (
  setBoardView(req.project.id, idOf(req.params.id), req.body || {}) ? res.status(204).end() : notFound(res)
)));

// ── Médias ──────────────────────────────────────────────────────────────────

p.get('/media', (req, res) => res.json(listProjectMedia(req.project.id)));

p.post('/media', uploadLimiter, uploadAuthorImage.single('image'), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const purpose = ['gallery', 'cover', 'map', 'board'].includes(req.body?.purpose) ? req.body.purpose : 'gallery';
  const entityId = req.body?.entityId ? idOf(req.body.entityId) : null;
  if (entityId && !liveEntity(req.project.id, entityId)) {
    safeUnlink(req.file.filename);
    return notFound(res);
  }
  const processed = await processAuthorImage(req.file);
  if (!processed) return res.status(415).json({ error: 'not_an_image' });
  try {
    return res.status(201).json(insertMedia(req.project.id, processed, {
      entityId, purpose, originalName: req.file.originalname || '', caption: req.body?.caption || '',
    }));
  } catch (err) {
    safeUnlink(processed.filename);
    safeUnlink(processed.thumbFilename);
    throw err;
  }
}));

p.put('/media/:id', h((req, res) => {
  const media = updateMedia(req.project.id, idOf(req.params.id), req.body || {});
  return media ? res.json(media) : notFound(res);
}));
p.delete('/media/:id', (req, res) => (deleteMedia(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// ── Cartes : épingles cliquables sur l'image d'un lieu ─────────────────────

p.get('/places/:id/pins', (req, res) => res.json(listPins(req.project.id, idOf(req.params.id))));
p.post('/places/:id/pins', h((req, res) => {
  const pin = createPin(req.project.id, idOf(req.params.id), req.body || {});
  return pin ? res.status(201).json(pin) : notFound(res);
}));
p.put('/pins/:id', h((req, res) => {
  const pin = updatePin(req.project.id, idOf(req.params.id), req.body || {});
  return pin ? res.json(pin) : notFound(res);
}));
p.delete('/pins/:id', (req, res) => (deletePin(req.project.id, idOf(req.params.id)) ? res.status(204).end() : notFound(res)));

// ── Cohérence ───────────────────────────────────────────────────────────────

p.get('/consistency', (req, res) => res.json(checkProject(req.project.id)));
p.post('/consistency/dismiss', h((req, res) => {
  const key = cleanText(req.body?.key, 400, 'key', { trim: true, required: true });
  dismissIssue(req.project.id, key, req.body?.value !== false);
  res.status(204).end();
}));

// ── Corbeille & exports ─────────────────────────────────────────────────────

p.get('/trash', (req, res) => res.json(listEntities(req.project.id, { trashed: true, sort: 'updated', limit: 500 })));

const fileSlug = (s) => String(s || 'livre').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'livre';

p.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="${fileSlug(req.project.title)}-sauvegarde.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.json(exportProject(req.project.id));
});

p.get('/export/manuscript', (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileSlug(req.project.title)}-manuscrit.md"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(exportManuscript(req.project.id));
});

// ── Partage (propriétaire) ──────────────────────────────────────────────────

p.get('/shares', (req, res) => res.json(listShares(req.project.id)));
p.post('/shares', h((req, res) => {
  const { share, created } = upsertShare(req.project.id, req.user.id, req.body || {});
  res.status(created ? 201 : 200).json(share);
}));
p.put('/shares/:userId', h((req, res) => {
  const share = updateShare(req.project.id, idOf(req.params.userId), req.body || {});
  return share ? res.json(share) : notFound(res);
}));
p.delete('/shares/:userId', (req, res) => (
  deleteShare(req.project.id, idOf(req.params.userId)) ? res.status(204).end() : notFound(res)
));

// ── Commentaires & liseuse : communs aux deux routeurs ─────────────────────
// `guest` borne tout aux éléments visibles et retire les gestes réservés au
// propriétaire (marquer traité, supprimer le message d'un autre).

function readerRoutes(router) {
  router.get('/reader', (req, res) => res.json(readerChapters(req.project.id)));
  router.get('/reader/:id', (req, res) => {
    const ch = readerChapter(req.project.id, idOf(req.params.id));
    return ch ? res.json(ch) : notFound(res);
  });
}

function commentRoutes(router, { guest }) {
  router.get('/comments', (req, res) => {
    const opts = { guest, viewerId: req.user.id, open: req.query.open === '1', limit: req.query.limit };
    if (req.query.entity !== undefined) {
      const ent = liveEntity(req.project.id, req.query.entity);
      if (!ent || (guest && !GUEST_KINDS.includes(ent.kind))) return notFound(res);
      opts.entityId = ent.id;
    } else if (req.query.general === '1') opts.general = true;
    return res.json(listComments(req.project.id, opts));
  });
  router.post('/comments', h((req, res) => {
    const out = createComment(req.project.id, req.user, req.body || {}, { guest });
    return out.notFound ? notFound(res) : res.status(201).json(out.comment);
  }));
  router.put('/comments/:id', h((req, res) => {
    const out = updateComment(req.project.id, req.user, idOf(req.params.id), req.body || {}, { guest });
    if (out.notFound) return notFound(res);
    if (out.forbidden) return res.status(403).json({ error: 'forbidden' });
    return res.json(out.comment);
  }));
  router.delete('/comments/:id', (req, res) => {
    const out = deleteComment(req.project.id, req.user, idOf(req.params.id), { guest });
    if (out.notFound) return notFound(res);
    if (out.forbidden) return res.status(403).json({ error: 'forbidden' });
    return res.status(204).end();
  });
}

readerRoutes(p); // aperçu « ce que voient les lecteurs »
commentRoutes(p, { guest: false });

// ── Routeur invité ──────────────────────────────────────────────────────────
// Lecture seule, liste blanche : ce qui n'est pas déclaré ici n'existe pas
// pour un invité (404 en lecture, 403 read_only en écriture). Les lectures
// passent toutes par server/author/sharing.js, qui retire la boîte à idées.

g.get('/', (req, res) => res.json(guestProject(req.project, req.access)));
readerRoutes(g);

// Tout ce qui suit : rôle omniscient seulement. Pour un lecteur, ça n'existe pas.
g.use((req, res, next) => (req.access === 'omniscient' ? next() : notFound(res)));

g.get('/overview', (req, res) => res.json(guestOverview(req.project.id)));

g.get('/entities', (req, res) => res.json(guestList(req.project.id, listQuery(req.query))));
g.get('/entities/:id', (req, res) => {
  const ent = guestEntity(req.project.id, idOf(req.params.id));
  return ent ? res.json(ent) : notFound(res);
});
g.get('/index', (req, res) => res.json(entityIndex(req.project.id, { allowKinds: GUEST_KINDS })));

g.get('/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 200);
  const kinds = req.query.kinds ? String(req.query.kinds).split(',') : [];
  const rows = searchEntities(req.project.id, q, {
    kinds, tagId: req.query.tag ? idOf(req.query.tag) : null, limit: req.query.limit, allowKinds: GUEST_KINDS,
  });
  res.json(rows.map((r) => ({ ...r, snippet: scrubSnippet(r.snippet) })));
});

g.get('/graph', (req, res) => {
  const asked = req.query.kinds ? String(req.query.kinds).split(',') : GUEST_KINDS;
  const kinds = asked.filter((k) => GUEST_KINDS.includes(k));
  res.json(kinds.length ? graphData(req.project.id, { kinds }) : { nodes: [], edges: [] });
});

g.get('/tags', (req, res) => res.json(guestTags(req.project.id)));
g.get('/categories', (req, res) => res.json(listCategories(req.project.id)));
g.get('/timelines', (req, res) => res.json(listTimelines(req.project.id)));

g.get('/plan', (req, res) => {
  const plan = getPlan(req.project.id);
  const hidden = hiddenNames(req.project.id);
  const clean = (items) => items.map((it) => ({ ...it, summary: scrubWikiLinks(it.summary, hidden) }));
  res.json({ acts: plan.acts.map((a) => ({ ...a, items: clean(a.items) })), unassigned: clean(plan.unassigned) });
});

g.get('/boards', (req, res) => res.json(guestBoards(req.project.id)));
g.get('/boards/:id', (req, res) => {
  const board = guestBoard(req.project.id, idOf(req.params.id));
  return board ? res.json(board) : notFound(res);
});

g.get('/places/:id/pins', (req, res) => {
  const pins = guestPins(req.project.id, idOf(req.params.id));
  return pins ? res.json(pins) : notFound(res);
});

commentRoutes(g, { guest: true });

g.use((req, res) => (req.method === 'GET'
  ? notFound(res)
  : res.status(403).json({ error: 'read_only' })));

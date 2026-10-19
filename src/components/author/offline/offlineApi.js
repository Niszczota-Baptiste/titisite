import { KINDS } from '../kinds';
import { textStats } from '../text';
import { pick, wireAll } from './fields.js';
import { getNet, isNetworkError } from './net.js';
import { isTempId, newClientRef, newTempId, offlineStore as store } from './store.js';

// Client API de l'atelier pour le PROPRIÉTAIRE, capable de travailler sans
// réseau. Il enveloppe api.author.p(pid) et ne change que ce qui peut se faire
// hors connexion :
//   - créer un élément : sans réseau, il naît sur l'appareil avec un id
//     temporaire (< 0) et part dans la file d'envoi ;
//   - lire / modifier / supprimer un élément temporaire : sur l'appareil ;
//   - capturer une idée : mise en file si le réseau manque.
// Le reste passe tel quel (lectures servies au besoin par le service worker ;
// les gestes structurels — relations, plan, tableaux, images — attendent le
// réseau et le disent).

function offlineError(code = 'local_pending') {
  const err = new Error(code);
  err.status = 0;
  return err;
}

// Valeur par défaut d'un champ selon son type (kinds.js) : la fiche d'un
// élément créé hors connexion a la même forme que celle du serveur.
const TYPE_DEFAULT = {
  text: '', area: '', markdown: '', number: null, date: null, category: null, timeline: null,
  chapterStatus: 'idee', noteStatus: 'brute', priority: 0,
};
const KIND_DEFAULTS = { event: { importance: 2 }, note: { inbox: false } };

function defaultsFor(kind) {
  const out = { summary: '', body: '', icon: '', color: '' };
  for (const s of KINDS[kind]?.sections || []) {
    for (const f of s.fields) out[f.key] = f.type === 'select' ? (f.options?.[1]?.[0] ?? f.options?.[0]?.[0] ?? null) : (TYPE_DEFAULT[f.type] ?? null);
  }
  return { ...out, ...(KIND_DEFAULTS[kind] || {}) };
}

export function localAsEntity(pid, rec) {
  const fields = rec.fields || {};
  const e = {
    ...defaultsFor(rec.kind),
    ...fields,
    id: rec.id,
    projectId: pid,
    kind: rec.kind,
    title: fields.title ?? '',
    tags: fields.tags || [],
    aliases: fields.aliases || [],
    links: [], media: [], tasks: [], boards: [], cover: null, map: null,
    isFavorite: false,
    revision: rec.revision || 1,
    createdAt: Math.floor(rec.createdAt / 1000),
    updatedAt: Math.floor(rec.updatedAt / 1000),
    number: null,
    actId: fields.actId ?? null,
    local: true,
    syncedAs: rec.syncedAs || null,
  };
  if (rec.kind === 'chapter') {
    const stats = textStats(e.content || '');
    e.wordCount = stats.words;
    e.charCount = stats.chars;
    e.contentUpdatedAt = e.updatedAt;
    e.validatedAt = null;
  }
  return e;
}

export function withOffline(P, pid, getUid) {
  const createLocal = (body, clientRef) => {
    const { kind, clientRef: _ignored, ...fields } = body;
    if (!KINDS[kind]) throw offlineError('invalid_kind');
    const now = Date.now();
    const rec = { id: newTempId(), kind, fields: wireAll(fields), createdAt: now, updatedAt: now, revision: 1, clientRef, uid: getUid() };
    if (!store.putLocal(pid, rec)) throw offlineError('local_storage_full');
    store.pushOp({ type: 'create', pid, uid: getUid(), tmpId: rec.id, clientRef });
    return localAsEntity(pid, rec);
  };

  const getLocal = (id) => {
    const rec = store.getLocal(pid, id);
    if (!rec) {
      const err = offlineError('not_found');
      err.status = 404;
      throw err;
    }
    return rec;
  };

  // Modifier un élément temporaire. Déjà synchronisé (l'éditeur n'a pas encore
  // basculé sur l'id réel) : la saisie devient un brouillon de l'élément réel.
  const updateLocal = (id, body) => {
    const rec = getLocal(id);
    const { revision: _r, force: _f, ...patch } = body || {};
    const next = { ...rec, fields: { ...rec.fields, ...patch }, updatedAt: Date.now(), revision: (rec.revision || 1) + 1 };
    if (rec.syncedAs) {
      const map = store.mapped(pid, id);
      const prev = store.readDraft(pid, rec.syncedAs);
      const sent = rec.sentFields || {};
      store.writeDraft(pid, rec.syncedAs, {
        fields: { ...(prev?.fields || {}), ...patch },
        base: { ...pick(sent, Object.keys(patch)), ...(prev?.base || {}) },
        revision: prev?.revision ?? map?.revision ?? 1,
        ts: Date.now(), uid: getUid(), title: next.fields.title, kind: rec.kind,
      });
    }
    if (!store.putLocal(pid, next)) throw offlineError('local_storage_full');
    return localAsEntity(pid, next);
  };

  // « Supprimer » un élément pas encore envoyé = annuler sa création.
  const discardLocal = (id) => {
    const rec = getLocal(id);
    for (const op of store.outbox()) if (op.type === 'create' && op.pid === pid && op.tmpId === rec.id) store.removeOp(op.id);
    store.removeLocal(pid, id);
    store.removeDraft(pid, id);
    return null;
  };

  const tempOnly = (fn) => (id, ...rest) => (isTempId(id) ? Promise.reject(offlineError()) : fn(id, ...rest));

  const entities = {
    ...P.entities,
    get: async (id, params) => (isTempId(id) ? localAsEntity(pid, getLocal(id)) : P.entities.get(id, params)),
    update: async (id, body) => (isTempId(id) ? updateLocal(id, body) : P.entities.update(id, body)),
    remove: async (id) => (isTempId(id) ? discardLocal(id) : P.entities.remove(id)),
    visit: async (id) => (isTempId(id) ? null : P.entities.visit(id)),
    favorite: tempOnly(P.entities.favorite),
    validate: tempOnly(P.entities.validate),
    create: async (body) => {
      const clientRef = body?.clientRef || newClientRef();
      if (getNet().online) {
        try {
          return await P.entities.create({ ...body, clientRef });
        } catch (err) {
          if (!isNetworkError(err)) throw err;
        }
      }
      // Même référence client : si la création était en fait passée avant la
      // coupure, la synchronisation retrouvera l'élément au lieu d'en refaire un.
      return createLocal(body, clientRef);
    },
  };

  const notes = {
    ...P.notes,
    quick: async (text, tags) => {
      const clientRef = newClientRef();
      if (getNet().online) {
        try {
          return await P.notes.quick(text, tags, clientRef);
        } catch (err) {
          if (!isNetworkError(err)) throw err;
        }
      }
      if (!store.pushOp({ type: 'quick', pid, uid: getUid(), payload: { text, tags: tags || [] }, clientRef })) {
        throw offlineError('local_storage_full');
      }
      return { queued: true };
    },
  };

  const revisions = {
    ...P.revisions,
    list: tempOnly(P.revisions.list),
    create: tempOnly(P.revisions.create),
  };

  return { ...P, entities, notes, revisions };
}

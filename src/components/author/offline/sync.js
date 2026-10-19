import { pick, same, wire, wireAll } from './fields.js';
import { mergeDraft } from './merge.js';
import { isNetworkError } from './net.js';

// Synchronisation du travail fait hors connexion. Une passe, dans l'ordre :
//   1. la file d'envoi (créations d'éléments, captures d'idées) — chaque envoi
//      porte sa référence client : un rejeu après une coupure renvoie
//      l'élément déjà créé (pas de doublon) ;
//   2. les brouillons d'éléments existants qu'aucun éditeur n'a ouverts (un
//      éditeur ouvert pousse lui-même les siens), en PUT partiel sous
//      révision : un 409 se fusionne champ par champ (merge.js) ; un champ
//      modifié des deux côtés reste sur l'appareil, marqué « conflit », et
//      s'ouvre dans la modale habituelle quand on rouvre l'élément.
// Au premier échec RÉSEAU la passe s'arrête (on réessaiera) ; un REFUS du
// serveur (validation, élément supprimé, accès retiré) marque l'élément « en
// échec » sans jamais effacer le texte.
//
// `api`, `store`, `isOpen` sont injectés : la fonction se teste sans
// navigateur (test/author-offline.test.js).

export async function runSync({ api, store, uid, isOpen = () => false, onMapped = () => {} }) {
  const report = { created: 0, ideas: 0, saved: 0, conflicts: 0, failed: 0, offline: false };

  for (const op of store.outbox()) {
    if (op.uid !== uid || op.failed) continue;
    try {
      if (op.type === 'quick') {
        await api.quick(op.pid, { ...op.payload, clientRef: op.clientRef });
        store.removeOp(op.id);
        report.ideas += 1;
      } else if (op.type === 'create') {
        const local = store.getLocal(op.pid, op.tmpId);
        if (!local || local.syncedAs) { store.removeOp(op.id); continue; } // annulée ou déjà faite
        const sent = { ...local.fields };
        const created = await api.create(op.pid, { kind: local.kind, ...wireAll(sent), clientRef: op.clientRef });
        // Ce qui a été tapé pendant l'envoi devient un brouillon de l'élément réel.
        const after = store.getLocal(op.pid, op.tmpId) || local;
        const late = {};
        for (const [k, v] of Object.entries(after.fields || {})) if (!same(k, v, sent[k])) late[k] = v;
        if (Object.keys(late).length) {
          store.writeDraft(op.pid, created.id, {
            fields: late, base: pick(created, Object.keys(late)), revision: created.revision,
            ts: Date.now(), uid, title: created.title, kind: created.kind,
          });
        }
        store.setMapped(op.pid, op.tmpId, { id: created.id, revision: created.revision });
        store.putLocal(op.pid, { ...after, syncedAs: created.id, syncedAt: Date.now(), sentFields: sent });
        store.removeOp(op.id);
        onMapped(op.pid, op.tmpId, created);
        report.created += 1;
      }
    } catch (err) {
      if (isNetworkError(err)) { report.offline = true; return report; }
      store.updateOp(op.id, { failed: true, error: err.message || `HTTP ${err.status}` });
      report.failed += 1;
    }
  }

  for (const { pid, id, rec } of store.listDrafts()) {
    if (id <= 0 || (rec.uid && rec.uid !== uid) || rec.conflict || rec.failed || isOpen(pid, id)) continue;
    let draft = rec;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const body = { revision: draft.revision };
      for (const [k, v] of Object.entries(draft.fields)) body[k] = wire(k, v);
      try {
        await api.update(pid, id, body);
        store.removeDraft(pid, id);
        report.saved += 1;
        break;
      } catch (err) {
        if (isNetworkError(err)) { report.offline = true; return report; }
        if (err.status === 409 && err.body?.entity) {
          const server = err.body.entity;
          const { apply, clash } = mergeDraft(draft, server);
          if (clash.length) {
            store.writeDraft(pid, id, { ...draft, conflict: true, conflictKeys: clash });
            report.conflicts += 1;
            break;
          }
          if (Object.keys(apply).length === 0) { store.removeDraft(pid, id); break; }
          draft = { ...draft, fields: apply, base: pick(server, Object.keys(apply)), revision: server.revision };
          store.writeDraft(pid, id, draft);
          continue;
        }
        store.writeDraft(pid, id, { ...draft, failed: true, error: err.message || `HTTP ${err.status}` });
        report.failed += 1;
        break;
      }
    }
  }
  return report;
}

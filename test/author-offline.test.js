import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeDraft } from '../src/components/author/offline/merge.js';
import { makeStore, newTempId } from '../src/components/author/offline/store.js';
import { runSync } from '../src/components/author/offline/sync.js';

// Mode hors connexion de l'atelier d'auteur : fusion des brouillons et passe
// de synchronisation, sans navigateur (stockage en mémoire, API simulée).

function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const offline = () => Object.assign(new Error('offline'), { status: 0, offline: true });
const conflict = (entity) => Object.assign(new Error('conflict'), { status: 409, body: { error: 'conflict', entity } });

// Petit serveur en mémoire : révisions, CAS, références client idempotentes.
function fakeServer() {
  const entities = new Map();
  const refs = new Map();
  let next = 100;
  let down = false;
  const calls = [];
  const guard = () => { if (down) throw offline(); };
  return {
    entities, calls,
    setDown: (v) => { down = v; },
    seed(e) { entities.set(e.id, { revision: 1, ...e }); },
    api: {
      async create(pid, body) {
        guard();
        calls.push(['create', body.title]);
        if (refs.has(body.clientRef)) return entities.get(refs.get(body.clientRef));
        const id = next++;
        const { clientRef, ...fields } = body;
        const e = { id, revision: 1, ...fields };
        entities.set(id, e);
        refs.set(clientRef, id);
        return e;
      },
      async quick(pid, body) {
        guard();
        calls.push(['quick', body.text]);
        if (refs.has(body.clientRef)) return entities.get(refs.get(body.clientRef));
        const id = next++;
        entities.set(id, { id, kind: 'note', title: body.text, revision: 1 });
        refs.set(body.clientRef, id);
        return entities.get(id);
      },
      async update(pid, id, body) {
        guard();
        calls.push(['update', id]);
        const e = entities.get(id);
        if (!e) throw Object.assign(new Error('not_found'), { status: 404 });
        const { revision, ...fields } = body;
        if (revision !== e.revision) throw conflict({ ...e });
        Object.assign(e, fields, { revision: e.revision + 1 });
        return { ...e };
      },
    },
  };
}

describe('hors connexion — fusion des brouillons', () => {
  const server = { id: 1, revision: 5, title: 'Le port', content: 'Version serveur', summary: 'Résumé' };

  it('révision inchangée : tout s\'applique', () => {
    const r = mergeDraft({ revision: 5, fields: { content: 'Ma version' } }, server);
    assert.deepEqual(r, { apply: { content: 'Ma version' }, clash: [] });
  });

  it('serveur modifié ailleurs : un champ intact s\'applique, un champ touché des deux côtés est un conflit', () => {
    const draft = {
      revision: 3,
      fields: { content: 'Ma version', summary: 'Mon résumé' },
      base: { content: 'Version serveur', summary: 'Ancien résumé' },
    };
    const r = mergeDraft(draft, server);
    assert.deepEqual(r.apply, { content: 'Ma version' });
    assert.deepEqual(r.clash, ['summary']);
  });

  it('valeur déjà identique côté serveur : rien à faire ; ancien format sans base : conflit', () => {
    assert.deepEqual(mergeDraft({ revision: 2, fields: { title: 'Le port' } }, server), { apply: {}, clash: [] });
    assert.deepEqual(mergeDraft({ revision: 2, fields: { title: 'Autre' } }, server).clash, ['title']);
  });

  it('les tags se comparent sans tenir compte de la casse ni de l\'ordre', () => {
    const e = { id: 1, revision: 9, tags: [{ name: 'Magie' }, { name: 'acte 1' }] };
    assert.deepEqual(mergeDraft({ revision: 1, fields: { tags: ['Acte 1', 'magie'] } }, e), { apply: {}, clash: [] });
  });
});

describe('hors connexion — synchronisation', () => {
  const uid = 7;
  const pid = 1;

  it('envoie créations, idées et brouillons dans l\'ordre, et fait correspondre les ids', async () => {
    const store = makeStore(memoryStorage());
    const srv = fakeServer();
    srv.seed({ id: 1, kind: 'chapter', title: 'Le port', content: 'Avant' });
    const tmpId = newTempId();
    store.putLocal(pid, { id: tmpId, kind: 'chapter', fields: { title: 'Écrit dans le train', content: 'Hors ligne.' }, createdAt: 1, updatedAt: 1, revision: 1 });
    store.pushOp({ type: 'create', pid, uid, tmpId, clientRef: 'ref-create-0001' });
    store.pushOp({ type: 'quick', pid, uid, payload: { text: 'Une idée', tags: [] }, clientRef: 'ref-quick-0001' });
    store.writeDraft(pid, 1, { fields: { content: 'Après' }, base: { content: 'Avant' }, revision: 1, uid, ts: 2 });

    const mapped = [];
    const report = await runSync({ api: srv.api, store, uid, onMapped: (p, t, e) => mapped.push([t, e.id]) });
    assert.deepEqual(report, { created: 1, ideas: 1, saved: 1, conflicts: 0, failed: 0, offline: false });
    assert.deepEqual(srv.calls.map((c) => c[0]), ['create', 'quick', 'update']);
    assert.equal(srv.entities.get(1).content, 'Après');
    const realId = mapped[0][1];
    assert.equal(store.mapped(pid, tmpId).id, realId);
    assert.equal(store.getLocal(pid, tmpId).syncedAs, realId);
    assert.equal(store.pending(uid).total, 0);
  });

  it('coupure en cours de route : on s\'arrête, rien n\'est perdu, et le rejeu ne duplique rien', async () => {
    const store = makeStore(memoryStorage());
    const srv = fakeServer();
    store.pushOp({ type: 'quick', pid, uid, payload: { text: 'Idée A' }, clientRef: 'ref-quick-000A' });
    store.pushOp({ type: 'quick', pid, uid, payload: { text: 'Idée B' }, clientRef: 'ref-quick-000B' });
    srv.setDown(true);
    const r1 = await runSync({ api: srv.api, store, uid });
    assert.equal(r1.offline, true);
    assert.equal(store.outbox().length, 2);
    // Le serveur a reçu « Idée A » mais la réponse s'est perdue : simulé en
    // rejouant à la main avant la vraie passe.
    srv.setDown(false);
    await srv.api.quick(pid, { text: 'Idée A', clientRef: 'ref-quick-000A' });
    const r2 = await runSync({ api: srv.api, store, uid });
    assert.equal(r2.ideas, 2);
    assert.equal([...srv.entities.values()].filter((e) => e.title === 'Idée A').length, 1);
    assert.equal(store.outbox().length, 0);
  });

  it('modifié ailleurs pendant la coupure : champ intact fusionné, champ en conflit gardé sur l\'appareil', async () => {
    const store = makeStore(memoryStorage());
    const srv = fakeServer();
    srv.seed({ id: 5, kind: 'character', title: 'Élise', summary: 'Ancien', body: 'Corps' });
    store.writeDraft(pid, 5, { fields: { body: 'Corps hors ligne', summary: 'Mien' }, base: { body: 'Corps', summary: 'Ancien' }, revision: 1, uid, ts: 1 });
    // Autre appareil : modifie le résumé.
    await srv.api.update(pid, 5, { revision: 1, summary: 'Leur résumé' });
    const r = await runSync({ api: srv.api, store, uid });
    assert.equal(r.conflicts, 1);
    const d = store.readDraft(pid, 5);
    assert.equal(d.conflict, true);
    assert.deepEqual(d.conflictKeys, ['summary']);
    assert.equal(srv.entities.get(5).summary, 'Leur résumé'); // jamais écrasé en silence
    // Sans conflit (seul le corps) : fusionné et envoyé.
    store.writeDraft(pid, 6, { fields: { body: 'Nouveau' }, base: { body: 'B' }, revision: 1, uid, ts: 1 });
    srv.seed({ id: 6, kind: 'lore', title: 'Magie', body: 'B', summary: 'S' });
    await srv.api.update(pid, 6, { revision: 1, summary: 'S2' });
    const r2 = await runSync({ api: srv.api, store, uid });
    assert.equal(r2.saved, 1);
    assert.equal(srv.entities.get(6).body, 'Nouveau');
    assert.equal(srv.entities.get(6).summary, 'S2');
  });

  it('ne touche ni aux éditeurs ouverts, ni au travail d\'un autre compte ; un refus serveur garde le texte', async () => {
    const store = makeStore(memoryStorage());
    const srv = fakeServer();
    srv.seed({ id: 8, kind: 'note', title: 'x', body: '' });
    store.writeDraft(pid, 8, { fields: { body: 'ouvert' }, revision: 1, uid, ts: 1 });
    store.writeDraft(pid, 9, { fields: { body: 'autre compte' }, revision: 1, uid: 99, ts: 1 });
    store.writeDraft(pid, 404, { fields: { body: 'élément supprimé' }, revision: 1, uid, ts: 1 });
    const r = await runSync({ api: srv.api, store, uid, isOpen: (p, id) => id === 8 });
    assert.equal(r.failed, 1);
    assert.equal(store.readDraft(pid, 8).fields.body, 'ouvert');
    assert.equal(store.readDraft(pid, 9).fields.body, 'autre compte');
    assert.equal(store.readDraft(pid, 404).failed, true);
    assert.equal(store.readDraft(pid, 404).fields.body, 'élément supprimé');
    assert.deepEqual(srv.calls, [['update', 404]]); // seul l'élément introuvable a été tenté
  });

  it('une saisie arrivée pendant la création devient un brouillon de l\'élément réel', async () => {
    const store = makeStore(memoryStorage());
    const srv = fakeServer();
    const tmpId = newTempId();
    store.putLocal(pid, { id: tmpId, kind: 'chapter', fields: { title: 'T', content: 'Début' }, createdAt: 1, updatedAt: 1, revision: 1 });
    store.pushOp({ type: 'create', pid, uid, tmpId, clientRef: 'ref-create-race' });
    const create = srv.api.create;
    srv.api.create = async (p, body) => {
      const e = await create(p, body);
      store.putLocal(pid, { ...store.getLocal(pid, tmpId), fields: { title: 'T', content: 'Début, puis la suite' }, updatedAt: 2 });
      return e;
    };
    // La passe crée l'élément, puis pousse aussitôt la suite comme brouillon.
    const r = await runSync({ api: srv.api, store, uid });
    const realId = store.mapped(pid, tmpId).id;
    assert.deepEqual([r.created, r.saved], [1, 1]);
    assert.equal(srv.entities.get(realId).content, 'Début, puis la suite');
    assert.equal(store.readDraft(pid, realId), null);
    assert.deepEqual(srv.calls.map((c) => c[0]), ['create', 'update']);
  });
});

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { bootServer, fetcher } from './harness.js';

// Partage de l'atelier d'auteur : rôle « omniscient » (tout sauf la boîte à
// idées, commentaires permis) et rôle « lecteur » (chapitres terminés ET
// validés). Le cœur du fichier est un balayage : chaque lecture invitée est
// fouillée à la recherche des marqueurs posés dans une idée privée.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const OMNI = { email: 'omni@test.local', password: 'omnipw1-strong', name: 'Oriane' };
const READER = { email: 'lecteur@test.local', password: 'lecteurpw1-strong', name: 'Louis' };
const STRANGER = { email: 'member@test.local', password: 'memberpw1-strong' };
const wb = (body) => ({ body, headers: { 'X-Author-Request': '1' } });
const W = { headers: { 'X-Author-Request': '1' } };

// Tout ce qui ne doit JAMAIS sortir vers un invité.
const SECRETS = ['SECRETIDEE', 'Le Pacte Secret', 'PACTEALIAS', 'intrigue-cachee', 'TACHE-PRIVEE', 'TABLEAU-PRIVE', 'COMMENT-SUR-IDEE'];

let owner;
let omni;
let reader;
let pid;
const ids = {};
let base;

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

async function login(creds) {
  const f = fetcher(server.base);
  const r = await f.post('/api/auth/login', { body: { email: creds.email, password: creds.password } });
  assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
  return { f, user: r.json.user };
}

async function create(kind, fields) {
  const r = await owner.post(`${base}/entities`, wb({ kind, ...fields }));
  assert.equal(r.status, 201, r.text);
  return r.json;
}

async function upload(entityId, purpose = 'gallery') {
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#335577' } }).png().toBuffer();
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'img.png');
  if (entityId) fd.append('entityId', String(entityId));
  fd.append('purpose', purpose);
  const r = await owner.post(`${base}/media`, { body: fd, headers: { 'X-Author-Request': '1' } });
  assert.equal(r.status, 201, r.text);
  return r.json;
}

function assertNoSecret(label, text) {
  for (const s of SECRETS) assert.ok(!text.includes(s), `${label} laisse fuir « ${s} »`);
}

describe('partage — mise en place', () => {
  it('le propriétaire prépare un livre avec une idée privée reliée partout', async () => {
    ({ f: owner } = await login(ADMIN));
    pid = (await owner.post('/api/author/projects', wb({ title: 'Les Cendres', description: 'Notes de travail' }))).json.id;
    base = `/api/author/projects/${pid}`;

    const note = await create('note', {
      title: 'Le Pacte Secret', body: 'SECRETIDEE : le roi meurt au chapitre 12.', tags: ['intrigue-cachee'],
      aliases: [{ alias: 'PACTEALIAS', kind: 'alias' }],
    });
    ids.note = note.id;
    const elise = await create('character', {
      title: 'Élise Varnier', summary: 'Cartographe.',
      body: 'Elle a signé [[Le Pacte Secret|un pacte]] à [[Valcendre]].', tags: ['protagoniste'],
    });
    ids.elise = elise.id;
    const place = await create('place', { title: 'Valcendre', summary: 'Cité des cendres.' });
    ids.place = place.id;
    ids.ch1 = (await create('chapter', {
      title: 'Prologue', status: 'termine', content: 'Élise relit [[Le Pacte Secret|le pacte]]. Puis [[Élise Varnier|elle]] part.',
    })).id;
    ids.ch2 = (await create('chapter', { title: 'Brouillon', status: 'premier_jet', content: 'BROUILLON-TEXTE' })).id;
    ids.ch3 = (await create('chapter', { title: 'Fini non validé', status: 'termine', content: 'NONVALIDE-TEXTE' })).id;

    assert.equal((await owner.post(`${base}/links`, wb({ fromId: ids.note, toId: ids.elise, kind: 'lie_a' }))).status, 201);
    assert.equal((await owner.post(`${base}/links`, wb({ fromId: ids.elise, toId: ids.place, kind: 'se_trouve_a' }))).status, 201);
    await owner.post(`${base}/tasks`, wb({ title: 'TACHE-PRIVEE', entityId: ids.elise }));

    ids.noteMedia = await upload(ids.note);
    ids.placeMedia = await upload(ids.place);
    ids.boardMedia = await upload(null, 'board'); // posé sur le tableau partagé
    ids.loneMedia = await upload(null, 'board'); //  posé nulle part
    await owner.post(`${base}/places/${ids.place}/pins`, wb({ x: 0.2, y: 0.3, label: 'ici', targetId: ids.note }));
    await owner.post(`${base}/places/${ids.place}/pins`, wb({ x: 0.5, y: 0.5, label: 'maison', targetId: ids.elise }));

    // Tableau partagé (avec une idée, une image d'idée et un texte qui la cite),
    // et tableau privé.
    const shared = (await owner.post(`${base}/boards`, wb({ title: 'Carte des personnages' }))).json;
    ids.boardShared = shared.id;
    const ops = await owner.post(`${base}/boards/${shared.id}/ops`, wb({
      baseRevision: shared.revision,
      ops: [
        { op: 'node', id: 'n1', kind: 'entity', entityId: ids.elise, x: 0, y: 0, w: 200, h: 80 },
        { op: 'node', id: 'n2', kind: 'entity', entityId: ids.note, x: 300, y: 0, w: 200, h: 80 },
        { op: 'node', id: 'n3', kind: 'image', mediaId: ids.noteMedia.id, x: 0, y: 200, w: 120, h: 90 },
        { op: 'node', id: 'n4', kind: 'text', text: 'Voir [[Le Pacte Secret|ça]]', x: 300, y: 200, w: 200, h: 80 },
        { op: 'node', id: 'n5', kind: 'image', mediaId: ids.boardMedia.id, x: 600, y: 200, w: 120, h: 90 },
        { op: 'edge', id: 'e1', from: 'n1', to: 'n2' },
        { op: 'edge', id: 'e2', from: 'n1', to: 'n4' },
      ],
    }));
    assert.equal(ops.status, 200, ops.text);
    assert.equal((await owner.put(`${base}/boards/${shared.id}`, wb({ shared: true }))).json.shared, true);
    ids.boardPrivate = (await owner.post(`${base}/boards`, wb({ title: 'TABLEAU-PRIVE' }))).json.id;

    // Comptes invités : de simples membres, créés par l'administrateur.
    for (const u of [OMNI, READER]) {
      const r = await owner.post('/api/users', { body: { ...u, role: 'member' } });
      assert.equal(r.status, 201, r.text);
      u.id = r.json.id;
    }
  });

  it('sans partage, un membre n\'entre pas', async () => {
    const { f, user } = await login(OMNI);
    assert.equal(user.authorShared, false);
    assert.equal((await f.get('/api/author/projects')).status, 403);
    assert.equal((await f.get(base)).status, 403);
  });

  it('le propriétaire partage par e-mail, avec un rôle valide', async () => {
    assert.equal((await owner.post(`${base}/shares`, wb({ email: 'personne@nulle.part', role: 'lecteur' }))).json.error, 'unknown_user');
    assert.equal((await owner.post(`${base}/shares`, wb({ email: ADMIN.email, role: 'lecteur' }))).json.error, 'self_share');
    assert.equal((await owner.post(`${base}/shares`, wb({ email: OMNI.email, role: 'admin' }))).status, 422);
    assert.equal((await owner.post(`${base}/shares`, wb({ email: OMNI.email, role: 'omniscient' }))).status, 201);
    assert.equal((await owner.post(`${base}/shares`, wb({ email: READER.email.toUpperCase(), role: 'lecteur' }))).status, 201);
    const list = (await owner.get(`${base}/shares`)).json;
    assert.deepEqual(list.map((s) => [s.email, s.role]).sort(), [[READER.email, 'lecteur'], [OMNI.email, 'omniscient']]);
  });
});

describe('partage — rôle omniscient', () => {
  it('voit le livre partagé, sans pouvoir créer de livre', async () => {
    const { f, user } = await login(OMNI);
    omni = f;
    assert.equal(user.canAuthor, false);
    assert.equal(user.authorShared, true);
    const list = (await omni.get('/api/author/projects')).json;
    assert.deepEqual(list.map((p) => [p.id, p.access]), [[pid, 'omniscient']]);
    assert.equal(list[0].ownerName.length > 0, true);
    const proj = (await omni.get(base)).json;
    assert.equal(proj.access, 'omniscient');
    assert.equal(proj.description, 'Notes de travail');
    assert.equal((await omni.post('/api/author/projects', wb({ title: 'x' }))).status, 403);
  });

  it('témoin : le propriétaire, lui, voit bien les marqueurs (le balayage n\'est pas vide)', async () => {
    for (const p of ['/entities', '/search?q=pacte', `/boards/${ids.boardShared}`, `/entities/${ids.elise}`, '/tags']) {
      const text = (await owner.get(`${base}${p}`)).text;
      assert.ok(SECRETS.some((s) => text.includes(s)), `${p} devrait contenir un marqueur côté propriétaire`);
    }
  });

  it('aucune lecture ne laisse fuir la boîte à idées', async () => {
    const paths = [
      '', '/overview', '/entities', '/entities?kind=note', '/entities?kinds=note,character', '/entities?sort=opened',
      `/entities/${ids.elise}`, `/entities/${ids.place}`, `/entities/${ids.ch1}`, '/index',
      '/search?q=pacte', '/search?q=SECRETIDEE', '/search?q=PACTEALIAS', '/search?q=elise', '/search?q=%23intrigue',
      '/graph', '/graph?kinds=note', '/tags', '/categories', '/timelines', '/plan',
      '/boards', `/boards/${ids.boardShared}`, `/places/${ids.place}/pins`, '/comments', '/reader',
    ];
    for (const p of paths) {
      const r = await omni.get(`${base}${p}`);
      assert.equal(r.status, 200, `${p} → ${r.status}`);
      assertNoSecret(p || '/', r.text);
    }
    const elise = (await omni.get(`${base}/entities/${ids.elise}`)).json;
    assert.equal(elise.body, 'Elle a signé un pacte à [[Valcendre]].');
    assert.deepEqual(elise.links.map((l) => l.other.id), [ids.place]);
    assert.equal(elise.tasks, undefined);
    const list = (await omni.get(`${base}/entities?kind=character`)).json.items;
    assert.equal(list.find((e) => e.id === ids.elise).linkCount, 1);
    const board = (await omni.get(`${base}/boards/${ids.boardShared}`)).json;
    assert.deepEqual(board.nodes.map((n) => n.id).sort(), ['n1', 'n4', 'n5']);
    assert.deepEqual(board.edges.map((e) => e.id), ['e2']);
    assert.equal(board.nodes.find((n) => n.id === 'n4').text, 'Voir ça');
    assert.deepEqual((await omni.get(`${base}/boards`)).json.map((b) => [b.id, b.nodeCount]), [[ids.boardShared, 3]]);
    const pins = (await omni.get(`${base}/places/${ids.place}/pins`)).json;
    assert.deepEqual(pins.map((p) => p.label), ['maison']);
    const ov = (await omni.get(`${base}/overview`)).json;
    assert.equal(ov.counts.note, undefined);
    assert.equal(ov.counts.chapter, 3);
  });

  it('une idée, un tableau privé ou un outil du propriétaire répondent 404', async () => {
    for (const p of [
      `/entities/${ids.note}`, `/boards/${ids.boardPrivate}`, `/comments?entity=${ids.note}`,
      `/entities/${ids.elise}/revisions`, '/tasks', '/trash', '/consistency', '/export', '/export/manuscript',
      '/media', '/shares', `/places/${ids.note}/pins`,
    ]) {
      assert.equal((await omni.get(`${base}${p}`)).status, 404, p);
    }
  });

  it('ne reçoit que les images des éléments visibles', async () => {
    assert.equal((await omni.get(ids.placeMedia.url, { raw: true })).status, 200);
    assert.equal((await omni.get(ids.placeMedia.thumbUrl, { raw: true })).status, 200);
    assert.equal((await omni.get(ids.noteMedia.url, { raw: true })).status, 404);
    assert.equal((await omni.get(ids.boardMedia.url, { raw: true })).status, 200);
    assert.equal((await omni.get(ids.loneMedia.url, { raw: true })).status, 404);
    const { f: stranger } = await login(STRANGER);
    assert.equal((await stranger.get(ids.placeMedia.url, { raw: true })).status, 403);
  });

  it('toute écriture du contenu est refusée', async () => {
    const elise = (await owner.get(`${base}/entities/${ids.elise}`)).json;
    const attempts = [
      ['put', '', { title: 'volé' }],
      ['delete', '', { confirmTitle: 'Les Cendres' }],
      ['post', '/entities', { kind: 'character', title: 'Intrus' }],
      ['put', `/entities/${ids.elise}`, { revision: elise.revision, title: 'Renommée' }],
      ['delete', `/entities/${ids.elise}`, {}],
      ['put', `/entities/${ids.elise}/favorite`, { value: true }],
      ['post', '/notes/quick', { text: 'idée' }],
      ['post', '/links', { fromId: ids.elise, toId: ids.place, kind: 'ami' }],
      ['put', '/plan', { columns: [] }],
      ['post', `/boards/${ids.boardShared}/ops`, { baseRevision: 1, ops: [] }],
      ['put', `/boards/${ids.boardShared}`, { shared: false }],
      ['post', '/shares', { email: STRANGER.email, role: 'omniscient' }],
      ['put', `/entities/${ids.ch3}/validation`, { value: true }],
      ['post', '/tasks', { title: 'x' }],
    ];
    for (const [method, p, body] of attempts) {
      const r = await omni[method](`${base}${p}`, wb(body));
      assert.equal(r.status, 403, `${method.toUpperCase()} ${p} → ${r.status}`);
      assert.equal(r.json.error, 'read_only');
    }
    const after = (await owner.get(`${base}/entities/${ids.elise}`)).json;
    assert.equal(after.title, 'Élise Varnier');
    assert.equal(after.revision, elise.revision);
  });

  it('commente une fiche, un passage, le livre ; le propriétaire répond et traite', async () => {
    const c1 = await omni.post(`${base}/comments`, wb({ entityId: ids.elise, body: 'Pourquoi part-elle ?' }));
    assert.equal(c1.status, 201, c1.text);
    assert.equal(c1.json.mine, true);
    assert.equal(c1.json.byOwner, false);
    const c2 = await omni.post(`${base}/comments`, wb({ entityId: ids.ch1, body: 'Joli début', quote: 'Puis elle part.' }));
    assert.equal(c2.json.quote, 'Puis elle part.');
    const c3 = await omni.post(`${base}/comments`, wb({ body: 'Je comprends que le roi est la clé.' }));
    assert.equal(c3.json.entityId, null);
    assert.equal((await omni.post(`${base}/comments`, wb({ entityId: ids.note, body: 'x' }))).status, 404);
    assert.equal((await omni.post(`${base}/comments`, wb({ entityId: ids.elise, body: '  ' }))).status, 422);

    // Le propriétaire commente aussi son idée : l'invité ne doit pas le voir.
    assert.equal((await owner.post(`${base}/comments`, wb({ entityId: ids.note, body: 'COMMENT-SUR-IDEE' }))).status, 201);
    const reply = await owner.post(`${base}/comments`, wb({ entityId: ids.elise, body: 'Elle fuit le pacte.' }));
    assert.equal(reply.json.byOwner, true);

    const thread = (await omni.get(`${base}/comments?entity=${ids.elise}`)).json;
    assert.deepEqual(thread.map((c) => c.body), ['Pourquoi part-elle ?', 'Elle fuit le pacte.']);
    assert.equal(thread[1].byOwner, true);
    assertNoSecret('/comments', (await omni.get(`${base}/comments`)).text);
    assert.equal((await omni.get(`${base}/comments?general=1`)).json.length, 1);

    // « À traiter » côté propriétaire : ses propres messages n'en font pas partie.
    const ov = (await owner.get(`${base}/overview`)).json;
    assert.equal(ov.comments.open, 3);
    assert.equal(ov.comments.total, 5);
    assert.equal((await owner.get(`${base}/comments?open=1`)).json.length, 3);

    // « Traité » : propriétaire seulement. Texte : auteur seulement.
    assert.equal((await omni.put(`${base}/comments/${c1.json.id}`, wb({ resolved: true }))).status, 403);
    const res = await owner.put(`${base}/comments/${c1.json.id}`, wb({ resolved: true }));
    assert.ok(res.json.resolvedAt);
    assert.equal((await owner.put(`${base}/comments/${c1.json.id}`, wb({ body: 'réécrit' }))).status, 403);
    assert.equal((await omni.put(`${base}/comments/${c1.json.id}`, wb({ body: 'Pourquoi part-elle si tôt ?' }))).json.body, 'Pourquoi part-elle si tôt ?');
    assert.equal((await omni.put(`${base}/comments/${reply.json.id}`, wb({ body: 'non' }))).status, 403);
    assert.equal((await omni.delete(`${base}/comments/${reply.json.id}`, W)).status, 403);
    assert.equal((await omni.get(`${base}/comments?open=1`)).json.length, 3);

    assert.equal((await omni.delete(`${base}/comments/${c3.json.id}`, W)).status, 204);
    assert.equal((await owner.delete(`${base}/comments/${c2.json.id}`, W)).status, 204);
    assert.equal((await owner.get(`${base}/comments`)).json.length, 3);
  });
});

describe('partage — rôle lecteur', () => {
  it('ne voit rien tant qu\'aucun chapitre n\'est validé', async () => {
    const { f, user } = await login(READER);
    reader = f;
    assert.equal(user.authorShared, true);
    const proj = (await reader.get(base)).json;
    assert.equal(proj.access, 'lecteur');
    assert.equal(proj.description, undefined);
    assert.deepEqual((await reader.get(`${base}/reader`)).json, []);
  });

  it('valider exige « terminé » ; le lecteur lit alors ce chapitre seul', async () => {
    const bad = await owner.put(`${base}/entities/${ids.ch2}/validation`, wb({ value: true }));
    assert.equal(bad.status, 422);
    assert.equal(bad.json.error, 'not_finished');
    const ok = await owner.put(`${base}/entities/${ids.ch1}/validation`, wb({ value: true }));
    assert.ok(ok.json.validatedAt);
    assert.ok((await owner.get(`${base}/entities/${ids.ch1}`)).json.validatedAt);

    const list = (await reader.get(`${base}/reader`)).json;
    assert.deepEqual(list.map((c) => [c.id, c.number, c.title]), [[ids.ch1, 1, 'Prologue']]);
    const ch = (await reader.get(`${base}/reader/${ids.ch1}`)).json;
    assert.equal(ch.content, 'Élise relit le pacte. Puis elle part.');
    assert.equal(ch.prev, null);
    assert.equal(ch.next, null);
    assertNoSecret('/reader/:id', JSON.stringify(ch));
    for (const id of [ids.ch2, ids.ch3, ids.elise, ids.note]) {
      assert.equal((await reader.get(`${base}/reader/${id}`)).status, 404);
    }
  });

  it('n\'a accès à rien d\'autre', async () => {
    for (const p of ['/overview', '/entities', `/entities/${ids.ch1}`, '/index', '/search?q=elise', '/graph', '/plan',
      '/tags', '/boards', '/comments', `/comments?entity=${ids.ch1}`]) {
      assert.equal((await reader.get(`${base}${p}`)).status, 404, p);
    }
    assert.equal((await reader.post(`${base}/comments`, wb({ entityId: ids.ch1, body: 'x' }))).status, 404);
    assert.equal((await reader.put(`${base}/entities/${ids.ch1}`, wb({ title: 'x', force: true }))).status, 404);
    assert.equal((await reader.get(ids.placeMedia.url, { raw: true })).status, 404);
  });

  it('repasser un chapitre en réécriture le retire, et il faut le revalider', async () => {
    const ch = (await owner.get(`${base}/entities/${ids.ch1}`)).json;
    const r = await owner.put(`${base}/entities/${ids.ch1}`, wb({ revision: ch.revision, status: 'reecriture' }));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.validatedAt, null);
    assert.deepEqual((await reader.get(`${base}/reader`)).json, []);
    const again = await owner.put(`${base}/entities/${ids.ch1}`, wb({ revision: r.json.revision, status: 'termine' }));
    assert.equal(again.json.validatedAt, null);
    assert.deepEqual((await reader.get(`${base}/reader`)).json, []);
    await owner.put(`${base}/entities/${ids.ch1}/validation`, wb({ value: true }));
    assert.equal((await reader.get(`${base}/reader`)).json.length, 1);
  });
});

describe('partage — changement de rôle et révocation', () => {
  it('passer l\'omniscient en lecteur lui ferme le reste du livre', async () => {
    const r = await owner.put(`${base}/shares/${OMNI.id}`, wb({ role: 'lecteur' }));
    assert.equal(r.json.role, 'lecteur');
    assert.equal((await omni.get(`${base}/entities`)).status, 404);
    assert.equal((await omni.get(`${base}/reader`)).json.length, 1);
    await owner.put(`${base}/shares/${OMNI.id}`, wb({ role: 'omniscient' }));
  });

  it('révoquer ferme la porte (403 à l\'entrée)', async () => {
    assert.equal((await owner.delete(`${base}/shares/${READER.id}`, W)).status, 204);
    assert.equal((await reader.get('/api/author/projects')).status, 403);
    assert.equal((await reader.get(`${base}/reader`)).status, 403);
    assert.equal((await reader.get('/api/auth/me')).json.authorShared, false);
  });

  it('supprimer le compte invité garde ses commentaires (auteur anonymisé)', async () => {
    assert.equal((await owner.delete(`/api/users/${OMNI.id}`)).status, 204);
    const all = (await owner.get(`${base}/comments`)).json;
    assert.ok(all.some((c) => c.authorName === 'Compte supprimé' && c.authorId === null));
    assert.deepEqual((await owner.get(`${base}/shares`)).json, []);
  });
});

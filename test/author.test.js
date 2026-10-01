import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { bootServer, fetcher } from './harness.js';

// Atelier d'auteur : la garde d'accès d'abord (c'est l'exigence n°1 — privé,
// vérifié côté serveur), puis le comportement réel de chaque brique.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };
const ADMIN2 = { email: 'admin2@test.local', password: 'admin2pw1-strong' };
const W = { headers: { 'X-Author-Request': '1' } };
const wb = (body) => ({ body, headers: { 'X-Author-Request': '1' } });

let owner;   // fetcher connecté au compte propriétaire
let pid;     // projet de test

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

async function login(creds) {
  const f = fetcher(server.base);
  const r = await f.post('/api/auth/login', { body: creds });
  assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
  return { f, user: r.json.user };
}

// Écrit directement dans la base du serveur de test (WAL : accès concurrent sûr).
function withDb(fn) {
  const db = new Database(path.join(server.workdir, 'data.sqlite'));
  try { return fn(db); } finally { db.close(); }
}

describe('atelier d\'auteur — contrôle d\'accès', () => {
  it('refuse les anonymes (401) et les membres (403)', async () => {
    const anon = fetcher(server.base);
    assert.equal((await anon.get('/api/author/projects')).status, 401);
    const { f, user } = await login(MEMBER);
    assert.equal(user.canAuthor, false);
    assert.equal((await f.get('/api/author/projects')).status, 403);
    assert.equal((await f.post('/api/author/projects', wb({ title: 'x' }))).status, 403);
  });

  it('ouvre l\'espace au compte propriétaire (ADMIN_EMAIL par défaut)', async () => {
    const { f, user } = await login(ADMIN);
    assert.equal(user.canAuthor, true);
    const me = await f.get('/api/auth/me');
    assert.equal(me.json.canAuthor, true);
    assert.equal((await f.get('/api/author/projects')).status, 200);
    owner = f;
  });

  it('un second administrateur n\'entre pas et ne peut pas s\'octroyer le droit', async () => {
    const created = await owner.post('/api/users', {
      body: { ...ADMIN2, name: 'Admin 2', role: 'admin', canAuthor: true, can_author: 1 },
    });
    assert.equal(created.status, 201);
    const { f, user } = await login(ADMIN2);
    assert.equal(user.canAuthor, false);
    assert.equal((await f.get('/api/author/projects')).status, 403);
    // La route d'édition des comptes ignore le drapeau.
    await owner.put(`/api/users/${created.json.id}`, { body: { canAuthor: true, can_author: 1 } });
    const { f: f2 } = await login(ADMIN2);
    assert.equal((await f2.get('/api/author/projects')).status, 403);
  });

  it('exige l\'en-tête anti-CSRF sur toute écriture', async () => {
    const r = await owner.post('/api/author/projects', { body: { title: 'Sans en-tête' } });
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'csrf_header_missing');
    const ok = await owner.post('/api/author/projects', wb({ title: 'Le Livre des Cendres', targetWords: 90000 }));
    assert.equal(ok.status, 201);
    pid = ok.json.id;
  });

  it('un projet n\'est servi qu\'à son propriétaire (404 sinon, même avec le drapeau)', async () => {
    // On force le drapeau en base pour le second admin : il franchit la garde
    // de rôle, mais les données restent bornées à leur owner_id.
    withDb((db) => db.prepare(`UPDATE users SET can_author = 1 WHERE email = ?`).run(ADMIN2.email));
    const { f } = await login(ADMIN2);
    const list = await f.get('/api/author/projects');
    assert.equal(list.status, 200);
    assert.deepEqual(list.json, []);
    assert.equal((await f.get(`/api/author/projects/${pid}`)).status, 404);
    assert.equal((await f.get(`/api/author/projects/${pid}/entities`)).status, 404);
    assert.equal((await f.put(`/api/author/projects/${pid}`, wb({ title: 'volé' }))).status, 404);
    withDb((db) => db.prepare(`UPDATE users SET can_author = 0 WHERE email = ?`).run(ADMIN2.email));
  });

  it('le compte propriétaire d\'un livre ne peut pas être supprimé', async () => {
    const { f } = await login(ADMIN2);
    const me = await owner.get('/api/auth/me');
    // ADMIN2 est admin : il pourrait supprimer le propriétaire… sans le 409.
    const r = await f.delete(`/api/users/${me.json.id}`);
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'owns_author_projects');
  });
});

describe('atelier d\'auteur — éléments, révisions, relations', () => {
  let elise;
  let marek;
  let port;

  it('crée un projet avec catégories et lignes de temps par défaut', async () => {
    const cats = await owner.get(`/api/author/projects/${pid}/categories`);
    assert.ok(cats.json.some((c) => c.domain === 'lore' && c.name === 'Faction'));
    assert.ok(cats.json.some((c) => c.domain === 'place' && c.name === 'Royaume'));
    const tls = await owner.get(`/api/author/projects/${pid}/timelines`);
    assert.equal(tls.json.length, 3);
  });

  it('crée un personnage complet avec tags et alias', async () => {
    const r = await owner.post(`/api/author/projects/${pid}/entities`, wb({
      kind: 'character', title: 'Élise Varnier', firstName: 'Élise', nickname: 'la Cendrée',
      storyRole: 'Protagoniste', fears: 'Le feu', summary: 'Cartographe exilée.',
      tags: ['Acte 1', 'Important', 'acte 1'], aliases: [{ alias: 'Lise', kind: 'alias' }],
    }));
    assert.equal(r.status, 201);
    elise = r.json;
    assert.equal(elise.kind, 'character');
    assert.equal(elise.fears, 'Le feu');
    assert.equal(elise.revision, 1);
    assert.deepEqual(elise.tags.map((t) => t.name).sort(), ['Acte 1', 'Important']);
    assert.equal(elise.aliases[0].alias, 'Lise');
  });

  it('valide les entrées (422 explicite)', async () => {
    const bad = await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'character', title: '   ' }));
    assert.equal(bad.status, 422);
    assert.equal(bad.json.field, 'title');
    const badKind = await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'dragon', title: 'x' }));
    assert.equal(badKind.status, 422);
    const badColor = await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'note', title: 'x', color: 'red;' }));
    assert.equal(badColor.status, 422);
  });

  it('PUT partiel sous révision : 409 avec l\'état serveur si la révision est périmée', async () => {
    const ok = await owner.put(`/api/author/projects/${pid}/entities/${elise.id}`, wb({ revision: 1, goals: 'Retrouver sa sœur' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.revision, 2);
    assert.equal(ok.json.fears, 'Le feu', 'les champs absents ne sont pas touchés');
    const stale = await owner.put(`/api/author/projects/${pid}/entities/${elise.id}`, wb({ revision: 1, goals: 'écrasé ?' }));
    assert.equal(stale.status, 409);
    assert.equal(stale.json.serverRevision, 2);
    assert.equal(stale.json.entity.goals, 'Retrouver sa sœur');
    const missing = await owner.put(`/api/author/projects/${pid}/entities/${elise.id}`, wb({ goals: 'sans révision' }));
    assert.equal(missing.status, 400);
    const forced = await owner.put(`/api/author/projects/${pid}/entities/${elise.id}`, wb({ force: true, goals: 'Choisi' }));
    assert.equal(forced.status, 200);
    assert.equal(forced.json.revision, 3);
  });

  it('relie les éléments ; une relation symétrique n\'est stockée qu\'une fois', async () => {
    marek = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'character', title: 'Marek' }))).json;
    port = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'place', title: 'Port-Brume' }))).json;
    const a = await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: elise.id, toId: marek.id, kind: 'rival' }));
    assert.equal(a.status, 201);
    const b = await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: marek.id, toId: elise.id, kind: 'rival' }));
    assert.equal(b.status, 200, 'le doublon inversé renvoie la relation existante');
    assert.equal(b.json.id, a.json.id);
    await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: marek.id, toId: elise.id, kind: 'mentor' }));
    await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: elise.id, toId: port.id, kind: 'se_trouve_a' }));

    const e = (await owner.get(`/api/author/projects/${pid}/entities/${elise.id}`)).json;
    const labels = e.links.map((l) => `${l.label}→${l.other.title}`).sort();
    assert.deepEqual(labels, ['Rival→Marek', 'Se trouve à→Port-Brume', 'Élève de→Marek'].sort());
    const m = (await owner.get(`/api/author/projects/${pid}/entities/${marek.id}`)).json;
    assert.ok(m.links.some((l) => l.label === 'Mentor de' && l.other.id === elise.id));

    assert.equal((await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: elise.id, toId: elise.id, kind: 'ami' }))).status, 422);
    assert.equal((await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: elise.id, toId: marek.id, kind: 'xx' }))).status, 422);
    // Clés héritées d'Object.prototype : jamais une relation valide.
    for (const kind of ['__proto__', 'constructor', 'toString']) {
      assert.equal((await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: elise.id, toId: marek.id, kind }))).status, 422, kind);
    }
    assert.equal((await owner.get(`/api/author/projects/${pid}/entities?kind=character&sort=__proto__`)).status, 200);
    const graph = (await owner.get(`/api/author/projects/${pid}/graph`)).json;
    assert.equal(graph.edges.length, 3);
  });

  it('recherche plein-texte insensible aux accents, avec extrait surligné', async () => {
    const r = await owner.get(`/api/author/projects/${pid}/search?q=cendree`);
    assert.equal(r.status, 200);
    assert.equal(r.json[0].id, elise.id);
    const byBody = await owner.get(`/api/author/projects/${pid}/search?q=${encodeURIComponent('exilee cartographe')}`);
    assert.ok(byBody.json.some((x) => x.id === elise.id));
    assert.ok(byBody.json[0].snippet.includes('\u0002'));
    const filtered = await owner.get(`/api/author/projects/${pid}/search?q=cendree&kinds=place`);
    assert.equal(filtered.json.length, 0);
    // Titre exact devant les titres qui le contiennent.
    await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'event', title: 'Le retour de Marek' }));
    const ranked = await owner.get(`/api/author/projects/${pid}/search?q=marek`);
    assert.equal(ranked.json[0].title, 'Marek');
    const list = await owner.get(`/api/author/projects/${pid}/entities?kind=character&q=marek`);
    assert.equal(list.json.total, 1);
  });

  it('corbeille : supprimer masque, restaurer rend, purger exige la corbeille', async () => {
    const tmp = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'lore', title: 'Ordre du Givre' }))).json;
    assert.equal((await owner.delete(`/api/author/projects/${pid}/entities/${tmp.id}/purge`, W)).status, 404);
    assert.equal((await owner.delete(`/api/author/projects/${pid}/entities/${tmp.id}`, W)).status, 204);
    assert.equal((await owner.get(`/api/author/projects/${pid}/entities/${tmp.id}`)).status, 404);
    assert.equal((await owner.get(`/api/author/projects/${pid}/search?q=givre`)).json.length, 0);
    const trash = (await owner.get(`/api/author/projects/${pid}/trash`)).json;
    assert.ok(trash.items.some((x) => x.id === tmp.id));
    assert.equal((await owner.post(`/api/author/projects/${pid}/entities/${tmp.id}/restore`, W)).status, 204);
    assert.equal((await owner.get(`/api/author/projects/${pid}/search?q=givre`)).json.length, 1);
    await owner.delete(`/api/author/projects/${pid}/entities/${tmp.id}`, W);
    assert.equal((await owner.delete(`/api/author/projects/${pid}/entities/${tmp.id}/purge`, W)).status, 204);
  });

  it('favoris et éléments récents ne bougent pas la révision', async () => {
    const before = (await owner.get(`/api/author/projects/${pid}/entities/${marek.id}`)).json.revision;
    assert.equal((await owner.put(`/api/author/projects/${pid}/entities/${marek.id}/favorite`, wb({ value: true }))).status, 204);
    assert.equal((await owner.post(`/api/author/projects/${pid}/entities/${marek.id}/visit`, W)).status, 204);
    const after = (await owner.get(`/api/author/projects/${pid}/entities/${marek.id}`)).json;
    assert.equal(after.revision, before);
    assert.equal(after.isFavorite, true);
    const ov = (await owner.get(`/api/author/projects/${pid}/overview`)).json;
    assert.ok(ov.favorites.some((x) => x.id === marek.id));
    assert.ok(ov.recentOpened.some((x) => x.id === marek.id));
    assert.equal(ov.counts.character, 2);
  });
});

describe('atelier d\'auteur — chapitres, plan, historique, idées', () => {
  let act1;
  let ch1;
  let ch2;

  it('plan : actes, chapitres, moments forts et numérotation', async () => {
    act1 = (await owner.post(`/api/author/projects/${pid}/acts`, wb({ title: 'Acte 1' }))).json;
    ch1 = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'chapter', title: 'Le port', actId: act1.id }))).json;
    ch2 = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'chapter', title: 'La fuite', actId: act1.id }))).json;
    const beat = (await owner.post(`/api/author/projects/${pid}/beats`, wb({ title: 'L\'incendie', actId: act1.id }))).json;
    assert.equal(ch1.number, 1);
    assert.equal(ch2.number, 2);
    const plan = await owner.put(`/api/author/projects/${pid}/plan`, wb({
      columns: [{ actId: act1.id, items: [{ type: 'chapter', id: ch2.id }, { type: 'beat', id: beat.id }, { type: 'chapter', id: ch1.id }] }],
    }));
    assert.equal(plan.status, 200);
    assert.deepEqual(plan.json.acts[0].items.map((i) => `${i.type}:${i.id}`), [`chapter:${ch2.id}`, `beat:${beat.id}`, `chapter:${ch1.id}`]);
    assert.equal((await owner.get(`/api/author/projects/${pid}/entities/${ch2.id}`)).json.number, 1);
    const bad = await owner.put(`/api/author/projects/${pid}/plan`, wb({ columns: [{ actId: null, items: [{ type: 'chapter', id: 999999 }] }] }));
    assert.equal(bad.status, 422);
  });

  it('écriture : compteurs serveur et snapshots automatiques/manuels/restauration', async () => {
    const text = '# Le port\n\nÉlise regarde la mer. Aujourd\'hui, peut-être, elle partira.\n\n> Une citation.';
    let r = await owner.put(`/api/author/projects/${pid}/entities/${ch1.id}`, wb({ revision: ch1.revision, content: text, status: 'premier_jet' }));
    assert.equal(r.status, 200);
    assert.equal(r.json.wordCount, 12);
    // Première réécriture : l'original est figé automatiquement.
    r = await owner.put(`/api/author/projects/${pid}/entities/${ch1.id}`, wb({ revision: r.json.revision, content: 'Tout effacé.' }));
    let revs = (await owner.get(`/api/author/projects/${pid}/entities/${ch1.id}/revisions?field=content`)).json;
    assert.equal(revs.length, 1);
    assert.equal(revs[0].manual, false);
    const manual = await owner.post(`/api/author/projects/${pid}/entities/${ch1.id}/revisions`, wb({ field: 'content', label: 'Avant relecture' }));
    assert.equal(manual.status, 201);
    const restored = await owner.post(`/api/author/projects/${pid}/entities/${ch1.id}/revisions/${revs[0].id}/restore`, W);
    assert.equal(restored.status, 200);
    assert.equal(restored.json.content, text);
    revs = (await owner.get(`/api/author/projects/${pid}/entities/${ch1.id}/revisions?field=content`)).json;
    assert.ok(revs.some((x) => x.label === 'Avant restauration'), 'la version courante est gardée avant restauration');
    const md = await owner.get(`/api/author/projects/${pid}/export/manuscript`);
    assert.match(md.text, /# Acte 1/);
    assert.match(md.text, /Élise regarde la mer/);
  });

  it('idées : capture éclair dans l\'inbox puis classement Kanban', async () => {
    const q = await owner.post(`/api/author/projects/${pid}/notes/quick`, wb({ text: 'Un phare qui chante\nIl n\'y a pas de gardien.' }));
    assert.equal(q.status, 201);
    assert.equal(q.json.title, 'Un phare qui chante');
    assert.equal(q.json.inbox, true);
    const inbox = (await owner.get(`/api/author/projects/${pid}/entities?kind=note&inbox=1`)).json;
    assert.equal(inbox.total, 1);
    const moved = await owner.put(`/api/author/projects/${pid}/notes/order`, wb({ status: 'a_developper', ids: [q.json.id] }));
    assert.equal(moved.status, 204);
    const n = (await owner.get(`/api/author/projects/${pid}/entities/${q.json.id}`)).json;
    assert.equal(n.status, 'a_developper');
    assert.equal(n.inbox, false);
    assert.equal(n.revision, q.json.revision + 1);
    assert.equal((await owner.put(`/api/author/projects/${pid}/notes/order`, wb({ status: 'nope', ids: [] }))).status, 422);
  });

  it('tâches liées à un élément', async () => {
    const t = await owner.post(`/api/author/projects/${pid}/tasks`, wb({ title: 'Corriger le ch. 1', entityId: ch1.id, dueDate: '2026-12-01' }));
    assert.equal(t.status, 201);
    assert.equal(t.json.entity.id, ch1.id);
    const done = await owner.put(`/api/author/projects/${pid}/tasks/${t.json.id}`, wb({ done: true }));
    assert.equal(done.json.done, true);
    assert.equal((await owner.post(`/api/author/projects/${pid}/tasks`, wb({ title: 'x', dueDate: '01/12/2026' }))).status, 422);
    const ent = (await owner.get(`/api/author/projects/${pid}/entities/${ch1.id}`)).json;
    assert.equal(ent.tasks.length, 1);
  });
});

describe('atelier d\'auteur — cohérence', () => {
  it('détecte ancien nom, chronologie impossible et ignore sur demande', async () => {
    const city = (await owner.post(`/api/author/projects/${pid}/entities`, wb({
      kind: 'place', title: 'Valcendre', aliases: [{ alias: 'Valdor', kind: 'ancien_nom' }],
    }))).json;
    const chap = (await owner.post(`/api/author/projects/${pid}/entities`, wb({
      kind: 'chapter', title: 'Retour', content: 'Ils arrivèrent à Valdor au matin.',
    }))).json;
    const tl = (await owner.get(`/api/author/projects/${pid}/timelines`)).json[0];
    const war = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'event', title: 'La guerre', timelineId: tl.id, sortKey: 300 }))).json;
    const treaty = (await owner.post(`/api/author/projects/${pid}/entities`, wb({ kind: 'event', title: 'Le traité', timelineId: tl.id, sortKey: 250 }))).json;
    await owner.post(`/api/author/projects/${pid}/links`, wb({ fromId: war.id, toId: treaty.id, kind: 'cause' }));

    const c = (await owner.get(`/api/author/projects/${pid}/consistency`)).json;
    const oldName = c.issues.find((i) => i.rule === 'ancien_nom');
    assert.ok(oldName, 'ancien nom détecté');
    assert.ok(oldName.entityIds.includes(city.id) && oldName.entityIds.includes(chap.id));
    assert.ok(c.issues.some((i) => i.rule === 'chronologie' && i.severity === 'error'));

    await owner.post(`/api/author/projects/${pid}/consistency/dismiss`, wb({ key: oldName.key }));
    const c2 = (await owner.get(`/api/author/projects/${pid}/consistency`)).json;
    assert.ok(!c2.issues.some((i) => i.key === oldName.key));
    assert.ok(c2.dismissed.some((i) => i.key === oldName.key));

    const moved = await owner.put(`/api/author/projects/${pid}/events/${treaty.id}/move`, wb({ sortKey: 320 }));
    assert.equal(moved.status, 200);
    const c3 = (await owner.get(`/api/author/projects/${pid}/consistency`)).json;
    assert.ok(!c3.issues.some((i) => i.rule === 'chronologie'));
  });
});

describe('atelier d\'auteur — tableau blanc', () => {
  it('applique des lots sous révision, refuse les lots périmés', async () => {
    const board = (await owner.post(`/api/author/projects/${pid}/boards`, wb({ title: 'Carte politique' }))).json;
    const chars = (await owner.get(`/api/author/projects/${pid}/entities?kind=character`)).json.items;
    let r = await owner.post(`/api/author/projects/${pid}/boards/${board.id}/ops`, wb({
      baseRevision: board.revision,
      ops: [
        { op: 'node', id: 'n1', kind: 'card', x: 10, y: 20, text: 'Royaume' },
        { op: 'node', id: 'n2', kind: 'entity', x: 300, y: 20, entityId: chars[0].id },
        { op: 'edge', id: 'e1', from: 'n1', to: 'n2', label: 'gouverne' },
      ],
    }));
    assert.equal(r.status, 200);
    const rev = r.json.revision;
    assert.equal(rev, board.revision + 1);
    const stale = await owner.post(`/api/author/projects/${pid}/boards/${board.id}/ops`, wb({
      baseRevision: board.revision, ops: [{ op: 'node', id: 'n1', x: 99 }],
    }));
    assert.equal(stale.status, 409);
    const badEdge = await owner.post(`/api/author/projects/${pid}/boards/${board.id}/ops`, wb({
      baseRevision: rev, ops: [{ op: 'edge', id: 'e2', from: 'n1', to: 'absent' }],
    }));
    assert.equal(badEdge.status, 422);
    r = await owner.post(`/api/author/projects/${pid}/boards/${board.id}/ops`, wb({
      baseRevision: rev, ops: [{ op: 'node', id: 'n1', x: 50 }, { op: 'deleteNode', id: 'n2' }],
    }));
    assert.equal(r.status, 200);
    const full = (await owner.get(`/api/author/projects/${pid}/boards/${board.id}`)).json;
    assert.equal(full.nodes.length, 1);
    assert.equal(full.nodes[0].x, 50);
    assert.equal(full.nodes[0].text, 'Royaume', 'un déplacement ne réécrit pas le texte');
    assert.equal(full.edges.length, 0, 'la flèche suit son nœud supprimé');
    assert.equal((await owner.put(`/api/author/projects/${pid}/boards/${board.id}/view`, wb({ x: 1, y: 2, zoom: 1.5 }))).status, 204);
  });
});

describe('atelier d\'auteur — médias privés', () => {
  let mediaUrl;

  it('réencode une image en WebP et la sert uniquement au propriétaire', async () => {
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#663399' } }).png().toBuffer();
    const ent = (await owner.get(`/api/author/projects/${pid}/entities?kind=character`)).json.items[0];
    const fd = new FormData();
    fd.append('image', new Blob([png], { type: 'image/png' }), 'portrait.png');
    fd.append('entityId', String(ent.id));
    fd.append('purpose', 'cover');
    const up = await owner.post(`/api/author/projects/${pid}/media`, { body: fd, headers: { 'X-Author-Request': '1' } });
    assert.equal(up.status, 201, up.text);
    assert.match(up.json.url, /^\/api\/author\/media\/[\w-]+\.webp$/);
    mediaUrl = up.json.url;
    const file = await owner.get(mediaUrl, { raw: true });
    assert.equal(file.status, 200);
    assert.match(file.headers.get('cache-control'), /private/);
    const e = (await owner.get(`/api/author/projects/${pid}/entities/${ent.id}`)).json;
    assert.equal(e.cover.url, mediaUrl);

    assert.equal((await fetcher(server.base).get(mediaUrl, { raw: true })).status, 401);
    const { f } = await login(MEMBER);
    assert.equal((await f.get(mediaUrl, { raw: true })).status, 403);
    // Les images de l'atelier ne passent JAMAIS par la route publique.
    const name = mediaUrl.split('/').pop();
    assert.equal((await fetcher(server.base).get(`/api/images/${name}`, { raw: true })).status, 404);
  });

  it('refuse un faux fichier image (415) et un nom forgé (400/404)', async () => {
    const fd = new FormData();
    fd.append('image', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'x.png');
    const r = await owner.post(`/api/author/projects/${pid}/media`, { body: fd, headers: { 'X-Author-Request': '1' } });
    assert.equal(r.status, 415);
    const svg = new FormData();
    svg.append('image', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg');
    assert.equal((await owner.post(`/api/author/projects/${pid}/media`, { body: svg, headers: { 'X-Author-Request': '1' } })).status, 415);
    assert.equal((await owner.get('/api/author/media/..%2F..%2Fdata.sqlite', { raw: true })).status, 400);
    assert.equal((await owner.get('/api/author/media/00000000-0000-0000-0000-000000000000.webp', { raw: true })).status, 404);
  });
});

describe('atelier d\'auteur — exports et suppression', () => {
  it('exporte une sauvegarde JSON complète', async () => {
    const r = await owner.get(`/api/author/projects/${pid}/export`);
    assert.equal(r.status, 200);
    assert.equal(r.json.format, 'titisite-author-export');
    assert.ok(r.json.entities.length > 5);
    assert.ok(r.json.links.length >= 3);
    assert.match(r.headers.get('content-disposition'), /attachment/);
  });

  it('supprimer un livre exige de retaper son titre', async () => {
    const tmp = (await owner.post('/api/author/projects', wb({ title: 'Brouillon' }))).json;
    assert.equal((await owner.delete(`/api/author/projects/${tmp.id}`, wb({ confirmTitle: 'brouillon' }))).status, 400);
    assert.equal((await owner.delete(`/api/author/projects/${tmp.id}`, wb({ confirmTitle: 'Brouillon' }))).status, 204);
    assert.equal((await owner.get(`/api/author/projects/${tmp.id}`)).status, 404);
  });
});

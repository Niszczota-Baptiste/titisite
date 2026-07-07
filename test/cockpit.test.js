import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';

// Cockpit MF : flux enrichi (inputs/rewards/mapPoints), items perso (section
// `wanted`), filtre des quêtes suivies, et endpoint « où trouver » (stock).
// Le cockpit est réservé aux ADMINS : les réglages perso passent par le compte
// admin, et un membre (même avec can_view_quests) est refusé partout.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => { server = await bootServer({ env: { SEED_DEMO_QUESTS: 'off' } }); });
after(async () => { await server.stop(); });

function login(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

describe('cockpit — flux enrichi + items perso + follows', () => {
  let admin;
  let member;
  let anon;
  let dailyId;
  let deadlineId;
  let adminToken;

  it('setup : quêtes + accès quêtes pour le membre', async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    anon = fetcher(server.base);
    await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });

    const daily = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Livrer 16 pains', occurrenceType: 'journaliere',
        inputs: [{ kind: 'item', refCode: 'minecraft:bread', quantite: 16, label: 'Pain' }],
        rewards: [{ kind: 'pa', quantite: 50, label: '' }],
        mapPoints: [{ label: 'boulangerie', role: 'rendu', x: 128, y: 64, z: -342 }],
      },
    });
    assert.equal(daily.status, 201);
    dailyId = daily.json.id;

    const dueSoon = Math.floor(Date.now() / 1000) + 3600;
    const dl = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Quête à échéance', occurrenceType: 'simple', dueDate: dueSoon,
        inputs: [{ kind: 'item', quantite: 3, label: 'Perle' }],
        rewards: [{ kind: 'pa', quantite: 10, label: '' }],
        mapPoints: [{ label: 'autel', role: 'rendu', x: 1, y: 2, z: 3 }],
      },
    });
    assert.equal(dl.status, 201);
    deadlineId = dl.json.id;

    const info = await admin.f.get('/api/me/cockpit-token');
    assert.equal(info.status, 200);
    adminToken = info.json.token;
  });

  it('le flux porte inputs/rewards/mapPoints sur available ET deadlines', async () => {
    const feed = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.equal(feed.status, 200);

    const q = feed.json.available.journaliere.find((x) => x.id === dailyId);
    assert.ok(q, 'la journalière est disponible');
    assert.deepEqual(q.inputs[0], {
      kind: 'item', label: 'Pain', quantite: 16, refCode: 'minecraft:bread', factionId: null, icon: null,
    });
    assert.equal(q.rewards[0].kind, 'pa');
    assert.deepEqual(q.mapPoints[0], { label: 'boulangerie', role: 'rendu', x: 128, y: 64, z: -342 });

    const d = feed.json.deadlines.find((x) => x.id === deadlineId);
    assert.ok(d, 'la quête à échéance est dans deadlines');
    assert.equal(d.inputs[0].label, 'Perle');
    assert.equal(d.rewards[0].kind, 'pa');
    assert.equal(d.mapPoints[0].label, 'autel');
  });

  it('items perso : CRUD + section wanted (done exclu, tri par priorité)', async () => {
    const a = await admin.f.post('/api/me/cockpit/items', {
      body: { name: 'Diamant', quantity: 64, priority: 1, note: 'pour la beacon' },
    });
    assert.equal(a.status, 201);
    const b = await admin.f.post('/api/me/cockpit/items', {
      body: { name: 'Laine', quantity: 32, priority: 3 },
    });
    const c = await admin.f.post('/api/me/cockpit/items', {
      body: { name: 'Fer', quantity: 128, priority: 2, x: -1204, y: 11, z: 356 },
    });
    assert.equal(c.json.x, -1204);

    // Cocher « Laine » → exclue du flux.
    const done = await admin.f.patch(`/api/me/cockpit/items/${b.json.id}/done`);
    assert.equal(done.json.done, true);

    const feed = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.deepEqual(feed.json.wanted.map((w) => w.name), ['Diamant', 'Fer']);
    assert.equal(feed.json.counts.wanted, 2);
    assert.equal(feed.json.wanted[0].note, 'pour la beacon');
    assert.equal(feed.json.wanted[1].x, -1204);

    // Édition (priorité) réordonne le flux.
    await admin.f.put(`/api/me/cockpit/items/${c.json.id}`, { body: { priority: 1, quantity: 200 } });
    const feed2 = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.equal(feed2.json.wanted.find((w) => w.name === 'Fer').quantity, 200);

    // Suppression.
    const del = await admin.f.delete(`/api/me/cockpit/items/${a.json.id}`);
    assert.equal(del.status, 204);
  });

  it('wanted lié à un projet : nom du workspace résolu, projet inconnu → null', async () => {
    const ws = await admin.f.get('/api/workspaces');
    const principal = ws.json.find((w) => w.slug === 'projet-principal');
    const linked = await admin.f.post('/api/me/cockpit/items', {
      body: { name: 'Obsidienne', quantity: 10, priority: 2, workspaceId: principal.id },
    });
    assert.equal(linked.json.workspaceName, principal.name);

    const feed = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.equal(feed.json.wanted.find((w) => w.name === 'Obsidienne').workspace, principal.name);

    // Un workspace inexistant est ignoré (SET NULL côté validation).
    const bogus = await admin.f.post('/api/me/cockpit/items', {
      body: { name: 'X', workspaceId: 99999 },
    });
    assert.equal(bogus.json.workspaceId, null);
  });

  it('follows : aucune ligne = tout envoyé ; sinon seules les suivies', async () => {
    // Par défaut : les deux quêtes sont dans le flux.
    const feed = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.ok(feed.json.available.journaliere.some((q) => q.id === dailyId));
    assert.ok(feed.json.deadlines.some((q) => q.id === deadlineId));

    // L'admin suit uniquement la journalière → la deadline disparaît.
    const follow = await admin.f.put(`/api/me/cockpit/quests/${dailyId}/follow`, { body: { followed: true } });
    assert.equal(follow.json.followedCount, 1);
    const feed2 = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.ok(feed2.json.available.journaliere.some((q) => q.id === dailyId));
    assert.equal(feed2.json.deadlines.length, 0);
    // Les gains restent globaux.
    assert.ok(feed2.json.potentialGains);

    // GET /quests reflète l'état de follow.
    const list = await admin.f.get('/api/me/cockpit/quests');
    assert.equal(list.json.followedCount, 1);
    assert.equal(list.json.quests.find((q) => q.id === dailyId).followed, true);

    // Ne plus rien suivre → tout revient.
    await admin.f.put(`/api/me/cockpit/quests/${dailyId}/follow`, { body: { followed: false } });
    const feed3 = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.ok(feed3.json.deadlines.some((q) => q.id === deadlineId));
  });

  it('opt-out des rappels vide wanted (et le reste), gains conservés', async () => {
    await admin.f.put('/api/me/quest-reminders', { body: { enabled: false } });
    const feed = await anon.get(`/api/quests/cockpit/${adminToken}.json`);
    assert.equal(feed.json.counts.wanted, 0);
    assert.deepEqual(feed.json.wanted, []);
    assert.equal(feed.json.counts.availableTotal, 0);
    assert.ok(feed.json.potentialGains);
    await admin.f.put('/api/me/quest-reminders', { body: { enabled: true } });
  });

  it('accès : le cockpit est refusé aux membres, même avec can_view_quests', async () => {
    // Le membre a can_view_quests (posé au setup) : /quetes lui est ouvert…
    const quests = await member.f.get('/api/quests/quests');
    assert.equal(quests.status, 200);
    // …mais tout le cockpit répond 403.
    assert.equal((await member.f.get('/api/me/cockpit-token')).status, 403);
    assert.equal((await member.f.post('/api/me/cockpit-token/rotate')).status, 403);
    assert.equal((await member.f.put('/api/me/quest-reminders', { body: { enabled: true } })).status, 403);
    assert.equal((await member.f.get('/api/me/cockpit/items')).status, 403);
    assert.equal((await member.f.post('/api/me/cockpit/items', { body: { name: 'X' } })).status, 403);
    assert.equal((await member.f.get('/api/me/cockpit/quests')).status, 403);
  });
});

describe('cockpit — où trouver les entrées d\'une quête (stock)', () => {
  let admin;
  let member;
  let questId;
  let privateWsSlug;

  it('setup : workspace minecraft privé + inventaire + quête', async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);

    // Workspace minecraft dont SEUL l'admin est membre.
    const ws = await admin.f.post('/api/workspaces', {
      body: { name: 'Base secrète', isMinecraft: true, memberIds: [admin.user.id] },
    });
    assert.equal(ws.status, 201);
    privateWsSlug = ws.json.slug;

    const chest = await admin.f.post(`/api/workspaces/${privateWsSlug}/minecraft/chests`, {
      body: { name: 'Réserve', world: 'overworld', x: 10, y: 64, z: -20 },
    });
    assert.equal(chest.status, 201);
    const item = await admin.f.post(`/api/workspaces/${privateWsSlug}/minecraft`, {
      body: { name: 'Pain', quantity: 40, chestId: chest.json.id },
    });
    assert.equal(item.status, 201);

    const q = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Livraison de pains', occurrenceType: 'simple',
        inputs: [
          { kind: 'item', quantite: 16, label: 'Pain' },
          { kind: 'item', quantite: 5, label: 'Introuvable' },
        ],
      },
    });
    questId = q.json.id;
  });

  it('admin : le stock localise l\'item (coffre + monde + coords + total)', async () => {
    const r = await admin.f.get(`/api/quests/quests/${questId}/stock`);
    assert.equal(r.status, 200);
    const pain = r.json.inputs.find((i) => i.label === 'Pain');
    assert.equal(pain.needed, 16);
    assert.equal(pain.totalHave, 40);
    assert.equal(pain.locations.length, 1);
    assert.equal(pain.locations[0].workspaceSlug, privateWsSlug);
    assert.equal(pain.locations[0].chest.name, 'Réserve');
    assert.equal(pain.locations[0].chest.x, 10);

    const nf = r.json.inputs.find((i) => i.label === 'Introuvable');
    assert.equal(nf.totalHave, 0);
    assert.deepEqual(nf.locations, []);
  });

  it('membre : ne voit pas les coffres d\'un workspace dont il n\'est pas membre', async () => {
    const r = await member.f.get(`/api/quests/quests/${questId}/stock`);
    assert.equal(r.status, 200);
    const pain = r.json.inputs.find((i) => i.label === 'Pain');
    assert.equal(pain.totalHave, 0);
    assert.deepEqual(pain.locations, []);
  });

  it('membre : voit le stock des workspaces où il est membre (match accent-insensible)', async () => {
    // Le rendre membre du workspace + ajouter une ligne « non rangé ».
    const ws = await admin.f.get('/api/workspaces');
    const secret = ws.json.find((w) => w.slug === privateWsSlug);
    await admin.f.put(`/api/workspaces/${secret.id}/members`, {
      body: { memberIds: [admin.user.id, member.user.id] },
    });
    await admin.f.post(`/api/workspaces/${privateWsSlug}/minecraft`, {
      body: { name: 'PAIN', quantity: 2 }, // casse différente → même item
    });

    const r = await member.f.get(`/api/quests/quests/${questId}/stock`);
    const pain = r.json.inputs.find((i) => i.label === 'Pain');
    assert.equal(pain.totalHave, 42);
    assert.equal(pain.locations.length, 2);
    assert.equal(pain.locations[1].chest, null); // non rangé
  });

  it('404 sur une quête inconnue', async () => {
    const r = await admin.f.get('/api/quests/quests/99999/stock');
    assert.equal(r.status, 404);
  });
});

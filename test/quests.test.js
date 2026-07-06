import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';
import { currentPeriodKey, nextResetAt } from '../server/quests/period.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

// Suppress the demo seed so quest counts / gains sums are deterministic here.
before(async () => { server = await bootServer({ env: { SEED_DEMO_QUESTS: 'off' } }); });
after(async () => { await server.stop(); });

function login(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

// ── Unit: period_key anchored at 07:00 Europe/Paris ─────────────────────────
describe('period_key (Europe/Paris, 07:00)', () => {
  it('daily flips at 07:00 Paris', () => {
    assert.equal(currentPeriodKey('journaliere', new Date('2026-07-07T04:00:00Z')), 'd:2026-07-06');
    assert.equal(currentPeriodKey('journaliere', new Date('2026-07-07T05:30:00Z')), 'd:2026-07-07');
  });
  it('weekly anchors on Friday', () => {
    assert.equal(currentPeriodKey('hebdomadaire', new Date('2026-07-03T04:00:00Z')), 'w:2026-06-26');
    assert.equal(currentPeriodKey('hebdomadaire', new Date('2026-07-03T05:30:00Z')), 'w:2026-07-03');
  });
  it('monthly flips on the 1st', () => {
    assert.equal(currentPeriodKey('mensuelle', new Date('2026-07-01T04:00:00Z')), 'm:2026-06');
    assert.equal(currentPeriodKey('mensuelle', new Date('2026-07-01T05:30:00Z')), 'm:2026-07');
  });
  it('simple never resets', () => {
    assert.equal(currentPeriodKey('simple', new Date()), 'once');
    assert.equal(nextResetAt('simple', new Date()), null);
  });
  it('nextResetAt is strictly in the future for recurring', () => {
    const now = new Date('2026-07-07T05:30:00Z');
    assert.ok(nextResetAt('journaliere', now) > Math.floor(now.getTime() / 1000));
  });
});

// ── API flow ────────────────────────────────────────────────────────────────
describe('quests — CRUD + access + completion', () => {
  let admin;
  let member;
  let factionId;
  let questId;

  it('admin (bypass) creates a faction with tiers', async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    const r = await admin.f.post('/api/quests/factions', {
      body: {
        nom: 'Hewyr', couleur: '#e0407a', type: 'faction',
        tiers: [{ nomPalier: 'Néophyte', seuil: 1 }, { nomPalier: 'Héros', seuil: 500 }],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.tiers.length, 2);
    factionId = r.json.id;
  });

  it('admin creates a daily quest with nested inputs/rewards/map point', async () => {
    const r = await admin.f.post('/api/quests/quests', {
      body: {
        titre: "Offrande à l'autel", description: 'Déposer 10 blés',
        occurrenceType: 'journaliere', factionId,
        inputs: [{ kind: 'item', refCode: 'minecraft:wheat', quantite: 10, label: 'Blé' }],
        rewards: [
          { kind: 'pa', quantite: 50, label: '50 PA' },
          { kind: 'reputation', factionId, quantite: 25, label: '+25 Hewyr' },
        ],
        mapPoints: [{ label: 'Autel', role: 'recuperation', x: 120, y: 64, z: -33 }],
      },
    });
    assert.equal(r.status, 201);
    questId = r.json.id;
    assert.equal(r.json.inputs.length, 1);
    assert.equal(r.json.rewards.length, 2);
    assert.equal(r.json.mapPoints[0].x, 120);
  });

  it('rejects >2 map points and invalid occurrence', async () => {
    const r1 = await admin.f.post('/api/quests/quests', {
      body: { titre: 'X', mapPoints: [{}, {}, {}] },
    });
    assert.equal(r1.status, 400);
    assert.equal(r1.json.error, 'too_many_map_points');
    const r2 = await admin.f.post('/api/quests/quests', {
      body: { titre: 'X', occurrenceType: 'nope' },
    });
    assert.equal(r2.status, 400);
    assert.equal(r2.json.error, 'invalid_occurrence');
  });

  it('member without flag is forbidden (read + edit)', async () => {
    const read = await member.f.get('/api/quests/quests');
    assert.equal(read.status, 403);
    const edit = await member.f.post('/api/quests/factions', { body: { nom: 'Z' } });
    assert.equal(edit.status, 403);
  });

  it('admin grants can_view_quests → member can read but not edit', async () => {
    const g = await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });
    assert.equal(g.status, 200);
    const read = await member.f.get('/api/quests/quests');
    assert.equal(read.status, 200);
    assert.equal(read.json.length, 1);
    const edit = await member.f.post('/api/quests/quests', { body: { titre: 'Nope' } });
    assert.equal(edit.status, 403);
  });

  it('completion is per-member', async () => {
    // admin completes
    const c = await admin.f.post(`/api/quests/quests/${questId}/complete`);
    assert.equal(c.status, 200);
    assert.equal(c.json.done, true);
    // admin sees it done, member does not
    const adminMine = await admin.f.get('/api/quests/me/quests');
    // eslint-disable-next-line security/detect-object-injection -- questId is a numeric id from our own response
    assert.equal(adminMine.json.done[questId], true);
    const memberMine = await member.f.get('/api/quests/me/quests');
    // eslint-disable-next-line security/detect-object-injection -- questId is a numeric id from our own response
    assert.equal(memberMine.json.done[questId], undefined);
    // list reflects per-caller done flag
    const memberList = await member.f.get('/api/quests/quests');
    assert.equal(memberList.json[0].done, false);
  });

  it('uncomplete removes the current-period completion', async () => {
    await admin.f.post(`/api/quests/quests/${questId}/uncomplete`);
    const mine = await admin.f.get('/api/quests/me/quests');
    // eslint-disable-next-line security/detect-object-injection -- questId is a numeric id from our own response
    assert.equal(mine.json.done[questId], undefined);
  });

  it('gains sum the reward ceiling per cadence', async () => {
    const g = await admin.f.get('/api/quests/gains');
    assert.equal(g.json.journaliere.pa, 50);
    assert.equal(g.json.journaliere.reputations[0].total, 25);
    assert.equal(g.json.journaliere.questCount, 1);
  });
});

// ── User-defined groups (many-to-many) ──────────────────────────────────────
describe('quests — groups', () => {
  let admin;
  let groupId;
  let questId;

  it('admin creates a group and assigns a quest to it', async () => {
    admin = await login(ADMIN);
    const g = await admin.f.post('/api/quests/groups', { body: { nom: 'Prioritaire', couleur: '#ff8800' } });
    assert.equal(g.status, 201);
    groupId = g.json.id;

    const q = await admin.f.post('/api/quests/quests', {
      body: { titre: 'Quête groupée', occurrenceType: 'simple', groupIds: [groupId] },
    });
    assert.equal(q.status, 201);
    questId = q.json.id;
    assert.deepEqual(q.json.groups.map((x) => x.id), [groupId]);
  });

  it('lists groups with a quest count and filters quests by group', async () => {
    const groups = await admin.f.get('/api/quests/groups');
    const grp = groups.json.find((x) => x.id === groupId);
    assert.equal(grp.questCount, 1);

    const filtered = await admin.f.get(`/api/quests/quests?group=${groupId}`);
    assert.ok(filtered.json.every((q) => q.groups.some((g) => g.id === groupId)));
    assert.ok(filtered.json.some((q) => q.id === questId));
  });

  it('reassigning groups via updateQuest replaces membership', async () => {
    const upd = await admin.f.put(`/api/quests/quests/${questId}`, {
      body: { titre: 'Quête groupée', occurrenceType: 'simple', groupIds: [] },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.json.groups.length, 0);
    const groups = await admin.f.get('/api/quests/groups');
    assert.equal(groups.json.find((x) => x.id === groupId).questCount, 0);
  });

  it('member without edit flag cannot create a group; empty name is 400', async () => {
    const member = await login(MEMBER);
    const forbidden = await member.f.post('/api/quests/groups', { body: { nom: 'X' } });
    assert.equal(forbidden.status, 403);
    const bad = await admin.f.post('/api/quests/groups', { body: { nom: '' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'group_nom_required');
  });

  it('deleting a group leaves quests intact', async () => {
    const del = await admin.f.delete(`/api/quests/groups/${groupId}`);
    assert.equal(del.status, 204);
    const q = await admin.f.get(`/api/quests/quests/${questId}`);
    assert.equal(q.status, 200);
    assert.equal(q.json.groups.length, 0);
  });
});

// ── World map: aggregated quest points + standalone POIs ────────────────────
describe('quests — map & POIs', () => {
  let admin;
  let poiId;

  it('aggregates quest map points and lists standalone POIs', async () => {
    admin = await login(ADMIN);
    await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Quête cartographiée', occurrenceType: 'simple',
        mapPoints: [{ label: 'Autel', role: 'recuperation', x: 100, y: 64, z: 200 }],
      },
    });
    const poi = await admin.f.post('/api/quests/pois', {
      body: { label: 'Ferme à fer', category: 'farm', note: 'proche du spawn', x: -30, y: 50, z: 12 },
    });
    assert.equal(poi.status, 201);
    poiId = poi.json.id;

    const map = await admin.f.get('/api/quests/map');
    assert.equal(map.status, 200);
    assert.ok(map.json.questPoints.some((p) => p.label === 'Autel' && p.questTitre === 'Quête cartographiée'));
    assert.ok(map.json.pois.some((p) => p.id === poiId && p.category === 'farm'));
  });

  it('validates POI label and category', async () => {
    const noLabel = await admin.f.post('/api/quests/pois', { body: { label: '' } });
    assert.equal(noLabel.status, 400);
    assert.equal(noLabel.json.error, 'poi_label_required');
    const badCat = await admin.f.post('/api/quests/pois', { body: { label: 'X', category: 'nope' } });
    assert.equal(badCat.status, 400);
    assert.equal(badCat.json.error, 'invalid_poi_category');
  });

  it('member without edit flag cannot create a POI', async () => {
    const member = await login(MEMBER);
    const r = await member.f.post('/api/quests/pois', { body: { label: 'X', category: 'batiment' } });
    assert.equal(r.status, 403);
  });

  it('updates and deletes a POI', async () => {
    const upd = await admin.f.put(`/api/quests/pois/${poiId}`, {
      body: { label: 'Ferme à fer (v2)', category: 'ressource', x: -30, y: 50, z: 12 },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.json.category, 'ressource');
    const del = await admin.f.delete(`/api/quests/pois/${poiId}`);
    assert.equal(del.status, 204);
    const map = await admin.f.get('/api/quests/map');
    assert.ok(!map.json.pois.some((p) => p.id === poiId));
  });
});

// ── Cockpit pull feed ───────────────────────────────────────────────────────
describe('cockpit pull feed', () => {
  it('serves a member feed by secret token and honours the reminder opt-in', async () => {
    const admin = await login(ADMIN);
    const member = await login(MEMBER);
    await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });

    const info = await member.f.get('/api/me/cockpit-token');
    assert.equal(info.status, 200);
    const token = info.json.token;
    assert.match(info.json.feedUrl, /\/api\/quests\/cockpit\//);

    // No cookie needed — the token is the credential.
    const anon = fetcher(server.base);
    const feed = await anon.get(`/api/quests/cockpit/${token}.json`);
    assert.equal(feed.status, 200);
    assert.ok(feed.json.counts.availableTotal >= 1, 'member has an available daily quest');
    assert.ok(feed.json.potentialGains, 'gains always present');

    // Opt out → actionable lists emptied, gains still served.
    await member.f.put('/api/me/quest-reminders', { body: { enabled: false } });
    const feed2 = await anon.get(`/api/quests/cockpit/${token}.json`);
    assert.equal(feed2.json.counts.availableTotal, 0);
    assert.ok(feed2.json.potentialGains);

    // Bad token → 404.
    const bad = await anon.get('/api/quests/cockpit/deadbeef.json');
    assert.equal(bad.status, 404);
  });
});

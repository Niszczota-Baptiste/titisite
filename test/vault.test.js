import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';
import { CHEST_SLOTS, normalizeDims, normalizeDoc, VaultValidationError } from '../server/vault/validate.js';
import { planStats } from '../server/vault/capacity.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

function login(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

const DIMS = { x: 125, y: 200, z: 125 };
const FLOOR = { id: 'f1', name: 'Rez — Entrée & tri', yMin: 0, yMax: 5, color: '#c8a24a' };
const ZONE = {
  id: 'z1', floorId: 'f1', rect: { x0: 4, z0: 4, x1: 40, z1: 30 }, yMin: 0, yMax: 5,
  name: 'Redstone', color: '#b02e2e', categoryIds: [], reservedSlots: 0, reserved: false, notes: '',
};
const chest = (id, x, z, over = {}) => ({ id, zoneId: 'z1', x, y: 1, z, items: [], ...over });

const docWith = (over = {}) => ({
  floors: [FLOOR], zones: [ZONE], chests: [], circulation: [], ...over,
});

// ── Unités : normalisation du document ─────────────────────────────────────
describe('vault/validate — normalisation', () => {
  it('refuse des dimensions hors bornes', () => {
    assert.throws(() => normalizeDims({ x: 0, y: 200, z: 125 }), VaultValidationError);
    assert.throws(() => normalizeDims({ x: 125, y: 99999, z: 125 }), VaultValidationError);
    assert.deepEqual(normalizeDims(DIMS), DIMS);
  });

  it('refuse deux étages qui se chevauchent', () => {
    const doc = docWith({
      floors: [FLOOR, { id: 'f2', name: 'R+1', yMin: 5, yMax: 12 }],
      zones: [],
    });
    assert.throws(() => normalizeDoc(doc, DIMS), (e) => e.code === 'floors_overlap');
  });

  it('accepte des tranches Y libres tant qu\'elles ne se touchent pas', () => {
    const doc = docWith({
      floors: [FLOOR, { id: 'f2', name: 'R+1', yMin: 6, yMax: 40 }],
      zones: [],
    });
    assert.equal(normalizeDoc(doc, DIMS).floors.length, 2);
  });

  it('refuse une référence d\'étage inconnue et un id dupliqué', () => {
    assert.throws(
      () => normalizeDoc(docWith({ zones: [{ ...ZONE, floorId: 'nope' }] }), DIMS),
      (e) => e.code === 'unknown_floor',
    );
    assert.throws(
      () => normalizeDoc(docWith({ zones: [ZONE, { ...ZONE }] }), DIMS),
      (e) => e.code === 'duplicate_id',
    );
  });

  it('refuse un coffre hors gabarit', () => {
    assert.throws(
      () => normalizeDoc(docWith({ chests: [chest('c1', 125, 8)] }), DIMS),
      (e) => e.code === 'chest_out_of_bounds',
    );
    assert.throws(
      () => normalizeDoc(docWith({ chests: [chest('c1', 10, 8, { y: 999 })] }), DIMS),
      (e) => e.code === 'chest_out_of_bounds',
    );
    // Le coffre sans fond tient sur une seule case : la dernière colonne passe.
    assert.equal(normalizeDoc(docWith({ chests: [chest('c1', 124, 124)] }), DIMS).chests.length, 1);
  });

  it('donne à une zone la hauteur de son étage par défaut, et la borne dedans', () => {
    const doc = normalizeDoc(docWith({ zones: [{ ...ZONE, yMin: undefined, yMax: undefined }] }), DIMS);
    assert.equal(doc.zones[0].yMin, FLOOR.yMin);
    assert.equal(doc.zones[0].yMax, FLOOR.yMax);
    // Une hauteur qui déborde de l'étage est ramenée dedans, pas refusée.
    const clamped = normalizeDoc(docWith({ zones: [{ ...ZONE, yMin: -5, yMax: 99 }] }), DIMS);
    assert.equal(clamped.zones[0].yMin, FLOOR.yMin);
    assert.equal(clamped.zones[0].yMax, FLOOR.yMax);
  });

  it('détache un coffre dont la zone a disparu au lieu de bloquer la sauvegarde', () => {
    const doc = normalizeDoc({ ...docWith(), zones: [], chests: [chest('c1', 6, 8)] }, DIMS);
    assert.equal(doc.chests[0].zoneId, null);
  });

  it('nettoie la circulation : cases hors gabarit et doublons éliminés', () => {
    const doc = normalizeDoc(docWith({
      circulation: [
        { id: 'p1', kind: 'couloir', floorId: 'f1', cells: [[5, 3], [5, 3], [999, 3], [6, 3]] },
        { id: 'e1', kind: 'entree', floorId: 'f1', cell: [0, 15], label: 'Entrée principale' },
      ],
    }), DIMS);
    assert.deepEqual(doc.circulation[0].cells, [[5, 3], [6, 3]]);
    assert.equal(doc.circulation[1].label, 'Entrée principale');
  });

  it('refuse un escalier qui ne relie pas deux étages distincts', () => {
    const doc = docWith({
      floors: [FLOOR, { id: 'f2', name: 'R+1', yMin: 6, yMax: 12 }],
      circulation: [{ id: 's1', kind: 'escalier', cell: [10, 3], fromFloorId: 'f1', toFloorId: 'f1' }],
    });
    assert.throws(() => normalizeDoc(doc, DIMS), (e) => e.code === 'stair_same_floor');
  });

  it('migre les anciens coffres (kind/facing) et ne garde aucune quantité', () => {
    const doc = normalizeDoc(docWith({
      chests: [{
        id: 'c1', zoneId: 'z1', x: 6, y: 1, z: 8,
        kind: 'double', facing: 'south', quantity: 640,
        items: ['redstone', 'redstone', 'repeater'],
      }],
    }), DIMS);
    const c = doc.chests[0];
    assert.equal(c.kind, undefined, 'plus de type : tout est un coffre sans fond');
    assert.equal(c.facing, undefined, 'ouvrable de partout : plus d’orientation');
    assert.equal(c.quantity, undefined, 'aucune quantité ne survit');
    // Les items sont des désignations de rangement, dédoublonnées.
    assert.deepEqual(c.items, ['redstone', 'repeater']);
    assert.deepEqual(Object.keys(c).sort(), ['id', 'items', 'label', 'x', 'y', 'z', 'zoneId']);
  });
});

// ── Unités : capacité ──────────────────────────────────────────────────────
describe('vault/capacity — capacité structurelle', () => {
  it('compte 72 slots par coffre sans fond', () => {
    const doc = normalizeDoc(docWith({
      chests: [chest('c1', 6, 8), chest('c2', 10, 8, { items: ['redstone'] })],
    }), DIMS);
    const s = planStats(doc, DIMS);
    assert.equal(CHEST_SLOTS, 72);
    assert.equal(s.slots, 144);
    assert.equal(s.chests, 2);
    assert.equal(s.assignedChests, 1);
    assert.equal(s.distinctItems, 1);
  });

  it('compte la réserve manuelle en besoin et signale le déficit', () => {
    const doc = normalizeDoc(docWith({
      zones: [{ ...ZONE, reservedSlots: 100 }],
      chests: [chest('c1', 6, 8)],
    }), DIMS);
    const s = planStats(doc, DIMS);
    assert.equal(s.reservedSlots, 100);
    assert.equal(s.deficit, 100 - 72);
  });

  it('exclut les zones réservées MàJ de la capacité et les compte à part', () => {
    const doc = normalizeDoc(docWith({
      zones: [{ ...ZONE, id: 'z2', reserved: true, reservedSlots: 999 }],
      chests: [chest('c1', 6, 8, { zoneId: 'z2' })],
    }), DIMS);
    const s = planStats(doc, DIMS);
    assert.equal(s.slots, 0);
    assert.equal(s.reservedSlots, 0);
    assert.equal(s.reservedZones, 1);
    assert.ok(s.reservedVolumePct > 0);
  });
});

// ── API ────────────────────────────────────────────────────────────────────
describe('vault — API plans, partage, snapshots', () => {
  let admin;
  let member;
  let planId;

  it('un membre sans le flag n\'atteint pas l\'atelier', async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    assert.equal(member.user.canViewVault, false);
    assert.equal((await member.f.get('/api/vault-plans')).status, 403);
    // L'admin passe outre le flag.
    assert.equal(admin.user.canViewVault, true);
    assert.equal((await admin.f.get('/api/vault-plans')).status, 200);
  });

  it('les catégories sont amorcées depuis le codex', async () => {
    const r = await admin.f.get('/api/vault-categories');
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 9);
    const redstone = r.json.find((c) => c.name === 'Redstone');
    assert.ok(redstone.itemIds.length > 0, 'la catégorie Redstone est pré-remplie');
  });

  it('crée un plan 125×200×125', async () => {
    const r = await admin.f.post('/api/vault-plans', {
      body: { name: 'Salle des coffres — Fédération', mcVersion: '1.21', dims: DIMS, worldOrigin: { x: -1200, y: -60, z: 3400 } },
    });
    assert.equal(r.status, 201);
    planId = r.json.id;
    assert.deepEqual(r.json.dims, DIMS);
    assert.deepEqual(r.json.worldOrigin, { x: -1200, y: -60, z: 3400 });
    assert.equal(r.json.revision, 1);
    assert.equal(r.json.role, 'owner');
  });

  it('sauvegarde un document et incrémente la révision', async () => {
    const r = await admin.f.put(`/api/vault-plans/${planId}`, {
      body: {
        revision: 1,
        ...docWith({
          chests: [chest('c1', 6, 8, { items: ['redstone'] })],
          circulation: [{ id: 'p1', kind: 'couloir', floorId: 'f1', cells: [[5, 3], [6, 3]] }],
        }),
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.revision, 2);
    assert.equal(r.json.chests.length, 1);
    assert.equal(r.json.stats.slots, 72);
    assert.deepEqual(r.json.chests[0].items, ['redstone']);
  });

  it('rejette un document structurellement incohérent en 422', async () => {
    const r = await admin.f.put(`/api/vault-plans/${planId}`, {
      body: { revision: 2, ...docWith({ zones: [{ ...ZONE, rect: { x0: 4, z0: 4, x1: 400, z1: 30 } }] }) },
    });
    assert.equal(r.status, 422);
    assert.equal(r.json.error, 'zone_out_of_bounds');
  });

  it('renvoie 409 sur une révision périmée, avec de quoi remplir la modale', async () => {
    const r = await admin.f.put(`/api/vault-plans/${planId}`, { body: { revision: 1, ...docWith() } });
    assert.equal(r.status, 409);
    assert.equal(r.json.serverRevision, 2);
    assert.ok(r.json.updatedAt > 0);
    assert.ok('updatedBy' in r.json);
    // Le plan serveur n'a pas bougé.
    assert.equal((await admin.f.get(`/api/vault-plans/${planId}`)).json.revision, 2);
  });

  it('« Écraser » force la sauvegarde malgré la révision périmée', async () => {
    const r = await admin.f.put(`/api/vault-plans/${planId}`, {
      body: { revision: 1, force: true, ...docWith({ zones: [{ ...ZONE, name: 'Redstone (écrasé)' }] }) },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.revision, 3);
    assert.equal(r.json.zones[0].name, 'Redstone (écrasé)');
  });

  it('un plan reste invisible tant qu\'il n\'est pas partagé', async () => {
    await admin.f.put('/api/users/2', { body: { canViewVault: true } });
    const relogged = await login(MEMBER);
    member = relogged;
    assert.equal(member.user.canViewVault, true);
    assert.deepEqual((await member.f.get('/api/vault-plans')).json, []);
    // Ni lecture, ni existence : 404, pas 403.
    assert.equal((await member.f.get(`/api/vault-plans/${planId}`)).status, 404);
    assert.equal((await member.f.put(`/api/vault-plans/${planId}`, { body: { revision: 3, ...docWith() } })).status, 404);
  });

  it('le partage ouvre l\'édition complète au binôme', async () => {
    const r = await admin.f.post(`/api/vault-plans/${planId}/share`, { body: { userId: member.user.id } });
    assert.equal(r.status, 200);
    assert.equal(r.json.sharedWith.length, 1);
    assert.equal(r.json.sharedWith[0].canViewVault, true);

    const list = await member.f.get('/api/vault-plans');
    assert.equal(list.json.length, 1);
    assert.equal(list.json[0].role, 'shared');

    const saved = await member.f.put(`/api/vault-plans/${planId}`, {
      body: { revision: 3, ...docWith({ zones: [{ ...ZONE, name: 'Redstone (binôme)' }] }) },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.revision, 4);
  });

  it('seul le propriétaire partage et supprime', async () => {
    assert.equal((await member.f.post(`/api/vault-plans/${planId}/share`, { body: { userId: 1 } })).status, 403);
    assert.equal((await member.f.delete(`/api/vault-plans/${planId}`)).status, 403);
    assert.equal((await admin.f.post(`/api/vault-plans/${planId}/share`, { body: { userId: 1 } })).status, 400);
    assert.equal((await admin.f.post(`/api/vault-plans/${planId}/share`, { body: { userId: 9999 } })).status, 404);
  });

  it('un snapshot fige le plan et se restaure en NOUVEAU plan', async () => {
    const cat = (await admin.f.get('/api/vault-categories')).json.find((c) => c.name === 'Redstone');
    await admin.f.put(`/api/vault-plans/${planId}`, {
      body: { revision: 4, ...docWith({ zones: [{ ...ZONE, categoryIds: [cat.id] }] }) },
    });

    const snap = await admin.f.post(`/api/vault-plans/${planId}/snapshots`, { body: { label: 'v1.21 — avant MàJ été' } });
    assert.equal(snap.status, 201);
    assert.equal(snap.json.label, 'v1.21 — avant MàJ été');
    // Le snapshot embarque une copie de la catégorie référencée.
    assert.equal(snap.json.categories.length, 1);
    assert.equal((await admin.f.get(`/api/vault-plans/${planId}/snapshots`)).json.length, 1);

    // La catégorie disparaît : la restauration doit la recréer et remapper.
    assert.equal((await admin.f.delete(`/api/vault-categories/${cat.id}`)).status, 204);
    const restored = await admin.f.post(`/api/vault-plans/${planId}/snapshots/${snap.json.id}/restore`);
    assert.equal(restored.status, 201);
    assert.notEqual(restored.json.id, planId, 'restaurer duplique, n\'écrase pas');
    assert.match(restored.json.name, /v1\.21/);
    assert.equal(restored.json.revision, 1);

    const newCatId = restored.json.zones[0].categoryIds[0];
    assert.notEqual(newCatId, cat.id);
    const recreated = (await admin.f.get('/api/vault-categories')).json.find((c) => c.id === newCatId);
    assert.equal(recreated.name, 'Redstone');

    // L'original est intact.
    assert.equal((await admin.f.get(`/api/vault-plans/${planId}`)).json.revision, 5);
    await admin.f.delete(`/api/vault-plans/${restored.json.id}`);
  });

  it('le propriétaire supprime, le plan disparaît des deux côtés', async () => {
    assert.equal((await admin.f.delete(`/api/vault-plans/${planId}`)).status, 204);
    assert.deepEqual((await member.f.get('/api/vault-plans')).json, []);
    assert.equal((await admin.f.get(`/api/vault-plans/${planId}`)).status, 404);
  });
});

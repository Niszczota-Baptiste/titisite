import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { bootServer, fetcher } from './harness.js';

// Page « 🛡 Admin » du module Lore : réservée au rôle admin, et surtout
// journal d'audit en AJOUT SEUL — sa raison d'être est de survivre aux
// suppressions en cascade, qui autrement ne laissent aucune trace.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => {
  server = await bootServer({ env: { SEED_DEMO_QUESTS: 'off', SEED_UNIQUE_ITEMS: 'off', SEED_LORE: 'off' } });
});
after(async () => { await server.stop(); });

function login(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

const png = (w = 40, h = 40) => sharp({
  create: { width: w, height: h, channels: 3, background: { r: 90, g: 160, b: 120 } },
}).png().toBuffer();

async function uploadMedia(api, entryId, name) {
  const fd = new FormData();
  fd.append('image', new Blob([await png()], { type: 'image/png' }), name);
  fd.append('entryId', String(entryId));
  const r = await api.post('/api/lore/media', { body: fd });
  assert.equal(r.status, 201, r.text);
  return r.json;
}

describe('lore — page admin & journal d’audit', () => {
  let admin;
  let member;
  let memberId;

  before(async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    const users = await admin.f.get('/api/users');
    memberId = users.json.find((u) => u.email === MEMBER.email).id;
    // On ouvre le lore au membre : il devient enquêteur, pas administrateur.
    await admin.f.put(`/api/users/${memberId}`, { body: { canViewLore: true } });
    member = await login(MEMBER);
    assert.equal(member.user.canViewLore, true);
    assert.equal(member.user.role, 'member');
  });

  it('le tag lore ne suffit pas : /admin/* exige le rôle admin', async () => {
    for (const path of ['/api/lore/admin/overview', '/api/lore/admin/media', '/api/lore/admin/journal']) {
      const r = await member.f.get(path);
      assert.equal(r.status, 403, `${path} → ${r.status} (attendu 403)`);
      assert.equal(r.json.error, 'forbidden');
    }
    // Et sans session du tout : 401, jamais de fuite.
    const anon = fetcher(server.base);
    assert.equal((await anon.get('/api/lore/admin/overview')).status, 401);
  });

  it('l’admin voit les trois vues', async () => {
    const o = await admin.f.get('/api/lore/admin/overview');
    assert.equal(o.status, 200, o.text);
    assert.ok(Array.isArray(o.json.members));
    assert.ok(o.json.storage);
    assert.equal((await admin.f.get('/api/lore/admin/media')).status, 200);
    assert.equal((await admin.f.get('/api/lore/admin/journal')).status, 200);
  });

  it('journalise les ajouts avec le type et le poids du fichier', async () => {
    const e = await member.f.post('/api/lore/entries', {
      body: { title: 'Ruine engloutie', bodyMd: 'notes', entryType: 'structure' },
    });
    assert.equal(e.status, 201, e.text);
    const media = await uploadMedia(member.f, e.json.id, 'capture-terrain.png');

    const journal = (await admin.f.get('/api/lore/admin/journal')).json;

    const entryLog = journal.find((j) => j.targetType === 'entry' && j.action === 'create');
    assert.ok(entryLog, 'la création d’entrée doit être journalisée');
    assert.equal(entryLog.label, 'Ruine engloutie');
    assert.equal(entryLog.actorId, memberId);

    const mediaLog = journal.find((j) => j.targetType === 'media' && j.action === 'create');
    assert.ok(mediaLog, 'l’upload doit être journalisé');
    // Le « quel type de fichier » et le « combien ça pèse » demandés.
    assert.equal(mediaLog.label, 'capture-terrain.png');
    assert.equal(mediaLog.detail.mimeType, 'image/webp'); // recompressé par le pipeline
    assert.ok(mediaLog.detail.size > 0);
    assert.ok(mediaLog.detail.width > 0 && mediaLog.detail.height > 0);
    assert.equal(mediaLog.detail.entryId, e.json.id);
    assert.equal(mediaLog.targetId, media.id);
  });

  it('une suppression en cascade laisse une trace de CE qu’elle a emporté', async () => {
    // Une entrée avec deux pièces jointes : la cascade va effacer les deux.
    const e = await member.f.post('/api/lore/entries', {
      body: { title: 'Dossier à saboter', bodyMd: 'x', entryType: 'observation' },
    });
    const m1 = await uploadMedia(member.f, e.json.id, 'preuve-1.png');
    const m2 = await uploadMedia(member.f, e.json.id, 'preuve-2.png');
    const expectedBytes = m1.size + m2.size;

    assert.equal((await member.f.delete(`/api/lore/entries/${e.json.id}`)).status, 204);

    // Les lignes ont disparu de la base…
    assert.equal((await admin.f.get(`/api/lore/entries/${e.json.id}`)).status, 404);

    // …mais le journal sait quoi, qui, quand, et à quel prix.
    const journal = (await admin.f.get('/api/lore/admin/journal?action=delete&type=entry')).json;
    const del = journal.find((j) => j.targetId === e.json.id);
    assert.ok(del, 'la suppression doit être journalisée');
    assert.equal(del.label, 'Dossier à saboter', 'le titre doit être figé AVANT la suppression');
    assert.equal(del.actorId, memberId);
    assert.equal(del.detail.mediaCount, 2, 'la cascade emportait 2 médias');
    assert.equal(del.detail.mediaBytes, expectedBytes);
  });

  it('compte les suppressions et le poids déposé par membre', async () => {
    const o = await admin.f.get('/api/lore/admin/overview');
    const row = o.json.members.find((m) => m.id === memberId);
    assert.ok(row, 'le membre doit figurer dans le tableau');
    assert.ok(row.deletions >= 1, 'sa suppression doit être comptée');
    assert.ok(row.mediaBytes > 0, 'son dépôt doit être pesé');
    assert.ok(row.lastActionAt > 0);
    // L'inventaire liste les médias restants, du plus lourd au plus léger.
    const media = (await admin.f.get('/api/lore/admin/media')).json;
    assert.ok(media.length >= 1);
    for (let i = 1; i < media.length; i++) {
      assert.ok(media[i - 1].size >= media[i].size, 'tri par poids décroissant');
    }
  });

  it('repère les pièces jointes rattachées à rien (dépôt perso)', async () => {
    // Un média rattaché à une hypothèse supprimée ensuite ne reste pas orphelin
    // (cascade) ; l'orphelin type est le fond de carte, hors entrée/hypothèse.
    const before = (await admin.f.get('/api/lore/admin/overview')).json.storage;
    const map = await admin.f.post('/api/lore/maps', { body: { name: 'Atlas' } });
    const fd = new FormData();
    fd.append('image', new Blob([await png(64, 64)], { type: 'image/png' }), 'fond.png');
    assert.equal((await admin.f.post(`/api/lore/maps/${map.json.id}/image`, { body: fd })).status, 200);

    const after = (await admin.f.get('/api/lore/admin/overview')).json.storage;
    // Le fond de carte ne passe pas par lore_media : ce sont les compteurs de
    // médias qui doivent rester stables, et la carte être journalisée.
    assert.equal(after.mediaCount, before.mediaCount);
    const journal = (await admin.f.get('/api/lore/admin/journal?type=map_image')).json;
    assert.equal(journal.length, 1);
    assert.equal(journal[0].label, 'Atlas');
    assert.equal(journal[0].action, 'update');
  });

  it('les tentatives refusées ne polluent pas le journal', async () => {
    const before = (await admin.f.get('/api/lore/admin/journal')).json.length;
    // 400 : titre manquant. Rien ne doit être enregistré.
    assert.equal((await member.f.post('/api/lore/entries', { body: { bodyMd: 'x' } })).status, 400);
    // 404 : cible inexistante.
    assert.equal((await member.f.delete('/api/lore/entries/999999')).status, 404);
    const after = (await admin.f.get('/api/lore/admin/journal')).json.length;
    assert.equal(after, before, 'seules les actions réussies sont journalisées');
  });

  it('compte les commentaires par membre et globalement', async () => {
    const e = await admin.f.post('/api/lore/entries', {
      body: { title: 'Sujet de débat', bodyMd: 'x', entryType: 'texte' },
    });
    const post = (api, body) => api.post('/api/comments', {
      body: { targetType: 'lore_entry', targetId: e.json.id, body },
    });
    assert.equal((await post(admin.f, 'Première lecture des glyphes.')).status, 201);
    assert.equal((await post(member.f, 'Je confirme, deux se répètent.')).status, 201);
    assert.equal((await post(member.f, 'Et un troisième plus bas.')).status, 201);

    const o = (await admin.f.get('/api/lore/admin/overview')).json;
    assert.equal(o.storage.commentCount, 3);
    assert.equal(o.storage.threadCount, 1);
    assert.equal(o.members.find((m) => m.id === memberId).comments, 2);
    assert.ok(o.members.find((m) => m.role === 'admin').comments >= 1);

    const threads = (await admin.f.get('/api/lore/admin/threads')).json;
    const t = threads.find((x) => x.targetId === e.json.id);
    assert.equal(t.count, 3);
    assert.equal(t.participants, 2);
    assert.equal(t.title, 'Sujet de débat');
    assert.equal(t.targetType, 'lore_entry');
  });

  it('journalise les commentaires, et signale l’effacement du message d’autrui', async () => {
    const e = await member.f.post('/api/lore/entries', {
      body: { title: 'Fil surveillé', bodyMd: 'x', entryType: 'observation' },
    });
    const c = await member.f.post('/api/comments', {
      body: { targetType: 'lore_entry', targetId: e.json.id, body: 'Message du membre' },
    });
    assert.equal(c.status, 201);

    let log = (await admin.f.get('/api/lore/admin/journal?type=comment')).json;
    const added = log.find((j) => j.targetId === c.json.id && j.action === 'create');
    assert.ok(added, 'le message posté doit être journalisé');
    // Le libellé est le SUJET, pas l'id — c'est ce qui se lit dans le journal.
    assert.equal(added.label, 'Fil surveillé');
    assert.equal(added.detail.excerpt, 'Message du membre');
    assert.equal(added.actorId, memberId);

    // L'admin efface le message du membre : le journal doit le dire.
    assert.equal((await admin.f.delete(`/api/comments/${c.json.id}`)).status, 204);
    log = (await admin.f.get('/api/lore/admin/journal?type=comment&action=delete')).json;
    const removed = log.find((j) => j.targetId === c.json.id);
    assert.ok(removed, 'la suppression doit être journalisée');
    assert.equal(removed.label, 'Fil surveillé');
    assert.equal(removed.detail.excerpt, 'Message du membre', 'le texte effacé doit être figé');
    assert.equal(removed.detail.ofSomeoneElse, true, 'effacer le message d’un autre doit être signalé');

    // Un membre qui efface SON message n'est pas signalé de la même façon.
    const own = await member.f.post('/api/comments', {
      body: { targetType: 'lore_entry', targetId: e.json.id, body: 'Le mien' },
    });
    assert.equal((await member.f.delete(`/api/comments/${own.json.id}`)).status, 204);
    log = (await admin.f.get('/api/lore/admin/journal?type=comment&action=delete')).json;
    assert.equal(log.find((j) => j.targetId === own.json.id).detail.ofSomeoneElse, false);
  });

  it('les commentaires hors lore ne polluent pas le journal du lore', async () => {
    const before = (await admin.f.get('/api/lore/admin/journal')).json.length;
    // 'discussion' est le fil d'équipe global, sans rapport avec le lore.
    const r = await admin.f.post('/api/comments', {
      body: { targetType: 'discussion', targetId: 0, body: 'Réunion demain' },
    });
    assert.equal(r.status, 201);
    const after = (await admin.f.get('/api/lore/admin/journal')).json.length;
    assert.equal(after, before, 'seules les cibles lore alimentent ce journal');
    // …et ce commentaire ne doit pas non plus gonfler les compteurs du lore.
    const o = (await admin.f.get('/api/lore/admin/overview')).json;
    const threads = (await admin.f.get('/api/lore/admin/threads')).json;
    assert.ok(threads.every((t) => t.targetType.startsWith('lore_')));
    assert.equal(o.storage.threadCount, threads.length);
  });

  it('le journal filtre par membre, action et type', async () => {
    const mine = (await admin.f.get(`/api/lore/admin/journal?actor=${memberId}`)).json;
    assert.ok(mine.length > 0);
    assert.ok(mine.every((j) => j.actorId === memberId));

    const deletions = (await admin.f.get('/api/lore/admin/journal?action=delete')).json;
    assert.ok(deletions.every((j) => j.action === 'delete'));

    assert.equal((await admin.f.get('/api/lore/admin/journal?actor=abc')).status, 400);
  });
});

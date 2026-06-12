import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

function loggedIn(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return f;
  });
}

const VALID = {
  name: 'Visiteur Test',
  email: 'visiteur@example.com',
  message: 'Bonjour, ceci est un message de test suffisamment long.',
};

// NOTE : le rate-limit (5 POST/min/IP) est partagé par tout le fichier — les
// describe ci-dessous totalisent ≤ 5 envois avant le test du rate-limit, qui
// doit rester le dernier.

describe('contact — validation publique', () => {
  it('rejette un email invalide', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/contact', { body: { ...VALID, email: 'pas-un-email' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_email');
  });

  it('rejette un message trop court (< 10 caractères)', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/contact', { body: { ...VALID, message: 'court' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_message');
  });

  it('rejette un message trop long (> 5000 caractères)', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/contact', { body: { ...VALID, message: 'x'.repeat(5001) } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_message');
  });
});

describe('contact — honeypot', () => {
  it('répond 200 sans rien stocker quand le champ caché est rempli', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/contact', {
      body: { ...VALID, email: 'bot@spam.test', website: 'http://spam.example' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);

    const admin = await loggedIn(ADMIN);
    const list = await admin.get('/api/contact');
    assert.equal(list.status, 200);
    assert.ok(!list.json.some((m) => m.email === 'bot@spam.test'), 'le message du bot ne doit pas être stocké');
  });
});

describe('contact — envoi valide + accès admin', () => {
  it('stocke un message valide, visible par l’admin uniquement', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/contact', { body: VALID });
    assert.equal(r.status, 200);

    // Anonyme et membre : pas d'accès à la boîte de réception.
    assert.equal((await fetcher(server.base).get('/api/contact')).status, 401);
    const member = await loggedIn(MEMBER);
    assert.equal((await member.get('/api/contact')).status, 403);

    const admin = await loggedIn(ADMIN);
    const list = await admin.get('/api/contact');
    assert.equal(list.status, 200);
    const msg = list.json.find((m) => m.email === VALID.email);
    assert.ok(msg, 'message stocké');
    assert.equal(msg.name, VALID.name);
    assert.equal(msg.read, 0);

    // Marquer lu / non lu, puis supprimer.
    const read = await admin.patch(`/api/contact/${msg.id}/read`, { body: { read: true } });
    assert.equal(read.status, 200);
    const after1 = await admin.get('/api/contact');
    assert.equal(after1.json.find((m) => m.id === msg.id).read, 1);

    assert.equal((await member.patch(`/api/contact/${msg.id}/read`, { body: { read: false } })).status, 403);
    assert.equal((await member.delete(`/api/contact/${msg.id}`)).status, 403);

    const del = await admin.delete(`/api/contact/${msg.id}`);
    assert.equal(del.status, 204);
    const after2 = await admin.get('/api/contact');
    assert.ok(!after2.json.some((m) => m.id === msg.id));
  });
});

describe('contact — rate-limit dédié (5/min/IP)', () => {
  it('finit par répondre 429 sur une rafale', async () => {
    const f = fetcher(server.base);
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const r = await f.post('/api/contact', {
        body: { ...VALID, message: `Rafale numéro ${i} — message assez long pour la validation.` },
      });
      statuses.push(r.status);
    }
    assert.ok(statuses.includes(429), `aucun 429 dans la rafale : ${statuses.join(',')}`);
    // Une fois la limite atteinte, les envois suivants restent bloqués.
    const again = await f.post('/api/contact', { body: VALID });
    assert.equal(again.status, 429);
  });
});

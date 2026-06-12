import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };
const WS = 'projet-principal'; // seeded workspace, both users are members

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

function loggedIn(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return f;
  });
}

describe('workspace activity-count (badges nouveautés)', () => {
  it('refuse les anonymes', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.get(`/api/workspaces/${WS}/activity-count`)).status, 401);
  });

  it('compte les nouveautés depuis la dernière visite, puis repart à zéro', async () => {
    const member = await loggedIn(MEMBER);
    const admin = await loggedIn(ADMIN);

    // Première visite : jamais vu → rien n'est compté (pas de bruit).
    const first = await member.get(`/api/workspaces/${WS}/activity-count`);
    assert.equal(first.status, 200);
    assert.equal(first.json.total, 0);

    // Le membre marque sa visite.
    assert.equal((await member.post(`/api/workspaces/${WS}/activity-count/seen`)).status, 200);

    // SQLite stocke last_seen_at à la seconde : on attend que la fenêtre bascule.
    await new Promise((r) => setTimeout(r, 1100));

    // L'admin crée une feature + un commentaire dessus.
    const feat = await admin.post(`/api/workspaces/${WS}/features`, {
      body: { title: 'Nouvelle feature badge' },
    });
    assert.equal(feat.status, 201, JSON.stringify(feat.json));
    const com = await admin.post('/api/comments', {
      body: { targetType: 'feature', targetId: feat.json.id, body: 'Un commentaire' },
    });
    assert.equal(com.status, 201, JSON.stringify(com.json));

    const counts = await member.get(`/api/workspaces/${WS}/activity-count`);
    assert.equal(counts.status, 200);
    assert.ok(counts.json.features >= 1, `features: ${counts.json.features}`);
    assert.ok(counts.json.comments >= 1, `comments: ${counts.json.comments}`);
    assert.ok(counts.json.total >= 2);

    // Ses propres commentaires ne comptent pas pour lui-même.
    const own = await member.post('/api/comments', {
      body: { targetType: 'feature', targetId: feat.json.id, body: 'Ma réponse' },
    });
    assert.equal(own.status, 201);
    const counts2 = await member.get(`/api/workspaces/${WS}/activity-count`);
    assert.equal(counts2.json.comments, counts.json.comments, 'le propre commentaire ne doit pas incrémenter');

    // Marquer vu → tout retombe à zéro.
    await member.post(`/api/workspaces/${WS}/activity-count/seen`);
    const after1 = await member.get(`/api/workspaces/${WS}/activity-count`);
    assert.equal(after1.json.total, 0);
  });
});

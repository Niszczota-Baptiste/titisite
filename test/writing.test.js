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

describe('writing — public reading API', () => {
  it('lists the seeded published work', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/ecriture');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
    assert.ok(r.json.some((w) => w.slug === 'nostra' && w.isPublished));
  });

  it('returns a work with ordered chapters, linked character and verbatim tokens', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/ecriture/nostra');
    assert.equal(r.status, 200);
    assert.ok(r.json.chapters.length >= 2);
    assert.equal(r.json.chapters[0].number, 'Livre I');
    // ASCII boxes + custom tokens must survive untouched for the renderer.
    assert.match(r.json.chapters[0].content, /╔/);
    assert.match(r.json.chapters[0].content, /\[\[perso:nielas\|Nielas\]\]/);
    assert.match(r.json.chapters[0].content, /\{\{kr:호수 신념\}\}/);
    assert.ok(r.json.characters.some((c) => c.slug === 'nielas'));
  });

  it('exposes the glossary and the character index', async () => {
    const f = fetcher(server.base);
    const lex = await f.get('/api/lexique');
    assert.equal(lex.status, 200);
    assert.ok(lex.json.length >= 2);
    const chars = await f.get('/api/personnages');
    assert.ok(chars.json.some((c) => c.slug === 'nielas'));
    const one = await f.get('/api/personnages/nielas');
    assert.equal(one.status, 200);
    assert.ok(one.json.works.some((w) => w.slug === 'nostra'));
  });

  it('404s an unknown work / character', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.get('/api/ecriture/nope')).status, 404);
    assert.equal((await f.get('/api/personnages/nope')).status, 404);
  });
});

describe('writing — auth', () => {
  it('rejects writes without an admin cookie', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/writing/works', { body: { title: 'X' } })).status, 401);
    assert.equal((await f.get('/api/writing/works')).status, 401);
  });

  it('forbids members from the admin CRUD', async () => {
    const f = await loggedIn(MEMBER);
    assert.equal((await f.get('/api/writing/works')).status, 403);
  });
});

describe('writing — admin CRUD', () => {
  it('creates an unpublished work that stays out of the public list', async () => {
    const f = await loggedIn(ADMIN);
    const created = await f.post('/api/writing/works', { body: { title: 'Atelier secret', status: 'wip', isPublished: false } });
    assert.equal(created.status, 201);
    assert.equal(created.json.slug, 'atelier-secret');

    const pub = await fetcher(server.base).get('/api/ecriture');
    assert.ok(!pub.json.some((w) => w.slug === 'atelier-secret'), 'draft leaked into public list');

    // Admin sees it though.
    const adminList = await f.get('/api/writing/works');
    assert.ok(adminList.json.some((w) => w.slug === 'atelier-secret'));
  });

  it('adds a chapter with a track FK and links a character', async () => {
    const f = await loggedIn(ADMIN);
    const work = (await f.post('/api/writing/works', { body: { title: 'Le Cycle', isPublished: true } })).json;
    const track = (await f.get('/api/tracks')).json[0];
    const ch = await f.post(`/api/writing/works/${work.id}/chapters`, {
      body: { number: 'Livre I', title: 'Aube', content: 'x', audioTrackId: track.id },
    });
    assert.equal(ch.status, 201);
    assert.equal(ch.json.audioTrackId, track.id);

    const char = (await f.post('/api/writing/characters', { body: { name: 'Aria' } })).json;
    const link = await f.put(`/api/writing/works/${work.id}/characters`, { body: { characterIds: [char.id] } });
    assert.deepEqual(link.json.characterIds, [char.id]);

    const view = await fetcher(server.base).get('/api/ecriture/le-cycle');
    assert.equal(view.status, 200);
    assert.ok(view.json.characters.some((c) => c.slug === 'aria'));
  });

  it('keeps a draft-only character out of the public index', async () => {
    const f = await loggedIn(ADMIN);
    const draft = (await f.post('/api/writing/works', { body: { title: 'Brouillon', isPublished: false } })).json;
    const ghost = (await f.post('/api/writing/characters', { body: { name: 'Fantome' } })).json;
    await f.put(`/api/writing/works/${draft.id}/characters`, { body: { characterIds: [ghost.id] } });

    const chars = await fetcher(server.base).get('/api/personnages');
    assert.ok(!chars.json.some((c) => c.slug === 'fantome'), 'draft-only character leaked');
    assert.equal((await fetcher(server.base).get('/api/personnages/fantome')).status, 404);
  });

  it('reorders chapters', async () => {
    const f = await loggedIn(ADMIN);
    const work = (await f.post('/api/writing/works', { body: { title: 'Ordre' } })).json;
    const c1 = (await f.post(`/api/writing/works/${work.id}/chapters`, { body: { title: 'un' } })).json;
    const c2 = (await f.post(`/api/writing/works/${work.id}/chapters`, { body: { title: 'deux' } })).json;
    const out = await f.post(`/api/writing/works/${work.id}/chapters/reorder`, { body: { order: [c2.id, c1.id] } });
    assert.equal(out.status, 200);
    assert.deepEqual(out.json.map((c) => c.title), ['deux', 'un']);
  });

  it('rejects an empty title and bad media owner', async () => {
    const f = await loggedIn(ADMIN);
    assert.equal((await f.post('/api/writing/works', { body: { title: '   ' } })).status, 400);
    assert.equal((await f.post('/api/writing/media', { body: { type: 'screenshot' } })).status, 400);
  });
});

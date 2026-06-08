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

describe('writing — public reading API (projects → books)', () => {
  it('lists the seeded published project with its book count', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/ecriture');
    assert.equal(r.status, 200);
    const nostra = r.json.find((p) => p.slug === 'nostra');
    assert.ok(nostra && nostra.isPublished);
    assert.ok(nostra.bookCount >= 2);
  });

  it('returns a project with books, project characters and glossary', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/ecriture/nostra');
    assert.equal(r.status, 200);
    assert.ok(r.json.entries.length >= 2);
    assert.ok(r.json.characters.some((c) => c.slug === 'nielas'));
    assert.ok(r.json.glossary.length >= 2);
  });

  it('reads a book with chapters + the project characters/glossary for tokens', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/ecriture/nostra/le-cycle-des-cendres');
    assert.equal(r.status, 200);
    assert.equal(r.json.project.slug, 'nostra');
    assert.ok(r.json.chapters.length >= 2);
    assert.match(r.json.chapters[0].content, /╔/);
    assert.match(r.json.chapters[0].content, /\[\[perso:nielas\|Nielas\]\]/);
    assert.ok(r.json.characters.some((c) => c.slug === 'nielas'));
    assert.ok(r.json.glossary.length >= 2);
  });

  it('serves a project character', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/ecriture/nostra/personnages/nielas');
    assert.equal(r.status, 200);
    assert.equal(r.json.project.slug, 'nostra');
  });

  it('404s unknown project / book / character', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.get('/api/ecriture/nope')).status, 404);
    assert.equal((await f.get('/api/ecriture/nostra/nope')).status, 404);
    assert.equal((await f.get('/api/ecriture/nostra/personnages/nope')).status, 404);
  });
});

describe('writing — auth', () => {
  it('rejects writes without an admin cookie', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/writing/projects', { body: { title: 'X' } })).status, 401);
    assert.equal((await f.get('/api/writing/projects')).status, 401);
  });
  it('forbids members from the admin CRUD', async () => {
    const f = await loggedIn(MEMBER);
    assert.equal((await f.get('/api/writing/projects')).status, 403);
  });
});

describe('writing — admin CRUD (project-scoped)', () => {
  it('creates a draft project that stays off the public list', async () => {
    const f = await loggedIn(ADMIN);
    const p = (await f.post('/api/writing/projects', { body: { title: 'Atelier secret', isPublished: false } })).json;
    assert.equal(p.slug, 'atelier-secret');
    const pub = await fetcher(server.base).get('/api/ecriture');
    assert.ok(!pub.json.some((x) => x.slug === 'atelier-secret'), 'draft project leaked');
    assert.ok((await f.get('/api/writing/projects')).json.some((x) => x.slug === 'atelier-secret'));
  });

  it('creates a book under a project with a chapter + track FK', async () => {
    const f = await loggedIn(ADMIN);
    const proj = (await f.post('/api/writing/projects', { body: { title: 'Univers Test', isPublished: true } })).json;
    const track = (await f.get('/api/tracks')).json[0];
    const book = (await f.post(`/api/writing/projects/${proj.id}/works`, { body: { title: 'Tome I', isPublished: true } })).json;
    assert.equal(book.projectId, proj.id);
    const ch = await f.post(`/api/writing/works/${book.id}/chapters`, { body: { title: 'Ch1', content: 'x', audioTrackId: track.id } });
    assert.equal(ch.json.audioTrackId, track.id);

    const view = await fetcher(server.base).get(`/api/ecriture/${proj.slug}/${book.slug}`);
    assert.equal(view.status, 200);
    assert.equal(view.json.chapters.length, 1);
  });

  it('scopes characters and glossary to their project', async () => {
    const f = await loggedIn(ADMIN);
    const a = (await f.post('/api/writing/projects', { body: { title: 'Univers A', isPublished: true } })).json;
    const b = (await f.post('/api/writing/projects', { body: { title: 'Univers B', isPublished: true } })).json;
    await f.post(`/api/writing/projects/${a.id}/characters`, { body: { name: 'Alpha' } });
    await f.post(`/api/writing/projects/${b.id}/characters`, { body: { name: 'Beta' } });
    await f.post(`/api/writing/projects/${a.id}/glossary`, { body: { termKr: '가' } });

    const aChars = (await f.get(`/api/writing/projects/${a.id}/characters`)).json;
    assert.ok(aChars.some((c) => c.name === 'Alpha'));
    assert.ok(!aChars.some((c) => c.name === 'Beta'), 'character leaked across projects');
    assert.equal((await f.get(`/api/writing/projects/${b.id}/glossary`)).json.length, 0);

    // Public project payload only carries its own characters.
    const pubA = await fetcher(server.base).get('/api/ecriture/univers-a');
    assert.ok(pubA.json.characters.some((c) => c.name === 'Alpha'));
    assert.ok(!pubA.json.characters.some((c) => c.name === 'Beta'));
  });

  it('nests typed entries (tree) and exposes children + breadcrumb', async () => {
    const f = await loggedIn(ADMIN);
    const proj = (await f.post('/api/writing/projects', { body: { title: 'Arbre', isPublished: true } })).json;
    const region = (await f.post(`/api/writing/projects/${proj.id}/works`, { body: { title: 'Le Nord', type: 'Région', content: 'Froid.', isPublished: true } })).json;
    assert.equal(region.type, 'Région');
    const city = (await f.post(`/api/writing/projects/${proj.id}/works`, { body: { title: 'Aldoria', type: 'Cité', parentId: region.id, isPublished: true } })).json;
    assert.equal(city.parentId, region.id);

    // Top-level listing shows only roots.
    const proj2 = await fetcher(server.base).get(`/api/ecriture/${proj.slug}`);
    assert.ok(proj2.json.entries.some((e) => e.slug === region.slug));
    assert.ok(!proj2.json.entries.some((e) => e.slug === city.slug), 'child leaked to top level');

    // Reading the region exposes its child + content; reading the city has a trail.
    const reg = await fetcher(server.base).get(`/api/ecriture/${proj.slug}/${region.slug}`);
    assert.equal(reg.json.content, 'Froid.');
    assert.ok(reg.json.children.some((c) => c.slug === city.slug));
    const cit = await fetcher(server.base).get(`/api/ecriture/${proj.slug}/${city.slug}`);
    assert.deepEqual(cit.json.trail.map((t) => t.title), ['Le Nord']);

    // Cycle guard: region can't become a child of its own descendant.
    assert.equal((await f.put(`/api/writing/works/${region.id}`, { body: { parentId: city.id } })).json.error, 'invalid_parent');
  });

  it('links characters (with a note) and an OST to an element', async () => {
    const f = await loggedIn(ADMIN);
    const proj = (await f.post('/api/writing/projects', { body: { title: 'Lié', isPublished: true } })).json;
    const char = (await f.post(`/api/writing/projects/${proj.id}/characters`, { body: { name: 'Nielas' } })).json;
    const track = (await f.get('/api/tracks')).json[0];
    const book = (await f.post(`/api/writing/projects/${proj.id}/works`, {
      body: { title: 'Livre I', isPublished: true, audioTrackId: track.id, linkedCharacters: [{ id: char.id, note: 'Auteur' }] },
    })).json;
    assert.equal(book.audioTrackId, track.id);

    const view = await fetcher(server.base).get(`/api/ecriture/${proj.slug}/${book.slug}`);
    assert.equal(view.json.track?.id, track.id);
    assert.equal(view.json.linkedCharacters[0].name, 'Nielas');
    assert.equal(view.json.linkedCharacters[0].note, 'Auteur');

    // A character from another project can't be linked.
    const other = (await f.post('/api/writing/projects', { body: { title: 'Autre' } })).json;
    const ghost = (await f.post(`/api/writing/projects/${other.id}/characters`, { body: { name: 'Ghost' } })).json;
    await f.put(`/api/writing/works/${book.id}`, { body: { linkedCharacters: [{ id: ghost.id, note: 'x' }] } });
    const v2 = await fetcher(server.base).get(`/api/ecriture/${proj.slug}/${book.slug}`);
    assert.equal(v2.json.linkedCharacters.length, 0, 'cross-project character leaked');
  });

  it('reorders books within a project', async () => {
    const f = await loggedIn(ADMIN);
    const proj = (await f.post('/api/writing/projects', { body: { title: 'Ordre' } })).json;
    const b1 = (await f.post(`/api/writing/projects/${proj.id}/works`, { body: { title: 'un' } })).json;
    const b2 = (await f.post(`/api/writing/projects/${proj.id}/works`, { body: { title: 'deux' } })).json;
    const out = await f.post(`/api/writing/projects/${proj.id}/works/reorder`, { body: { order: [b2.id, b1.id] } });
    assert.deepEqual(out.json.map((w) => w.title), ['deux', 'un']);
  });

  it('validates titles, ambient effect and media owner', async () => {
    const f = await loggedIn(ADMIN);
    assert.equal((await f.post('/api/writing/projects', { body: { title: '  ' } })).status, 400);
    const p = (await f.post('/api/writing/projects', { body: { title: 'FX', ambientEffect: 'fireworks' } })).json;
    assert.equal(p.ambientEffect, 'fireworks');
    const p2 = (await f.post('/api/writing/projects', { body: { title: 'FX2', ambientEffect: 'lasers' } })).json;
    assert.equal(p2.ambientEffect, 'none');
    assert.equal((await f.post('/api/writing/media', { body: { type: 'screenshot' } })).status, 400);
  });

  it('per-project glossary toggle hides the lexicon publicly', async () => {
    const f = await loggedIn(ADMIN);
    const p = (await f.post('/api/writing/projects', { body: { title: 'Sans Lexique', isPublished: true, hasGlossary: false } })).json;
    assert.equal(p.hasGlossary, false);
    // a term can still be created (kept in DB) but is not exposed publicly
    await f.post(`/api/writing/projects/${p.id}/glossary`, { body: { termKr: '비' } });
    const pub = await fetcher(server.base).get(`/api/ecriture/${p.slug}`);
    assert.deepEqual(pub.json.glossary, [], 'glossary leaked while disabled');

    const on = (await f.put(`/api/writing/projects/${p.id}`, { body: { hasGlossary: true } })).json;
    assert.equal(on.hasGlossary, true);
    assert.equal((await fetcher(server.base).get(`/api/ecriture/${p.slug}`)).json.glossary.length, 1);
  });

  it('cascades: deleting a project removes its books and characters', async () => {
    const f = await loggedIn(ADMIN);
    const proj = (await f.post('/api/writing/projects', { body: { title: 'Éphémère', isPublished: true } })).json;
    const book = (await f.post(`/api/writing/projects/${proj.id}/works`, { body: { title: 'B' } })).json;
    await f.post(`/api/writing/projects/${proj.id}/characters`, { body: { name: 'Ghost' } });
    assert.equal((await f.delete(`/api/writing/projects/${proj.id}`)).status, 204);
    assert.equal((await f.get(`/api/writing/works/${book.id}`)).status, 404);
    assert.equal((await fetcher(server.base).get(`/api/ecriture/${proj.slug}`)).status, 404);
  });
});

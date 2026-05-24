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

describe('analytics beacon', () => {
  it('records a public page view without auth', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/analytics/hit', { body: { path: '/', referrer: 'https://google.com/search?q=x' } });
    assert.equal(r.status, 204);
  });

  it('rejects a non-string or non-absolute path', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/hit', { body: { path: 'no-slash' } })).status, 400);
    assert.equal((await f.post('/api/analytics/hit', { body: { path: 123 } })).status, 400);
  });

  it('silently drops back-office paths (204, not stored)', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/hit', { body: { path: '/admin/x' } })).status, 204);
    assert.equal((await f.post('/api/analytics/hit', { body: { path: '/project/y' } })).status, 204);
  });
});

describe('analytics events', () => {
  it('records an allowed interaction event without auth', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/event', { body: { name: 'track_play', label: 'Song A' } })).status, 204);
    assert.equal((await f.post('/api/analytics/event', { body: { name: 'link_click', label: 'github' } })).status, 204);
    assert.equal((await f.post('/api/analytics/event', { body: { name: 'contact_submit' } })).status, 204);
  });

  it('rejects an unknown event name', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/event', { body: { name: 'drop_table', label: 'x' } })).status, 400);
    assert.equal((await f.post('/api/analytics/event', { body: { label: 'x' } })).status, 400);
  });
});

describe('analytics summary', () => {
  it('requires authentication', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.get('/api/analytics/summary')).status, 401);
  });

  it('forbids non-admins', async () => {
    const f = await loggedIn(MEMBER);
    assert.equal((await f.get('/api/analytics/summary')).status, 403);
  });

  it('aggregates views for an admin and excludes back-office hits', async () => {
    const pub = fetcher(server.base);
    await pub.post('/api/analytics/hit', { body: { path: '/' } });
    await pub.post('/api/analytics/hit', { body: { path: '/' } });
    await pub.post('/api/analytics/hit', { body: { path: '/stairs' } });
    await pub.post('/api/analytics/hit', { body: { path: '/admin/secret' } });

    const f = await loggedIn(ADMIN);
    const r = await f.get('/api/analytics/summary?days=30');
    assert.equal(r.status, 200);
    assert.ok(r.json.totals.views >= 3, 'counts public views');
    const paths = r.json.topPaths.map((p) => p.path);
    assert.ok(paths.includes('/'), 'lists the home path');
    assert.ok(!paths.some((p) => p.startsWith('/admin')), 'never stores admin paths');
    assert.ok(Array.isArray(r.json.series), 'returns a daily series');
  });

  it('aggregates interaction events by name and label', async () => {
    const pub = fetcher(server.base);
    await pub.post('/api/analytics/event', { body: { name: 'track_play', label: 'Hit Song' } });
    await pub.post('/api/analytics/event', { body: { name: 'track_play', label: 'Hit Song' } });

    const f = await loggedIn(ADMIN);
    const r = await f.get('/api/analytics/summary?days=30');
    assert.equal(r.status, 200);
    const play = r.json.events.find((e) => e.name === 'track_play');
    assert.ok(play && play.total >= 2, 'counts track plays');
    assert.ok(play.labels.some((l) => l.label === 'Hit Song'), 'surfaces the played title');
  });
});

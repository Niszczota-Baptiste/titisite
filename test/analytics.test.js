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

describe('analytics dwell-time beacon (/track)', () => {
  it('accepts a valid timing beacon', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/analytics/track', {
      body: { path: '/projets/ecriture/nostra', durationMs: 8500, scrollPct: 80 },
    });
    assert.equal(r.status, 204);
  });

  it('rejects bad path or negative duration', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/track', { body: { path: 'x', durationMs: 1 } })).status, 400);
    assert.equal((await f.post('/api/analytics/track', { body: { path: '/x', durationMs: -1 } })).status, 400);
  });

  it('caps absurdly large durations instead of rejecting', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/analytics/track', { body: { path: '/x', durationMs: 9e12, scrollPct: 200 } });
    assert.equal(r.status, 204);
  });

  it('silently drops back-office paths', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/track', { body: { path: '/admin/x', durationMs: 1 } })).status, 204);
  });
});

describe('analytics click beacon (/click)', () => {
  it('accepts an internal writing-zone hop', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/analytics/click', {
      body: { from: '/projets/ecriture/nostra', to: '/projets/ecriture/nostra/livre-1', kind: 'writing_nav' },
    });
    assert.equal(r.status, 204);
  });

  it('accepts an external click (stores host only, drops query)', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/analytics/click', {
      body: { from: '/', to: 'https://example.com/foo?secret=abc', kind: 'external' },
    });
    assert.equal(r.status, 204);
  });

  it('rejects an unknown kind', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.post('/api/analytics/click', {
      body: { from: '/', to: '/x', kind: 'drop_table' },
    })).status, 400);
  });
});

describe('analytics writing summary', () => {
  it('requires admin', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.get('/api/analytics/summary/writing')).status, 401);
    const member = await loggedIn(MEMBER);
    assert.equal((await member.get('/api/analytics/summary/writing')).status, 403);
  });

  it('aggregates writing-zone views, transitions, and entry/exit pages', async () => {
    const pub = fetcher(server.base);
    // Simulate a reader session: home → project → livre → personnages.
    await pub.post('/api/analytics/hit', { body: { path: '/' } });
    await pub.post('/api/analytics/hit', { body: { path: '/projets/ecriture/nostra' } });
    await pub.post('/api/analytics/hit', { body: { path: '/projets/ecriture/nostra/livre-1' } });
    await pub.post('/api/analytics/click', { body: { from: '/projets/ecriture/nostra', to: '/projets/ecriture/nostra/livre-1', kind: 'writing_nav' } });
    await pub.post('/api/analytics/click', { body: { from: '/projets/ecriture/nostra/livre-1', to: 'https://wiki.example.com/x', kind: 'writing_external' } });

    const f = await loggedIn(ADMIN);
    const r = await f.get('/api/analytics/summary/writing?days=30');
    assert.equal(r.status, 200);
    assert.ok(r.json.zoneTotals.views >= 2, 'counts writing views');
    assert.ok(r.json.projects.some((p) => p.slug === 'nostra'), 'lists the nostra project');
    assert.ok(r.json.transitions.some((t) => t.to_path === '/projets/ecriture/nostra/livre-1'), 'lists transitions');
    assert.ok(r.json.outbound.some((o) => o.to_host === 'wiki.example.com'), 'lists outbound hosts');
    assert.ok(r.json.entryPaths.length > 0, 'has entry paths');
  });
});

describe('analytics summary — engagement & recent pages', () => {
  it('includes recentPages, engagement.bounceRate and dwell on the main summary', async () => {
    const pub = fetcher(server.base);
    await pub.post('/api/analytics/hit', { body: { path: '/brand-new-page' } });
    await pub.post('/api/analytics/track', { body: { path: '/brand-new-page', durationMs: 4000, scrollPct: 60 } });

    const f = await loggedIn(ADMIN);
    const r = await f.get('/api/analytics/summary?days=30');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.recentPages), 'returns recentPages');
    assert.ok(r.json.recentPages.some((p) => p.path === '/brand-new-page'), 'lists the new path');
    assert.ok(r.json.engagement, 'returns engagement block');
    assert.ok(typeof r.json.engagement.bounceRate === 'number', 'has a bounce rate');
    assert.ok(Array.isArray(r.json.engagement.dwell), 'returns dwell list');
    assert.ok(Array.isArray(r.json.engagement.scrollDepth), 'returns scroll depth list');
  });
});

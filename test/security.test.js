import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1' };

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

function loggedIn(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return f;
  });
}

describe('security headers', () => {
  it('emits CSP and X-Frame-Options on every response', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/health');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });

  it('advertises a global rate limit on /api/*', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/health');
    assert.match(r.headers.get('ratelimit-policy') || '', /\b600\b/);
  });
});

describe('CORS', () => {
  it('rejects a foreign origin in dev', async () => {
    const r = await fetch(`${server.base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });

  it('echoes the legitimate Vite origin', async () => {
    const r = await fetch(`${server.base}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});

describe('auth', () => {
  it('rejects bad credentials', async () => {
    const f = fetcher(server.base);
    const r = await f.post('/api/auth/login', { body: { email: ADMIN.email, password: 'wrong' } });
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'invalid_credentials');
  });

  it('blocks /auth/me without a session', async () => {
    const f = fetcher(server.base);
    const r = await f.get('/api/auth/me');
    assert.equal(r.status, 401);
  });

  it('logs in and returns a session cookie', async () => {
    const f = fetcher(server.base);
    const login = await f.post('/api/auth/login', { body: ADMIN });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.role, 'admin');
    const me = await f.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.email, ADMIN.email);
  });

  it('logout revokes the JWT — replay is rejected', async () => {
    const f = await loggedIn(ADMIN);
    // Snapshot the cookie before logout so we can replay it as a Bearer.
    const token = f.jar.cookies.get('titisite_session');
    assert.ok(token, 'session cookie should be present');
    const logout = await f.post('/api/auth/logout');
    assert.equal(logout.status, 204);
    // Replay the captured token as a Bearer — must be rejected as revoked.
    const replay = await fetch(`${server.base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(replay.status, 401);
    const body = await replay.json();
    assert.equal(body.error, 'revoked_token');
  });
});

describe('RBAC', () => {
  it('blocks members from creating users (admin-only)', async () => {
    const f = await loggedIn(MEMBER);
    const r = await f.post('/api/users', { body: { email: 'x@y.z', password: 'p', role: 'member' } });
    assert.equal(r.status, 403);
  });

  it('lets admins create users', async () => {
    const f = await loggedIn(ADMIN);
    const r = await f.post('/api/users', {
      body: { email: 'fresh@test.local', name: 'Fresh', password: 'freshpw', role: 'member' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.role, 'member');
  });
});

describe('comments', () => {
  it('hides authorEmail from members but shows it to admins', async () => {
    const admin = await loggedIn(ADMIN);
    const member = await loggedIn(MEMBER);
    const post = await admin.post('/api/comments', {
      body: { targetType: 'discussion', targetId: 0, body: 'hello from admin' },
    });
    assert.equal(post.status, 201);
    const adminView = await admin.get('/api/comments?target_type=discussion&target_id=0');
    assert.equal(adminView.status, 200);
    assert.ok(adminView.json.some((c) => c.authorEmail === ADMIN.email),
      'admin should see authorEmail');
    const memberView = await member.get('/api/comments?target_type=discussion&target_id=0');
    assert.equal(memberView.status, 200);
    assert.ok(memberView.json.length > 0, 'member should still see the comment');
    assert.ok(memberView.json.every((c) => c.authorEmail === undefined),
      'member must not see authorEmail');
  });

  it('blocks IDOR on feature comments outside the user\'s workspaces', async () => {
    const admin = await loggedIn(ADMIN);
    const member = await loggedIn(MEMBER);
    // Admin creates a workspace with no other members.
    const ws = await admin.post('/api/workspaces', {
      body: { name: 'Solo Project', memberIds: [] },
    });
    assert.equal(ws.status, 201);
    const slug = ws.json.slug;
    // Admin creates a feature there.
    const feat = await admin.post(`/api/workspaces/${slug}/features`, {
      body: { title: 'classified' },
    });
    assert.equal(feat.status, 201);
    // Member must not be able to read the feature's comment thread.
    const r = await member.get(`/api/comments?target_type=feature&target_id=${feat.json.id}`);
    assert.equal(r.status, 403);
    // Nor post into it.
    const w = await member.post('/api/comments', {
      body: { targetType: 'feature', targetId: feat.json.id, body: 'leak' },
    });
    assert.equal(w.status, 403);
  });
});

describe('builds externalUrl validation', () => {
  it('refuses non-http schemes', async () => {
    const f = await loggedIn(ADMIN);
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'not a url']) {
      const r = await f.post('/api/workspaces/projet-principal/builds', {
        body: { version: '1.0', externalUrl: url },
      });
      assert.equal(r.status, 400, `${url} should be rejected`);
      assert.equal(r.json.error, 'invalid_external_url');
    }
  });

  it('accepts a valid https URL', async () => {
    const f = await loggedIn(ADMIN);
    const r = await f.post('/api/workspaces/projet-principal/builds', {
      body: { version: '2.0', externalUrl: 'https://example.com/build.zip' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.externalUrl, 'https://example.com/build.zip');
  });
});

describe('upload validation', () => {
  it('rejects a .exe document upload (extension allowlist)', async () => {
    const f = await loggedIn(ADMIN);
    const fd = new FormData();
    fd.set('file', new Blob([Buffer.from('MZ\x90\x00')], { type: 'application/octet-stream' }), 'malware.exe');
    fd.set('title', 'pwn');
    const r = await f.post('/api/workspaces/projet-principal/documents', { body: fd });
    assert.equal(r.status, 415);
    assert.equal(r.json.error, 'extension_not_allowed');
  });

  it('rejects a .pdf with mismatched MIME (mime allowlist)', async () => {
    const f = await loggedIn(ADMIN);
    const fd = new FormData();
    fd.set('file', new Blob([Buffer.from('not really a pdf')], { type: 'application/x-msdownload' }), 'fake.pdf');
    fd.set('title', 'fake');
    const r = await f.post('/api/workspaces/projet-principal/documents', { body: fd });
    assert.equal(r.status, 415);
    assert.equal(r.json.error, 'mime_not_allowed');
  });
});

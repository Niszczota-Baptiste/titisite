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
    const r = await f.post('/api/users', { body: { email: 'x@y.z', password: 'longenoughpw', role: 'member' } });
    assert.equal(r.status, 403);
  });

  it('lets admins create users', async () => {
    const f = await loggedIn(ADMIN);
    const r = await f.post('/api/users', {
      body: { email: 'fresh@test.local', name: 'Fresh', password: 'freshpw-strong', role: 'member' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.role, 'member');
  });
});

describe('password policy', () => {
  it('rejects a too-short password on create', async () => {
    const f = await loggedIn(ADMIN);
    const r = await f.post('/api/users', {
      body: { email: 'short@test.local', password: 'short', role: 'member' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'password_too_short');
  });

  it('rejects a denylisted password on create', async () => {
    const f = await loggedIn(ADMIN);
    const r = await f.post('/api/users', {
      body: { email: 'weak@test.local', password: 'change-me-please', role: 'member' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'password_too_weak');
  });

  it('rejects a too-short password on update', async () => {
    const f = await loggedIn(ADMIN);
    const create = await f.post('/api/users', {
      body: { email: 'updateme@test.local', password: 'initialpw-strong', role: 'member' },
    });
    assert.equal(create.status, 201);
    const r = await f.put(`/api/users/${create.json.id}`, { body: { password: 'short' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'password_too_short');
  });
});

describe('feature assignee guard', () => {
  it('rejects assigning a feature to a user without access to the workspace', async () => {
    const admin = await loggedIn(ADMIN);
    const member = await loggedIn(MEMBER);
    // Member-only workspace: admin always has access (role-based bypass), but
    // a brand-new outsider does not.
    const ws = await admin.post('/api/workspaces', {
      body: { name: 'Assignee Guard Project' },
    });
    assert.equal(ws.status, 201);
    const slug = ws.json.slug;
    await admin.put(`/api/workspaces/${ws.json.id}/members`, {
      body: { memberIds: [(await admin.get('/api/users')).json.find((u) => u.email === MEMBER.email).id] },
    });
    // Find a third user that's not in this workspace.
    const outsider = await admin.post('/api/users', {
      body: { email: 'outsider@test.local', password: 'outsider-strong', role: 'member' },
    });
    assert.equal(outsider.status, 201);

    // Member tries to create a feature assigned to the outsider → rejected.
    const bad = await member.post(`/api/workspaces/${slug}/features`, {
      body: { title: 'pollute', assigneeId: outsider.json.id },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'invalid_assignee');

    // Member assigning to themselves works.
    const self = (await member.get('/api/auth/me')).json;
    const ok = await member.post(`/api/workspaces/${slug}/features`, {
      body: { title: 'mine', assigneeId: self.id },
    });
    assert.equal(ok.status, 201);

    // PUT to outsider also rejected.
    const moved = await member.put(`/api/workspaces/${slug}/features/${ok.json.id}`, {
      body: { assigneeId: outsider.json.id },
    });
    assert.equal(moved.status, 400);
    assert.equal(moved.json.error, 'invalid_assignee');

    // Admin remains a valid assignee even though they're not an explicit member row.
    const adminSelf = (await admin.get('/api/auth/me')).json;
    const adminAssign = await member.put(`/api/workspaces/${slug}/features/${ok.json.id}`, {
      body: { assigneeId: adminSelf.id },
    });
    assert.equal(adminAssign.status, 200);
    assert.equal(adminAssign.json.assigneeId, adminSelf.id);
  });
});

describe('password change re-auth (SEC-09)', () => {
  it('refuses admin-on-self password change via PUT /users/:id', async () => {
    const admin = await loggedIn(ADMIN);
    const me = (await admin.get('/api/auth/me')).json;
    const r = await admin.put(`/api/users/${me.id}`, { body: { password: 'something-strong-12' } });
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'use_self_service_password');
  });

  it('refuses admin-on-other-admin password change', async () => {
    const admin = await loggedIn(ADMIN);
    const second = await admin.post('/api/users', {
      body: { email: 'admin2@test.local', name: 'Second Admin', password: 'second-strong-12', role: 'admin' },
    });
    assert.equal(second.status, 201);
    const r = await admin.put(`/api/users/${second.json.id}`, { body: { password: 'pivot-strong-12' } });
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'cannot_change_other_admin_password');
  });

  it('still lets an admin reset a member password', async () => {
    const admin = await loggedIn(ADMIN);
    const m = await admin.post('/api/users', {
      body: { email: 'resetme@test.local', password: 'oldpass-strong-12', role: 'member' },
    });
    assert.equal(m.status, 201);
    const r = await admin.put(`/api/users/${m.json.id}`, { body: { password: 'newpass-strong-12' } });
    assert.equal(r.status, 200);
    // The reset should have invalidated old credentials.
    const fresh = fetcher(server.base);
    const oldLogin = await fresh.post('/api/auth/login', { body: { email: 'resetme@test.local', password: 'oldpass-strong-12' } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await fresh.post('/api/auth/login', { body: { email: 'resetme@test.local', password: 'newpass-strong-12' } });
    assert.equal(newLogin.status, 200);
  });

  it('PUT /me/password requires current password and rotates the session', async () => {
    const admin = await loggedIn(ADMIN);
    // Wrong current password is rejected.
    const wrong = await admin.put('/api/me/password', {
      body: { currentPassword: 'not-it', newPassword: 'brand-new-strong-12' },
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.error, 'invalid_current_password');

    // Same-as-current is rejected.
    const same = await admin.put('/api/me/password', {
      body: { currentPassword: ADMIN.password, newPassword: ADMIN.password },
    });
    assert.equal(same.status, 400);
    assert.equal(same.json.error, 'password_unchanged');

    // Snapshot the current cookie so we can prove it's invalidated.
    const oldCookie = admin.jar.cookies.get('titisite_session');

    const ok = await admin.put('/api/me/password', {
      body: { currentPassword: ADMIN.password, newPassword: 'brand-new-strong-12' },
    });
    assert.equal(ok.status, 204);

    // The old cookie should now be rejected (token version was bumped).
    const replay = await fetch(`${server.base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldCookie}` },
    });
    assert.equal(replay.status, 401);

    // The fresh cookie just set on the response keeps the tab logged in.
    const me = await admin.get('/api/auth/me');
    assert.equal(me.status, 200);

    // And the new password actually works at the login endpoint.
    const fresh = fetcher(server.base);
    const newLogin = await fresh.post('/api/auth/login', {
      body: { email: ADMIN.email, password: 'brand-new-strong-12' },
    });
    assert.equal(newLogin.status, 200);

    // Restore so later tests using the ADMIN constant still work.
    const restore = await admin.put('/api/me/password', {
      body: { currentPassword: 'brand-new-strong-12', newPassword: ADMIN.password },
    });
    assert.equal(restore.status, 204);
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

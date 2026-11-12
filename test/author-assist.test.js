import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fakeModelApi } from './fake-model-api.js';
import { bootServer, fetcher } from './harness.js';

// Assistance d'écriture facultative de l'atelier. L'API du modèle est jouée par
// un faux serveur local (ANTHROPIC_BASE_URL) : on y lit EXACTEMENT ce que le
// site envoie — c'est le cœur du test : seul l'extrait choisi doit partir.

const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const GUEST = { email: 'omni-assist@test.local', password: 'omnipw1-strong', name: 'Oriane' };
const wb = (body) => ({ body, headers: { 'X-Author-Request': '1' } });
const KEY = 'cle-de-test-jamais-reelle';

async function login(server, creds = ADMIN) {
  const f = fetcher(server.base);
  assert.equal((await f.post('/api/auth/login', { body: creds })).status, 200);
  return f;
}

describe('assistance d\'écriture — site sans clé', () => {
  let server; let owner; let base;
  before(async () => {
    server = await bootServer({ env: { ANTHROPIC_API_KEY: '' } });
    owner = await login(server);
    base = `/api/author/projects/${(await owner.post('/api/author/projects', wb({ title: 'Sans clé' }))).json.id}`;
  });
  after(async () => { await server.stop(); });

  it('la fonction n\'existe pas : rien à activer, rien à appeler', async () => {
    const info = (await owner.get(`${base}/assist`)).json;
    assert.equal(info.available, false);
    assert.equal(info.enabled, false);
    assert.equal((await owner.put(base, wb({ aiAssist: true }))).json.aiAssist, true, 'le réglage se garde, sans effet tant qu\'il n\'y a pas de clé');
    assert.equal((await owner.get(`${base}/assist`)).json.enabled, false);
    const r = await owner.post(`${base}/assist`, wb({ task: 'questions', text: 'Elle sourit.' }));
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'assist_unavailable');
  });
});

describe('assistance d\'écriture — site avec clé', () => {
  let server; let api; let owner; let base; let chapterId;
  before(async () => {
    api = await fakeModelApi();
    server = await bootServer({ env: { ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: api.base, AUTHOR_ASSIST_MODEL: '' } });
    owner = await login(server);
    const p = await owner.post('/api/author/projects', wb({ title: 'TITRE-DU-PROJET', description: 'PITCH-PRIVE' }));
    base = `/api/author/projects/${p.json.id}`;
    assert.equal(p.json.aiAssist, false, 'éteinte par défaut');
    await owner.post(`${base}/entities`, wb({ kind: 'note', title: 'IDEE-PRIVEE', body: 'CORPS-IDEE-PRIVEE' }));
    chapterId = (await owner.post(`${base}/entities`, wb({ kind: 'chapter', title: 'TITRE-CHAPITRE', content: 'RESTE-DU-CHAPITRE. Elle sourit. FIN-DU-CHAPITRE.' }))).json.id;
  });
  after(async () => { await server.stop(); await api.stop(); });

  it('éteinte par défaut : aucune demande ne quitte le site', async () => {
    const info = (await owner.get(`${base}/assist`)).json;
    assert.deepEqual({ available: info.available, enabled: info.enabled }, { available: true, enabled: false });
    const r = await owner.post(`${base}/assist`, wb({ task: 'variantes', text: 'Elle sourit.' }));
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'assist_disabled');
    assert.equal(api.seen.length, 0);
  });

  it('ne s\'allume que par un oui explicite du propriétaire, projet par projet', async () => {
    for (const bad of ['oui', 1, 'true', null]) {
      assert.equal((await owner.put(base, wb({ aiAssist: bad }))).status, 422, `valeur ${JSON.stringify(bad)} refusée`);
    }
    assert.equal((await owner.put(base, wb({ aiAssist: true }))).json.aiAssist, true);
    assert.equal((await owner.get(`${base}/assist`)).json.enabled, true);
    const other = (await owner.post('/api/author/projects', wb({ title: 'Autre projet' }))).json;
    assert.equal(other.aiAssist, false, 'un autre projet reste éteint');
    assert.equal((await owner.post(`/api/author/projects/${other.id}/assist`, wb({ task: 'pistes', text: 'x' }))).status, 403);
  });

  it('seul l\'extrait choisi part — ni le projet, ni le chapitre, ni les idées', async () => {
    const r = await owner.post(`${base}/assist`, wb({ task: 'variantes', text: 'Elle sourit.', brief: 'plus sec' }));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.suggestions, [{ text: 'Elle détourna les yeux.', why: 'retenue' }, { text: 'Un sourire, à peine.', why: 'ellipse' }]);
    assert.equal(r.json.task, 'variantes');

    assert.equal(api.seen.length, 1);
    const sent = api.seen[0];
    assert.equal(sent.headers['x-api-key'], KEY, 'la clé ne voyage qu\'entre le serveur et l\'API');
    assert.match(sent.url, /^\/v1\/messages/);
    assert.equal(sent.body.model, 'claude-opus-5-5');
    assert.equal(sent.body.fallbacks, 'default');
    assert.match(String(sent.headers['anthropic-beta'] || ''), /server-side-fallback-2026-07-01/);
    assert.equal(sent.body.output_config.format.type, 'json_schema');
    assert.equal(sent.body.messages.length, 1);
    assert.ok(sent.body.messages[0].content.includes('<extrait>\nElle sourit.\n</extrait>'));
    assert.ok(sent.body.messages[0].content.includes('<consigne>\nplus sec\n</consigne>'));
    for (const secret of ['TITRE-DU-PROJET', 'PITCH-PRIVE', 'IDEE-PRIVEE', 'CORPS-IDEE-PRIVEE', 'TITRE-CHAPITRE', 'RESTE-DU-CHAPITRE', 'FIN-DU-CHAPITRE', ADMIN.email]) {
      assert.ok(!sent.raw.includes(secret), `« ${secret} » ne doit pas être envoyé`);
    }
  });

  it('une proposition n\'écrit rien dans le projet', async () => {
    const ch = (await owner.get(`${base}/entities/${chapterId}`)).json;
    assert.equal(ch.content, 'RESTE-DU-CHAPITRE. Elle sourit. FIN-DU-CHAPITRE.');
    assert.equal(ch.revision, 1);
    assert.equal((await owner.get(`${base}/entities`)).json.total, 2);
  });

  it('la clé ne sort jamais du serveur', async () => {
    for (const path of [base, `${base}/assist`, '/api/auth/me', '/api/settings']) {
      assert.ok(!(await owner.get(path)).text.includes(KEY), path);
    }
  });

  it('valide la demande avant tout appel', async () => {
    const before = api.seen.length;
    assert.equal((await owner.post(`${base}/assist`, wb({ task: 'reecrire-tout', text: 'x' }))).status, 422);
    assert.equal((await owner.post(`${base}/assist`, wb({ task: 'pistes', text: '   ' }))).status, 422);
    assert.equal((await owner.post(`${base}/assist`, wb({ task: 'pistes', text: 'a'.repeat(6001) }))).status, 422, 'un chapitre entier ne passe pas');
    assert.equal((await owner.post(`${base}/assist`, wb({ task: 'pistes', text: 'x', brief: 'b'.repeat(401) }))).status, 422);
    assert.equal((await owner.post(`${base}/assist`, { body: { task: 'pistes', text: 'x' } })).status, 403, 'en-tête d\'écriture exigé');
    assert.equal(api.seen.length, before);
  });

  it('un refus du modèle ou une panne de l\'API se disent, sans rien inventer', async () => {
    api.reply(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: 'refusal', stop_sequence: null, stop_details: { type: 'refusal', category: null, explanation: null }, usage: { input_tokens: 1, output_tokens: 0 } });
    let r = await owner.post(`${base}/assist`, wb({ task: 'questions', text: 'x' }));
    assert.deepEqual([r.status, r.json.error], [422, 'assist_refused']);

    api.reply(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    r = await owner.post(`${base}/assist`, wb({ task: 'questions', text: 'x' }));
    assert.deepEqual([r.status, r.json.error], [502, 'assist_misconfigured']);

    api.reply(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
    r = await owner.post(`${base}/assist`, wb({ task: 'questions', text: 'x' }));
    assert.deepEqual([r.status, r.json.error], [503, 'assist_busy']);

    api.reply(200, { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'pas du JSON' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    r = await owner.post(`${base}/assist`, wb({ task: 'questions', text: 'x' }));
    assert.deepEqual([r.status, r.json.error], [502, 'assist_failed']);
    assert.ok(!r.text.includes('pas du JSON'));
  });

  it('un invité n\'a pas d\'assistance, et ne voit pas le réglage', async () => {
    const created = await owner.post('/api/users', { body: { ...GUEST, role: 'member' } });
    assert.equal(created.status, 201, created.text);
    assert.ok((await owner.post(`${base}/shares`, wb({ email: GUEST.email, role: 'omniscient' }))).status < 300);
    const guest = await login(server, GUEST);
    const before = api.seen.length;
    assert.equal((await guest.get(`${base}/assist`)).status, 404);
    assert.notEqual((await guest.post(`${base}/assist`, wb({ task: 'pistes', text: 'x' }))).status, 200);
    assert.equal(api.seen.length, before);
    assert.equal((await guest.get(base)).json.aiAssist, undefined);
  });
});

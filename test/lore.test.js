import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { bootServer, fetcher } from './harness.js';

// Tests d'API du module Lore : gate can_view_lore, CRUD + révisions, preuves,
// règle de la note de résolution, géo, recherche FTS, médias (dont le rejet
// d'un faux PNG — validation par décodage réel). Le seed lore tourne (vraies
// données) : les comptages absolus du début s'appuient dessus.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => {
  server = await bootServer({ env: { SEED_DEMO_QUESTS: 'off', SEED_UNIQUE_ITEMS: 'off' } });
});
after(async () => { await server.stop(); });

function login(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

describe('lore — accès, seed, enquête de bout en bout', () => {
  let admin;
  let member;
  let memberId;

  it('sans le tag lore, tout est fermé — GET compris', async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    assert.equal(member.user.canViewLore, false);
    assert.equal((await member.f.get('/api/lore/entries')).status, 403);
    assert.equal((await member.f.get('/api/lore/map/points')).status, 403);
    assert.equal((await member.f.get('/api/lore/search?q=kota')).status, 403);
    // Les commentaires sur cible lore sont refusés aussi (gate dans comments.js).
    const c = await member.f.post('/api/comments', {
      body: { targetType: 'lore_entry', targetId: 1, body: 'test' },
    });
    assert.equal(c.status, 403);
  });

  it('le seed a inséré les vraies données relevées', async () => {
    const entries = (await admin.f.get('/api/lore/entries')).json;
    assert.equal(entries.length, 45); // Kota + 21 bâtiments + 9 tours + 5 poèmes + 9 entités
    const hyps = (await admin.f.get('/api/lore/hypotheses')).json;
    assert.equal(hyps.length, 7);
    assert.equal(hyps.filter((h) => h.status === 'refuted').length, 4);
    assert.equal(hyps.filter((h) => h.status === 'confirmed').length, 2);
    assert.equal(hyps.filter((h) => h.status === 'open').length, 1);
    // Les pistes mortes gardent leur note de résolution, jamais masquées.
    for (const h of hyps.filter((x) => x.status === 'refuted')) {
      assert.ok(h.resolutionNote.length > 0, `refuted sans note: ${h.title}`);
      assert.ok(h.resolvedAt > 0);
    }
    const maps = (await admin.f.get('/api/lore/maps')).json;
    assert.equal(maps.length, 1);
    assert.equal(maps[0].imgXLeft, -5353);
    assert.equal(maps[0].imgXRight, 4646);
    assert.equal(maps[0].imgZBottom, -636);
  });

  it('carte : 22 points géolocalisés (Kota + 21 bâtiments)', async () => {
    const points = (await admin.f.get('/api/lore/map/points')).json;
    assert.equal(points.length, 22);
    const kota = points.find((p) => p.slug === 'kotanostra-ville-centrale');
    assert.deepEqual([kota.x, kota.z, kota.dimension], [-353, -5636, 'overworld']);
  });

  it('geo/bearing : nord = Z décroissant, via l\'API', async () => {
    let r = await admin.f.post('/api/lore/geo/bearing', {
      body: { from: { x: 0, z: 0 }, to: { x: 0, z: -100 } },
    });
    assert.deepEqual(r.json, { distance: 100, bearingDeg: 0, cardinal8: 'N', cardinal16: 'N' });
    r = await admin.f.post('/api/lore/geo/bearing', {
      body: { from: { x: 0, z: 0 }, to: { x: 100, z: 0 } },
    });
    assert.equal(r.json.bearingDeg, 90);
    assert.equal(r.json.cardinal8, 'E');
    // Points confondus : distance 0, pas d'angle.
    r = await admin.f.post('/api/lore/geo/bearing', {
      body: { from: { x: 5, z: 5 }, to: { x: 5, z: 5 } },
    });
    assert.equal(r.json.bearingDeg, null);
  });

  it('geo/ring depuis KotaNostra : 21 points triés par angle', async () => {
    const r = await admin.f.get('/api/lore/geo/ring?origin_x=-353&origin_z=-5636&tolerance=2');
    assert.equal(r.status, 200);
    const { points } = r.json;
    assert.equal(points.length, 21); // Kota elle-même (distance 0) est exclue
    const bearings = points.map((p) => p.bearingDeg);
    assert.deepEqual(bearings, [...bearings].sort((a, b) => a - b), 'tri par relèvement');
    const b6 = points.find((p) => p.title.startsWith('B6'));
    assert.equal(b6.cardinal8, 'N'); // dz fortement négatif → quasi plein nord
    assert.ok(Math.abs(b6.bearingDeg - 13.64) < 0.1);
    assert.equal(b6.aligned, false); // 13.6° de l'axe N, au-delà des ±2°
  });

  it('l\'admin pose le tag lore sur le membre', async () => {
    const users = (await admin.f.get('/api/users')).json;
    memberId = users.find((u) => u.email === MEMBER.email).id;
    const r = await admin.f.put(`/api/users/${memberId}`, { body: { canViewLore: true } });
    assert.equal(r.status, 200);
    assert.equal(r.json.can_view_lore, 1);
    const me = await member.f.get('/api/auth/me');
    assert.equal(me.json.canViewLore, true);
    assert.equal((await member.f.get('/api/lore/entries')).status, 200);
  });

  let entryId;
  let entry2Id;

  it('membre : création d\'entrée, slug, révisions à chaque save', async () => {
    let r = await member.f.post('/api/lore/entries', {
      body: {
        title: 'Stèle du carrefour', entryType: 'texte', x: 120, y: 64, z: -450,
        bodyMd: 'Inscription à moitié effacée.', tags: ['stèle', 'poème-de-jade'],
      },
    });
    assert.equal(r.status, 201);
    entryId = r.json.id;
    assert.equal(r.json.slug, 'stele-du-carrefour');
    assert.equal(r.json.tags.length, 2);
    // Le tag existant « poème-de-jade » est réutilisé, pas dupliqué.
    const tags = (await member.f.get('/api/lore/tags')).json;
    assert.equal(tags.filter((t) => t.name === 'poème-de-jade').length, 1);

    r = await member.f.put(`/api/lore/entries/${entryId}`, {
      body: { bodyMd: 'Inscription relue à la lueur d\'un seau de lave.' },
    });
    assert.equal(r.status, 200);
    const revs = (await member.f.get(`/api/lore/entries/${entryId}/revisions`)).json;
    assert.equal(revs.length, 2); // snapshot à la création + au save
  });

  it('coordonnées : x sans z refusé', async () => {
    const r = await member.f.post('/api/lore/entries', {
      body: { title: 'Point bancal', x: 100 },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_coords');
  });

  it('recherche FTS : trouve la nouvelle entrée et le seed', async () => {
    let r = await member.f.get('/api/lore/search?q=carrefour');
    assert.equal(r.json.length, 1);
    assert.equal(r.json[0].kind, 'entry');
    r = await member.f.get('/api/lore/search?q=flux');
    assert.ok(r.json.some((h) => h.kind === 'hypothesis'));
    assert.ok(r.json.some((h) => h.kind === 'entry'));
    // Préfixe : « kota » matche KotaNostra.
    r = await member.f.get('/api/lore/search?q=kota');
    assert.ok(r.json.some((h) => h.title.startsWith('KotaNostra')));
  });

  it('liens entre entrées : self-link 400, doublon 409', async () => {
    const r0 = await member.f.post('/api/lore/entries', { body: { title: 'Salle sous la stèle' } });
    entry2Id = r0.json.id;
    let r = await member.f.post('/api/lore/links', {
      body: { fromEntryId: entryId, toEntryId: entryId, relationType: 'points_to' },
    });
    assert.equal(r.status, 400);
    r = await member.f.post('/api/lore/links', {
      body: { fromEntryId: entry2Id, toEntryId: entryId, relationType: 'located_in' },
    });
    assert.equal(r.status, 201);
    r = await member.f.post('/api/lore/links', {
      body: { fromEntryId: entry2Id, toEntryId: entryId, relationType: 'located_in' },
    });
    assert.equal(r.status, 409);
    const detail = (await member.f.get(`/api/lore/entries/${entryId}`)).json;
    assert.equal(detail.linksIn.length, 1);
    assert.equal(detail.linksIn[0].relationType, 'located_in');
  });

  let hypId;

  it('hypothèse : la note de résolution est exigée pour clore', async () => {
    let r = await member.f.post('/api/lore/hypotheses', {
      body: { title: 'La stèle marque un axe doré', confidence: 40 },
    });
    assert.equal(r.status, 201);
    hypId = r.json.id;
    assert.equal(r.json.status, 'open');

    r = await member.f.post(`/api/lore/hypotheses/${hypId}/evidence`, {
      body: { entryId, stance: 'supports', note: 'L\'inscription mentionne « l\'or du chemin ».' },
    });
    assert.equal(r.status, 201);
    // Une seule position par paire (hypothèse, entrée).
    r = await member.f.post(`/api/lore/hypotheses/${hypId}/evidence`, {
      body: { entryId, stance: 'contradicts' },
    });
    assert.equal(r.status, 409);

    // Clore sans note → refus. Avec note → resolved_at posé.
    r = await member.f.put(`/api/lore/hypotheses/${hypId}`, { body: { status: 'refuted' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'resolution_note_required');
    r = await member.f.put(`/api/lore/hypotheses/${hypId}`, {
      body: { status: 'refuted', resolutionNote: 'L\'inscription parle d\'orge, pas d\'or.' },
    });
    assert.equal(r.status, 200);
    assert.ok(r.json.resolvedAt > 0);
    assert.equal(r.json.supportsCount, 1);

    // Réouverture : resolved_at s'efface, la note (trace) reste.
    r = await member.f.put(`/api/lore/hypotheses/${hypId}`, { body: { status: 'open' } });
    assert.equal(r.json.resolvedAt, null);
    assert.equal(r.json.resolutionNote, 'L\'inscription parle d\'orge, pas d\'or.');
  });

  it('commentaires sur cibles lore via la table globale', async () => {
    let r = await member.f.post('/api/comments', {
      body: { targetType: 'lore_entry', targetId: entryId, body: 'Je repasse demain avec une pioche silk touch.' },
    });
    assert.equal(r.status, 201);
    r = await member.f.get(`/api/comments?target_type=lore_entry&target_id=${entryId}`);
    assert.equal(r.json.length, 1);
    // Cible inexistante → refus.
    r = await member.f.post('/api/comments', {
      body: { targetType: 'lore_hypothesis', targetId: 999999, body: 'fantôme' },
    });
    assert.equal(r.status, 403);
  });

  it('médias : upload recompressé WebP + miniature, faux PNG rejeté', async () => {
    const png = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 180, g: 40, b: 60 } },
    }).png().toBuffer();
    const fd = new FormData();
    fd.append('image', new Blob([png], { type: 'image/png' }), 'capture.png');
    fd.append('entryId', String(entryId));
    fd.append('caption', 'La stèle au couchant');
    let r = await member.f.post('/api/lore/media', { body: fd });
    assert.equal(r.status, 201);
    assert.equal(r.json.mimeType, 'image/webp');
    assert.equal(r.json.width, 640);
    assert.ok(r.json.thumbUrl, 'miniature générée');

    // Les fichiers servis existent, derrière le gate, en WebP.
    const img = await member.f.get(r.json.url, { raw: true });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/webp');
    const thumb = await member.f.get(r.json.thumbUrl, { raw: true });
    assert.equal(thumb.status, 200);
    // …et sans session, rien ne sort (401 avant même le gate lore).
    const anon = fetcher(server.base);
    assert.equal((await anon.get(r.json.url)).status, 401);

    // Un texte déguisé en .png passe multer (extension + MIME déclarés) mais
    // échoue au décodage sharp → 415, rien n'est conservé.
    const fake = new FormData();
    fake.append('image', new Blob([Buffer.from('pas une image')], { type: 'image/png' }), 'fake.png');
    fake.append('entryId', String(entryId));
    r = await member.f.post('/api/lore/media', { body: fake });
    assert.equal(r.status, 415);

    // Nom inconnu → 404 (le service ne sert que les fichiers en base).
    assert.equal((await member.f.get('/api/lore/media/file/inconnu.webp')).status, 404);
  });

  it('graphe et export embarquent le travail du membre', async () => {
    const g = (await member.f.get('/api/lore/graph')).json;
    assert.ok(g.nodes.some((n) => n.kind === 'entry' && n.id === entryId));
    assert.ok(g.edges.some((e) => e.kind === 'evidence' && e.hypothesisId === hypId));
    assert.ok(g.edges.some((e) => e.kind === 'link' && e.fromEntryId === entry2Id));

    const ex = (await member.f.get('/api/lore/export')).json;
    assert.equal(ex.hypotheses.length, 8); // 7 seed + 1 du test
    assert.ok(ex.comments.length >= 1);
    assert.ok(ex.revisions.length >= 2);
    assert.equal(ex.maps.length, 1);
  });

  it('suppression d\'entrée : cascade preuves/liens + purge FTS et révisions', async () => {
    let r = await member.f.delete(`/api/lore/entries/${entryId}`);
    assert.equal(r.status, 204);
    assert.equal((await member.f.get(`/api/lore/entries/${entryId}`)).status, 404);
    // La preuve attachée est partie avec l'entrée.
    const h = (await member.f.get(`/api/lore/hypotheses/${hypId}`)).json;
    assert.equal(h.evidence.length, 0);
    // Plus trouvable en recherche.
    r = await member.f.get('/api/lore/search?q=carrefour');
    assert.equal(r.json.length, 0);
  });
});

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { sniffAudio } from '../server/author/audio.js';
import { issueNature } from '../server/author/consistency.js';
import { bootServer, fetcher } from './harness.js';

// Atelier musical privé : prises audio de l'atelier d'auteur.
//
// L'exigence n°1 est la séparation entre création privée et publication : une
// prise envoyée, rangée ou synchronisée ne doit apparaître sur AUCUNE route
// publique tant que son propriétaire ne l'a pas publiée par un geste explicite.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };
const GUEST = { email: 'omni-audio@test.local', password: 'omnipw1-strong', name: 'Oriane' };
const H = { 'X-Author-Request': '1' };
const wb = (body) => ({ body, headers: H });

let owner; let pid; let base; let soundId;
const uploadsDir = () => path.join(server.workdir, 'uploads');
const filesOnDisk = () => fs.readdirSync(uploadsDir()).filter((f) => /\.(wav|m4a|aac|mp3|ogg|webm|flac)$/.test(f));

// Un vrai fichier WAV (PCM 16 bits mono, 8 kHz) : `seconds` de La 440.
function wav(seconds = 1, freq = 440) {
  const rate = 8000;
  const n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 12000), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function form(buf, name, type, fields = {}) {
  const fd = new FormData();
  fd.append('audio', new Blob([buf], { type }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  return fd;
}
const send = (f, buf, name, type, fields) => f.post(`${base}/audio`, { body: form(buf, name, type, fields), headers: H });

async function login(creds) {
  const f = fetcher(server.base);
  const r = await f.post('/api/auth/login', { body: { email: creds.email, password: creds.password } });
  assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
  return f;
}

before(async () => {
  server = await bootServer();
  owner = await login(ADMIN);
  const p = await owner.post('/api/author/projects', wb({ title: 'Chansons du port', kind: 'musique' }));
  assert.equal(p.status, 201);
  assert.equal(p.json.kind, 'musique');
  pid = p.json.id;
  base = `/api/author/projects/${pid}`;
});
after(async () => { await server.stop(); });

describe('reconnaissance du format (premiers octets)', () => {
  it('reconnaît les conteneurs audio courants et refuse le reste', () => {
    assert.equal(sniffAudio(wav(0.01)), 'wav');
    assert.equal(sniffAudio(Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0])), 'mp4');
    assert.equal(sniffAudio(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0x1f, 0xfc, 0, 0, 0, 0, 0])), 'adts');
    assert.equal(sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])), 'mp3');
    assert.equal(sniffAudio(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(12)])), 'mp3');
    assert.equal(sniffAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(12)])), 'ogg');
    assert.equal(sniffAudio(Buffer.concat([Buffer.from('fLaC'), Buffer.alloc(12)])), 'flac');
    assert.equal(sniffAudio(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), 'webm');
    assert.equal(sniffAudio(Buffer.from('<script>alert(1)</script>')), null);
    assert.equal(sniffAudio(Buffer.from('%PDF-1.7 pas du son du tout')), null);
    assert.equal(sniffAudio(Buffer.alloc(4)), null);
  });
});

describe('prises audio — accès', () => {
  it('refuse les anonymes (401), les comptes sans atelier (403) et l\'absence d\'en-tête anti-CSRF', async () => {
    const anon = fetcher(server.base);
    assert.equal((await anon.get(`${base}/audio`)).status, 401);
    assert.equal((await send(anon, wav(), 'a.wav', 'audio/wav')).status, 401);
    const member = await login(MEMBER);
    assert.equal((await member.get(`${base}/audio`)).status, 403);
    assert.equal((await send(member, wav(), 'a.wav', 'audio/wav')).status, 403);
    const noHeader = await owner.post(`${base}/audio`, { body: form(wav(), 'a.wav', 'audio/wav') });
    assert.equal(noHeader.status, 403);
    assert.equal(noHeader.json.error, 'csrf_header_missing');
    assert.deepEqual(filesOnDisk(), [], 'aucun fichier laissé par les envois refusés');
  });
});

describe('prises audio — réception, rangement, versions', () => {
  let first; let second; const bytes = wav(1.5);

  it('crée une idée musicale avec ses repères facultatifs (type privé)', async () => {
    const r = await owner.post(`${base}/entities`, wb({
      kind: 'sound', title: 'Valse du port', lyrics: 'Sous les mâts, la brume…', tempo: 92, timeSignature: '3/4',
      keySignature: 'La mineur', chords: 'Am  F  C  G', instruments: 'piano, voix', structure: 'Intro / Couplet / Refrain', mood: 'brumeuse',
    }));
    assert.equal(r.status, 201, JSON.stringify(r.json));
    soundId = r.json.id;
    assert.equal(r.json.kind, 'sound');
    assert.equal(r.json.tempo, 92);
    assert.equal(r.json.timeSignature, '3/4');
    assert.deepEqual(r.json.audio, []);
    assert.equal(r.json.referenceMediaId, null);
    const bad = await owner.post(`${base}/entities`, wb({ kind: 'sound', title: 'x', tempo: 5000 }));
    assert.equal(bad.status, 422);
    assert.equal(bad.json.field, 'tempo');
  });

  it('reçoit une prise : conservée octet pour octet, empreinte renvoyée, première prise = référence', async () => {
    const r = await send(owner, bytes, 'Prise du matin.wav', 'audio/wav', {
      entityId: soundId, label: 'Prise du matin', durationMs: 1500, source: 'recorded', integrity: 'ok',
      capturedAt: 1794300000, clientRef: 'take-ref-0001',
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    first = r.json;
    assert.equal(first.kind, 'audio');
    assert.equal(first.entityId, soundId);
    assert.equal(first.label, 'Prise du matin');
    assert.equal(first.durationMs, 1500);
    assert.equal(first.source, 'recorded');
    assert.equal(first.size, bytes.length);
    assert.equal(first.sha256, sha(bytes), 'le serveur a exactement les octets envoyés');
    assert.match(first.url, /^\/api\/author\/media\/[\w-]+\.wav$/);
    const stored = fs.readFileSync(path.join(uploadsDir(), path.basename(first.url)));
    assert.ok(stored.equals(bytes), 'aucun réencodage');
    const ent = (await owner.get(`${base}/entities/${soundId}`)).json;
    assert.equal(ent.referenceMediaId, first.id);
    assert.deepEqual(ent.audio.map((a) => a.id), [first.id]);
    assert.deepEqual(ent.media, [], 'une prise n\'est pas une image de la galerie');
  });

  it('une seconde version ne remplace ni la première ni la référence, sauf demande', async () => {
    const r = await send(owner, wav(0.5, 660), 'v2.wav', 'audio/wav', { entityId: soundId, label: 'Plus lente', clientRef: 'take-ref-0002' });
    assert.equal(r.status, 201);
    second = r.json;
    let ent = (await owner.get(`${base}/entities/${soundId}`)).json;
    assert.deepEqual(ent.audio.map((a) => a.id), [first.id, second.id]);
    assert.equal(ent.referenceMediaId, first.id);
    const put = await owner.put(`${base}/media/${second.id}`, wb({ reference: true, notes: 'tempo plus posé' }));
    assert.equal(put.status, 200);
    assert.equal(put.json.notes, 'tempo plus posé');
    ent = (await owner.get(`${base}/entities/${soundId}`)).json;
    assert.equal(ent.referenceMediaId, second.id);
    const list = (await owner.get(`${base}/entities?kind=sound`)).json.items;
    assert.equal(list[0].audioCount, 2);
    assert.equal(list[0].reference.id, second.id);
  });

  it('envoi rejoué (réponse perdue) : la même référence client ne crée pas de doublon', async () => {
    const before = filesOnDisk().length;
    const again = await send(owner, bytes, 'Prise du matin.wav', 'audio/wav', { entityId: soundId, clientRef: 'take-ref-0001' });
    assert.equal(again.status, 200);
    assert.equal(again.json.id, first.id);
    assert.equal(filesOnDisk().length, before, 'le fichier en double a été jeté');
    assert.equal((await owner.get(`${base}/audio`)).json.length, 2);
    // Et l'appareil peut le savoir AVANT de renvoyer un gros fichier.
    assert.equal((await owner.get(`${base}/audio/by-ref/take-ref-0001`)).json.id, first.id);
    assert.equal((await owner.get(`${base}/audio/by-ref/take-ref-inconnue`)).status, 404);
  });

  it('refuse ce qui n\'est pas du son, une cible qui n\'est pas une idée musicale, et ne laisse rien sur le disque', async () => {
    const before = filesOnDisk().length;
    const fake = await send(owner, Buffer.from('<script>alert(1)</script> pas un son du tout'), 'x.mp3', 'audio/mpeg');
    assert.equal(fake.status, 415);
    assert.equal(fake.json.error, 'not_audio');
    const badExt = await send(owner, wav(), 'x.exe', 'audio/wav');
    assert.equal(badExt.status, 415);
    const badMime = await send(owner, wav(), 'x.wav', 'text/html');
    assert.equal(badMime.status, 415);
    const chapter = (await owner.post(`${base}/entities`, wb({ kind: 'chapter', title: 'Scène du quai' }))).json;
    const wrong = await send(owner, wav(), 'x.wav', 'audio/wav', { entityId: chapter.id });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.json.error, 'invalid_entity');
    assert.equal(filesOnDisk().length, before);
  });

  it('un contenu reconnu sous une mauvaise extension est rangé sous la bonne', async () => {
    const r = await send(owner, wav(0.2), 'memo.mp3', 'audio/mpeg', { label: 'Mémo mal nommé' });
    assert.equal(r.status, 201);
    assert.match(r.json.url, /\.wav$/);
    assert.equal(r.json.mimeType, 'audio/wav');
    assert.equal((await owner.delete(`${base}/media/${r.json.id}`, { headers: H })).status, 204);
  });

  it('se relie à une scène ou à un personnage par les relations de l\'idée musicale', async () => {
    const perso = (await owner.post(`${base}/entities`, wb({ kind: 'character', title: 'Élise' }))).json;
    const link = await owner.post(`${base}/links`, wb({ fromId: soundId, toId: perso.id, kind: 'theme_de' }));
    assert.equal(link.status, 201, JSON.stringify(link.json));
    const ent = (await owner.get(`${base}/entities/${perso.id}`)).json;
    assert.equal(ent.links[0].label, 'A pour thème');
    assert.equal(ent.links[0].other.kind, 'sound');
  });

  it('garde l\'historique des paroles', async () => {
    const cur = (await owner.get(`${base}/entities/${soundId}`)).json;
    const put = await owner.put(`${base}/entities/${soundId}`, wb({ revision: cur.revision, lyrics: 'Sous les mâts, la brume se lève.' }));
    assert.equal(put.status, 200);
    const revs = (await owner.get(`${base}/entities/${soundId}/revisions?field=lyrics`)).json;
    assert.equal(revs.length, 1);
    const body = (await owner.get(`${base}/entities/${soundId}/revisions/${revs[0].id}`)).json.body;
    assert.equal(body, 'Sous les mâts, la brume…');
  });

  describe('lecture authentifiée', () => {
    it('sert la prise à son propriétaire, avec déplacement dans la piste (Range)', async () => {
      const full = await owner.get(first.url, { raw: true });
      assert.equal(full.status, 200);
      assert.equal(full.headers.get('content-type'), 'audio/wav');
      assert.match(full.headers.get('cache-control'), /private/);
      assert.equal(full.headers.get('accept-ranges'), 'bytes');
      assert.ok(Buffer.from(await full.arrayBuffer()).equals(bytes));
      const part = await owner.get(first.url, { raw: true, headers: { Range: 'bytes=1000-1999' } });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get('content-range'), `bytes 1000-1999/${bytes.length}`);
      assert.ok(Buffer.from(await part.arrayBuffer()).equals(bytes.subarray(1000, 2000)));
      const dl = await owner.get(`${base}/media/${first.id}/download`, { raw: true });
      assert.equal(dl.status, 200);
      assert.match(dl.headers.get('content-disposition'), /attachment; filename="Prise-du-matin\.wav"/);
      assert.ok(Buffer.from(await dl.arrayBuffer()).equals(bytes));
    });

    it('ne la sert à personne d\'autre, ni par un nom deviné', async () => {
      assert.equal((await fetcher(server.base).get(first.url)).status, 401);
      assert.equal((await (await login(MEMBER)).get(first.url)).status, 403);
      assert.equal((await owner.get('/api/author/media/..%2F..%2Fdata.sqlite')).status, 400);
      assert.equal((await owner.get('/api/author/media/00000000-0000-0000-0000-000000000000.wav')).status, 404);
    });
  });

  describe('séparation création privée / public', () => {
    let guest;

    it('aucune route publique ne connaît la prise', async () => {
      const anon = fetcher(server.base);
      const name = path.basename(first.url);
      assert.equal((await anon.get(`/api/audio/${name}`)).status, 404, '/api/audio (pistes publiques)');
      assert.equal((await anon.get(`/api/images/${name}`)).status, 404, '/api/images');
      assert.equal((await anon.get(`/uploads/${name}`)).status, 404, 'aucun service statique');
      const tracks = (await anon.get('/api/tracks')).text;
      assert.ok(!tracks.includes(name) && !tracks.includes('Prise du matin'), 'absente des pistes du portfolio');
      for (const route of ['/api/ecriture', '/api/tracks', '/api/projects', '/sitemap.xml']) {
        const body = (await anon.get(route)).text || '';
        assert.ok(!body.includes('Valse du port') && !body.includes(name), `${route} ne mentionne rien de l'atelier musical`);
      }
    });

    it('un invité omniscient ne voit ni l\'idée musicale, ni ses prises, ni ses paroles', async () => {
      await owner.post('/api/users', { body: { ...GUEST, role: 'member' } });
      assert.equal((await owner.post(`${base}/shares`, wb({ email: GUEST.email, role: 'omniscient' }))).status, 201);
      guest = await login(GUEST);
      assert.equal((await guest.get(base)).json.access, 'omniscient');
      assert.equal((await guest.get(first.url)).status, 404, 'fichier audio');
      assert.equal((await guest.get(`${base}/audio`)).status, 404);
      assert.equal((await guest.get(`${base}/media/${first.id}/markers`)).status, 404);
      assert.equal((await guest.get(`${base}/media/${first.id}/download`)).status, 404);
      assert.equal((await guest.get(`${base}/entities/${soundId}`)).status, 404);
      assert.equal((await send(guest, wav(), 'x.wav', 'audio/wav')).status, 403);
      for (const route of ['/entities', '/entities?kind=sound', '/index', '/search?q=Valse', '/search?q=brume', '/graph', '/overview', '/tags']) {
        const r = await guest.get(`${base}${route}`);
        assert.equal(r.status, 200, route);
        assert.ok(!r.text.includes('Valse du port') && !r.text.includes('brume se lève') && !r.text.includes('"sound"'), `${route} laisse fuir l'atelier musical`);
      }
      // La fiche du personnage relié ne trahit pas son thème.
      const persoId = (await owner.get(`${base}/entities?kind=character`)).json.items[0].id;
      const fiche = await guest.get(`${base}/entities/${persoId}`);
      assert.equal(fiche.status, 200);
      assert.ok(!fiche.text.includes('Valse'), 'relation vers une idée musicale retirée');
      assert.equal(fiche.json.audio, undefined);
    });
  });

  describe('repères, boucles, extractions', () => {
    let marker;

    it('pose un repère commenté, une boucle et une extraction — sans toucher à l\'original', async () => {
      const m = await owner.post(`${base}/media/${first.id}/markers`, wb({ tMs: 400, label: 'Le motif', note: 'à développer', clientRef: 'marker-ref-0001' }));
      assert.equal(m.status, 201, JSON.stringify(m.json));
      marker = m.json;
      assert.equal((await owner.post(`${base}/media/${first.id}/markers`, wb({ tMs: 400, label: 'Le motif', clientRef: 'marker-ref-0001' }))).status, 200, 'rejeu sans doublon');
      const loop = await owner.post(`${base}/media/${first.id}/markers`, wb({ tMs: 200, endMs: 900, kind: 'loop', label: 'Boucle A' }));
      assert.equal(loop.status, 201);
      const extract = await owner.post(`${base}/media/${first.id}/markers`, wb({ tMs: 500, endMs: 1200, kind: 'extract', label: 'Refrain' }));
      assert.equal(extract.status, 201);
      const list = (await owner.get(`${base}/media/${first.id}/markers`)).json;
      assert.deepEqual(list.map((x) => [x.tMs, x.endMs, x.kind]), [[200, 900, 'loop'], [400, null, 'marker'], [500, 1200, 'extract']]);
      const stored = fs.readFileSync(path.join(uploadsDir(), path.basename(first.url)));
      assert.equal(sha(stored), first.sha256, 'le fichier n\'a pas bougé');
      assert.equal((await owner.get(`${base}/media/${first.id}/audio`)).json.markerCount, 3);
    });

    it('valide les plages et les types', async () => {
      const post = (body) => owner.post(`${base}/media/${first.id}/markers`, wb(body));
      assert.equal((await post({ tMs: 100, kind: 'loop' })).status, 422, 'boucle sans fin');
      assert.equal((await post({ tMs: 900, endMs: 100 })).status, 422, 'fin avant début');
      assert.equal((await post({ tMs: -1 })).status, 422);
      assert.equal((await post({ tMs: 10, kind: 'effacer' })).status, 422);
      assert.equal((await owner.post(`${base}/media/999999/markers`, wb({ tMs: 1 }))).status, 404);
      const up = await owner.put(`${base}/markers/${marker.id}`, wb({ note: 'gardé pour le pont', tMs: 450 }));
      assert.equal(up.status, 200);
      assert.equal(up.json.tMs, 450);
      assert.equal(up.json.note, 'gardé pour le pont');
      assert.equal((await owner.put(`${base}/markers/${marker.id}`, wb({ endMs: 100 }))).status, 422);
    });
  });

  describe('export', () => {
    it('la sauvegarde JSON contient l\'idée musicale, ses prises (nom, taille, empreinte) et leurs repères', async () => {
      const r = await owner.get(`${base}/export`);
      assert.equal(r.status, 200);
      const x = r.json;
      assert.equal(x.version, 2);
      assert.equal(x.project.kind, 'musique');
      assert.equal(x.kinds.sound.length, 1);
      assert.equal(x.kinds.sound[0].time_signature, '3/4');
      const audio = x.media.filter((m) => m.kind === 'audio');
      assert.equal(audio.length, 2);
      assert.equal(audio.find((m) => m.id === first.id).sha256, first.sha256);
      assert.equal(x.mediaMarkers.length, 3);
      assert.ok(x.revisions.some((rev) => rev.field === 'lyrics'));
    });
  });

  describe('publication : un geste séparé, jamais implicite', () => {
    const tracksCount = async () => (await fetcher(server.base).get('/api/tracks')).json.length;

    it('ni l\'envoi, ni le rangement, ni les repères n\'ont rien publié', async () => {
      const tracks = (await fetcher(server.base).get('/api/tracks')).json;
      assert.ok(tracks.every((t) => !t.filename), 'aucune piste publique n\'a reçu de fichier');
    });

    it('l\'aperçu ne publie rien ; sans destination ou sans confirmation, refus', async () => {
      const n = await tracksCount();
      const preview = await owner.get(`${base}/media/${second.id}/publication?title=Valse%20du%20port`);
      assert.equal(preview.status, 200);
      assert.equal(preview.json.wouldPublish.title, 'Valse du port');
      assert.equal(preview.json.alreadyPublished, null);
      assert.equal((await owner.post(`${base}/media/${second.id}/publish`, wb({ title: 'Valse du port', destination: 'portfolio' }))).json.error, 'confirmation_required');
      assert.equal((await owner.post(`${base}/media/${second.id}/publish`, wb({ title: 'Valse du port', confirm: true }))).json.error, 'invalid_destination');
      assert.equal((await owner.post(`${base}/media/${second.id}/publish`, wb({ destination: 'portfolio', confirm: true }))).status, 422, 'titre obligatoire');
      assert.equal(await tracksCount(), n);
    });

    it('publier copie la prise choisie vers le portfolio ; l\'original reste privé', async () => {
      const n = await tracksCount();
      const r = await owner.post(`${base}/media/${second.id}/publish`, wb({ title: 'Valse du port', genre: 'Valse', destination: 'portfolio', confirm: true }));
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(await tracksCount(), n + 1);
      const anon = fetcher(server.base);
      const track = (await anon.get('/api/tracks')).json.find((t) => t.id === r.json.track.id);
      assert.equal(track.title, 'Valse du port');
      assert.notEqual(track.filename, path.basename(second.url), 'un autre fichier : une copie');
      assert.equal((await anon.get(`/api/audio/${track.filename}`)).status, 200, 'la copie publiée est publique');
      assert.equal((await anon.get(`/api/audio/${path.basename(second.url)}`)).status, 404, 'l\'original ne l\'est pas');
      assert.equal((await anon.get(`/api/audio/${path.basename(first.url)}`)).status, 404, 'les autres versions non plus');
      assert.equal((await anon.get(second.url)).status, 401);
      assert.ok(r.json.media.publishedAt);
      assert.equal((await owner.post(`${base}/media/${second.id}/publish`, wb({ title: 'Encore', destination: 'portfolio', confirm: true }))).status, 409, 'pas de double publication');
      // Un invité ou un compte sans atelier ne peut pas publier.
      assert.equal((await (await login(MEMBER)).post(`${base}/media/${first.id}/publish`, wb({ title: 'x', destination: 'portfolio', confirm: true }))).status, 403);
    });

    it('supprimer la prise privée retire son fichier et ses repères, pas la piste publiée', async () => {
      const name = path.basename(second.url);
      const n = await tracksCount();
      assert.equal((await owner.delete(`${base}/media/${second.id}`, { headers: H })).status, 204);
      await new Promise((r) => setTimeout(r, 100));
      assert.ok(!fs.existsSync(path.join(uploadsDir(), name)));
      assert.equal(await tracksCount(), n);
      const ent = (await owner.get(`${base}/entities/${soundId}`)).json;
      assert.deepEqual(ent.audio.map((a) => a.id), [first.id]);
      assert.equal(ent.referenceMediaId, null, 'la référence disparue n\'est pas remplacée d\'office');
    });

    it('purger l\'idée musicale ne détruit pas ses prises', async () => {
      const tmp = (await owner.post(`${base}/entities`, wb({ kind: 'sound', title: 'Esquisse jetable' }))).json;
      const take = (await send(owner, wav(0.3), 'e.wav', 'audio/wav', { entityId: tmp.id, label: 'Esquisse' })).json;
      assert.equal((await owner.delete(`${base}/entities/${tmp.id}`, { headers: H })).status, 204);
      assert.equal((await owner.delete(`${base}/entities/${tmp.id}/purge`, { headers: H })).status, 204);
      const kept = (await owner.get(`${base}/audio`)).json.find((a) => a.id === take.id);
      assert.ok(kept, 'la prise reste dans les sons du projet');
      assert.equal(kept.entity, null);
      assert.equal((await owner.get(take.url)).status, 200);
    });
  });
});

describe('idées : provenance et « à revoir plus tard »', () => {
  it('une capture garde d\'où elle vient et quand elle a été saisie', async () => {
    const r = await owner.post(`${base}/notes/quick`, wb({ text: 'Le phare ne s\'éteint jamais\nIdée notée dans le train', origin: 'partage : Navigateur', capturedAt: 1794300123, clientRef: 'capture-ref-0001' }));
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.origin, 'partage : Navigateur');
    assert.equal(r.json.capturedAt, 1794300123);
    assert.equal(r.json.inbox, true);
    const again = await owner.post(`${base}/notes/quick`, wb({ text: 'Le phare ne s\'éteint jamais', clientRef: 'capture-ref-0001' }));
    assert.equal(again.status, 200);
    assert.equal(again.json.id, r.json.id);
    const put = await owner.put(`${base}/entities/${r.json.id}`, wb({ revision: r.json.revision, revisitOn: '2027-01-15' }));
    assert.equal(put.status, 200);
    const list = (await owner.get(`${base}/entities?kind=note`)).json.items;
    assert.equal(list.find((n) => n.id === r.json.id).revisitOn, '2027-01-15');
    assert.equal((await owner.put(`${base}/entities/${r.json.id}`, wb({ revision: put.json.revision, revisitOn: 'demain' }))).status, 422);
  });
});

describe('images : envoi rejouable par référence client', () => {
  it('la même référence ne crée pas une seconde image', async () => {
    const { default: sharp } = await import('sharp');
    const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#335577' } }).png().toBuffer();
    const fd = () => { const f = new FormData(); f.append('image', new Blob([png], { type: 'image/png' }), 'croquis.png'); f.append('clientRef', 'image-ref-0001'); return f; };
    const first = await owner.post(`${base}/media`, { body: fd(), headers: H });
    assert.equal(first.status, 201, JSON.stringify(first.json));
    const again = await owner.post(`${base}/media`, { body: fd(), headers: H });
    assert.equal(again.status, 200);
    assert.equal(again.json.id, first.json.id);
    assert.equal((await owner.get(`${base}/media`)).json.filter((m) => m.originalName === 'croquis.png').length, 1);
  });
});

describe('projets : nature', () => {
  it('nature facultative, validée, et « livre » par défaut', async () => {
    const def = await owner.post('/api/author/projects', wb({ title: 'Sans nature' }));
    assert.equal(def.json.kind, 'livre');
    assert.equal((await owner.post('/api/author/projects', wb({ title: 'x', kind: 'opéra-rock' }))).status, 422);
    const up = await owner.put(`/api/author/projects/${def.json.id}`, wb({ kind: 'mixte' }));
    assert.equal(up.json.kind, 'mixte');
    assert.equal((await owner.get('/api/author/projects')).json.find((p) => p.id === def.json.id).kind, 'mixte');
  });
});

describe('cohérence : nature des alertes et raison d\'ignorer', () => {
  it('classe les règles sans changer leurs clés', () => {
    assert.equal(issueNature('ancien_nom:12:valcendre'), 'calculee');
    assert.equal(issueNature('ubiquite:3:8:9'), 'calculee');
    assert.equal(issueNature('chronologie:44'), 'calculee');
    assert.equal(issueNature('contradiction:7'), 'declaree');
    assert.equal(issueNature('mention_non_liee:5:1-2'), 'suggestion');
    assert.equal(issueNature('regle_future:1'), 'calculee');
  });

  it('une alerte s\'ignore avec une raison, qui se relit et se modifie ; la décision se lève', async () => {
    const p = (await owner.post('/api/author/projects', wb({ title: 'Cohérence' }))).json;
    const b = `/api/author/projects/${p.id}`;
    const a = (await owner.post(`${b}/entities`, wb({ kind: 'event', title: 'La chute', sortKey: 10 }))).json;
    const z = (await owner.post(`${b}/entities`, wb({ kind: 'event', title: 'Le serment', sortKey: 5 }))).json;
    const link = (await owner.post(`${b}/links`, wb({ fromId: a.id, toId: z.id, kind: 'contredit', note: 'deux témoins, deux récits' }))).json;
    let c = (await owner.get(`${b}/consistency`)).json;
    const issue = c.issues.find((i) => i.key === `contradiction:${link.id}`);
    assert.ok(issue, 'contradiction déclarée signalée');
    assert.equal(issue.nature, 'declaree');
    assert.ok(c.issues.every((i) => ['calculee', 'declaree', 'suggestion'].includes(i.nature)));

    assert.equal((await owner.post(`${b}/consistency/dismiss`, wb({ key: issue.key, reason: 'Narrateur peu fiable : voulu.' }))).status, 204);
    c = (await owner.get(`${b}/consistency`)).json;
    assert.ok(!c.issues.some((i) => i.key === issue.key));
    assert.equal(c.dismissed.find((i) => i.key === issue.key).reason, 'Narrateur peu fiable : voulu.');
    // Sans `reason`, la raison enregistrée est conservée ; avec, elle change.
    await owner.post(`${b}/consistency/dismiss`, wb({ key: issue.key }));
    assert.equal((await owner.get(`${b}/consistency`)).json.dismissed[0].reason, 'Narrateur peu fiable : voulu.');
    await owner.post(`${b}/consistency/dismiss`, wb({ key: issue.key, reason: 'Ambiguïté assumée.' }));
    assert.equal((await owner.get(`${b}/consistency`)).json.dismissed[0].reason, 'Ambiguïté assumée.');
    assert.equal((await owner.post(`${b}/consistency/dismiss`, wb({ key: issue.key, reason: 'x'.repeat(501) }))).status, 422);
    await owner.post(`${b}/consistency/dismiss`, wb({ key: issue.key, value: false }));
    c = (await owner.get(`${b}/consistency`)).json;
    assert.ok(c.issues.some((i) => i.key === issue.key), 'l\'alerte revient, les données n\'ont pas bougé');
    assert.equal((await owner.get(`${b}/entities/${a.id}`)).json.sortKey, 10);
  });
});

describe('micro : ouvert seulement pour le document de l\'atelier', () => {
  it('Permissions-Policy : microphone=(self) sous /auteur, fermé partout ailleurs', async () => {
    const policy = async (p) => (await fetcher(server.base).get(p, { raw: true })).headers.get('permissions-policy');
    assert.match(await policy('/auteur'), /microphone=\(self\)/);
    assert.match(await policy('/auteur/3/sons'), /microphone=\(self\)/);
    for (const p of ['/', '/admin', '/auteurs', '/api/health', '/api/author/projects', '/projets/ecriture']) {
      assert.match(await policy(p), /microphone=\(\)/, p);
    }
    assert.match(await policy('/auteur'), /camera=\(\)/);
  });
});

describe('migration : une base d\'avant l\'atelier musical garde tout son contenu', () => {
  it('ajoute colonnes et tables sans rien réécrire, et peut être rejouée', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'titisite-migr-'));
    const dbPath = path.join(dir, 'data.sqlite');
    const env = { DB_PATH: dbPath, UPLOADS_DIR: path.join(dir, 'uploads') };
    fs.mkdirSync(env.UPLOADS_DIR, { recursive: true });

    // 1. Une base « actuelle » avec du contenu…
    let s = await bootServer({ env });
    let f = fetcher(s.base);
    await f.post('/api/auth/login', { body: ADMIN });
    const proj = (await f.post('/api/author/projects', wb({ title: 'Livre d\'avant' }))).json;
    const b = `/api/author/projects/${proj.id}`;
    const chap = (await f.post(`${b}/entities`, wb({ kind: 'chapter', title: 'Prologue', content: 'Tout commence ici.' }))).json;
    const idea = (await f.post(`${b}/notes/quick`, wb({ text: 'Idée ancienne' }))).json;
    await f.post(`${b}/consistency/dismiss`, wb({ key: 'chapitre_vide:999' }));
    await s.stop();

    // 2. …ramenée à l'ancien schéma : tout ce que cette version ajoute est retiré.
    const db = new Database(dbPath);
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP INDEX IF EXISTS idx_author_media_client_ref; DROP INDEX IF EXISTS idx_author_media_kind;
      DROP TABLE author_media_markers; DROP TABLE author_sounds;
      ALTER TABLE author_projects DROP COLUMN kind;
      ALTER TABLE author_notes DROP COLUMN revisit_on; ALTER TABLE author_notes DROP COLUMN origin; ALTER TABLE author_notes DROP COLUMN captured_at;
      ALTER TABLE author_issue_dismissals DROP COLUMN reason;
    `);
    for (const col of ['kind', 'duration_ms', 'label', 'notes', 'source', 'integrity', 'captured_at', 'sha256', 'client_ref', 'published_track_id', 'published_at']) {
      db.exec(`ALTER TABLE author_media DROP COLUMN ${col}`);
    }
    db.prepare(`INSERT INTO author_media (project_id, filename, thumb_filename, mime_type, width, height, size) VALUES (?, 'ancienne.webp', 'ancienne-t.webp', 'image/webp', 10, 10, 123)`).run(proj.id);
    const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    assert.ok(!cols('author_media').includes('kind') && !cols('author_projects').includes('kind'));
    db.close();

    // 3. Démarrage de cette version, deux fois de suite : la migration est additive et rejouable.
    for (let pass = 0; pass < 2; pass += 1) {
      s = await bootServer({ env });
      f = fetcher(s.base);
      await f.post('/api/auth/login', { body: ADMIN });
      const p = (await f.get(b)).json;
      assert.equal(p.title, 'Livre d\'avant');
      assert.equal(p.kind, 'livre', 'un projet d\'avant est un livre');
      assert.equal((await f.get(`${b}/entities/${chap.id}`)).json.content, 'Tout commence ici.');
      const note = (await f.get(`${b}/entities/${idea.id}`)).json;
      assert.equal(note.title, 'Idée ancienne');
      assert.equal(note.revisitOn, null);
      assert.equal(note.origin, '');
      const media = (await f.get(`${b}/media`)).json;
      assert.equal(media.length, 1, 'un média d\'avant est une image');
      assert.deepEqual((await f.get(`${b}/audio`)).json, []);
      const check = new Database(dbPath, { readonly: true });
      assert.equal(check.prepare(`SELECT reason FROM author_issue_dismissals WHERE issue_key = 'chapitre_vide:999'`).get().reason, '', 'décision conservée');
      assert.equal(check.prepare(`SELECT kind FROM author_media WHERE filename = 'ancienne.webp'`).get().kind, 'image');
      check.close();
      await s.stop();
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

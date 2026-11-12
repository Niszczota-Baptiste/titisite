import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileItem } from '../src/mobile/inbox/file.js';
import {
  composeText, findUrl, hiddenCount, inboxSummary, isEmpty, itemKind, itemTitle, newItem, refFor, takeItem, visibleItems,
} from '../src/mobile/inbox/model.js';

// Boîte de réception locale de l'application Mon Atelier : modèle des captures
// et classement rejouable dans un projet (API simulée, sans navigateur).

const offline = () => Object.assign(new Error('offline'), { status: 0, offline: true });

// Petit serveur en mémoire, idempotent par référence client comme le vrai.
function fakeProject() {
  const byRef = new Map();
  const calls = [];
  let next = 100;
  let failNext = null;
  const once = (ref, make) => {
    if (failNext) { const f = failNext; failNext = null; if (f.before) throw offline(); }
    if (byRef.has(ref)) return byRef.get(ref);
    const row = { id: next++, ...make() };
    byRef.set(ref, row);
    return row;
  };
  return {
    calls, byRef,
    // La prochaine écriture échoue : avant d'atteindre le serveur, ou après (réponse perdue).
    failNext(mode) { failNext = mode === 'lost' ? { lost: true } : { before: true }; },
    P: {
      entities: { create: async (body) => {
        calls.push(['entity', body.kind, body.title]);
        const lost = failNext?.lost; if (lost) failNext = null;
        const row = once(body.clientRef, () => ({ kind: body.kind, title: body.title, body: body.body }));
        if (lost) throw offline();
        return row;
      } },
      notes: { quick: async (text, tags, clientRef, extra) => {
        calls.push(['note', text]);
        const lost = failNext?.lost; if (lost) failNext = null;
        const row = once(clientRef, () => ({ kind: 'note', text, ...extra }));
        if (lost) throw offline();
        return row;
      } },
      media: { upload: async (fd) => {
        calls.push(['image', fd.get('clientRef')]);
        return once(fd.get('clientRef'), () => ({ kind: 'image', entityId: Number(fd.get('entityId')) }));
      } },
    },
    sendTake: async (P, take, opts) => {
      calls.push(['take', opts.clientRef, opts.label]);
      const lost = failNext?.lost; if (lost) failNext = null;
      const row = once(opts.clientRef, () => ({ kind: 'audio', entityId: opts.entityId, label: opts.label, markers: take.markers.length, source: take.source, integrity: take.integrity }));
      if (lost) throw offline();
      return row;
    },
  };
}

const files = { blob: async (f) => new Blob([`contenu de ${f.name}`]) };

describe('boîte de réception — modèle', () => {
  it('une capture n\'a besoin ni de titre, ni de catégorie, ni de projet', () => {
    const it0 = newItem({ text: 'Le phare ne s\'éteint jamais\nil attend quelqu\'un', now: 1_700_000_000_000 });
    assert.match(it0.id, /^c-[0-9a-f-]{20,}$/);
    assert.equal(it0.state, 'local');
    assert.equal(it0.target, null);
    assert.equal(it0.owner, null);
    assert.equal(itemTitle(it0), 'Le phare ne s\'éteint jamais');
    assert.equal(itemKind(it0), 'text');
    assert.equal(isEmpty(it0), false);
    assert.equal(isEmpty(newItem({ text: '   \n' })), true);
    assert.ok(/^[A-Za-z0-9_-]{8,64}$/.test(refFor(it0, '-a12')), 'référence acceptée par le site');
  });

  it('reconnaît la nature d\'une capture et son titre provisoire', () => {
    const audio = newItem({ files: [{ id: 'f1', role: 'audio', name: 'prise.m4a', label: 'Prise du matin' }], origin: 'enregistrement' });
    assert.equal(itemKind(audio), 'audio');
    assert.equal(itemTitle(audio), 'Prise du matin');
    const image = newItem({ files: [{ id: 'f2', role: 'image', name: 'croquis.jpg' }] });
    assert.equal(itemKind(image), 'image');
    const link = newItem({ url: 'https://exemple.fr/article', origin: 'partage : Navigateur' });
    assert.equal(itemKind(link), 'link');
    assert.equal(itemTitle(link), 'https://exemple.fr/article');
    assert.equal(findUrl('à lire https://exemple.fr/a?b=1, vraiment.'), 'https://exemple.fr/a?b=1');
    assert.equal(findUrl('rien ici'), null);
    assert.equal(composeText(newItem({ text: 'À lire', url: 'https://exemple.fr' })), 'À lire\n\nhttps://exemple.fr');
    assert.equal(composeText(newItem({ text: 'Vu sur https://exemple.fr', url: 'https://exemple.fr' })), 'Vu sur https://exemple.fr');
  });

  it('une capture d\'un compte n\'est jamais montrée à un autre ; celles sans compte suivent l\'appareil', () => {
    const a = 'https://site.fr|1';
    const b = 'https://site.fr|2';
    const items = [
      newItem({ text: 'de A', owner: a }), newItem({ text: 'de B', owner: b }), newItem({ text: 'sans compte' }),
      { ...newItem({ text: 'A sur un autre site', owner: 'https://autre.fr|1' }) },
    ];
    assert.deepEqual(visibleItems(items, a).map((i) => i.text), ['de A', 'sans compte']);
    assert.deepEqual(visibleItems(items, b).map((i) => i.text), ['de B', 'sans compte']);
    assert.deepEqual(visibleItems(items, null).map((i) => i.text), ['sans compte']);
    assert.equal(hiddenCount(items, a), 2);
    assert.equal(inboxSummary(items, a).total, 2);
  });
});

describe('boîte de réception — classement rejouable', () => {
  it('texte + lien + image → une idée du projet, avec sa provenance et son image', async () => {
    const srv = fakeProject();
    const item = newItem({
      text: 'Le phare', url: 'https://exemple.fr', origin: 'partage : Navigateur', now: 1_700_000_000_000,
      files: [{ id: 'f1', role: 'image', name: 'croquis.jpg', size: 10 }],
    });
    const out = await fileItem({ P: srv.P, item, files, sendTake: srv.sendTake });
    assert.equal(out.kind, 'note');
    const note = srv.byRef.get(item.id);
    assert.equal(note.text, 'Le phare\n\nhttps://exemple.fr');
    assert.equal(note.origin, 'partage : Navigateur');
    assert.equal(note.capturedAt, 1_700_000_000);
    assert.equal(srv.byRef.get(`${item.id}-i0`).entityId, note.id);
    assert.deepEqual(srv.calls.map((c) => c[0]), ['note', 'image']);
  });

  it('un son → une idée musicale avec sa prise, ses repères et son état (« récupérée »)', async () => {
    const srv = fakeProject();
    const item = newItem({
      text: 'Valse du port\npour la scène du quai', origin: 'enregistrement',
      files: [{ id: 'f1', role: 'audio', name: 'prise.m4a', size: 5000, durationMs: 42_000, integrity: 'recovered', markers: [{ tMs: 1000 }, { tMs: 9000 }] }],
    });
    const out = await fileItem({ P: srv.P, item, files, sendTake: srv.sendTake });
    assert.equal(out.kind, 'sound');
    const sound = srv.byRef.get(`${item.id}-s`);
    assert.equal(sound.title, 'Valse du port');
    assert.equal(sound.body, 'Valse du port\npour la scène du quai');
    const take = srv.byRef.get(`${item.id}-a0`);
    assert.deepEqual([take.entityId, take.markers, take.source, take.integrity], [sound.id, 2, 'recorded', 'recovered']);
  });

  it('nouvelle version d\'une idée musicale existante : aucune idée n\'est créée', async () => {
    const srv = fakeProject();
    const item = { ...newItem({ files: [{ id: 'f1', role: 'audio', name: 'v2.m4a', size: 1 }], origin: 'import' }), target: { pid: 3, entityId: 77 } };
    await fileItem({ P: srv.P, item, files, sendTake: srv.sendTake });
    assert.deepEqual(srv.calls.map((c) => c[0]), ['take']);
    assert.equal(srv.byRef.get(`${item.id}-a0`).entityId, 77);
    assert.equal(srv.byRef.get(`${item.id}-a0`).source, 'imported');
  });

  it('coupure avant l\'envoi, puis réponse perdue, puis fermeture en plein envoi : jamais de doublon', async () => {
    const srv = fakeProject();
    const item = newItem({
      text: 'Thème d\'Élise', origin: 'enregistrement',
      files: [{ id: 'a', role: 'audio', name: '1.m4a', size: 1 }, { id: 'b', role: 'audio', name: '2.m4a', size: 1 }, { id: 'c', role: 'image', name: 'partition.jpg', size: 1 }],
    });
    let saved = {};
    const run = () => fileItem({ P: srv.P, item: { ...item, progress: saved }, files, sendTake: srv.sendTake, save: async (p) => { saved = JSON.parse(JSON.stringify(p)); } });

    srv.failNext('before');                       // 1. pas de réseau : rien n'est créé
    await assert.rejects(run, /offline/);
    assert.equal(srv.byRef.size, 0);

    srv.failNext('lost');                         // 2. l'idée est créée, la réponse se perd
    await assert.rejects(run, /offline/);
    assert.equal(srv.byRef.size, 1);
    assert.deepEqual(saved.entityId, undefined, 'l\'appareil ne sait pas encore que c\'est arrivé');

    // 3. nouvel essai : l'idée est retrouvée (pas recréée), la première prise part,
    //    la seconde perd sa réponse.
    let takes = 0;
    const flaky = async (P, take, opts) => { takes += 1; if (takes === 2) srv.failNext('lost'); return srv.sendTake(P, take, opts); };
    await assert.rejects(() => fileItem({ P: srv.P, item: { ...item, progress: saved }, files, sendTake: flaky, save: async (p) => { saved = JSON.parse(JSON.stringify(p)); } }), /offline/);
    assert.ok(saved.entityId, 'avancement gardé');
    assert.equal(Object.keys(saved.mediaIds).length, 1);

    const out = await run();                      // 4. dernier essai : tout aboutit
    assert.equal([...srv.byRef.values()].filter((r) => r.kind === 'sound').length, 1);
    assert.equal([...srv.byRef.values()].filter((r) => r.kind === 'audio').length, 2);
    assert.equal([...srv.byRef.values()].filter((r) => r.kind === 'image').length, 1);
    assert.equal(Object.keys(out.progress.mediaIds).length, 3);
    // Les étapes déjà confirmées n'ont pas été rejouées au dernier essai.
    assert.deepEqual(srv.calls.slice(-2).map((c) => c[0]), ['take', 'image']);
  });
});

describe('boîte de réception — prise faite dans un projet, hors connexion', () => {
  const file = { id: 'f1', role: 'audio', name: 'prise.m4a', mime: 'audio/mp4', size: 9, durationMs: 4000, markers: [{ tMs: 1200, label: 'refrain', kind: 'marker' }] };
  const context = { pid: 7, entityId: 42, title: 'Chansons' };

  it('elle est adressée d\'office au même élément, en attente d\'envoi', () => {
    const item = takeItem({ file, take: { ref: 'c-0b6f2c1e-1111-4222-8333-444455556666' }, context, owner: 'https://site.test#3', serverUrl: 'https://site.test' });
    assert.equal(item.state, 'queued');
    assert.deepEqual(item.target, { serverUrl: 'https://site.test', pid: 7, title: 'Chansons', entityId: 42 });
    assert.equal(item.origin, 'enregistrement');
    assert.equal(item.owner, 'https://site.test#3');
  });

  it('sans site relié elle reste une capture locale à classer', () => {
    const item = takeItem({ file, take: {}, context, owner: null, serverUrl: null });
    assert.equal(item.state, 'local');
    assert.equal(item.target, null);
    assert.match(item.id, /^c-/);
  });

  it('l\'essai direct dont la réponse s\'est perdue n\'est pas refait : même référence, une seule prise', async () => {
    const srv = fakeProject();
    const take = { ref: 'c-0b6f2c1e-1111-4222-8333-444455556666', markers: file.markers, source: 'recorded', integrity: 'ok' };
    // 1. Dans le projet : l'envoi atteint le site, la réponse se perd.
    srv.failNext('lost');
    await assert.rejects(() => srv.sendTake(srv.P, take, { clientRef: `${take.ref}-a0`, entityId: 42, label: 'Refrain' }), /offline/);
    assert.equal(srv.byRef.size, 1);
    // 2. « Garder sur cet appareil » puis envoi différé par la boîte de réception.
    const item = takeItem({ file: { ...file, label: 'Refrain' }, take, context, owner: 'o', serverUrl: 'https://site.test' });
    assert.equal(refFor(item, '-a0'), `${take.ref}-a0`);
    const out = await fileItem({ P: srv.P, item, files, sendTake: srv.sendTake });
    assert.equal(out.entityId, 42, 'aucune idée musicale créée en double : la prise rejoint l\'élément visé');
    assert.equal(srv.byRef.size, 1, 'une seule prise côté site');
    assert.deepEqual(srv.calls.filter((c) => c[0] === 'entity'), []);
  });
});

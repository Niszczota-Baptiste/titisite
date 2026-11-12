import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootServer, fetcher } from '../harness.js';
import { loadPlaywright, startContainer } from './container.js';

// Atelier musical de bout en bout, dans Chromium avec un micro simulé :
// enregistrer une prise → la ranger dans l'atelier privé → l'écouter et
// l'annoter sur le web ET sur le téléphone (bundle mobile, banc « conteneur »).
//
// L'enregistreur exercé ici est celui du navigateur (MediaRecorder). Celui de
// l'application Android (service natif) remplit le même contrat
// (audio/recorderPort.js) mais ne peut être essayé que sur un téléphone.

const pw = loadPlaywright();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const built = fs.existsSync(`${ROOT}dist-atelier/index.html`) && fs.existsSync(`${ROOT}dist/index.html`);
const skip = !pw ? 'Playwright introuvable' : !built ? 'lancer d\'abord npm run build && npm run build:atelier' : false;

const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const W = { 'X-Author-Request': '1' };
const SHOTS = process.env.ATELIER_SHOTS || null;

let server; let webSim; let phoneSim; let browser; let api; let pid; let base; let soundId;

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

before(async () => {
  if (skip) return;
  server = await bootServer();
  webSim = await startContainer({ dist: `${ROOT}dist`, apiBase: server.base });
  phoneSim = await startContainer({ dist: `${ROOT}dist-atelier`, apiBase: server.base });
  browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  api = fetcher(server.base);
  assert.equal((await api.post('/api/auth/login', { body: ADMIN })).status, 200);
  const p = await api.post('/api/author/projects', { body: { title: 'Chansons du port', kind: 'musique' }, headers: W });
  pid = p.json.id;
  base = `/api/author/projects/${pid}`;
});

after(async () => {
  await browser?.close();
  await webSim?.stop();
  await phoneSim?.stop();
  await server?.stop();
});

describe('Mon Atelier — capture audio privée, lecture et annotation sur les deux interfaces', { skip }, () => {
  let web; let wp; let phone; let pp; let take;

  it('web : enregistre une prise (micro demandé au moment d\'enregistrer), pose un repère, la range', async () => {
    web = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', permissions: ['microphone'] });
    wp = await web.newPage();
    await wp.goto(`${webSim.base}/auteur/${pid}/sons`);
    await wp.locator('input[type=email]').fill(ADMIN.email);
    await wp.locator('input[type=password]').fill(ADMIN.password);
    await wp.locator('form button[type=submit]').click();
    await wp.getByRole('heading', { name: /Sons & musique/ }).waitFor();
    await wp.getByText('Aucune idée musicale pour l\'instant').waitFor();

    await wp.getByRole('button', { name: '● Enregistrer' }).click();
    await wp.getByText('Le micro sera demandé au moment d\'enregistrer').waitFor();
    await wp.locator('.au-rec-button').click();
    await wp.getByText('Enregistrement en cours').waitFor();
    await shot(wp, '20-enregistrement-web');
    await wp.waitForTimeout(1300);
    await wp.getByRole('button', { name: /＋ Repère/ }).click();
    await wp.waitForTimeout(900);
    await wp.getByRole('button', { name: '■ Arrêter' }).click();
    await wp.getByLabel('Nom de la prise').fill('Valse du port');
    await wp.getByRole('button', { name: 'Garder cette prise' }).click();
    await wp.waitForURL(/\/auteur\/\d+\/e\/\d+$/);
    soundId = Number(wp.url().split('/').pop());

    const audio = (await api.get(`${base}/audio`)).json;
    assert.equal(audio.length, 1);
    take = audio[0];
    assert.equal(take.entity.id, soundId);
    assert.equal(take.label, 'Valse du port');
    assert.equal(take.source, 'recorded');
    assert.equal(take.integrity, 'ok');
    assert.ok(take.durationMs >= 1800 && take.durationMs < 6000, `durée plausible (${take.durationMs} ms)`);
    assert.ok(take.size > 1000);
    assert.equal(take.markerCount, 1, 'le repère posé pendant la prise est arrivé avec elle');
    const stored = fs.statSync(path.join(server.workdir, 'uploads', path.basename(take.url)));
    assert.equal(stored.size, take.size);
  });

  it('la prise reste privée : aucune route publique ne la sert', async () => {
    const anon = fetcher(server.base);
    const name = path.basename(take.url);
    assert.equal((await anon.get(`/api/audio/${name}`)).status, 404);
    assert.equal((await anon.get(take.url)).status, 401);
    assert.ok(!(await anon.get('/api/tracks')).text.includes('Valse du port'));
  });

  it('web : lecture, déplacement dans la prise, boucle A→B, repère commenté', async () => {
    await wp.getByRole('button', { name: /Écouter — Valse du port/ }).waitFor();
    const state = () => wp.evaluate(() => { const a = document.querySelector('.au-takes audio'); return { t: a.currentTime, paused: a.paused, d: a.duration }; });
    await wp.getByRole('button', { name: /Écouter — Valse du port/ }).click();
    await wp.waitForFunction(() => document.querySelector('.au-takes audio')?.currentTime > 0.3);
    assert.equal((await state()).paused, false);
    await wp.getByRole('button', { name: /Mettre en pause/ }).click();

    // Déplacement : la piste est servie par requêtes partielles.
    await wp.getByLabel(/Position dans la prise/).fill('1000');
    assert.ok(Math.abs((await state()).t - 1.0) < 0.15, 'position à 1 s');

    // Boucle : A à 0,4 s, B à 1,2 s, puis lecture — la position ne dépasse plus B.
    await wp.getByLabel(/Position dans la prise/).fill('400');
    await wp.getByRole('button', { name: 'Début de boucle ici' }).click();
    await wp.getByLabel(/Position dans la prise/).fill('1200');
    await wp.getByRole('button', { name: 'Fin de boucle ici' }).click();
    await wp.getByRole('button', { name: /Écouter — Valse du port/ }).click();
    const seen = [];
    for (let i = 0; i < 14; i += 1) { await wp.waitForTimeout(150); seen.push((await state()).t); }
    assert.ok(Math.max(...seen) < 1.45, `reste dans la boucle (max ${Math.max(...seen).toFixed(2)} s)`);
    assert.ok(seen.some((t, i) => i > 0 && t < seen[i - 1]), 'est revenu au début de la boucle');
    await wp.getByRole('button', { name: /Mettre en pause/ }).click();
    await wp.getByRole('button', { name: 'Garder la boucle' }).click();
    await wp.getByPlaceholder('Le motif, Refrain, À refaire…').fill('Le motif');
    await wp.getByRole('button', { name: 'Garder la boucle' }).last().click();
    await wp.locator('.au-marker.is-loop', { hasText: 'Le motif' }).waitFor();
    await shot(wp, '21-prise-web');

    const markers = (await api.get(`${base}/media/${take.id}/markers`)).json;
    assert.equal(markers.length, 2);
    const loop = markers.find((m) => m.kind === 'loop');
    assert.equal(loop.label, 'Le motif');
    assert.ok(Math.abs(loop.tMs - 400) <= 60 && Math.abs(loop.endMs - 1200) <= 60, JSON.stringify(loop));
  });

  it('téléphone : retrouve la même idée, écoute la prise, ajoute un repère commenté', async () => {
    phone = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', permissions: ['microphone'] });
    pp = await phone.newPage();
    await pp.goto(`${phoneSim.base}/connexion`);
    await pp.getByLabel('E-mail').fill(ADMIN.email);
    await pp.getByLabel('Mot de passe').fill(ADMIN.password);
    await pp.getByRole('button', { name: 'Se connecter' }).click();
    await pp.locator('a.am-project', { hasText: 'Chansons du port' }).waitFor();
    await pp.goto(`${phoneSim.base}/auteur/${pid}/sons`);
    await pp.locator('.au-sound-title', { hasText: 'Valse du port' }).waitFor();
    await shot(pp, '22-sons-telephone');
    await pp.locator('.au-sound-title', { hasText: 'Valse du port' }).click();
    await pp.locator('.au-marker.is-loop', { hasText: 'Le motif' }).waitFor();

    await pp.getByRole('button', { name: /Écouter — Valse du port/ }).click();
    await pp.waitForFunction(() => document.querySelector('.au-takes audio')?.currentTime > 0.3);
    await pp.getByRole('button', { name: /Mettre en pause/ }).click();
    await pp.getByLabel(/Position dans la prise/).fill('800');
    await pp.getByRole('button', { name: '＋ Repère ici' }).click();
    await pp.getByPlaceholder('Le motif, Refrain, À refaire…').fill('À refaire');
    await pp.locator('.au-dialog textarea').fill('la fin traîne — 다시');
    await pp.getByRole('button', { name: 'Poser le repère' }).click();
    await pp.locator('.au-marker', { hasText: 'À refaire' }).waitFor();
    await shot(pp, '23-prise-telephone');

    const markers = (await api.get(`${base}/media/${take.id}/markers`)).json;
    const added = markers.find((m) => m.label === 'À refaire');
    assert.ok(added, `repère du téléphone reçu par le site : ${JSON.stringify(markers)}`);
    assert.equal(added.note, 'la fin traîne — 다시');
    assert.ok(Math.abs(added.tMs - 800) <= 60);
    const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'pas de débordement horizontal à 393 px');
  });

  it('web : l\'annotation faite sur le téléphone est là', async () => {
    await wp.reload();
    await wp.locator('.au-marker', { hasText: 'À refaire' }).waitFor();
    await wp.getByText('la fin traîne — 다시').waitFor();
  });

  it('téléphone : enregistre une seconde version ; la première reste la référence', async () => {
    await pp.getByRole('button', { name: '● Enregistrer' }).click();
    await pp.locator('.au-rec-button').click();
    await pp.getByText('Enregistrement en cours').waitFor();
    await pp.waitForTimeout(1200);
    await pp.getByRole('button', { name: '■ Arrêter' }).click();
    await pp.getByLabel('Nom de la prise').fill('Plus lente');
    await pp.getByRole('button', { name: 'Garder cette prise' }).click();
    await pp.locator('.au-take', { hasText: 'Plus lente' }).waitFor();
    const ent = (await api.get(`${base}/entities/${soundId}`)).json;
    assert.equal(ent.audio.length, 2);
    assert.equal(ent.referenceMediaId, take.id);
    assert.equal((await fetcher(server.base).get('/api/tracks')).json.filter((t) => t.filename).length, 0, 'toujours rien de public');
  });

  it('téléphone : une prise gardée hors connexion s\'écoute sans réseau — les autres non', async () => {
    const cached = (url) => pp.evaluate(async (u) => !!(await (await caches.open('au-media-v1')).match(u)), url);
    const ranged = (url, range) => pp.evaluate(async ([u, r]) => {
      const res = await fetch(u, { headers: { Range: r } });
      return { status: res.status, range: res.headers.get('Content-Range'), length: (await res.arrayBuffer()).byteLength };
    }, [url, range]);
    const other = (await api.get(`${base}/audio`)).json.find((t) => t.label === 'Plus lente');
    await pp.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 20000 });
    assert.equal(await cached(take.url), false, 'l\'écoute en ligne n\'a laissé aucune copie sur l\'appareil');

    await pp.getByRole('button', { name: /Actions sur Valse du port/ }).click();
    await pp.getByText(/Garder hors connexion/).click();
    await pp.locator('.au-take', { hasText: 'Valse du port' }).getByText('hors connexion', { exact: true }).waitFor();
    assert.equal(await cached(take.url), true);
    assert.equal(await cached(other.url), false, 'seule la prise demandée est gardée');

    phoneSim.setOffline(true);
    try {
      const part = await ranged(take.url, 'bytes=10-109');
      assert.deepEqual(part, { status: 206, range: `bytes 10-109/${take.size}`, length: 100 });
      const tail = await ranged(take.url, 'bytes=-50');
      assert.deepEqual(tail, { status: 206, range: `bytes ${take.size - 50}-${take.size - 1}/${take.size}`, length: 50 });
      assert.equal((await ranged(take.url, `bytes=${take.size}-`)).status, 416);
      assert.equal((await ranged(other.url, 'bytes=0-9')).status, 503, 'une prise non gardée ne se joue pas sans réseau');

      // Lecture réelle, et déplacement dans la piste, sans réseau.
      await pp.locator('.au-take', { hasText: 'Valse du port' }).locator('.au-take-main').click();
      await pp.getByRole('button', { name: /Écouter — Valse du port/ }).click();
      await pp.waitForFunction(() => document.querySelector('.au-takes audio')?.currentTime > 0.3);
      await pp.getByRole('button', { name: /Mettre en pause/ }).click();
      await pp.getByLabel(/Position dans la prise/).fill('900');
      await pp.waitForFunction(() => Math.abs((document.querySelector('.au-takes audio')?.currentTime ?? 0) - 0.9) < 0.15);
    } finally {
      phoneSim.setOffline(false);
    }

    await pp.getByRole('button', { name: /Actions sur Valse du port/ }).click();
    await pp.getByText('Retirer de cet appareil').click();
    await pp.waitForFunction(async (u) => !(await (await caches.open('au-media-v1')).match(u)), take.url);
  });

  it('hors connexion sur le web : la prise n\'est pas perdue ni déclarée rangée', async () => {
    await wp.getByRole('button', { name: '● Enregistrer' }).click();
    await wp.locator('.au-rec-button').click();
    await wp.getByText('Enregistrement en cours').waitFor();
    await wp.waitForTimeout(900);
    webSim.setOffline(true);
    await wp.getByRole('button', { name: '■ Arrêter' }).click();
    await wp.getByRole('button', { name: 'Garder cette prise' }).click();
    await wp.getByText(/Hors connexion : la prise n'a pas pu être envoyée/).waitFor();
    await wp.getByRole('link', { name: 'Télécharger le fichier' }).waitFor();
    assert.equal((await api.get(`${base}/audio`)).json.length, 2, 'rien n\'a été créé côté site');
    webSim.setOffline(false);
    await wp.getByRole('button', { name: 'Réessayer' }).click();
    await wp.waitForFunction(() => !document.querySelector('.au-rec-done'));
    assert.equal((await api.get(`${base}/audio`)).json.length, 3, 'un seul envoi après le nouvel essai');
  });

  it('publier : trois temps, et rien ne sort avant la confirmation', async () => {
    const tracks = async () => (await fetcher(server.base).get('/api/tracks')).json.filter((t) => t.filename);
    await wp.reload();
    await wp.getByRole('button', { name: /Actions sur Valse du port/ }).click();
    await wp.getByText('Publier…').click();
    await wp.getByText('Quelle version veux-tu rendre publique').waitFor();
    await wp.getByRole('button', { name: 'Prévisualiser' }).click();
    await wp.getByText('Voici exactement ce qui serait publié').waitFor();
    await wp.getByRole('button', { name: 'Choisir la destination' }).click();
    await wp.getByText('Destination : le site public').waitFor();
    assert.equal((await tracks()).length, 0, 'aperçu et choix de destination ne publient rien');
    assert.equal(await wp.getByRole('button', { name: 'Publier', exact: true }).isDisabled(), true);
    await shot(wp, '24-publication');
    await wp.getByLabel(/Je publie/).check();
    await wp.getByRole('button', { name: 'Publier', exact: true }).click();
    await wp.getByText('Prise publiée sur le site').waitFor();
    const pub = await tracks();
    assert.equal(pub.length, 1);
    assert.notEqual(pub[0].filename, path.basename(take.url));
    assert.equal((await fetcher(server.base).get(`/api/audio/${path.basename(take.url)}`)).status, 404, 'l\'original reste privé');
    await web.close();
    await phone.close();
  });
});

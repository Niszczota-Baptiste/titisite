import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootServer, fetcher } from '../harness.js';
import { loadPlaywright, startContainer } from './container.js';

// Parcours de bout en bout de l'application Mon Atelier, joués dans Chromium
// contre le VRAI serveur, à travers le banc « conteneur » (test/e2e/container.js)
// qui sert le bundle mobile sous l'origine de l'API comme le fait l'APK.
//
//   npm run build && npm run build:atelier && npm run test:atelier
//
// Le « téléphone » et le « web » sont deux contextes de navigateur distincts
// (deux pots à cookies, deux stockages), reliés au même serveur.

const pw = loadPlaywright();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const built = fs.existsSync(`${ROOT}dist-atelier/index.html`) && fs.existsSync(`${ROOT}dist/index.html`);
const skip = !pw ? 'Playwright introuvable' : !built ? 'lancer d\'abord npm run build && npm run build:atelier' : false;

const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };
const W = { 'X-Author-Request': '1' };
const SHOTS = process.env.ATELIER_SHOTS || null;

let server; let phoneSim; let webSim; let browser; let ownerApi; let pid; let chapterId;

async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const newPhone = (width = 393, height = 851) => browser.newContext({
  viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR',
  userAgent: 'Mozilla/5.0 (Linux; Android 16; Mon Atelier) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
});

async function signIn(page, creds = ADMIN) {
  await page.getByLabel('E-mail').fill(creds.email);
  await page.getByLabel('Mot de passe').fill(creds.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

const editor = (page) => page.locator('textarea.au-writer-text');
const saveState = (page) => page.locator('.au-writer-save');

async function chapterContent() {
  const r = await ownerApi.get(`/api/author/projects/${pid}/entities/${chapterId}`);
  assert.equal(r.status, 200);
  return r.json;
}

before(async () => {
  if (skip) return;
  server = await bootServer();
  phoneSim = await startContainer({ dist: `${ROOT}dist-atelier`, apiBase: server.base });
  webSim = await startContainer({ dist: `${ROOT}dist`, apiBase: server.base });
  browser = await pw.chromium.launch();
  ownerApi = fetcher(server.base);
  assert.equal((await ownerApi.post('/api/auth/login', { body: ADMIN })).status, 200);
  const p = await ownerApi.post('/api/author/projects', { body: { title: 'Le Livre des Cendres' }, headers: W });
  assert.equal(p.status, 201);
  pid = p.json.id;
  const c = await ownerApi.post(`/api/author/projects/${pid}/entities`, {
    body: { kind: 'chapter', title: 'L\'orage', content: 'Il était une fois, à Valcendre.' }, headers: W,
  });
  assert.equal(c.status, 201);
  chapterId = c.json.id;
});

after(async () => {
  await browser?.close();
  await phoneSim?.stop();
  await webSim?.stop();
  await server?.stop();
});

describe('Mon Atelier — projet web sur le téléphone, hors connexion, synchronisation', { skip }, () => {
  let phone; let page;

  it('démarre sans compte : accueil utilisable, rien d\'envoyé', async () => {
    phone = await newPhone();
    page = await phone.newPage();
    await page.goto(`${phoneSim.base}/`);
    await page.getByRole('heading', { name: 'Mon Atelier' }).waitFor();
    for (const label of ['Capturer une idée', 'Écrire', 'Enregistrer un son', 'Reprendre un projet', 'Explorer mes idées']) {
      await page.getByText(label, { exact: true }).waitFor();
    }
    await page.getByText('Non connecté').waitFor();
    await shot(page, '01-accueil-non-connecte');
  });

  it('se connecte (cookie HttpOnly de première partie) et ouvre le projet du site', async () => {
    await page.getByRole('link', { name: 'Se connecter' }).click();
    await signIn(page);
    await page.locator('a.am-project', { hasText: 'Le Livre des Cendres' }).waitFor();
    // Le cookie de session existe, HttpOnly et SameSite=Strict : le JavaScript ne le voit pas.
    const cookies = await phone.cookies(phoneSim.base);
    const session = cookies.find((c) => c.name === 'titisite_session');
    assert.ok(session, 'cookie de session posé');
    assert.equal(session.httpOnly, true);
    assert.equal(session.sameSite, 'Strict');
    assert.equal(await page.evaluate(() => document.cookie.includes('titisite_session')), false);
    await shot(page, '02-accueil-connecte');
    await page.locator('a.am-project', { hasText: 'Le Livre des Cendres' }).click();
    await page.waitForURL(new RegExp(`/auteur/${pid}$`));
  });

  it('modifie un chapitre en ligne : le site reçoit la modification', async () => {
    await page.goto(`${phoneSim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await editor(page).waitFor();
    assert.match(await editor(page).inputValue(), /Il était une fois/);
    await editor(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' La pluie tombait — 비가 내렸다.');
    await page.waitForFunction(() => document.querySelector('.au-writer-save')?.textContent.includes('Synchronisé'));
    const ch = await chapterContent();
    assert.match(ch.content, /La pluie tombait — 비가 내렸다\.$/, 'français et coréen conservés');
    await shot(page, '03-editeur');
  });

  it('prépare la lecture hors connexion (service worker + copie du projet)', async () => {
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 20000 });
    await page.waitForFunction((id) => !!localStorage.getItem(`au-pack:${id}`), pid, { timeout: 30000 });
  });

  it('hors connexion : l\'écriture est gardée sur l\'appareil, puis retrouvée après fermeture', async () => {
    phoneSim.setOffline(true);
    await editor(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Écrit dans le train.');
    await page.waitForFunction(() => /appareil/i.test(document.querySelector('.au-writer-save')?.textContent || ''));
    await shot(page, '04-editeur-hors-connexion');
    const before = await chapterContent();
    assert.doesNotMatch(before.content, /Écrit dans le train/, 'rien n\'est parti');

    // « Fermer l'application » : la page disparaît, le stockage de l'appareil reste.
    await page.close();
    page = await phone.newPage();
    await page.goto(`${phoneSim.base}/`);
    await page.getByText(/Hors connexion/).waitFor();
    await page.locator('a.am-project', { hasText: 'Le Livre des Cendres' }).waitFor();
    await shot(page, '05-accueil-hors-connexion');
    await page.goto(`${phoneSim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await editor(page).waitFor();
    assert.match(await editor(page).inputValue(), /Écrit dans le train\.$/, 'le texte hors connexion est toujours là');
  });

  it('au retour du réseau : synchronisation, puis le même texte dans l\'atelier web', async () => {
    phoneSim.setOffline(false);
    await page.waitForFunction(() => document.querySelector('.au-writer-save')?.textContent.includes('Synchronisé'), null, { timeout: 20000 });
    const ch = await chapterContent();
    assert.match(ch.content, /La pluie tombait — 비가 내렸다\. Écrit dans le train\.$/);

    const web = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
    const wp = await web.newPage();
    await wp.goto(`${webSim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await wp.locator('input[type=email]').fill(ADMIN.email);
    await wp.locator('input[type=password]').fill(ADMIN.password);
    await wp.locator('form button[type=submit]').click();
    await wp.locator('textarea.au-writer-text').waitFor();
    assert.match(await wp.locator('textarea.au-writer-text').inputValue(), /Écrit dans le train\.$/);
    await web.close();
  });

  it('même passage modifié des deux côtés : conflit explicite, les deux textes sont conservés', async () => {
    phoneSim.setOffline(true);
    await editor(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Version du téléphone.');
    await page.waitForFunction(() => /appareil/i.test(document.querySelector('.au-writer-save')?.textContent || ''));
    // Pendant ce temps, « le web » réécrit le même champ.
    const cur = await chapterContent();
    const put = await ownerApi.put(`/api/author/projects/${pid}/entities/${chapterId}`, {
      body: { revision: cur.revision, content: 'Version du web.' }, headers: W,
    });
    assert.equal(put.status, 200);

    phoneSim.setOffline(false);
    await page.getByText('Modifié ailleurs entre-temps').waitFor({ timeout: 20000 });
    await page.getByText('Version du téléphone.').first().waitFor();
    await page.getByText('Version du web.').first().waitFor();
    await shot(page, '06-conflit');
    assert.equal((await chapterContent()).content, 'Version du web.', 'rien n\'a été écrasé en silence');

    await page.getByRole('button', { name: 'Prendre l\'autre version' }).click();
    await page.waitForFunction(() => document.querySelector('textarea.au-writer-text')?.value === 'Version du web.');
    const revs = await ownerApi.get(`/api/author/projects/${pid}/entities/${chapterId}/revisions?field=content`);
    const kept = revs.json.find((r) => r.label === 'Version locale — conflit');
    assert.ok(kept, 'ma version perdante est dans l\'historique');
    const body = await ownerApi.get(`/api/author/projects/${pid}/entities/${chapterId}/revisions/${kept.id}`);
    assert.equal(body.json.body, 'Version du téléphone.');
  });

  it('création hors connexion, réponse de synchronisation perdue, nouvel essai : pas de doublon', async () => {
    phoneSim.setOffline(true);
    await page.goto(`${phoneSim.base}/auteur/${pid}/personnages`);
    await page.getByRole('button', { name: /Nouveau|Créer|＋/ }).first().click();
    const title = page.locator('.au-dialog input.au-input').first();
    await title.fill('Élise de Valcendre');
    await title.press('Enter');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('au-outbox') || '[]')).some((o) => o.type === 'create'), null, { timeout: 10000 });

    // Le réseau revient, mais la réponse à la création se perd en route.
    phoneSim.dropNextResponse((method, path) => method === 'POST' && path === `/api/author/projects/${pid}/entities`);
    phoneSim.setOffline(false);
    await page.waitForFunction(() => !localStorage.getItem('au-outbox'), null, { timeout: 60000 });
    const dropped = phoneSim.seen.filter((s) => s.method === 'POST' && s.path === `/api/author/projects/${pid}/entities`);
    assert.ok(dropped.some((s) => s.dropped && s.status === 201), 'première tentative : créée côté serveur, réponse perdue');
    assert.ok(dropped.some((s) => !s.dropped && s.status === 200), 'rejeu : le serveur renvoie l\'élément déjà créé');
    const list = await ownerApi.get(`/api/author/projects/${pid}/entities?kind=character`);
    assert.equal(list.json.items.filter((e) => e.title === 'Élise de Valcendre').length, 1, 'un seul personnage');
  });

  it('changement de compte : pas de fuite, et le travail non envoyé du premier compte est conservé', async () => {
    // Un brouillon non envoyé du propriétaire reste sur l'appareil.
    await page.goto(`${phoneSim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await editor(page).waitFor();
    phoneSim.setOffline(true);
    await editor(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Brouillon privé du propriétaire.');
    await page.waitForFunction((k) => (localStorage.getItem(k) || '').includes('Brouillon privé'), `au-draft:${pid}:${chapterId}`);
    await page.goto(`${phoneSim.base}/reglages`);
    phoneSim.setOffline(false);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).last().click();
    await page.getByRole('button', { name: 'Se connecter' }).waitFor();

    // Un autre compte se connecte sur le même appareil.
    await signIn(page, MEMBER);
    await page.getByText(/n'a pas accès à l'atelier/).first().waitFor();
    const leak = await page.evaluate(async (id) => {
      const names = typeof caches === 'undefined' ? [] : await caches.keys();
      let cached = 0;
      for (const n of names.filter((x) => x.startsWith('au-data') || x.startsWith('au-media'))) cached += (await (await caches.open(n)).keys()).length;
      const api = await fetch(`/api/author/projects/${id}`, { credentials: 'include' });
      return { cached, status: api.status, projects: Object.keys(localStorage).filter((k) => k.startsWith('am-projects:')).length };
    }, pid);
    assert.equal(leak.cached, 0, 'copies de lecture du premier compte effacées');
    assert.equal(leak.status, 403, 'le serveur refuse l\'atelier à ce compte');
    assert.equal(leak.projects, 0, 'liste des projets du premier compte effacée');
    await page.goto(`${phoneSim.base}/`);
    await page.getByText(/n'a pas accès à l'atelier/).waitFor();
    assert.equal(await page.locator('a.am-project').count(), 0);
    assert.doesNotMatch((await chapterContent()).content, /Brouillon privé/, 'rien n\'est parti sous un autre compte');

    // Le propriétaire revient : son brouillon est toujours là et repart.
    await page.goto(`${phoneSim.base}/reglages`);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).last().click();
    await signIn(page, ADMIN);
    await page.getByText(ADMIN.email).waitFor();
    await page.goto(`${phoneSim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await editor(page).waitFor();
    await page.waitForFunction(() => document.querySelector('.au-writer-save')?.textContent.includes('Synchronisé'), null, { timeout: 20000 });
    assert.match((await chapterContent()).content, /Brouillon privé du propriétaire\.$/);
    await phone.close();
  });
});

describe('Mon Atelier — mise en page téléphone', { skip }, () => {
  it('accueil lisible à 360 dp et 393 dp, sans défilement horizontal', async () => {
    for (const width of [360, 393]) {
      const ctx = await newPhone(width, 800);
      const p = await ctx.newPage();
      await p.goto(`${phoneSim.base}/`);
      await p.getByRole('heading', { name: 'Mon Atelier' }).waitFor();
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `pas de débordement horizontal à ${width} px (${overflow})`);
      await shot(p, `10-accueil-${width}`);
      await ctx.close();
    }
  });
});

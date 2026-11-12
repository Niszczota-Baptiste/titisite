import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fakeModelApi } from '../fake-model-api.js';
import { bootServer, fetcher } from '../harness.js';
import { loadPlaywright, startContainer } from './container.js';

// Assistance d'écriture facultative, vue de l'éditeur du téléphone : éteinte
// par défaut, un extrait choisi et montré avant l'envoi, des propositions qui
// n'entrent dans le texte que sur un geste. L'API du modèle est un faux serveur
// local : on y lit ce qui est réellement parti.

const pw = loadPlaywright();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const skip = !pw ? 'Playwright introuvable' : !fs.existsSync(`${ROOT}dist-atelier/index.html`) ? 'lancer d\'abord npm run build:atelier' : false;

const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const W = { 'X-Author-Request': '1' };
const SHOTS = process.env.ATELIER_SHOTS || null;
const TEXT = 'DEBUT-PRIVE du chapitre. Elle sourit {{question: NOTE-PRIVEE}} enfin. FIN-PRIVEE du chapitre.';

let model; let server; let sim; let browser; let phone; let page; let api; let pid; let chapterId; let base;

const editor = () => page.locator('textarea.au-writer-text');
const value = () => editor().inputValue();
// Deux images d'attente : une boîte qui vient de se fermer rend d'abord la sélection précédente.
const select = (start, end) => page.evaluate(async ([s, e]) => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t = document.querySelector('textarea.au-writer-text');
  t.focus();
  t.setSelectionRange(s, e);
}, [start, end]);
const assistButton = () => page.getByRole('button', { name: 'Demander des propositions sur le passage sélectionné' });

before(async () => {
  if (skip) return;
  model = await fakeModelApi();
  server = await bootServer({ env: { ANTHROPIC_API_KEY: 'cle-de-test', ANTHROPIC_BASE_URL: model.base, AUTHOR_ASSIST_MODEL: '' } });
  sim = await startContainer({ dist: `${ROOT}dist-atelier`, apiBase: server.base });
  browser = await pw.chromium.launch();
  api = fetcher(server.base);
  assert.equal((await api.post('/api/auth/login', { body: ADMIN })).status, 200);
  pid = (await api.post('/api/author/projects', { body: { title: 'PROJET-PRIVE' }, headers: W })).json.id;
  base = `/api/author/projects/${pid}`;
  chapterId = (await api.post(`${base}/entities`, { body: { kind: 'chapter', title: 'Prologue', content: TEXT }, headers: W })).json.id;
  phone = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  page = await phone.newPage();
  await page.goto(`${sim.base}/connexion`);
  await page.getByLabel('E-mail').fill(ADMIN.email);
  await page.getByLabel('Mot de passe').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.locator('a.am-project', { hasText: 'PROJET-PRIVE' }).waitFor();
});

after(async () => {
  await browser?.close();
  await sim?.stop();
  await server?.stop();
  await model?.stop();
});

describe('Mon Atelier — assistance d\'écriture facultative', { skip }, () => {
  it('éteinte par défaut : l\'éditeur ne la propose même pas', async () => {
    await page.goto(`${sim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await editor().waitFor();
    await page.getByRole('button', { name: 'Rechercher dans le chapitre' }).waitFor();
    assert.equal(await assistButton().count(), 0);
  });

  it('s\'active dans les réglages du projet, avec ce qu\'elle fait écrit noir sur blanc', async () => {
    await page.goto(`${sim.base}/auteur/${pid}/reglages`);
    await page.getByText('Assistance d\'écriture (facultative)').click();
    await page.getByText(/Jamais le projet, le chapitre entier, les fiches ni les idées/).waitFor();
    await page.getByLabel('Activer l\'assistance pour ce projet').check();
    await page.waitForFunction(async (b) => (await (await fetch(b)).json()).aiAssist === true, base);
    assert.equal(model.seen.length, 0, 'activer n\'envoie rien');
  });

  it('sans sélection, rien ne part', async () => {
    await page.goto(`${sim.base}/auteur/${pid}/ecrire/${chapterId}`);
    await editor().waitFor();
    await assistButton().waitFor();
    await select(5, 5);
    await assistButton().click();
    await page.getByText(/Sélectionne d'abord le passage/).waitFor();
    assert.equal(model.seen.length, 0);
  });

  it('montre l\'extrait avant l\'envoi, sans les marques de travail, et n\'envoie que lui', async () => {
    const start = TEXT.indexOf('Elle sourit');
    const end = TEXT.indexOf(' FIN-PRIVEE');
    await select(start, end);
    await assistButton().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Ce qui sera envoyé — et rien d\'autre').waitFor();
    assert.equal((await dialog.locator('.au-assist-excerpt').textContent()).trim(), 'Elle sourit enfin.');
    await dialog.getByText(/marques de travail .* ont été retirées de l'envoi/).waitFor();
    assert.equal(model.seen.length, 0, 'ouvrir la boîte n\'envoie rien');
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/40-assistance-avant-envoi.png` }); }

    await dialog.getByRole('radio', { name: 'Variantes' }).click();
    await dialog.getByRole('button', { name: 'Envoyer cet extrait' }).click();
    await dialog.getByText('Elle détourna les yeux.').waitFor();
    await dialog.getByText('rien n\'a été modifié dans ton texte').waitFor();
    assert.equal(model.seen.length, 1);
    const raw = model.seen[0].raw;
    assert.ok(raw.includes('Elle sourit enfin.'));
    for (const secret of ['DEBUT-PRIVE', 'FIN-PRIVEE', 'NOTE-PRIVEE', 'PROJET-PRIVE', 'Prologue']) assert.ok(!raw.includes(secret), `« ${secret} » ne doit pas partir`);
    assert.equal(await value(), TEXT, 'le texte n\'a pas bougé');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/41-assistance-propositions.png` });
  });

  it('une proposition n\'entre dans le texte que sur un geste, et le passage d\'origine reste', async () => {
    const dialog = page.getByRole('dialog');
    // Le passage sélectionné contenait une marque : pas d'enveloppe possible, seulement la copie.
    assert.equal(await dialog.getByRole('button', { name: 'Garder comme variante' }).count(), 0);
    await dialog.getByRole('button', { name: 'Fermer' }).first().click();
    await dialog.waitFor({ state: 'detached' });

    const start = TEXT.indexOf('Elle sourit');
    await select(start, start + 'Elle sourit'.length);
    await assistButton().click();
    await dialog.getByRole('radio', { name: 'Variantes' }).click();
    await dialog.getByRole('button', { name: 'Envoyer cet extrait' }).click();
    await dialog.getByText('Elle détourna les yeux.').waitFor();
    assert.equal(await value(), TEXT);
    await dialog.getByRole('button', { name: 'Garder comme variante' }).first().click();
    await page.waitForFunction(() => document.querySelector('textarea.au-writer-text')?.value.includes('{{variante: Elle sourit || Elle détourna les yeux.}}'));
    await page.waitForFunction(() => document.querySelector('.au-writer-save')?.textContent.includes('Synchronisé'));
    const stored = (await api.get(`${base}/entities/${chapterId}`)).json.content;
    assert.ok(stored.includes('{{variante: Elle sourit || Elle détourna les yeux.}}'), 'gardée comme seconde version, pas comme remplacement');
  });

  it('hors connexion : rien n\'est envoyé ni mis en attente', async () => {
    const before = model.seen.length;
    sim.setOffline(true);
    try {
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      const v = await value();
      const start = v.indexOf('FIN-PRIVEE');
      await select(start, start + 10);
      await assistButton().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText(/Hors connexion : l'assistance demande le réseau/).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Envoyer cet extrait' }).isDisabled(), true);
    } finally {
      sim.setOffline(false);
    }
    assert.equal(model.seen.length, before);
  });
});

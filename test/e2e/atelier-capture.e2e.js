import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootServer, fetcher } from '../harness.js';
import { loadPlaywright, startContainer } from './container.js';

// Capture locale de l'application Mon Atelier : saisir une idée et enregistrer
// un son SANS réseau ni compte, les retrouver après fermeture, puis les classer
// dans un projet du site — sans doublon même si une réponse se perd, et sans
// qu'un autre compte les voie. Stockage exercé ici : celui du navigateur
// (localStorage + IndexedDB) ; dans l'APK, le même contrat est rempli par le
// stockage natif (plugin AtelierVault), à vérifier sur téléphone.

const pw = loadPlaywright();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const skip = !pw ? 'Playwright introuvable' : !fs.existsSync(`${ROOT}dist-atelier/index.html`) ? 'lancer d\'abord npm run build:atelier' : false;

const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };
const W = { 'X-Author-Request': '1' };
const SHOTS = process.env.ATELIER_SHOTS || null;

let server; let sim; let browser; let api; let pid; let base; let phone; let page;

async function shot(p, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await p.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function signIn(creds) {
  await page.goto(`${sim.base}/connexion`);
  await page.getByLabel('E-mail').fill(creds.email);
  await page.getByLabel('Mot de passe').fill(creds.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

before(async () => {
  if (skip) return;
  server = await bootServer();
  sim = await startContainer({ dist: `${ROOT}dist-atelier`, apiBase: server.base });
  browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  api = fetcher(server.base);
  await api.post('/api/auth/login', { body: ADMIN });
  pid = (await api.post('/api/author/projects', { body: { title: 'Le Livre des Cendres' }, headers: W })).json.id;
  base = `/api/author/projects/${pid}`;
  phone = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', permissions: ['microphone'] });
  page = await phone.newPage();
});

after(async () => {
  await browser?.close();
  await sim?.stop();
  await server?.stop();
});

describe('Mon Atelier — capturer sans réseau ni compte, puis classer', { skip }, () => {
  it('premier lancement hors connexion : une idée est gardée dès la frappe, sans titre ni projet', async () => {
    sim.setOffline(true);
    await page.goto(`${sim.base}/`);
    await page.getByText('Capturer une idée', { exact: true }).click();
    const text = page.getByLabel('Texte de la capture');
    await text.fill('Le phare ne s\'éteint jamais\nil attend quelqu\'un — 등대');
    await page.getByText('✓ gardé sur cet appareil').waitFor();
    await shot(page, '30-capture');
    // Aucune requête d'écriture n'est partie : rien à envoyer, nulle part.
    assert.equal(sim.seen.filter((s) => s.method !== 'GET').length, 0);
  });

  it('application fermée puis rouverte, toujours hors connexion : l\'idée est là', async () => {
    await page.close();
    page = await phone.newPage();
    await page.goto(`${sim.base}/`);
    await page.getByText('1 à classer').waitFor();
    await page.getByText('📥 Boîte de réception').click();
    await page.getByText('Le phare ne s\'éteint jamais').first().waitFor();
    await page.getByText(/il attend quelqu'un — 등대/).waitFor();
    await page.getByText('Sauvegardée sur cet appareil — à classer').waitFor();
  });

  it('enregistre un son hors connexion : la prise est gardée sur l\'appareil, écoutable', async () => {
    await page.goto(`${sim.base}/`);
    await page.getByText('Enregistrer un son', { exact: true }).click();
    await page.locator('.au-rec-button').click();
    await page.getByText('Enregistrement en cours').waitFor();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /＋ Repère/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '■ Arrêter' }).click();
    await page.getByLabel('Nom de la prise').fill('Valse du port');
    await page.getByRole('button', { name: 'Garder cette prise' }).click();
    await page.waitForURL(/\/boite$/);
    await page.locator('.am-inbox-item', { hasText: 'Valse du port' }).waitFor();
    await page.getByRole('button', { name: /Écouter — Valse du port/ }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.am-inbox-audio audio')].some((a) => a.currentTime > 0.2));
    await shot(page, '31-boite');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, 'pas de débordement horizontal à 360 px');
  });

  it('sans compte, classer ne fait pas semblant : la capture reste, on est invité à se connecter', async () => {
    sim.setOffline(false);
    await page.locator('.am-inbox-item', { hasText: 'Le phare' }).getByRole('button', { name: 'Classer…' }).click();
    await page.waitForURL(/\/connexion$/);
    assert.equal((await api.get(`${base}/entities?kind=note`)).json.items.length, 0);
  });

  it('connecté : l\'idée rejoint la boîte à idées du projet, avec sa provenance', async () => {
    await signIn(ADMIN);
    await page.locator('a.am-project', { hasText: 'Le Livre des Cendres' }).waitFor();
    await page.goto(`${sim.base}/boite`);
    await page.locator('.am-inbox-item', { hasText: 'Le phare' }).getByRole('button', { name: 'Classer…' }).click();
    await page.getByRole('button', { name: 'Classer', exact: true }).click();
    await page.waitForFunction(() => !document.body.textContent.includes('Le phare ne s\'éteint jamais'), null, { timeout: 20000 });
    const notes = (await api.get(`${base}/entities?kind=note`)).json.items;
    assert.equal(notes.length, 1);
    const note = (await api.get(`${base}/entities/${notes[0].id}`)).json;
    assert.equal(note.title, 'Le phare ne s\'éteint jamais');
    assert.equal(note.body, 'il attend quelqu\'un — 등대');
    assert.equal(note.inbox, true);
    assert.equal(note.origin, 'saisie');
    assert.ok(note.capturedAt > 1_700_000_000);
  });

  it('le son devient une idée musicale privée, avec sa prise et son repère', async () => {
    await page.locator('.am-inbox-item', { hasText: 'Valse du port' }).getByRole('button', { name: 'Classer…' }).click();
    await page.getByText('Le son devient une idée musicale du projet').waitFor();
    await page.getByRole('button', { name: 'Classer', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.am-inbox-item'), null, { timeout: 30000 });
    const audio = (await api.get(`${base}/audio`)).json;
    assert.equal(audio.length, 1);
    assert.equal(audio[0].label, 'Valse du port');
    assert.equal(audio[0].source, 'recorded');
    assert.equal(audio[0].markerCount, 1);
    assert.equal(audio[0].entity.title, 'Valse du port');
    assert.equal((await fetcher(server.base).get(audio[0].url)).status, 401, 'toujours privé');
    // Reçue par le site : la copie locale a été libérée.
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('am-vault:items') || '[]').length), 0);
  });

  it('réponse perdue pendant le classement : nouvel essai, pas de doublon', async () => {
    await page.goto(`${sim.base}/capturer`);
    await page.getByLabel('Texte de la capture').fill('Idée envoyée deux fois');
    await page.getByText('✓ gardé sur cet appareil').waitFor();
    await page.getByRole('button', { name: 'Classer…' }).click();
    sim.dropNextResponse((method, path) => method === 'POST' && path === `${base}/notes/quick`);
    await page.getByRole('button', { name: 'Classer', exact: true }).click();
    // La première tentative atteint le site mais sa réponse se perd : la capture
    // reste « en attente d'envoi ». L'application réessaie d'elle-même dès qu'une
    // requête repasse ; sinon « Envoyer maintenant » le demande.
    await page.waitForFunction(() => window.performance.now() > 0 && true);
    for (let i = 0; i < 40 && sim.seen.filter((s) => s.method === 'POST' && s.path === `${base}/notes/quick` && s.dropped).length === 0; i += 1) await page.waitForTimeout(100);
    assert.equal((await api.get(`${base}/entities?kind=note`)).json.items.filter((n) => n.title === 'Idée envoyée deux fois').length, 1, 'déjà créée côté site');
    const sendNow = page.getByRole('button', { name: 'Envoyer maintenant' });
    await page.waitForTimeout(1500);
    if (await page.locator('.am-inbox-item').count() && await sendNow.count() && await sendNow.isEnabled()) await sendNow.click();
    await page.waitForFunction(() => !document.querySelector('.am-inbox-item'), null, { timeout: 40000 });
    assert.equal((await api.get(`${base}/entities?kind=note`)).json.items.filter((n) => n.title === 'Idée envoyée deux fois').length, 1, 'toujours une seule');
    const posts = sim.seen.filter((s) => s.method === 'POST' && s.path === `${base}/notes/quick` && s.status < 300);
    assert.deepEqual(posts.slice(-2).map((s) => [s.status, s.dropped]), [[201, true], [200, false]]);
  });

  it('une capture d\'un compte reste sur l\'appareil mais n\'est ni montrée ni envoyée sous un autre', async () => {
    await page.goto(`${sim.base}/capturer`);
    await page.getByLabel('Texte de la capture').fill('Secret du propriétaire');
    await page.getByText('✓ gardé sur cet appareil').waitFor();
    await page.goto(`${sim.base}/reglages`);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).last().click();
    await page.getByRole('button', { name: 'Se connecter' }).waitFor();
    await page.goto(`${sim.base}/boite`);
    await page.getByText(/1 capture\(s\) d'un autre compte/).waitFor();
    assert.equal(await page.getByText('Secret du propriétaire').count(), 0, 'invisible une fois déconnecté');

    await signIn(MEMBER);
    await page.getByText(/n'a pas accès à l'atelier/).first().waitFor();
    await page.goto(`${sim.base}/boite`);
    await page.getByText(/1 capture\(s\) d'un autre compte/).waitFor();
    assert.equal(await page.getByText('Secret du propriétaire').count(), 0, 'invisible pour un autre compte');

    await page.goto(`${sim.base}/reglages`);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).last().click();
    await page.getByRole('button', { name: 'Se connecter' }).waitFor();
    await signIn(ADMIN);
    try { await page.locator('a.am-project').first().waitFor({ timeout: 15000 }); }
    catch (e) { await shot(page, '39-debug'); throw new Error(`après reconnexion : ${page.url()} — ${(await page.locator('body').innerText()).slice(0, 300)}`); }
    await page.goto(`${sim.base}/boite`);
    await page.getByText('Secret du propriétaire').first().waitFor();
    assert.equal((await api.get(`${base}/entities?kind=note`)).json.items.filter((n) => n.title.includes('Secret')).length, 0, 'jamais envoyée sans être classée');
  });
});

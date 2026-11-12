import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootServer, fetcher } from '../harness.js';
import { loadPlaywright, startContainer } from './container.js';

// Éditeur d'écriture sur le téléphone (bundle de l'application, banc
// « conteneur ») : marques de travail, recherche dans le texte, aperçu d'une
// fiche citée sans perdre sa place, saisie coréenne par composition.
//
//   npm run build:atelier && npm run test:atelier

const pw = loadPlaywright();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const skip = !pw ? 'Playwright introuvable' : !fs.existsSync(`${ROOT}dist-atelier/index.html`) ? 'lancer d\'abord npm run build:atelier' : false;

const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const GUEST = { email: 'omni-editeur@test.local', password: 'omnipw1-strong', name: 'Oriane' };
const W = { 'X-Author-Request': '1' };
const SHOTS = process.env.ATELIER_SHOTS || null;
const TEXT = 'Élise relit le pacte à [[Valcendre]]. Elle sourit. Plus tard, élise repart.';

let server; let sim; let browser; let phone; let page; let api; let pid; let chapterId; let base;

const editor = () => page.locator('textarea.au-writer-text');
const value = () => editor().inputValue();
const selection = () => page.evaluate(() => { const t = document.querySelector('textarea.au-writer-text'); return [t.selectionStart, t.selectionEnd]; });
const select = (start, end) => page.evaluate(([s, e]) => { const t = document.querySelector('textarea.au-writer-text'); t.focus(); t.setSelectionRange(s, e); }, [start, end]);
const synced = () => page.waitForFunction(() => document.querySelector('.au-writer-save')?.textContent.includes('Synchronisé'));
const stored = async () => (await api.get(`${base}/entities/${chapterId}`)).json.content;
async function shot(name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

before(async () => {
  if (skip) return;
  server = await bootServer();
  sim = await startContainer({ dist: `${ROOT}dist-atelier`, apiBase: server.base });
  browser = await pw.chromium.launch();
  api = fetcher(server.base);
  assert.equal((await api.post('/api/auth/login', { body: ADMIN })).status, 200);
  pid = (await api.post('/api/author/projects', { body: { title: 'Les Cendres' }, headers: W })).json.id;
  base = `/api/author/projects/${pid}`;
  await api.post(`${base}/entities`, { body: { kind: 'place', title: 'Valcendre', summary: 'Cité bâtie sur les cendres.', body: 'On y entre par **la porte du Nord**.' }, headers: W });
  chapterId = (await api.post(`${base}/entities`, { body: { kind: 'chapter', title: 'Prologue', content: TEXT }, headers: W })).json.id;

  phone = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  page = await phone.newPage();
  await page.goto(`${sim.base}/connexion`);
  await page.getByLabel('E-mail').fill(ADMIN.email);
  await page.getByLabel('Mot de passe').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.locator('a.am-project', { hasText: 'Les Cendres' }).waitFor();
  await page.goto(`${sim.base}/auteur/${pid}/ecrire/${chapterId}`);
  await editor().waitFor();
});

after(async () => {
  await browser?.close();
  await sim?.stop();
  await server?.stop();
});

describe('Mon Atelier — éditeur d\'écriture sur le téléphone', { skip }, () => {
  it('tient dans 360 dp avec sa barre d\'outils, sans défilement horizontal de la page', async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `la page déborde de ${overflow}px`);
    await shot('30-editeur-360');
  });

  it('garde deux versions d\'un passage, les inverse, et le site les reçoit', async () => {
    const start = TEXT.indexOf('Elle sourit');
    await select(start, start + 'Elle sourit'.length);
    await page.getByRole('button', { name: /^Variante/ }).click();
    assert.match(await value(), /\{\{variante: Elle sourit \|\| \}\}/);
    await page.keyboard.type('Elle détourne les yeux');
    assert.match(await value(), /\{\{variante: Elle sourit \|\| Elle détourne les yeux\}\}/);
    await synced();
    assert.match(await stored(), /\{\{variante: Elle sourit \|\| Elle détourne les yeux\}\}/, 'le propriétaire garde ses deux versions');

    // Sur téléphone, le panneau du chapitre s'ouvre en boîte de dialogue.
    await page.getByRole('button', { name: 'Infos du chapitre' }).click();
    const panel = page.getByRole('dialog');
    await panel.getByText('Marques (1)').waitFor();
    await panel.getByText('ou : Elle détourne les yeux').waitFor();
    await shot('31-marques');
    await panel.getByRole('button', { name: 'Inverser' }).click();
    await page.waitForFunction(() => document.querySelector('textarea.au-writer-text')?.value.includes('{{variante: Elle détourne les yeux || Elle sourit}}'));
    await panel.getByText('ou : Elle sourit').waitFor();
    await panel.getByRole('button', { name: 'Fermer' }).click();
    await panel.waitFor({ state: 'detached' });
  });

  it('une question pour soi se pose après la sélection et se lève d\'un geste', async () => {
    const v = await value();
    const at = v.indexOf('le pacte') + 'le pacte'.length;
    await select(at, at);
    await page.getByRole('button', { name: /^Question/ }).click();
    await page.keyboard.type('lequel exactement ?');
    assert.match(await value(), /le pacte \{\{question: lequel exactement \?\}\} à/);
    await page.locator('.au-writer-marks').waitFor();
    assert.match(await page.locator('.au-writer-marks').textContent(), /2 marques/);
    await synced();
  });

  it('ce que lit un invité ne contient ni question ni version écartée', async () => {
    const admin = await api.post('/api/users', { body: { ...GUEST, role: 'member' } });
    assert.equal(admin.status, 201, admin.text);
    assert.ok((await api.post(`${base}/shares`, { body: { email: GUEST.email, role: 'omniscient' }, headers: W })).status < 300);
    const guest = fetcher(server.base);
    assert.equal((await guest.post('/api/auth/login', { body: GUEST })).status, 200);
    const seen = (await guest.get(`${base}/entities/${chapterId}`)).json.content;
    assert.equal(seen, 'Élise relit le pacte à [[Valcendre]]. Elle détourne les yeux. Plus tard, élise repart.');
  });

  it('recherche dans le texte sans casse ni accents, et rend la main au texte sur l\'occurrence', async () => {
    await select(0, 0);
    await page.getByRole('button', { name: 'Rechercher dans le chapitre' }).click();
    const input = page.getByRole('searchbox', { name: 'Rechercher dans le chapitre' });
    await input.fill('elise');
    await page.getByText('1 / 2').waitFor();
    const v = await value();
    assert.deepEqual(await selection(), [0, 5], '« Élise » trouvée par « elise »');
    await page.getByRole('button', { name: 'Occurrence suivante' }).click();
    await page.getByText('2 / 2').waitFor();
    assert.deepEqual(await selection(), [v.lastIndexOf('élise'), v.lastIndexOf('élise') + 5]);
    // L'occurrence courante est surlignée à l'endroit exact du mot dans le texte.
    const where = await page.evaluate(() => {
      const t = document.querySelector('textarea.au-writer-text');
      const m = document.querySelector('.au-writer-hl mark.is-current');
      const tr = t.getBoundingClientRect(); const mr = m.getBoundingClientRect();
      return { text: m.textContent, marks: document.querySelectorAll('.au-writer-hl mark').length, inside: mr.top >= tr.top && mr.bottom <= tr.bottom && mr.left >= tr.left && mr.right <= tr.right + 1, visible: mr.bottom <= window.innerHeight && mr.top >= 0 };
    });
    assert.deepEqual(where, { text: 'élise', marks: 2, inside: true, visible: true });
    await shot('32-recherche');
    await input.press('Escape');
    await page.waitForFunction(() => document.activeElement === document.querySelector('textarea.au-writer-text'));
    assert.deepEqual(await selection(), [v.lastIndexOf('élise'), v.lastIndexOf('élise') + 5], 'la sélection reste sur l\'occurrence');
    await input.waitFor({ state: 'detached' });
  });

  it('ouvre la fiche citée sous le curseur puis retrouve sa sélection et sa position', async () => {
    const v = await value();
    const inLink = v.indexOf('Valcendre') + 3;
    await select(inLink, inLink + 2);
    const before = await selection();
    await page.getByRole('button', { name: 'Fiches citées dans ce chapitre' }).click();
    const card = page.getByRole('dialog');
    await card.getByText('Cité bâtie sur les cendres.').waitFor();
    await card.getByText('la porte du Nord').waitFor();
    await shot('33-fiche-citee');
    await card.getByRole('button', { name: 'Revenir au texte' }).click();
    await page.waitForFunction(() => document.activeElement === document.querySelector('textarea.au-writer-text'));
    assert.deepEqual(await selection(), before, 'sélection retrouvée');
    assert.equal(await value(), v, 'le texte n\'a pas bougé');
  });

  it('une composition coréenne n\'est ni interrompue ni corrigée par l\'éditeur', async () => {
    const end = (await value()).length;
    await select(end, end);
    await page.keyboard.type('\n- ');
    // Composition réelle de « 한 » dans Chromium (jamo après jamo), puis validation.
    const cdp = await phone.newCDPSession(page);
    for (const step of ['ㅎ', '하', '한']) await cdp.send('Input.imeSetComposition', { text: step, selectionStart: step.length, selectionEnd: step.length });
    await cdp.send('Input.insertText', { text: '한' });
    assert.match(await value(), /\n- 한$/, 'la syllabe est entière, une seule fois');

    // Entrée pendant une composition : c'est le clavier qui valide la syllabe —
    // l'éditeur ne doit pas en profiter pour prolonger la liste.
    const prevented = await page.evaluate(() => {
      const t = document.querySelector('textarea.au-writer-text');
      const fire = (isComposing) => {
        const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing });
        t.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      return { composing: fire(true) };
    });
    assert.equal(prevented.composing, false, 'touche laissée au clavier pendant la composition');
    // Hors composition, la même touche prolonge bien la liste.
    await page.keyboard.press('Enter');
    assert.match(await value(), /\n- 한\n- $/);
    await page.keyboard.type('글 테스트');
    await synced();
    assert.match(await stored(), /\n- 한\n- 글 테스트$/);
  });

  it('l\'interligne se règle et les compteurs se masquent', async () => {
    await page.getByRole('button', { name: 'Réglages d\'affichage' }).click();
    const leading = page.getByRole('dialog').locator('input[type=range]').nth(2);
    await leading.fill('2.2');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.au-writer')).getPropertyValue('--w-leading').trim()), '2.2');
    await page.getByLabel(/Afficher les compteurs/).uncheck();
    await page.getByRole('button', { name: 'OK' }).click();
    assert.equal(await page.locator('.au-writer-status').getByText(/mots/).count(), 0);
    await page.locator('.au-writer-save').waitFor();
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('au-writer-prefs'))).counters, false);
  });
});

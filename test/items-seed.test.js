import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Le seed des items est la seule partie du module qui SUPPRIME des lignes : sa
// passe de resynchronisation efface les items encore intacts pour les recréer
// depuis le classeur. Ce qu'on vérifie ici, c'est précisément où elle s'arrête —
// un item créé ou retouché en ligne ne doit jamais disparaître.
//
// Le seed s'exécute dans un sous-processus : `server/db.js` fixe le chemin de la
// base à l'import, il faut donc un processus par base temporaire.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temps = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

function run(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'titisite-seed-'));
  temps.push(dir);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    env: { ...process.env, DB_PATH: path.join(dir, 'data.sqlite'), JWT_SECRET: 'test-secret' },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
}

describe('seed des items — import du classeur', () => {
  it('insère le catalogue et ne le réinsère jamais deux fois', () => {
    const r = run(`
      import { migrate, db } from './server/db.js'; migrate();
      const { seedItemsIfEmpty } = await import('./server/seed-items.js');
      const un = seedItemsIfEmpty();
      const deux = seedItemsIfEmpty();
      const { listItems } = await import('./server/items/store.js');
      const items = listItems();
      console.log(JSON.stringify({
        un, deux, total: items.length,
        statuts: items.reduce((a, i) => ({ ...a, [i.statut]: (a[i.statut] || 0) + 1 }), {}),
        series: [...new Set(items.map((i) => i.serieCode))].sort(),
      }));
    `);
    assert.ok(r.un.items >= 50, `catalogue trop court : ${r.un.items}`);
    assert.equal(r.un.tiers, 10);
    assert.equal(r.un.series, 9);
    assert.deepEqual(r.deux, { tiers: 0, series: 0, panoplies: 0, items: 0, resync: 0 },
      'un second passage ne touche à rien');
    assert.equal(r.total, r.un.items);
    // La couleur de police du classeur devient un statut : les deux valeurs
    // doivent être présentes, sinon la lecture des couleurs a échoué.
    assert.ok(r.statuts.a_tester > 0 && r.statuts.en_jeu > 0, JSON.stringify(r.statuts));
  });

  it('la resynchronisation épargne ce qui a été créé ou retouché en ligne', () => {
    const r = run(`
      import { migrate, db } from './server/db.js'; migrate();
      const { seedItemsIfEmpty } = await import('./server/seed-items.js');
      const { createItem, updateItem, listItems } = await import('./server/items/store.js');
      seedItemsIfEmpty();
      const avant = listItems().length;

      db.prepare("INSERT INTO users (email,name,password_hash,role) VALUES ('a@b.c','A','h','admin')").run();
      const zwei = listItems().find((i) => i.nom === 'Zweihander');
      updateItem(zwei.id, { ...zwei, note: 'retouché' }, 1);
      createItem({ nom: 'Item maison', baseItem: 'iron_sword' }, 1);

      // On remet la base dans l'état « resync pas encore jouée ».
      db.prepare("DELETE FROM site_settings WHERE key = 'mf_items_source_xlsx'").run();
      const rejeu = seedItemsIfEmpty();
      const apres = listItems();
      console.log(JSON.stringify({
        avant, rejeu, apres: apres.length,
        retouche: apres.filter((i) => i.note === 'retouché').length,
        maison: apres.filter((i) => i.nom === 'Item maison').length,
        zweihanders: apres.filter((i) => i.nom === 'Zweihander').length,
      }));
    `);
    assert.ok(r.rejeu.resync > 0, 'la passe a bien effacé les lignes intactes');
    assert.equal(r.retouche, 1, "l'item retouché survit");
    assert.equal(r.maison, 1, "l'item créé en ligne survit");
    // Le classeur porte deux Zweihander (séries 01 et 02) ; celui qui a été
    // retouché tient sa place, l'autre est recréé — jamais un troisième.
    assert.equal(r.zweihanders, 2);
    assert.equal(r.apres, r.avant + 1, 'seul « Item maison » s\'ajoute au total');
  });

  it('ne fait rien du tout avec SEED_ITEMS=off', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'titisite-seed-'));
    temps.push(dir);
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { migrate, db } from './server/db.js'; migrate();
      const { seedItemsIfEmpty } = await import('./server/seed-items.js');
      const r = seedItemsIfEmpty();
      console.log(JSON.stringify({ r, n: db.prepare('SELECT COUNT(*) c FROM mf_items').get().c }));
    `], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, DB_PATH: path.join(dir, 'data.sqlite'), JWT_SECRET: 't', SEED_ITEMS: 'off' },
    });
    const r = JSON.parse(out.trim().split('\n').pop());
    assert.deepEqual(r.r, { skipped: 'disabled' });
    assert.equal(r.n, 0);
  });
});

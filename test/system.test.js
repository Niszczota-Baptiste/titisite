import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

function loggedIn(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return f;
  });
}

describe('système — la route est strictement réservée aux admins', () => {
  it('anonyme → 401', async () => {
    assert.equal((await fetcher(server.base).get('/api/system/stats')).status, 401);
  });

  it('membre connecté → 403 (elle expose nom d\'hôte, noyau et chemins disque)', async () => {
    const member = await loggedIn(MEMBER);
    assert.equal((await member.get('/api/system/stats')).status, 403);
  });
});

describe('système — relevé de la machine', () => {
  it('renvoie disque, mémoire, CPU et l\'occupation du site', async () => {
    const admin = await loggedIn(ADMIN);
    const r = await admin.get('/api/system/stats');
    assert.equal(r.status, 200);
    const s = r.json;

    // Disque : au moins un volume, avec des chiffres cohérents entre eux.
    assert.ok(Array.isArray(s.disks) && s.disks.length >= 1, 'au moins un volume');
    for (const d of s.disks) {
      assert.ok(d.total > 0, 'volume non vide');
      assert.ok(d.used >= 0 && d.available >= 0);
      assert.ok(d.used + d.available <= d.total, 'utilisé + disponible ≤ total');
      assert.ok(d.usedPct >= 0 && d.usedPct <= 100, `pourcentage plausible : ${d.usedPct}`);
      assert.ok(d.labels.length >= 1 && d.paths.length >= 1);
      // Le pourcentage DOIT être celui de `df` : used / (used + available).
      // C'est la seule façon d'afficher le même chiffre que le serveur —
      // used/total donnerait un « il reste de la place » trompeur.
      const dfPct = (d.used / (d.used + d.available)) * 100;
      assert.ok(Math.abs(d.usedPct - dfPct) < 1e-6, `${d.usedPct} ≠ ${dfPct} (convention df)`);
      // `reserved` est ce que le noyau dit libre mais qu'on ne peut pas
      // écrire (réserve root, ou quota) : jamais négatif.
      assert.ok(d.reserved >= 0, `réserve négative : ${d.reserved}`);
    }

    // Mémoire : un total, un disponible qui ne le dépasse pas.
    assert.ok(s.memory.total > 0);
    assert.ok(s.memory.available >= 0 && s.memory.available <= s.memory.total);
    assert.ok(typeof s.memory.source === 'string');

    // CPU : le premier appel échantillonne sur place, il DOIT donc répondre un
    // pourcentage (et pas null, qui afficherait « — » au premier chargement).
    assert.ok(s.cpu.cores >= 1);
    assert.ok(s.cpu.usagePct !== null, 'un pourcentage dès le premier appel');
    assert.ok(s.cpu.usagePct >= 0 && s.cpu.usagePct <= 100, `plausible : ${s.cpu.usagePct}`);
    assert.ok(s.cpu.usageWindowMs > 0, 'la fenêtre de mesure est annoncée');
    assert.equal(s.cpu.loadavg.length, 3);

    // Occupation du site : les postes attendus, et un total qui est leur somme.
    const keys = s.app.items.map((i) => i.key);
    for (const k of ['uploads', 'database', 'dist', 'node_modules']) {
      assert.ok(keys.includes(k), `poste « ${k} » présent`);
    }
    assert.equal(s.app.total, s.app.items.reduce((n, i) => n + i.bytes, 0));
    // La base vient d'être créée par le boot : elle pèse forcément quelque chose.
    assert.ok(s.app.items.find((i) => i.key === 'database').bytes > 0, 'la base a une taille');

    assert.ok(s.process.pid > 0 && s.process.uptimeSec > 0);
    assert.ok(s.host.nodeVersion.startsWith('v'));
  });

  it('le scan disque est mémoïsé, et `rescan` le force', async () => {
    const admin = await loggedIn(ADMIN);
    const first = (await admin.get('/api/system/stats')).json;
    const cached = (await admin.get('/api/system/stats')).json;
    // Deux appels rapprochés partagent le même scan : le dashboard peut
    // rafraîchir toutes les 5 s sans reparcourir le disque à chaque fois.
    assert.equal(cached.app.scannedAt, first.app.scannedAt, 'scan réutilisé');

    const forced = (await admin.get('/api/system/stats?rescan=1')).json;
    assert.ok(forced.app.scannedAt >= first.app.scannedAt, 'rescan → nouveau relevé');
  });

  it('deux relevés successifs donnent un pourcentage CPU sur la fenêtre écoulée', async () => {
    const admin = await loggedIn(ADMIN);
    await admin.get('/api/system/stats');
    await new Promise((r) => { setTimeout(r, 350); });
    const s = (await admin.get('/api/system/stats')).json;
    // La fenêtre est l'intervalle entre les deux appels, pas l'échantillon
    // de 200 ms du premier — c'est ce qui rend la mesure représentative.
    assert.ok(s.cpu.usageWindowMs >= 300, `fenêtre ${s.cpu.usageWindowMs} ms`);
    assert.ok(s.cpu.usagePct >= 0 && s.cpu.usagePct <= 100);
  });
});

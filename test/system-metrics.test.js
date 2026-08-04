import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  cpuPercent, cpuSnapshot, dirSize, diskFromStatfs, fileSize, parseCpuMax,
  parseMeminfo,
} from '../server/system/metrics.js';

// Les mesures machine sont lues sur l'OS. Ce qui peut casser silencieusement,
// c'est le PARSING et l'ARITHMÉTIQUE — un octet pris pour un kilo-octet, ou
// l'espace réservé à root compté comme libre, et la jauge du dashboard ment
// sans jamais lever d'erreur. C'est donc ça qu'on verrouille ici.

describe('parseMeminfo — /proc/meminfo', () => {
  const SAMPLE = [
    'MemTotal:       16316412 kB',
    'MemFree:          243916 kB',
    'MemAvailable:   11982104 kB',
    'Buffers:          712344 kB',
    'Cached:         10233188 kB',
    'SwapTotal:       2097148 kB',
    'SwapFree:        2097148 kB',
    'Dirty:               492 kB',
  ].join('\n');

  it('convertit les kB en octets', () => {
    const m = parseMeminfo(SAMPLE);
    assert.equal(m.total, 16316412 * 1024);
    assert.equal(m.swapTotal, 2097148 * 1024);
  });

  it('MemAvailable prime sur MemFree — c\'est LA valeur honnête', () => {
    const m = parseMeminfo(SAMPLE);
    // MemFree seul dirait « 238 Mo restants » sur une machine qui en a 11 Go
    // de récupérables : c'est le cache disque, libérable à la demande.
    assert.equal(m.available, 11982104 * 1024);
    assert.ok(m.available > m.free * 40, 'l\'écart free/available est bien réel');
    assert.equal(m.availableExact, true);
  });

  it('noyau ancien sans MemAvailable : approximation libre + cache + buffers', () => {
    const old = SAMPLE.split('\n').filter((l) => !l.startsWith('MemAvailable')).join('\n');
    const m = parseMeminfo(old);
    assert.equal(m.available, (243916 + 10233188 + 712344) * 1024);
    assert.equal(m.availableExact, false, 'et c\'est signalé comme approximatif');
  });

  it('entrée illisible → null (l\'appelant retombe sur os.totalmem)', () => {
    assert.equal(parseMeminfo(''), null);
    assert.equal(parseMeminfo('n\'importe quoi'), null);
  });
});

describe('cpuSnapshot / cpuPercent — compteurs cumulés', () => {
  const cpu = (user, idle) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });

  it('agrège tous les cœurs', () => {
    const s = cpuSnapshot([cpu(100, 900), cpu(200, 800)], 1000);
    assert.equal(s.cores, 2);
    assert.equal(s.idle, 1700);
    assert.equal(s.total, 2000);
  });

  it('le pourcentage naît de l\'ÉCART, pas d\'un relevé seul', () => {
    const a = cpuSnapshot([cpu(100, 900)], 0);
    // +100 de travail, +300 d'idle → 400 de plus, occupé à 25 %.
    const b = cpuSnapshot([cpu(200, 1200)], 1000);
    assert.equal(cpuPercent(a, b), 25);
  });

  it('0 % et 100 % sont atteignables', () => {
    assert.equal(cpuPercent(cpuSnapshot([cpu(0, 0)]), cpuSnapshot([cpu(0, 1000)])), 0);
    assert.equal(cpuPercent(cpuSnapshot([cpu(0, 0)]), cpuSnapshot([cpu(1000, 0)])), 100);
  });

  it('intervalle vide ou compteurs incohérents → null, jamais NaN', () => {
    const s = cpuSnapshot([cpu(100, 900)]);
    assert.equal(cpuPercent(s, s), null, 'aucun temps écoulé');
    assert.equal(cpuPercent(null, s), null);
    // Compteurs qui reculent (redémarrage, migration de VM) : on préfère « je
    // ne sais pas » à un pourcentage absurde.
    assert.equal(cpuPercent(cpuSnapshot([cpu(500, 500)]), cpuSnapshot([cpu(100, 100)])), null);
  });
});

describe('diskFromStatfs — la convention df, pas une improvisation', () => {
  // 10 Gio au total, 2 Gio libres pour root, 1,5 Gio réellement écrivables :
  // les 512 Mio d'écart sont la réserve root d'ext4.
  const ST = { bsize: 4096, blocks: 2621440, bfree: 524288, bavail: 393216 };

  it('utilisé = total - bfree, disponible = bavail', () => {
    const d = diskFromStatfs(ST);
    assert.equal(d.total, 10 * 1024 ** 3);
    assert.equal(d.used, 8 * 1024 ** 3);
    assert.equal(d.available, 1.5 * 1024 ** 3);
    assert.equal(d.reserved, 0.5 * 1024 ** 3);
  });

  it('le pourcentage se calcule sur used + avail, comme df', () => {
    const d = diskFromStatfs(ST);
    // 8 / 9,5 = 84,2 % — et NON 8 / 10 = 80 %. Afficher 80 % ferait croire
    // qu'il reste 2 Gio alors que le disque sature à 1,5.
    assert.ok(Math.abs(d.usedPct - (8 / 9.5) * 100) < 1e-9, `obtenu ${d.usedPct}`);
    assert.ok(d.usedPct > 84 && d.usedPct < 85);
  });

  it('système de fichiers vide → 0 %, pas une division par zéro', () => {
    assert.equal(diskFromStatfs({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }).usedPct, 0);
  });

  it('gère les BigInt renvoyés par fs.statfs sur certains volumes', () => {
    const big = { bsize: 4096n, blocks: 2621440n, bfree: 524288n, bavail: 393216n };
    assert.deepEqual(diskFromStatfs(big), diskFromStatfs(ST));
  });
});

describe('parseCpuMax — quota cgroup en cœurs équivalents', () => {
  it('« quota période » → fraction de cœur', () => {
    assert.equal(parseCpuMax('200000 100000'), 2);
    assert.equal(parseCpuMax('50000 100000'), 0.5);
    assert.equal(parseCpuMax('150000'), 1.5); // période implicite 100000
  });
  it('« max » ou vide = pas de limite', () => {
    assert.equal(parseCpuMax('max 100000'), null);
    assert.equal(parseCpuMax(null), null);
    assert.equal(parseCpuMax(''), null);
  });
});

describe('dirSize / fileSize — parcours disque', () => {
  it('additionne récursivement et compte les fichiers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmetrics-'));
    fs.writeFileSync(path.join(root, 'a.bin'), Buffer.alloc(1000));
    fs.mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'sub', 'b.bin'), Buffer.alloc(2000));
    fs.writeFileSync(path.join(root, 'sub', 'deep', 'c.bin'), Buffer.alloc(300));

    const r = await dirSize(root);
    assert.equal(r.bytes, 3300);
    assert.equal(r.files, 3);
    assert.equal(r.truncated, false);

    // Un lien symbolique n'est PAS suivi : un lien vers / ferait scanner le
    // disque entier, ou boucler.
    fs.symlinkSync(root, path.join(root, 'boucle'));
    const withLink = await dirSize(root);
    assert.deepEqual(withLink, r, 'le lien n\'ajoute rien et ne boucle pas');

    assert.equal(await fileSize(path.join(root, 'a.bin')), 1000);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('dossier ou fichier absent → 0, pas une exception', async () => {
    assert.deepEqual(await dirSize('/nexiste/pas/du/tout'), { bytes: 0, files: 0, truncated: false });
    assert.equal(await fileSize('/nexiste/pas/du/tout.sqlite-wal'), 0);
  });

  it('garde-fou : au-delà de maxFiles la descente s\'arrête, et c\'est DIT', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmetrics-'));
    for (let i = 0; i < 20; i += 1) fs.writeFileSync(path.join(root, `f${i}.bin`), Buffer.alloc(10));
    fs.mkdirSync(path.join(root, 'enorme'));
    for (let i = 0; i < 10; i += 1) fs.writeFileSync(path.join(root, 'enorme', `g${i}.bin`), Buffer.alloc(1000));

    const capped = await dirSize(root, { maxFiles: 5 });
    // Le plafond borne le TRAVAIL, il ne coupe pas au fichier près : le lot en
    // cours se termine, puis la descente s'arrête. Ce qui compte, c'est que le
    // sous-dossier ne soit jamais parcouru et que le total soit marqué
    // incomplet — un chiffre partiel annoncé comme tel vaut mieux qu'un total
    // faux présenté comme exact.
    assert.equal(capped.truncated, true);
    assert.equal(capped.bytes, 200, 'le sous-dossier n\'a pas été parcouru');

    const full = await dirSize(root);
    assert.equal(full.truncated, false, 'sans plafond, scan complet');
    assert.equal(full.files, 30);
    assert.equal(full.bytes, 200 + 10_000);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('respecte la profondeur maximale', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmetrics-'));
    fs.mkdirSync(path.join(root, 'a', 'b', 'c'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'c', 'loin.bin'), Buffer.alloc(500));
    assert.equal((await dirSize(root, { maxDepth: 1 })).bytes, 0);
    assert.equal((await dirSize(root, { maxDepth: 5 })).bytes, 500);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

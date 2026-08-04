import { Router } from 'express';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireRole } from '../auth.js';
import { DB_PATH } from '../db.js';
import {
  cpuPercent, cpuSnapshot, dirSize, diskFromStatfs, fileSize, memoryStats,
  readCgroupCpu,
} from '../system/metrics.js';
import { UPLOADS_DIR } from '../uploads.js';

// « 🖥 Serveur » du dashboard : état de la machine qui héberge le site.
//
// Tout est lu localement par le process Node — pas d'API d'hébergeur, pas
// d'agent : le serveur EST la machine mesurée. Réservé au rôle admin : ça
// expose le nom d'hôte, le noyau et les chemins sur disque.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

export const systemRouter = Router();
systemRouter.use(requireAuth, requireRole('admin'));

// Relevé CPU précédent, gardé entre deux requêtes : os.cpus() ne donne que des
// compteurs cumulés, le pourcentage naît de l'écart. Avec le rafraîchissement
// auto du dashboard, la fenêtre est donc l'intervalle entre deux affichages —
// c'est exactement ce qu'on veut lire.
let lastCpu = null;

async function cpuStats() {
  const now = cpuSnapshot(os.cpus());
  let pct = cpuPercent(lastCpu, now);
  let windowMs = lastCpu ? now.at - lastCpu.at : 0;
  // Premier appel (ou relevé trop vieux pour être représentatif) : on
  // échantillonne sur place. 200 ms sur une route admin, c'est indolore.
  if (pct === null || windowMs > 5 * 60_000) {
    const base = now;
    await new Promise((r) => { setTimeout(r, 200); });
    const after = cpuSnapshot(os.cpus());
    pct = cpuPercent(base, after);
    windowMs = after.at - base.at;
    lastCpu = after;
  } else {
    lastCpu = now;
  }
  const cpus = os.cpus();
  const load = os.loadavg();
  const quota = await readCgroupCpu();
  return {
    cores: now.cores,
    model: cpus[0]?.model?.trim() || null,
    speedMhz: cpus[0]?.speed || null,
    usagePct: pct,
    usageWindowMs: windowMs,
    // La charge est un nombre de processus, pas un % : rapportée au nombre de
    // cœurs, 1.0 = machine pile saturée. C'est ça qu'il faut regarder.
    loadavg: load,
    loadPerCore: now.cores > 0 ? load.map((l) => l / now.cores) : null,
    quotaCores: quota,
  };
}

// Un point de montage par chemin qui compte, dédoublonné : sur un VPS
// classique tout est sur /, et afficher trois fois la même jauge n'aiderait
// personne. Deux chemins sur le même système de fichiers ont la même
// signature (taille de bloc × nombre de blocs).
async function diskStats() {
  const targets = [
    { label: 'Fichiers envoyés', dir: UPLOADS_DIR },
    { label: 'Base de données', dir: path.dirname(DB_PATH) },
    { label: 'Application', dir: ROOT },
  ];
  const seen = new Map();
  for (const t of targets) {
    let st;
    // statfs échoue sur les plateformes qui ne l'exposent pas (ou un chemin
    // démonté) : on saute le volume plutôt que de casser tout le relevé.
    try { st = await fsp.statfs(t.dir); } catch { continue; }
    const key = `${st.bsize}:${st.blocks}`;
    const existing = seen.get(key);
    // Même volume : on l'affiche une fois, en listant tout ce qu'il porte.
    if (existing) { existing.labels.push(t.label); existing.paths.push(t.dir); continue; }
    seen.set(key, { ...diskFromStatfs(st), labels: [t.label], paths: [t.dir] });
  }
  return [...seen.values()];
}

// Ce que le site occupe lui-même, poste par poste : c'est la réponse à « mon
// disque se remplit, qu'est-ce qui le mange ». Le parcours récursif coûte des
// I/O (node_modules seul, c'est ~18 000 fichiers), donc il est mémoïsé
// LARGEMENT : le rafraîchissement auto du dashboard interroge les jauges
// live — disque, RAM, CPU — sans remettre le disque à contribution. Le bouton
// « Rescanner » force la mesure quand on veut vraiment la revoir.
const SCAN_TTL_MS = 5 * 60_000;
let scanCache = null;
// Un scan en cours est partagé : deux onglets ouverts ne doivent pas lancer
// deux parcours concurrents du même disque.
let scanInFlight = null;

async function appUsage({ force = false } = {}) {
  if (!force && scanCache && Date.now() - scanCache.scannedAt < SCAN_TTL_MS) return scanCache;
  if (scanInFlight) return scanInFlight;
  scanInFlight = scanNow().finally(() => { scanInFlight = null; });
  return scanInFlight;
}

async function scanNow() {
  // Détail des sous-dossiers d'uploads (le staging WorldEdit peut peser lourd).
  let children = [];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- UPLOADS_DIR vient de la config serveur
    const entries = await fsp.readdir(UPLOADS_DIR, { withFileTypes: true });
    children = await Promise.all(entries
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map(async (e) => ({ name: e.name, ...(await dirSize(path.join(UPLOADS_DIR, e.name))) })));
    children.sort((a, b) => b.bytes - a.bytes);
  } catch { children = []; }

  const [uploads, dist, modules, sqlite, wal, shm] = await Promise.all([
    dirSize(UPLOADS_DIR),
    dirSize(path.join(ROOT, 'dist')),
    dirSize(path.join(ROOT, 'node_modules')),
    fileSize(DB_PATH),
    fileSize(`${DB_PATH}-wal`),
    fileSize(`${DB_PATH}-shm`),
  ]);

  const items = [
    { key: 'uploads', label: 'Fichiers envoyés', bytes: uploads.bytes, files: uploads.files, truncated: uploads.truncated, children },
    { key: 'database', label: 'Base de données', bytes: sqlite + wal + shm, files: 3, detail: { sqlite, wal, shm } },
    { key: 'dist', label: 'Site compilé (dist)', bytes: dist.bytes, files: dist.files, truncated: dist.truncated },
    { key: 'node_modules', label: 'Dépendances (node_modules)', bytes: modules.bytes, files: modules.files, truncated: modules.truncated },
  ];
  scanCache = {
    items,
    total: items.reduce((n, i) => n + i.bytes, 0),
    scannedAt: Date.now(),
    ttlMs: SCAN_TTL_MS,
  };
  return scanCache;
}

systemRouter.get('/stats', async (req, res) => {
  const [cpu, memory, disks, app] = await Promise.all([
    cpuStats(),
    memoryStats(),
    diskStats(),
    appUsage({ force: req.query.rescan === '1' }),
  ]);
  const mem = process.memoryUsage();
  res.json({
    host: {
      hostname: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      nodeVersion: process.version,
      uptimeSec: os.uptime(),
      env: process.env.NODE_ENV || 'development',
    },
    cpu,
    memory,
    disks,
    app,
    process: {
      pid: process.pid,
      uptimeSec: process.uptime(),
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
    at: Date.now(),
  });
});

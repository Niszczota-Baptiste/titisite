// Mesures de la machine — tout vient du système d'exploitation, RIEN d'un
// fournisseur : le process Node tourne SUR le VPS, il lit donc son propre
// disque, sa RAM et son CPU. Aucune clé d'API, aucun agent à installer, et ça
// marche à l'identique chez n'importe quel hébergeur.
//
// Les fonctions de parsing/calcul sont pures et testées
// (`test/system-metrics.test.js`) ; les fonctions d'I/O au-dessus se
// contentent de lire des fichiers et de dégrader proprement quand ils
// n'existent pas (macOS, BSD, conteneur restreint…).

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ── /proc/meminfo ───────────────────────────────────────────────────────────
// Format : « MemTotal:       16316412 kB ». L'unité est TOUJOURS le kB (kiB en
// réalité) quand elle est présente, sinon la valeur est déjà en octets.
//
// `MemAvailable` est la seule valeur honnête pour « il me reste combien » :
// `MemFree` ignore le cache disque, récupérable à tout moment, et sous-estime
// donc massivement la mémoire disponible (un serveur sain a peu de MemFree).
export function parseMeminfo(text) {
  // Prototype nul : les clés viennent d'un fichier, autant qu'un `__proto__`
  // exotique ne puisse rien polluer.
  const out = Object.create(null);
  for (const line of String(text).split('\n')) {
    // Découpage à la main plutôt qu'une regex à quantificateurs imbriqués :
    // le parcours est trivialement linéaire, sans risque de retour arrière.
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon);
    const [num, unit] = line.slice(colon + 1).trim().split(' ');
    if (!/^\d+$/.test(num)) continue;
    out[key] = Number(num) * (unit?.toLowerCase() === 'kb' ? 1024 : 1);
  }
  if (out.MemTotal === undefined) return null;
  return {
    total: out.MemTotal,
    free: out.MemFree ?? null,
    // Noyaux < 3.14 : pas de MemAvailable. L'approximation libre + cache +
    // buffers est plus juste que MemFree seul.
    available: out.MemAvailable ?? ((out.MemFree ?? 0) + (out.Cached ?? 0) + (out.Buffers ?? 0)),
    availableExact: out.MemAvailable !== undefined,
    cached: out.Cached ?? null,
    buffers: out.Buffers ?? null,
    swapTotal: out.SwapTotal ?? null,
    swapFree: out.SwapFree ?? null,
  };
}

// ── CPU ─────────────────────────────────────────────────────────────────────
// os.cpus() donne des compteurs CUMULÉS depuis le boot : une valeur seule ne
// dit rien, c'est l'écart entre deux relevés qui donne un pourcentage.
export function cpuSnapshot(cpus, at = Date.now()) {
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    idle += c.times.idle;
    for (const v of Object.values(c.times)) total += v;
  }
  return { idle, total, cores: cpus.length, at };
}

// Occupation moyenne (%) entre deux relevés. null quand l'intervalle est vide
// ou que les compteurs ont reculé (rare, mais un NaN silencieux serait pire).
export function cpuPercent(prev, curr) {
  if (!prev || !curr) return null;
  const dTotal = curr.total - prev.total;
  const dIdle = curr.idle - prev.idle;
  if (!(dTotal > 0) || dIdle < 0 || dIdle > dTotal) return null;
  return ((dTotal - dIdle) / dTotal) * 100;
}

// ── Disque ──────────────────────────────────────────────────────────────────
// Convention `df`, à ne pas improviser : `bfree` compte les blocs libres au
// sens du noyau, mais ~5 % d'un ext4 sont RÉSERVÉS à root — un utilisateur
// normal ne peut écrire que `bavail`. On rapporte donc l'espace utilisable
// (bavail) et on calcule le pourcentage sur used + avail, exactement comme df,
// sinon les chiffres affichés ne correspondraient pas à ceux du serveur.
export function diskFromStatfs(st) {
  const bsize = Number(st.bsize);
  const total = Number(st.blocks) * bsize;
  const free = Number(st.bfree) * bsize;
  const available = Number(st.bavail) * bsize;
  const used = total - free;
  const usable = used + available;
  return {
    total,
    used,
    available,
    reserved: free - available, // la part réservée à root, ni libre ni utilisée
    usedPct: usable > 0 ? (used / usable) * 100 : 0,
  };
}

// ── Limites de conteneur (cgroup v2 puis v1) ────────────────────────────────
// Sur un VPS classique il n'y en a pas. Mais si le site tourne dans Docker/LXC,
// os.totalmem() rapporte la RAM de l'HÔTE, pas la part allouée : afficher ça
// serait mentir. On lit donc la limite du cgroup quand elle existe et qu'elle
// est plus basse que la RAM vue par l'OS.
const CGROUP = {
  v2: { limit: '/sys/fs/cgroup/memory.max', usage: '/sys/fs/cgroup/memory.current', cpu: '/sys/fs/cgroup/cpu.max' },
  v1: {
    limit: '/sys/fs/cgroup/memory/memory.limit_in_bytes',
    usage: '/sys/fs/cgroup/memory/memory.usage_in_bytes',
    quota: '/sys/fs/cgroup/cpu/cpu.cfs_quota_us',
    period: '/sys/fs/cgroup/cpu/cpu.cfs_period_us',
  },
};

const readMaybe = async (p) => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- chemins constants du noyau, pas d'entrée utilisateur
    return (await fs.readFile(p, 'utf8')).trim();
  } catch { return null; }
};

// « max » (v2) et les valeurs astronomiques (v1) signifient « pas de limite ».
const NO_LIMIT = 2 ** 53;
function asLimit(raw) {
  if (raw === null || raw === 'max') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < NO_LIMIT ? n : null;
}

export async function readCgroupMemory() {
  const [v2Limit, v2Usage] = await Promise.all([readMaybe(CGROUP.v2.limit), readMaybe(CGROUP.v2.usage)]);
  const limit2 = asLimit(v2Limit);
  if (limit2) return { limit: limit2, used: Number(v2Usage) || null, version: 2 };
  const [v1Limit, v1Usage] = await Promise.all([readMaybe(CGROUP.v1.limit), readMaybe(CGROUP.v1.usage)]);
  const limit1 = asLimit(v1Limit);
  if (limit1) return { limit: limit1, used: Number(v1Usage) || null, version: 1 };
  return null;
}

// Quota CPU du cgroup en « cœurs équivalents » : cpu.max = « quota période ».
export function parseCpuMax(raw) {
  if (!raw) return null;
  const [quota, period] = raw.trim().split(/\s+/);
  if (quota === 'max') return null;
  const q = Number(quota);
  const p = Number(period) || 100000;
  return Number.isFinite(q) && q > 0 && p > 0 ? q / p : null;
}

export async function readCgroupCpu() {
  const v2 = parseCpuMax(await readMaybe(CGROUP.v2.cpu));
  if (v2) return v2;
  const [q, p] = await Promise.all([readMaybe(CGROUP.v1.quota), readMaybe(CGROUP.v1.period)]);
  const qn = Number(q);
  const pn = Number(p) || 100000;
  return Number.isFinite(qn) && qn > 0 ? qn / pn : null;
}

// ── Taille d'un dossier ─────────────────────────────────────────────────────
// Parcours récursif SANS suivre les liens symboliques (un lien vers / ferait
// boucler le scan, ou compterait le disque entier). On additionne la taille
// logique des fichiers ; les erreurs de permission sont ignorées plutôt que de
// faire échouer toute la mesure.
//
// `maxFiles` est un garde-fou, pas une optimisation : sur un VPS modeste, un
// dossier pathologique (des centaines de milliers de fichiers) mettrait le
// disque à genoux pour afficher une jauge. On s'arrête et on le DIT
// (`truncated`) plutôt que d'annoncer un total faux. Le plafond borne le
// TRAVAIL, pas le compte exact : le lot en cours se termine (jusqu'à
// STAT_BATCH fichiers de dépassement), puis la descente s'arrête.
const STAT_BATCH = 64;

export async function dirSize(dir, { maxDepth = 12, maxFiles = 400_000 } = {}) {
  let bytes = 0;
  let files = 0;
  let truncated = false;

  const sizeOf = async (full) => {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- chemins dérivés de la config serveur, pas d'entrée utilisateur
      return (await fs.lstat(full)).size;
    } catch { return null; } // disparu entre readdir et lstat : on l'ignore
  };

  const walk = async (d, depth) => {
    if (depth > maxDepth || truncated) return;
    let entries;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- idem
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch { return; }

    // Les lstat par lots : sur un dossier de 17 000 fichiers, les faire un par
    // un sérialise autant d'allers-retours disque.
    const batch = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const sizes = await Promise.all(batch.splice(0).map(sizeOf));
      for (const s of sizes) {
        if (s === null) continue;
        bytes += s;
        files += 1;
      }
      if (files >= maxFiles) truncated = true;
    };

    const dirs = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { dirs.push(full); continue; }
      if (!e.isFile()) continue;
      batch.push(full);
      if (batch.length >= STAT_BATCH) {
        await flush();
        if (truncated) return;
      }
    }
    await flush();
    for (const sub of dirs) {
      if (truncated) return;
      await walk(sub, depth + 1);
    }
  };

  await walk(dir, 0);
  return { bytes, files, truncated };
}

// Taille d'un fichier seul (0 s'il n'existe pas — un -wal absent est normal).
export async function fileSize(p) {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- chemins dérivés de la config serveur
    return (await fs.stat(p)).size;
  } catch { return 0; }
}

// ── Mémoire de la machine ───────────────────────────────────────────────────
// Linux : /proc/meminfo (MemAvailable). Ailleurs : os.freemem(), moins juste
// mais c'est tout ce qu'il y a. Si un cgroup impose une limite plus basse,
// c'est ELLE qui fait foi — sinon on afficherait la RAM de l'hôte.
export async function memoryStats() {
  const proc = parseMeminfo(await readMaybe('/proc/meminfo') ?? '');
  const base = proc ?? {
    total: os.totalmem(),
    free: os.freemem(),
    available: os.freemem(),
    availableExact: false,
    cached: null,
    buffers: null,
    swapTotal: null,
    swapFree: null,
  };
  const cgroup = await readCgroupMemory();
  if (cgroup && cgroup.limit < base.total) {
    return {
      ...base,
      total: cgroup.limit,
      used: cgroup.used ?? null,
      available: cgroup.used != null ? cgroup.limit - cgroup.used : base.available,
      source: `cgroup v${cgroup.version}`,
      limited: true,
    };
  }
  return { ...base, used: base.total - base.available, source: proc ? '/proc/meminfo' : 'os', limited: false };
}

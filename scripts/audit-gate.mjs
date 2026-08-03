#!/usr/bin/env node
// Porte de sécurité sur `npm audit` pour la CI.
//
// `npm audit --audit-level=high` échoue dès qu'une CVE haute/critique existe,
// sans distinguer « exploitable ici » de « code jamais atteint ». Quand le seul
// correctif proposé est une RÉGRESSION (npm audit fix --force propose parfois
// un downgrade), le choix se réduit à : casser l'appli, ou désarmer la porte
// pour tout le monde. Aucun des deux n'est acceptable.
//
// Ce script garde la porte armée sur TOUT, sauf sur des avis explicitement
// listés ci-dessous, chacun avec sa justification et sa date de revue. Une
// entrée périmée refait échouer le build : l'exemption est un délai, pas un
// oubli.
//
// Usage : node scripts/audit-gate.mjs [--level=high]

import { execFileSync } from 'node:child_process';

// ── Exemptions ──────────────────────────────────────────────────────────────
// `id`      : identifiant GHSA de l'avis.
// `reason`  : pourquoi le code vulnérable n'est pas atteignable ICI.
// `review`  : date (UTC) après laquelle l'exemption expire et la CI re-échoue.
const ALLOWLIST = [
  {
    id: 'GHSA-qwww-vcr4-c8h2',
    packages: ['react-router', 'react-router-dom'],
    reason:
      "Contournement CSRF du « RSC Mode » de React Router : la faille est dans le "
      + "traitement serveur des server actions (@react-router/rsc). Cette appli est une "
      + "SPA 100 % client — <BrowserRouter> + <Routes> déclaratifs, aucun data router, "
      + "aucun loader/action, aucun paquet @react-router/* installé, aucun rendu serveur. "
      + "Le code vulnérable n'est jamais chargé. Le seul correctif proposé par npm est un "
      + "downgrade en 7.11.0 (régression) ; la ligne réellement corrigée est la v8, où "
      + "react-router-dom a fusionné dans react-router — une migration majeure sans "
      + "rapport avec le risque réel.",
    review: '2026-11-01',
  },
];

const levelArg = process.argv.find((a) => a.startsWith('--level='));
const LEVEL = levelArg ? levelArg.split('=')[1] : 'high';
const BLOCKING = LEVEL === 'critical' ? ['critical'] : ['high', 'critical'];

function runAudit() {
  let raw;
  try {
    // `npm audit` sort en code ≠ 0 dès qu'il trouve quelque chose : la sortie
    // JSON reste sur stdout, on la récupère depuis l'erreur.
    raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8' });
  } catch (err) {
    if (!err.stdout) fail(`npm audit n'a produit aucune sortie : ${err.message}`);
    raw = err.stdout;
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    fail('sortie de npm audit illisible (JSON invalide).');
  }

  // Une porte de sécurité qui s'ouvre quand l'outil tombe en panne ne protège
  // rien : pas de lockfile, réseau coupé, registre en erreur → npm renvoie un
  // JSON d'erreur SANS clé `vulnerabilities`, que le filtre trouverait vide.
  // On exige donc la preuve positive que l'audit a bien tourné.
  if (report.error) {
    fail(`npm audit a échoué : ${report.error.summary || report.error.code || 'erreur inconnue'}`);
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    fail("rapport npm audit inattendu (pas de clé « vulnerabilities ») — audit non concluant.");
  }
  return report;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

// Un avis peut apparaître via plusieurs paquets ; on aplatit en (paquet, avis).
function collectFindings(report) {
  const out = [];
  for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
    if (!BLOCKING.includes(v.severity)) continue;
    for (const via of v.via || []) {
      if (typeof via !== 'object' || !via.url) continue;
      const id = via.url.split('/').pop();
      out.push({ package: name, id, title: via.title, severity: via.severity });
    }
  }
  return out;
}

const today = new Date().toISOString().slice(0, 10);
const expired = ALLOWLIST.filter((e) => e.review < today);

const findings = collectFindings(runAudit());
const exempt = [];
const blocking = [];

for (const f of findings) {
  const entry = ALLOWLIST.find(
    (e) => e.id === f.id && e.review >= today && e.packages.includes(f.package),
  );
  if (entry) exempt.push({ ...f, entry });
  else blocking.push(f);
}

for (const e of exempt) {
  console.log(`⚠️  toléré  ${e.severity.padEnd(8)} ${e.package} — ${e.id} (revue ${e.entry.review})`);
}
for (const e of expired) {
  console.error(`❌ exemption expirée : ${e.id} (revue prévue le ${e.review}) — réévaluer ou repousser la date.`);
}
for (const f of blocking) {
  console.error(`❌ bloquant ${f.severity.padEnd(8)} ${f.package} — ${f.id} : ${f.title}`);
}

if (blocking.length || expired.length) {
  console.error(
    `\n${blocking.length} vulnérabilité(s) bloquante(s), ${expired.length} exemption(s) expirée(s).`,
  );
  process.exit(1);
}

console.log(`\n✅ aucune vulnérabilité ${BLOCKING.join('/')} non tolérée (${exempt.length} exemption(s) documentée(s)).`);

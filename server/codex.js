// Lecture serveur du codex d'items (référentiel client public/codex + vanilla).
// Sert à résoudre un ref_code (id de codex, stocké sans FK dans les lignes de
// quêtes) vers son nom français — pour rapprocher les entrées de quêtes des
// noms saisis dans l'inventaire Minecraft (minecraft_resources.name).
// Chargé paresseusement une seule fois ; si un fichier manque, on dégrade
// silencieusement (le rapprochement retombe sur le label seul).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const CODEX_FILES = [
  path.join(ROOT, 'public', 'codex', 'codex.json'),
  path.join(ROOT, 'src', 'data', 'codex_vanilla.json'),
];

let byId = null;
let byCategory = null;

function load() {
  byId = new Map();
  byCategory = new Map();
  for (const file of CODEX_FILES) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- CODEX_FILES est une liste codée en dur relative au repo
      const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        if (e?.id && e?.nomFr && !byId.has(e.id)) byId.set(e.id, e.nomFr);
        // Seules les entrées Minefield portent une catégorie ; le vanilla n'en
        // a pas (d'où la table éditable de l'atelier « Salle des coffres »).
        if (e?.id && e?.categorie) {
          if (!byCategory.has(e.categorie)) byCategory.set(e.categorie, []);
          byCategory.get(e.categorie).push(e.id);
        }
      }
    } catch { /* codex absent/corrompu : dégrade sur le label */ }
  }
}

export function codexNameById(id) {
  if (!id) return null;
  if (!byId) load();
  return byId.get(String(id)) || null;
}

/** Map<catégorie du codex, ids d'items>. Vide si le codex est absent. */
export function codexIdsByCategory() {
  if (!byCategory) load();
  return byCategory;
}

// Normalisation de nom partagée avec le module Minecraft (accents, casse).
export const normName = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim();

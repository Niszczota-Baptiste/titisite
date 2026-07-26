// Amorçage des catégories de rangement de l'atelier « Salle des coffres ».
//
// Les 9 catégories du codex Minefield servent de point de départ ; chacune est
// pré-remplie avec les ids d'items du codex qui la portent, pour que le panneau
// items soit utile dès le premier plan. Ce ne sont que des étiquettes : aucune
// quantité n'est associée, et tout est renommable/supprimable depuis l'atelier.
//
// Les entrées vanilla n'ont pas de catégorie dans le codex — elles se
// rattachent à la main, ce qui est précisément la raison d'être de cette table
// éditable plutôt que d'une lecture directe du codex.

import { codexIdsByCategory } from '../codex.js';
import { db } from '../db.js';

const CATEGORIES = [
  { name: 'Redstone',     color: '#d94b4b' },
  { name: 'Construction', color: '#e8a87c' },
  { name: 'Matériaux',    color: '#9ad4ae' },
  { name: 'Outils',       color: '#7bd3e8' },
  { name: 'Combat',       color: '#e0526f' },
  { name: 'Alchimie',     color: '#b779e0' },
  { name: 'Nourriture',   color: '#e8c86a' },
  { name: 'Décoration',   color: '#e88cb8' },
  { name: 'Divers',       color: '#94a3b8' },
];

export function seedVaultCategoriesIfEmpty() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM vault_categories').get().n;
  if (existing > 0) return { skipped: true, existing };

  const byCategory = codexIdsByCategory();
  const stmt = db.prepare(`
    INSERT INTO vault_categories (name, color, item_ids, sort_order) VALUES (?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    CATEGORIES.forEach((c, idx) => {
      stmt.run(c.name, c.color, JSON.stringify(byCategory.get(c.name) || []), idx);
    });
  });
  tx();
  return { inserted: CATEGORIES.length };
}

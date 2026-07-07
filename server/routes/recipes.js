import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';

// Recettes custom Minefield (globales). Lecture pour tout utilisateur connecté
// (le calculateur de craft des projets en a besoin) ; écriture admin only.
export const recipesRouter = Router();

const TYPES = new Set(['crafting', 'smelting', 'brewing']);

function rowToRecipe(r) {
  if (!r) return null;
  let ingredients = [];
  try { ingredients = JSON.parse(r.ingredients) || []; } catch { ingredients = []; }
  let grid = [];
  try { grid = JSON.parse(r.grid) || []; } catch { grid = []; }
  return {
    id: r.id,
    resultId: r.result_id,
    resultCount: r.result_count,
    type: r.type,
    ingredients,
    grid,
    station: r.station || '',
    note: r.note || '',
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Grille 3×3 → tableau normalisé de 9 cases ('' = vide). Renvoie [] si vide.
function cleanGrid(input) {
  if (!Array.isArray(input)) return [];
  const cells = Array.from({ length: 9 }, (_, i) => String(input[i] || '').trim());
  return cells.some((c) => c) ? cells : [];
}

// Ingrédients agrégés depuis une grille (1 item consommé par case remplie).
function ingredientsFromGrid(grid) {
  const m = new Map();
  for (const c of grid) if (c) m.set(c, (m.get(c) || 0) + 1);
  return [...m.entries()].map(([item, count]) => ({ item, count }));
}

// Normalise/valide les ingrédients : [{ item:<id codex>, count:int>=1 }].
function cleanIngredients(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((it) => ({
      item: String(it?.item || '').trim(),
      count: Math.max(1, Math.floor(Number(it?.count) || 1)),
    }))
    .filter((it) => it.item);
}

function listRecipes() {
  return db.prepare('SELECT * FROM custom_recipes ORDER BY position, id').all().map(rowToRecipe);
}

recipesRouter.get('/', requireAuth, (_req, res) => {
  res.json(listRecipes());
});

recipesRouter.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { resultId, resultCount, type, ingredients, note } = req.body || {};
  if (!resultId || !String(resultId).trim()) return res.status(400).json({ error: 'missing_result' });
  // Grille prioritaire : si fournie, les ingrédients en sont dérivés.
  const grid = cleanGrid(req.body?.grid);
  const ing = grid.length ? ingredientsFromGrid(grid) : cleanIngredients(ingredients);
  if (ing.length === 0) return res.status(400).json({ error: 'missing_ingredients' });
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM custom_recipes').get().n;
  const result = db.prepare(`
    INSERT INTO custom_recipes (result_id, result_count, type, ingredients, grid, station, note, position, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(resultId).trim(),
    Math.max(1, Math.floor(Number(resultCount) || 1)),
    TYPES.has(type) ? type : 'crafting',
    JSON.stringify(ing),
    JSON.stringify(grid),
    String(req.body?.station || '').trim(),
    String(note || '').trim(),
    pos,
    req.user.id,
  );
  res.status(201).json(rowToRecipe(db.prepare('SELECT * FROM custom_recipes WHERE id = ?').get(result.lastInsertRowid)));
});

recipesRouter.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM custom_recipes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const body = req.body || {};
  const grid = 'grid' in body ? cleanGrid(body.grid) : (JSON.parse(existing.grid || '[]') || []);
  let ing;
  if (grid.length) ing = ingredientsFromGrid(grid);
  else if ('ingredients' in body) ing = cleanIngredients(body.ingredients);
  else ing = JSON.parse(existing.ingredients);
  if (ing.length === 0) return res.status(400).json({ error: 'missing_ingredients' });
  db.prepare(`
    UPDATE custom_recipes SET
      result_id    = COALESCE(?, result_id),
      result_count = ?,
      type         = ?,
      ingredients  = ?,
      grid         = ?,
      station      = ?,
      note         = COALESCE(?, note),
      updated_at   = strftime('%s','now')
    WHERE id = ?
  `).run(
    body.resultId === undefined ? null : String(body.resultId).trim(),
    body.resultCount === undefined ? existing.result_count : Math.max(1, Math.floor(Number(body.resultCount) || 1)),
    TYPES.has(body.type) ? body.type : existing.type,
    JSON.stringify(ing),
    JSON.stringify(grid),
    body.station === undefined ? existing.station : String(body.station).trim(),
    body.note === undefined ? null : String(body.note).trim(),
    id,
  );
  res.json(rowToRecipe(db.prepare('SELECT * FROM custom_recipes WHERE id = ?').get(id)));
});

recipesRouter.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const r = db.prepare('DELETE FROM custom_recipes WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

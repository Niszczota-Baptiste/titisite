// Atelier « Salle des coffres » — API des plans de rangement.
//
// Module global (pas de workspace) : un plan appartient à son créateur et peut
// être partagé avec d'autres comptes, qui l'éditent alors complètement. Le flag
// `users.can_view_vault` ouvre la section (les admins passent outre) ; la
// propriété du plan décide ensuite de ce que chacun voit — un admin ne voit pas
// les plans des autres.

import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import {
  addShare,
  createCategory,
  createPlan,
  createSnapshot,
  deleteCategory,
  deletePlan,
  getPlan,
  listCategories,
  listPlansFor,
  listSnapshots,
  planAccess,
  removeShare,
  restoreSnapshot,
  savePlan,
  updateCategory,
} from '../vault/store.js';
import { VaultValidationError } from '../vault/validate.js';

export const vaultRouter = Router();
export const vaultCategoriesRouter = Router();

function requireVaultAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin' || req.user.can_view_vault === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

const GUARD = [requireAuth, requireRole('admin', 'member'), requireVaultAccess];
vaultRouter.use(GUARD);
vaultCategoriesRouter.use(GUARD);

// Une erreur de structure (étages qui se chevauchent, coffre hors gabarit…)
// est une 422 explicite : le client sait quoi montrer sans deviner.
function handleValidation(err, res) {
  if (err instanceof VaultValidationError) {
    res.status(422).json({ error: err.code, detail: err.detail ?? null });
    return true;
  }
  return false;
}

// Accès au plan, ou 404. On ne distingue pas « inexistant » de « pas à toi » :
// rien ne doit permettre de sonder l'existence des plans des autres.
function access(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(404).json({ error: 'not_found' }); return null; }
  const found = planAccess(id, req.user.id);
  if (!found) { res.status(404).json({ error: 'not_found' }); return null; }
  return { id, ...found };
}

function requireOwner(req, res) {
  const found = access(req, res);
  if (!found) return null;
  if (found.role !== 'owner') { res.status(403).json({ error: 'owner_only' }); return null; }
  return found;
}

// ── Plans ────────────────────────────────────────────────────────────────

vaultRouter.get('/', (req, res) => res.json(listPlansFor(req.user.id)));

vaultRouter.post('/', (req, res) => {
  const { name, mcVersion, dims, worldOrigin } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'missing_name' });
  try {
    res.status(201).json(createPlan({ name, mcVersion, dims, worldOrigin }, req.user.id));
  } catch (err) {
    if (!handleValidation(err, res)) throw err;
  }
});

vaultRouter.get('/:id', (req, res) => {
  const found = access(req, res);
  if (!found) return undefined;
  return res.json(getPlan(found.id, req.user.id));
});

vaultRouter.put('/:id', (req, res) => {
  const found = access(req, res);
  if (!found) return undefined;
  const body = req.body || {};
  const force = body.force === true;
  if (!force && !Number.isFinite(Number(body.revision))) {
    return res.status(400).json({ error: 'missing_revision' });
  }
  try {
    const result = savePlan(found.id, body, req.user.id, { force });
    if (result.notFound) return res.status(404).json({ error: 'not_found' });
    // 409 : quelqu'un a sauvegardé entre-temps. Le corps porte de quoi
    // renseigner la modale « Recharger / Écraser ».
    if (result.conflict) return res.status(409).json(result.conflict);
    return res.json(result.plan);
  } catch (err) {
    if (handleValidation(err, res)) return undefined;
    throw err;
  }
});

vaultRouter.delete('/:id', (req, res) => {
  const found = requireOwner(req, res);
  if (!found) return undefined;
  deletePlan(found.id);
  return res.status(204).end();
});

// ── Partage ──────────────────────────────────────────────────────────────

vaultRouter.post('/:id/share', (req, res) => {
  const found = requireOwner(req, res);
  if (!found) return undefined;

  const { userId, email } = req.body || {};
  const target = userId != null
    ? db.prepare('SELECT id, role FROM users WHERE id = ?').get(Number(userId))
    : db.prepare('SELECT id, role FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
  if (!target) return res.status(404).json({ error: 'user_not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_share_with_self' });

  return res.json({ sharedWith: addShare(found.id, target.id) });
});

vaultRouter.delete('/:id/share/:userId', (req, res) => {
  const found = requireOwner(req, res);
  if (!found) return undefined;
  return res.json({ sharedWith: removeShare(found.id, Number(req.params.userId)) });
});

// ── Snapshots ────────────────────────────────────────────────────────────

vaultRouter.get('/:id/snapshots', (req, res) => {
  const found = access(req, res);
  if (!found) return undefined;
  return res.json(listSnapshots(found.id));
});

vaultRouter.post('/:id/snapshots', (req, res) => {
  const found = access(req, res);
  if (!found) return undefined;
  const snap = createSnapshot(found.id, req.body?.label, req.user.id);
  if (!snap) return res.status(404).json({ error: 'not_found' });
  return res.status(201).json(snap);
});

// Restaurer = dupliquer dans un nouveau plan, dont l'appelant devient
// propriétaire. L'original n'est jamais touché.
vaultRouter.post('/:id/snapshots/:sid/restore', (req, res) => {
  const found = access(req, res);
  if (!found) return undefined;
  try {
    const plan = restoreSnapshot(found.id, Number(req.params.sid), req.user.id);
    if (!plan) return res.status(404).json({ error: 'not_found' });
    return res.status(201).json(plan);
  } catch (err) {
    if (handleValidation(err, res)) return undefined;
    throw err;
  }
});

// ── Catégories (globales) ────────────────────────────────────────────────

vaultCategoriesRouter.get('/', (_req, res) => res.json(listCategories()));

vaultCategoriesRouter.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'missing_name' });
  return res.status(201).json(createCategory({ ...req.body, name }, req.user.id));
});

vaultCategoriesRouter.put('/:id', (req, res) => {
  const updated = updateCategory(Number(req.params.id), req.body || {}, req.user.id);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  return res.json(updated);
});

vaultCategoriesRouter.delete('/:id', (req, res) => {
  if (!deleteCategory(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  return res.status(204).end();
});

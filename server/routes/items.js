// Base des items customs Minefield — module global /items.
//
// Deux gardes, comme les quêtes : `can_view_items` ouvre la consultation,
// `can_edit_items` l'écriture (et implique la lecture) ; les admins passent
// outre les deux. Un compte sans le tag ne voit pas non plus l'entrée de menu.
//
// Lecture et écriture cohabitent dans ce fichier — le module est petit et
// chaque ressource tient en quelques lignes ; les séparer comme quests.js /
// quests-admin.js obligerait à lire deux fichiers pour suivre une ressource.

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import {
  ATTRIBUTS, CLASSE_LABELS, ENCHANTEMENTS, SLOTS, SLOT_LABELS,
} from '../items/power.js';
import {
  ACQUISITIONS, STATUTS,
  createItem, createPanoplie, createSerie, createTier,
  deleteItem, deletePanoplie, deleteSerie, deleteTier,
  getItem, listItems, listPanoplies, listSeries, listTiers, listWeights,
  nextCmd, previewPower, reorderTiers, resetWeights,
  updateItem, updatePanoplie, updateSerie, updateTier, updateWeight,
} from '../items/store.js';

export const itemsRouter = Router();

function requireItemView(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin') return next();
  if (req.user.can_view_items === 1 || req.user.can_edit_items === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

function requireItemEdit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin' || req.user.can_edit_items === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

const READ = [requireAuth, requireItemView];
const EDIT = [requireAuth, requireItemEdit];

const asList = (map) => [...map].map(([cle, label]) => ({ cle, label }));

/**
 * Tout le référentiel en un appel : le formulaire a besoin des tiers, séries,
 * panoplies, listes d'attributs/enchantements ET du barème pour s'afficher.
 * Six requêtes au chargement d'une page qui n'en mérite qu'une.
 */
itemsRouter.get('/ref', READ, (_req, res) => {
  res.json({
    tiers: listTiers(),
    series: listSeries(),
    panoplies: listPanoplies(),
    weights: listWeights(),
    attributs: ATTRIBUTS,
    enchantements: ENCHANTEMENTS,
    slots: SLOTS.map((s) => ({ cle: s, label: SLOT_LABELS[s] })),
    classes: Object.entries(CLASSE_LABELS).map(([cle, label]) => ({ cle, label })),
    acquisitions: asList(ACQUISITIONS),
    statuts: asList(STATUTS),
    // Les items uniques du module Quêtes, pour le pont facultatif « cet item
    // de conception correspond à tel objet déjà catalogué côté butin ».
    uniqueItems: db.prepare(`SELECT id, nom FROM quest_custom_items ORDER BY nom`).all(),
  });
});

// ── Barème de puissance ───────────────────────────────────────────────────

itemsRouter.get('/weights', READ, (_req, res) => res.json(listWeights()));

itemsRouter.put('/weights/:cle', EDIT, (req, res) => {
  const row = updateWeight(String(req.params.cle), req.body || {}, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(row);
});

itemsRouter.post('/weights/reset', EDIT, (req, res) => res.json(resetWeights(req.user.id)));

/** Aperçu du calcul sur un brouillon non enregistré (formulaire de création). */
itemsRouter.post('/power', READ, (req, res) => res.json(previewPower(req.body || {})));

// ── Tiers ─────────────────────────────────────────────────────────────────

itemsRouter.get('/tiers', READ, (_req, res) => res.json(listTiers()));
itemsRouter.post('/tiers', EDIT, (req, res) => res.status(201).json(createTier(req.body || {}, req.user.id)));
itemsRouter.post('/tiers/reorder', EDIT, (req, res) => res.json(reorderTiers(req.body?.ids || [], req.user.id)));
itemsRouter.put('/tiers/:id', EDIT, (req, res) => {
  const row = updateTier(Number(req.params.id), req.body || {}, req.user.id);
  return row ? res.json(row) : res.status(404).json({ error: 'not_found' });
});
itemsRouter.delete('/tiers/:id', EDIT, (req, res) => (
  deleteTier(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'not_found' })
));

// ── Séries de CMD ─────────────────────────────────────────────────────────

itemsRouter.get('/series', READ, (_req, res) => res.json(listSeries()));
itemsRouter.post('/series', EDIT, (req, res) => res.status(201).json(createSerie(req.body || {}, req.user.id)));
itemsRouter.put('/series/:id', EDIT, (req, res) => {
  const row = updateSerie(Number(req.params.id), req.body || {}, req.user.id);
  return row ? res.json(row) : res.status(404).json({ error: 'not_found' });
});
itemsRouter.delete('/series/:id', EDIT, (req, res) => (
  deleteSerie(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'not_found' })
));

/** Prochain CMD libre — le formulaire le propose d'un clic. */
itemsRouter.get('/series/:id/next-cmd', READ, (req, res) => {
  const out = nextCmd(Number(req.params.id));
  return out ? res.json(out) : res.status(404).json({ error: 'not_found' });
});

// ── Panoplies ─────────────────────────────────────────────────────────────

itemsRouter.get('/panoplies', READ, (_req, res) => res.json(listPanoplies()));
itemsRouter.post('/panoplies', EDIT, (req, res) => res.status(201).json(createPanoplie(req.body || {}, req.user.id)));
itemsRouter.put('/panoplies/:id', EDIT, (req, res) => {
  const row = updatePanoplie(Number(req.params.id), req.body || {}, req.user.id);
  return row ? res.json(row) : res.status(404).json({ error: 'not_found' });
});
itemsRouter.delete('/panoplies/:id', EDIT, (req, res) => (
  deletePanoplie(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'not_found' })
));

// ── Items ─────────────────────────────────────────────────────────────────

itemsRouter.get('/', READ, (req, res) => res.json(listItems(req.query || {})));

itemsRouter.get('/:idOrSlug', READ, (req, res) => {
  const item = getItem(req.params.idOrSlug);
  return item ? res.json(item) : res.status(404).json({ error: 'not_found' });
});

// Un CMD déjà pris est un conflit métier, pas une erreur serveur : la réponse
// nomme l'item qui le détient pour que l'auteur puisse aller voir.
const onCmdConflict = (err, res) => {
  if (err?.message === 'cmd_taken') return res.status(409).json({ error: 'cmd_taken', ...err.detail });
  throw err;
};

itemsRouter.post('/', EDIT, (req, res) => {
  try {
    res.status(201).json(createItem(req.body || {}, req.user.id));
  } catch (err) { onCmdConflict(err, res); }
});

itemsRouter.put('/:id', EDIT, (req, res) => {
  try {
    const item = updateItem(Number(req.params.id), req.body || {}, req.user.id);
    return item ? res.json(item) : res.status(404).json({ error: 'not_found' });
  } catch (err) { return onCmdConflict(err, res); }
});

itemsRouter.delete('/:id', EDIT, (req, res) => (
  deleteItem(Number(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'not_found' })
));

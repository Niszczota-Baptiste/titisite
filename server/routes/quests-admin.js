import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  createChain,
  createCustomItem,
  createFaction,
  createGroup,
  createMap,
  createPoi,
  createQuest,
  deleteChain,
  deleteCustomItem,
  deleteFaction,
  deleteGroup,
  deleteMap,
  deletePoi,
  deleteQuest,
  getFaction,
  updateChain,
  updateCustomItem,
  updateFaction,
  updateGroup,
  updateMap,
  updatePoi,
  updateQuest,
} from '../quests/store.js';

export const questsAdminRouter = Router();

// Edit access: admin, or a member explicitly granted can_edit_quests.
function requireQuestEdit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin' || req.user.can_edit_quests === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

questsAdminRouter.use(requireAuth, requireQuestEdit);

// ── Validation ─────────────────────────────────────────────────────────────
const OCCURRENCES = new Set(['simple', 'journaliere', 'hebdomadaire', 'mensuelle']);
const FACTION_TYPES = new Set(['faction', 'maitrise']);
const INPUT_KINDS = new Set(['item', 'pa', 'reputation', 'pnj', 'autre']);
const REWARD_KINDS = new Set(['item', 'pa', 'reputation', 'deblocage', 'autre']);
const PREREQ_KINDS = new Set(['quete_terminee', 'reputation_min', 'item_possede', 'maitrise_min', 'autre']);
const POINT_ROLES = new Set(['recuperation', 'rendu', 'pnj', 'autre']);
const POI_CATEGORIES = new Set(['batiment', 'farm', 'pnj', 'ressource', 'autre']);

class Invalid extends Error {
  constructor(code) { super(code); this.code = code; }
}

const asStr = (v) => (typeof v === 'string' ? v : '');
const nonEmpty = (v) => asStr(v).trim().length > 0;
const asIntOrNull = (v) => (v === '' || v == null ? null : Number.isFinite(+v) ? Math.trunc(+v) : null);

function validateFaction(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('faction_nom_required');
  if (b.type && !FACTION_TYPES.has(b.type)) throw new Invalid('invalid_faction_type');
  if (b.tiers != null && !Array.isArray(b.tiers)) throw new Invalid('invalid_tiers');
  for (const t of b.tiers || []) {
    if (!nonEmpty(t?.nomPalier)) throw new Invalid('tier_nom_required');
  }
}

function validateChain(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('chain_nom_required');
}

function validateGroup(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('group_nom_required');
}

function validatePoi(b) {
  if (!nonEmpty(b?.label)) throw new Invalid('poi_label_required');
  if (b.category && !POI_CATEGORIES.has(b.category)) throw new Invalid('invalid_poi_category');
}

function validateMap(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('map_nom_required');
}

function validateCustomItem(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('custom_item_nom_required');
  if (asStr(b.nom).trim().length > 120) throw new Invalid('custom_item_nom_too_long');
  if (b.enchantements != null && !Array.isArray(b.enchantements)) throw new Invalid('invalid_enchantements');
}

function validateQuest(b) {
  if (!nonEmpty(b?.titre)) throw new Invalid('titre_required');
  if (b.occurrenceType && !OCCURRENCES.has(b.occurrenceType)) throw new Invalid('invalid_occurrence');
  for (const l of b.inputs || []) {
    if (!INPUT_KINDS.has(l?.kind)) throw new Invalid('invalid_input_kind');
  }
  for (const l of b.rewards || []) {
    if (!REWARD_KINDS.has(l?.kind)) throw new Invalid('invalid_reward_kind');
  }
  for (const p of b.prerequisites || []) {
    if (!PREREQ_KINDS.has(p?.kind)) throw new Invalid('invalid_prereq_kind');
  }
  if (b.mapPoints != null) {
    if (!Array.isArray(b.mapPoints)) throw new Invalid('invalid_map_points');
    if (b.mapPoints.length > 2) throw new Invalid('too_many_map_points');
    for (const p of b.mapPoints) {
      if (p?.role && !POINT_ROLES.has(p.role)) throw new Invalid('invalid_point_role');
    }
  }
}

function handle(fn) {
  return (req, res) => {
    try { return fn(req, res); }
    catch (e) {
      if (e instanceof Invalid) return res.status(400).json({ error: e.code });
      throw e;
    }
  };
}

// ── Factions ───────────────────────────────────────────────────────────────
questsAdminRouter.post('/factions', handle((req, res) => {
  validateFaction(req.body);
  res.status(201).json(createFaction(req.body, req.user.id));
}));

questsAdminRouter.put('/factions/:id', handle((req, res) => {
  validateFaction(req.body);
  const out = updateFaction(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.get('/factions/:id', (req, res) => {
  const out = getFaction(Number(req.params.id));
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
});

questsAdminRouter.delete('/factions/:id', (req, res) => {
  if (!deleteFaction(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Chains ─────────────────────────────────────────────────────────────────
questsAdminRouter.post('/chains', handle((req, res) => {
  validateChain(req.body);
  res.status(201).json(createChain(req.body, req.user.id));
}));

questsAdminRouter.put('/chains/:id', handle((req, res) => {
  validateChain(req.body);
  const out = updateChain(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.delete('/chains/:id', (req, res) => {
  if (!deleteChain(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Groups ─────────────────────────────────────────────────────────────────
questsAdminRouter.post('/groups', handle((req, res) => {
  validateGroup(req.body);
  res.status(201).json(createGroup(req.body, req.user.id));
}));

questsAdminRouter.put('/groups/:id', handle((req, res) => {
  validateGroup(req.body);
  const out = updateGroup(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.delete('/groups/:id', (req, res) => {
  if (!deleteGroup(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Map POIs (standalone points of interest) ────────────────────────────────
questsAdminRouter.post('/pois', handle((req, res) => {
  validatePoi(req.body);
  res.status(201).json(createPoi(req.body, req.user.id));
}));

questsAdminRouter.put('/pois/:id', handle((req, res) => {
  validatePoi(req.body);
  const out = updatePoi(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.delete('/pois/:id', (req, res) => {
  if (!deletePoi(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Maps (multiple worlds/regions with editable centre + span) ──────────────
questsAdminRouter.post('/maps', handle((req, res) => {
  validateMap(req.body);
  res.status(201).json(createMap(req.body, req.user.id));
}));

questsAdminRouter.put('/maps/:id', handle((req, res) => {
  validateMap(req.body);
  const out = updateMap(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.delete('/maps/:id', (req, res) => {
  const out = deleteMap(Number(req.params.id));
  if (out === 'last_map') return res.status(400).json({ error: 'cannot_delete_last_map' });
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Custom items (objets renommés + enchantements) ──────────────────────────
questsAdminRouter.post('/custom-items', handle((req, res) => {
  validateCustomItem(req.body);
  res.status(201).json(createCustomItem(req.body, req.user.id));
}));

questsAdminRouter.put('/custom-items/:id', handle((req, res) => {
  validateCustomItem(req.body);
  const out = updateCustomItem(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.delete('/custom-items/:id', (req, res) => {
  if (!deleteCustomItem(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Quests ─────────────────────────────────────────────────────────────────
questsAdminRouter.post('/quests', handle((req, res) => {
  validateQuest(req.body);
  const payload = { ...req.body, dueDate: asIntOrNull(req.body.dueDate) };
  res.status(201).json(createQuest(payload, req.user.id));
}));

questsAdminRouter.put('/quests/:id', handle((req, res) => {
  validateQuest(req.body);
  const payload = { ...req.body, dueDate: asIntOrNull(req.body.dueDate) };
  const out = updateQuest(Number(req.params.id), payload, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

questsAdminRouter.delete('/quests/:id', (req, res) => {
  if (!deleteQuest(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

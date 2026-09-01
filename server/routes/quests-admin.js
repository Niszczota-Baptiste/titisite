import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  LOOT_RESULT_TYPES,
  MANUAL_SOURCE_KINDS,
  OFFER_LINE_KINDS,
  PROBA_SOURCES,
  QUEST_CATEGORIES,
  UNIQUE_ITEM_CATEGORIES,
} from '../quests/enums.js';
import {
  createItemSet,
  createRarity,
  createUniqueItem,
  deleteItemSet,
  deleteRarity,
  deleteUniqueItem,
  factionExists,
  getUniqueItem,
  itemSetExists,
  lootWouldCycle,
  parseUniqueRef,
  rarityExists,
  reorderRarities,
  uniqueItemExists,
  updateItemSet,
  updateRarity,
  updateUniqueItem,
} from '../quests/items.js';
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
  getGroupOwner,
  groupQuestIds,
  questExists,
  setGroupQuests,
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
// Cadences d'une rotation : tout sauf `simple` (voir validateGroup).
const RECURRING_OCCURRENCES = new Set(['journaliere', 'hebdomadaire', 'mensuelle']);
const PRICE_UNIT_RE = /^(pa|custom:\d+)$/;
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
  // Une rotation tire un de ses membres par période : la cadence doit être
  // récurrente, « une quête unique par jour » ne veut rien dire.
  if (b?.rotation && b.rotationOccurrence && !RECURRING_OCCURRENCES.has(b.rotationOccurrence)) {
    throw new Invalid('invalid_rotation_occurrence');
  }
  if (asStr(b?.rotationPnj).length > 120) throw new Invalid('rotation_pnj_too_long');
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
  if (b.stats != null && !Array.isArray(b.stats)) throw new Invalid('invalid_stats');
}

// ── Items uniques ───────────────────────────────────────────────────────────

function validateRarity(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('rarity_nom_required');
  if (asStr(b.nom).trim().length > 60) throw new Invalid('rarity_nom_too_long');
}

function validateItemSet(b) {
  if (!nonEmpty(b?.nom)) throw new Invalid('set_nom_required');
  if (asStr(b.nom).trim().length > 80) throw new Invalid('set_nom_too_long');
  // `taille` = nombre de pièces attendues en jeu ; 0 = « on ne sait pas encore ».
  const t = Number(b?.taille ?? 0);
  if (!Number.isFinite(t) || t < 0 || t > 999) throw new Invalid('invalid_set_taille');
}

// Une ligne de butin. `probabilite` est bornée à [0,100] mais la SOMME n'est
// jamais contrainte : une table incomplète doit rester enregistrable, elle est
// seulement signalée à l'écran.
function validateLootRow(l) {
  const type = l?.resultatType || 'item_referentiel';
  if (!LOOT_RESULT_TYPES.has(type)) throw new Invalid('invalid_resultat_type');
  if (l?.probabiliteSource && !PROBA_SOURCES.has(l.probabiliteSource)) {
    throw new Invalid('invalid_probabilite_source');
  }
  const p = Number(l?.probabilite ?? 0);
  if (!Number.isFinite(p) || p < 0 || p > 100) throw new Invalid('invalid_probabilite');
  const min = Math.trunc(Number(l?.quantiteMin ?? 1));
  const max = Math.trunc(Number(l?.quantiteMax ?? min));
  if (!Number.isFinite(min) || min < 1) throw new Invalid('invalid_quantite_min');
  if (!Number.isFinite(max) || max < 1) throw new Invalid('invalid_quantite_max');
  if (min > max) throw new Invalid('quantite_min_gt_max');
  if (type === 'unique_item') {
    const target = l?.resultatUniqueId ?? parseUniqueRef(l?.resultatRef);
    if (!target || !uniqueItemExists(Number(target))) throw new Invalid('unknown_unique_item');
  }
  if (type === 'reputation' && l?.factionId != null && !factionExists(Number(l.factionId))) {
    throw new Invalid('unknown_faction');
  }
}

function validateUniqueItem(b, { id = null } = {}) {
  if (!nonEmpty(b?.nom)) throw new Invalid('item_nom_required');
  if (asStr(b.nom).trim().length > 120) throw new Invalid('item_nom_too_long');
  if (b.categorie && !UNIQUE_ITEM_CATEGORIES.has(b.categorie)) throw new Invalid('invalid_categorie');
  if (b.rareteId != null && b.rareteId !== '' && !rarityExists(Number(b.rareteId))) {
    throw new Invalid('unknown_rarete');
  }
  if (b.factionId != null && b.factionId !== '' && !factionExists(Number(b.factionId))) {
    throw new Invalid('unknown_faction');
  }
  if (b.setId != null && b.setId !== '' && !itemSetExists(Number(b.setId))) {
    throw new Invalid('unknown_set');
  }
  if (b.prixVente != null && b.prixVente !== '') {
    const p = Number(b.prixVente);
    if (!Number.isFinite(p) || p < 0) throw new Invalid('invalid_prix');
  }
  // Unité de prix : PA, ou un item unique de catégorie « monnaie » qui existe.
  if (b.prixUnite && !PRICE_UNIT_RE.test(String(b.prixUnite))) throw new Invalid('invalid_prix_unite');
  const unitId = parseUniqueRef(b.prixUnite);
  if (unitId != null && !uniqueItemExists(unitId)) throw new Invalid('unknown_prix_unite');
  if (unitId != null && id != null && unitId === Number(id)) throw new Invalid('prix_unite_self');
  for (const e of [b.enchantements, b.stats, b.tags]) {
    if (e != null && !Array.isArray(e)) throw new Invalid('invalid_list');
  }
  if (b.loot != null) {
    if (!Array.isArray(b.loot)) throw new Invalid('invalid_loot');
    if (b.loot.length > 200) throw new Invalid('too_many_loot_rows');
    for (const l of b.loot) validateLootRow(l);
    // Un contenant ne peut pas se contenir lui-même, même indirectement.
    if (id != null && lootWouldCycle(id, b.loot)) throw new Invalid('loot_cycle');
  }
  if (b.sourcesManuelles != null) {
    if (!Array.isArray(b.sourcesManuelles)) throw new Invalid('invalid_sources');
    for (const s of b.sourcesManuelles) {
      if (s?.kind && !MANUAL_SOURCE_KINDS.has(s.kind)) throw new Invalid('invalid_source_kind');
      if (!nonEmpty(s?.label)) throw new Invalid('source_label_required');
      // Quête rattachée : facultative, mais elle doit exister.
      if (s?.questId != null && s.questId !== '' && !questExists(Number(s.questId))) {
        throw new Invalid('unknown_quest');
      }
    }
  }
}

function validateOffers(offers) {
  if (!Array.isArray(offers)) throw new Invalid('invalid_offers');
  if (offers.length > 50) throw new Invalid('too_many_offers');
  for (const o of offers) {
    if (o?.stock != null && o.stock !== '') {
      const s = Number(o.stock);
      if (!Number.isFinite(s) || s < 0) throw new Invalid('invalid_stock');
    }
    let lines = 0;
    for (const sens of ['donne', 'recoit']) {
      // eslint-disable-next-line security/detect-object-injection -- `sens` itère une liste littérale
      const rows = o?.[sens];
      if (rows == null) continue;
      if (!Array.isArray(rows)) throw new Invalid('invalid_offer_lines');
      lines += rows.length;
      for (const l of rows) {
        if (l?.kind && !OFFER_LINE_KINDS.has(l.kind)) throw new Invalid('invalid_offer_line_kind');
        const q = Math.trunc(Number(l?.quantite ?? 1));
        if (!Number.isFinite(q) || q < 1) throw new Invalid('invalid_offer_quantite');
        const uid = parseUniqueRef(l?.refCode);
        if (uid != null && !uniqueItemExists(uid)) throw new Invalid('unknown_unique_item');
      }
    }
    if (lines === 0) throw new Invalid('offer_needs_lines');
  }
}

// Aléa d'une ligne de récompense : `probabilite` absente = ligne garantie (le
// cas historique). Mêmes bornes que les tables de butin des contenants — une
// quête de récolte qui donne « rien ou 1–3 géodes » se décrit exactement comme
// l'ouverture d'une géode.
function validateRewardChance(l) {
  const aleatoire = l?.probabilite != null && l.probabilite !== '';
  if (aleatoire) {
    const p = Number(l.probabilite);
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new Invalid('invalid_probabilite');
    if (l.probabiliteSource && !PROBA_SOURCES.has(l.probabiliteSource)) {
      throw new Invalid('invalid_probabilite_source');
    }
  }
  const borne = (v) => (v == null || v === '' ? null : Number(v));
  const min = borne(l?.quantiteMin);
  const max = borne(l?.quantiteMax);
  for (const [v, code] of [[min, 'invalid_quantite_min'], [max, 'invalid_quantite_max']]) {
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) throw new Invalid(code);
  }
  if (min != null && max != null && min > max) throw new Invalid('quantite_min_gt_max');
}

function validateQuest(b) {
  if (!nonEmpty(b?.titre)) throw new Invalid('titre_required');
  if (b.occurrenceType && !OCCURRENCES.has(b.occurrenceType)) throw new Invalid('invalid_occurrence');
  if (b.categorie && !QUEST_CATEGORIES.has(b.categorie)) throw new Invalid('invalid_quest_categorie');
  if (b.craft != null) {
    if (typeof b.craft !== 'object') throw new Invalid('invalid_craft');
    if (b.craft.grid != null && !Array.isArray(b.craft.grid)) throw new Invalid('invalid_craft_grid');
    if (b.craft.grid != null && b.craft.grid.length > 9) throw new Invalid('invalid_craft_grid');
    if (b.craft.maitriseFactionId != null && b.craft.maitriseFactionId !== ''
        && !factionExists(Number(b.craft.maitriseFactionId))) throw new Invalid('unknown_faction');
  }
  if (b.offers != null) validateOffers(b.offers);
  for (const l of b.inputs || []) {
    if (!INPUT_KINDS.has(l?.kind)) throw new Invalid('invalid_input_kind');
  }
  for (const l of b.rewards || []) {
    if (!REWARD_KINDS.has(l?.kind)) throw new Invalid('invalid_reward_kind');
    validateRewardChance(l);
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

// Quêtes d'un groupe PARTAGÉ, en bloc. Le même geste existait déjà pour les
// groupes privés (`/my-groups/:id/quests`) ; sans lui ici, monter une rotation
// de dix livraisons demanderait d'ouvrir les dix quêtes une par une.
questsAdminRouter.get('/groups/:id/quests', handle((req, res) => {
  const id = Number(req.params.id);
  if (getGroupOwner(id) === undefined) return res.status(404).json({ error: 'not_found' });
  res.json({ questIds: groupQuestIds(id) });
}));

questsAdminRouter.put('/groups/:id/quests', handle((req, res) => {
  const id = Number(req.params.id);
  if (getGroupOwner(id) === undefined) return res.status(404).json({ error: 'not_found' });
  if (!Array.isArray(req.body?.questIds)) return res.status(400).json({ error: 'quest_ids_required' });
  res.json({ questIds: setGroupQuests(id, req.body.questIds) });
}));

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

// ── Raretés (échelle ordonnée, éditable en ligne) ───────────────────────────
questsAdminRouter.post('/rarities', handle((req, res) => {
  validateRarity(req.body);
  res.status(201).json(createRarity(req.body, req.user.id));
}));

questsAdminRouter.put('/rarities/:id', handle((req, res) => {
  validateRarity(req.body);
  const out = updateRarity(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

// Réordonne toute l'échelle d'un coup (glisser-déposer côté éditeur).
questsAdminRouter.put('/rarities', handle((req, res) => {
  if (!Array.isArray(req.body?.ids)) throw new Invalid('ids_required');
  res.json(reorderRarities(req.body.ids, req.user.id));
}));

// Les items concernés gardent leur ligne : rarete_id retombe à NULL (FK).
questsAdminRouter.delete('/rarities/:id', (req, res) => {
  if (!deleteRarity(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Sets d'items (les 6 sets de joyaux, et ce qui viendra après) ────────────
questsAdminRouter.post('/sets', handle((req, res) => {
  validateItemSet(req.body);
  res.status(201).json(createItemSet(req.body, req.user.id));
}));

questsAdminRouter.put('/sets/:id', handle((req, res) => {
  validateItemSet(req.body);
  const out = updateItemSet(Number(req.params.id), req.body, req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
}));

// Les items membres gardent leur fiche : set_id retombe à NULL (FK).
questsAdminRouter.delete('/sets/:id', (req, res) => {
  if (!deleteItemSet(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

// ── Items uniques (catalogue + table de butin + sources manuelles) ──────────
questsAdminRouter.post('/unique-items', handle((req, res) => {
  validateUniqueItem(req.body);
  res.status(201).json(createUniqueItem(req.body, req.user.id));
}));

questsAdminRouter.put('/unique-items/:id', handle((req, res) => {
  const id = Number(req.params.id);
  if (!uniqueItemExists(id)) return res.status(404).json({ error: 'not_found' });
  validateUniqueItem(req.body, { id });
  res.json(updateUniqueItem(id, req.body, req.user.id));
}));

questsAdminRouter.get('/unique-items/:id/edit', (req, res) => {
  const out = getUniqueItem(Number(req.params.id));
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
});

questsAdminRouter.delete('/unique-items/:id', (req, res) => {
  if (!deleteUniqueItem(Number(req.params.id))) return res.status(404).json({ error: 'not_found' });
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

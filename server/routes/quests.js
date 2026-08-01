import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import { codexNameById, normName } from '../codex.js';
import { db } from '../db.js';
import { findByCockpitToken } from '../users.js';
import { buildCockpitFeed } from '../quests/cockpit.js';
import {
  addObservation,
  deleteObservation,
  getObservation,
  getUniqueItem,
  itemSources,
  listObservations,
  listRarities,
  listUniqueItems,
  observationSummary,
  parseUniqueRef,
  uniqueItemExists,
} from '../quests/items.js';
import { LOOT_RESULT_TYPES } from '../quests/enums.js';
import {
  completeQuest,
  createGroup,
  customItemNameByRef,
  deleteGroup,
  getChainGraph,
  getGroupOwner,
  getQuest,
  groupQuestIds,
  groupVisibleBy,
  listChains,
  listCustomItems,
  listFactions,
  listGroups,
  listMaps,
  listQuests,
  memberCurrentDone,
  potentialGains,
  questHistory,
  reputationOverview,
  setGroupQuests,
  uncompleteQuest,
  updateGroup,
  worldMap,
} from '../quests/store.js';

export const questsRouter = Router();

// Read access: admin, or a member with can_view_quests / can_edit_quests.
// (can_edit_quests implies view; both flags are surfaced on req.user.)
function requireQuestView(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_authenticated' });
  if (req.user.role === 'admin') return next();
  if (req.user.can_view_quests === 1 || req.user.can_edit_quests === 1) return next();
  return res.status(403).json({ error: 'forbidden' });
}

const READ = [requireAuth, requireQuestView];

// ── Reference data ─────────────────────────────────────────────────────────
questsRouter.get('/factions', READ, (_req, res) => res.json(listFactions()));
questsRouter.get('/chains', READ, (_req, res) => res.json(listChains()));
// Groupes partagés + les groupes privés de l'appelant.
questsRouter.get('/groups', READ, (req, res) => res.json(listGroups(req.user.id)));
questsRouter.get('/chains/:id/graph', READ, (req, res) => {
  res.json(getChainGraph(Number(req.params.id)));
});
// Gains potentiels — globaux, ou restreints à un groupe visible (?group=N).
questsRouter.get('/gains', READ, (req, res) => {
  const groupId = req.query.group ? Number(req.query.group) : null;
  if (groupId != null) {
    if (!Number.isFinite(groupId) || !groupVisibleBy(groupId, req.user.id)) {
      return res.status(404).json({ error: 'not_found' });
    }
  }
  res.json(potentialGains(groupId));
});

// ── Groupes privés (sélections perso, gérables par tout lecteur de quêtes) ──
// Un groupe privé appartient à son créateur : lui seul le voit, le modifie,
// choisit ses quêtes ou le supprime. Les groupes partagés restent gérés par
// l'admin d'édition (quests-admin).

function ownPrivateGroup(req, res) {
  const id = Number(req.params.id);
  const owner = getGroupOwner(id);
  if (owner === undefined) { res.status(404).json({ error: 'not_found' }); return null; }
  if (owner === null || owner !== req.user.id) { res.status(403).json({ error: 'forbidden' }); return null; }
  return id;
}

questsRouter.post('/my-groups', READ, (req, res) => {
  const nom = String(req.body?.nom || '').trim();
  if (!nom) return res.status(400).json({ error: 'nom_required' });
  const group = createGroup({
    nom: nom.slice(0, 80),
    couleur: req.body?.couleur,
    description: String(req.body?.description || '').slice(0, 300),
  }, req.user.id, req.user.id);
  res.status(201).json(group);
});

questsRouter.put('/my-groups/:id', READ, (req, res) => {
  const id = ownPrivateGroup(req, res);
  if (id == null) return;
  const nom = String(req.body?.nom || '').trim();
  if (!nom) return res.status(400).json({ error: 'nom_required' });
  res.json(updateGroup(id, {
    nom: nom.slice(0, 80),
    couleur: req.body?.couleur,
    description: String(req.body?.description || '').slice(0, 300),
  }, req.user.id));
});

questsRouter.delete('/my-groups/:id', READ, (req, res) => {
  const id = ownPrivateGroup(req, res);
  if (id == null) return;
  deleteGroup(id);
  res.status(204).end();
});

// Quêtes du groupe : lecture (ids) + remplacement complet (picker à cases).
questsRouter.get('/my-groups/:id/quests', READ, (req, res) => {
  const id = ownPrivateGroup(req, res);
  if (id == null) return;
  res.json({ questIds: groupQuestIds(id) });
});

questsRouter.put('/my-groups/:id/quests', READ, (req, res) => {
  const id = ownPrivateGroup(req, res);
  if (id == null) return;
  if (!Array.isArray(req.body?.questIds)) return res.status(400).json({ error: 'quest_ids_required' });
  res.json({ questIds: setGroupQuests(id, req.body.questIds) });
});
// ── Catalogue d'items uniques ──────────────────────────────────────────────
// Lecture ouverte à tout lecteur de quêtes (même garde que le reste du module :
// rien n'est public). L'écriture du catalogue vit dans quests-admin.js ; SEULE
// exception, le journal d'ouvertures ci-dessous, qu'un simple lecteur alimente
// — c'est le principe même d'une table de butin affinée collectivement.
questsRouter.get('/rarities', READ, (_req, res) => res.json(listRarities()));

questsRouter.get('/unique-items', READ, (_req, res) => res.json(listUniqueItems()));

questsRouter.get('/unique-items/:id', READ, (req, res) => {
  const item = getUniqueItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(item);
});

// Index inversé : toutes les façons d'obtenir l'objet + tout ce à quoi il sert.
questsRouter.get('/unique-items/:id/sources', READ, (req, res) => {
  const id = Number(req.params.id);
  if (!uniqueItemExists(id)) return res.status(404).json({ error: 'not_found' });
  res.json(itemSources(id));
});

questsRouter.get('/unique-items/:id/observations', READ, (req, res) => {
  const id = Number(req.params.id);
  if (!uniqueItemExists(id)) return res.status(404).json({ error: 'not_found' });
  res.json({ resume: observationSummary(id), recentes: listObservations(id) });
});

// Loguer une ouverture : réservé aux items ouvrables, quantité bornée.
questsRouter.post('/unique-items/:id/observations', READ, (req, res) => {
  const id = Number(req.params.id);
  const item = getUniqueItem(id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  if (!item.estOuvrable) return res.status(400).json({ error: 'item_not_openable' });
  const type = String(req.body?.resultatType || 'item_referentiel');
  if (!LOOT_RESULT_TYPES.has(type)) return res.status(400).json({ error: 'invalid_resultat_type' });
  const qte = Math.trunc(Number(req.body?.quantite ?? 1));
  if (!Number.isFinite(qte) || qte < 1 || qte > 10_000) {
    return res.status(400).json({ error: 'invalid_quantite' });
  }
  // Une observation qui désigne un item unique doit désigner un item existant.
  if (type === 'unique_item') {
    const target = req.body?.resultatUniqueId ?? parseUniqueRef(req.body?.resultatRef);
    if (!target || !uniqueItemExists(Number(target))) {
      return res.status(400).json({ error: 'unknown_unique_item' });
    }
  }
  addObservation(id, { ...req.body, quantite: qte, resultatType: type }, req.user.id);
  res.status(201).json({ resume: observationSummary(id), recentes: listObservations(id) });
});

// Suppression d'une observation : son auteur, ou un éditeur de quêtes.
questsRouter.delete('/observations/:id', READ, (req, res) => {
  const obs = getObservation(Number(req.params.id));
  if (!obs) return res.status(404).json({ error: 'not_found' });
  const isEditor = req.user.role === 'admin' || req.user.can_edit_quests === 1;
  if (!isEditor && obs.memberId !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  deleteObservation(obs.id);
  res.json({ resume: observationSummary(obs.uniqueItemId), recentes: listObservations(obs.uniqueItemId) });
});

questsRouter.get('/reputation', READ, (_req, res) => res.json(reputationOverview()));
questsRouter.get('/maps', READ, (_req, res) => res.json(listMaps()));
questsRouter.get('/custom-items', READ, (_req, res) => res.json(listCustomItems()));
questsRouter.get('/map', READ, (req, res) => {
  const mapId = req.query.map ? Number(req.query.map) : null;
  res.json(worldMap(mapId));
});

// ── Quests ─────────────────────────────────────────────────────────────────
questsRouter.get('/quests', READ, (req, res) => {
  const filters = {};
  if (req.query.faction) filters.factionId = Number(req.query.faction);
  if (req.query.chain) filters.chainId = Number(req.query.chain);
  if (req.query.group) {
    const gid = Number(req.query.group);
    // Un groupe privé d'un autre membre ne filtre rien (pas de fuite).
    if (groupVisibleBy(gid, req.user.id)) filters.groupId = gid;
    else return res.status(404).json({ error: 'not_found' });
  }
  if (req.query.occurrence) filters.occurrence = String(req.query.occurrence);
  if (req.query.categorie) filters.categorie = String(req.query.categorie);
  const done = memberCurrentDone(req.user.id);
  const quests = listQuests(filters).map((q) => ({ ...q, done: !!done[q.id] }));
  res.json(quests);
});

questsRouter.get('/quests/:id', READ, (req, res) => {
  const id = Number(req.params.id);
  const quest = getQuest(id);
  if (!quest) return res.status(404).json({ error: 'not_found' });
  const done = memberCurrentDone(req.user.id);
  // eslint-disable-next-line security/detect-object-injection -- `id` is a Number()-coerced quest id, read-only lookup
  res.json({ ...quest, done: !!done[id], history: questHistory(id, req.user.id) });
});

// ── Où trouver les entrées d'une quête dans les coffres des projets ─────────
// Pour chaque entrée de type `item`, cherche dans l'inventaire Minecraft
// (minecraft_resources) des workspaces accessibles à l'appelant (admin : tous ;
// membre : ses adhésions) les lignes dont le nom correspond — par nom normalisé,
// sur le label de l'entrée et/ou le nom codex de son ref_code. Renvoie les
// emplacements (coffre + monde + coordonnées) et le total possédé.
questsRouter.get('/quests/:id/stock', READ, (req, res) => {
  const id = Number(req.params.id);
  const quest = db.prepare(`SELECT id FROM quests WHERE id = ?`).get(id);
  if (!quest) return res.status(404).json({ error: 'not_found' });

  const inputs = db.prepare(`
    SELECT id, label, ref_code AS refCode, quantite FROM quest_inputs
    WHERE quest_id = ? AND kind = 'item' ORDER BY ordre, id
  `).all(id);
  if (inputs.length === 0) return res.json({ inputs: [] });

  const workspaces = req.user.role === 'admin'
    ? db.prepare(`SELECT id, slug, name FROM workspaces WHERE is_minecraft = 1 AND status = 'active'`).all()
    : db.prepare(`
        SELECT w.id, w.slug, w.name FROM workspaces w
        JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = ? AND w.is_minecraft = 1 AND w.status = 'active'
      `).all(req.user.id);
  if (workspaces.length === 0) {
    return res.json({
      inputs: inputs.map((i) => ({
        inputId: i.id,
        label: i.label || customItemNameByRef(i.refCode) || codexNameById(i.refCode) || i.refCode,
        refCode: i.refCode,
        needed: i.quantite,
        totalHave: 0,
        locations: [],
      })),
    });
  }

  const ph = workspaces.map(() => '?').join(',');
  const resources = db.prepare(`
    SELECT r.workspace_id, r.name, r.quantity,
           c.id AS chest_id, c.name AS chest_name, c.world AS chest_world,
           c.x AS chest_x, c.y AS chest_y, c.z AS chest_z
    FROM minecraft_resources r
    LEFT JOIN minecraft_chests c ON c.id = r.chest_id
    WHERE r.workspace_id IN (${ph}) AND r.quantity > 0
  `).all(...workspaces.map((w) => w.id));
  const wsById = new Map(workspaces.map((w) => [w.id, w]));

  const out = inputs.map((input) => {
    // ref_code 'custom:<id>' → nom custom (item renommé) ; sinon nom codex.
    const refName = customItemNameByRef(input.refCode) ?? codexNameById(input.refCode);
    const candidates = new Set([normName(input.label), normName(refName)]);
    candidates.delete('');
    const locations = resources
      .filter((r) => candidates.has(normName(r.name)))
      .map((r) => {
        const ws = wsById.get(r.workspace_id);
        return {
          workspaceSlug: ws.slug,
          workspaceName: ws.name,
          itemName: r.name,
          quantity: r.quantity,
          chest: r.chest_id ? {
            id: r.chest_id, name: r.chest_name, world: r.chest_world,
            x: r.chest_x, y: r.chest_y, z: r.chest_z,
          } : null,
        };
      })
      .sort((a, b) => b.quantity - a.quantity);
    return {
      inputId: input.id,
      // Libellé affichable : label saisi, sinon nom custom/codex résolu — le
      // client ne doit jamais retomber sur le ref_code brut (« custom:1 »).
      label: input.label || refName || input.refCode,
      refCode: input.refCode,
      needed: input.quantite,
      totalHave: locations.reduce((s, l) => s + l.quantity, 0),
      locations,
    };
  });
  res.json({ inputs: out });
});

// My completion state (map questId → true for the current period).
questsRouter.get('/me/quests', READ, (req, res) => {
  res.json({ done: memberCurrentDone(req.user.id) });
});

questsRouter.post('/quests/:id/complete', READ, (req, res) => {
  const out = completeQuest(Number(req.params.id), req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
});

questsRouter.post('/quests/:id/uncomplete', READ, (req, res) => {
  const out = uncompleteQuest(Number(req.params.id), req.user.id);
  if (!out) return res.status(404).json({ error: 'not_found' });
  res.json(out);
});

// ── Cockpit pull feed (secret per-member token, no cookie) ─────────────────
const cockpitLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

questsRouter.get('/cockpit/:token', cockpitLimiter, (req, res) => {
  // Accept an optional .json suffix so the URL reads like a file to the poller.
  const token = String(req.params.token).replace(/\.json$/, '');
  const member = findByCockpitToken(token);
  // Cockpit admin-only : un jeton émis pour un compte membre ne sert plus rien.
  if (!member || member.role !== 'admin') return res.status(404).json({ error: 'not_found' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildCockpitFeed(member));
});

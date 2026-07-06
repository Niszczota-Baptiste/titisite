import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import { codexNameById, normName } from '../codex.js';
import { db } from '../db.js';
import { findByCockpitToken } from '../users.js';
import { buildCockpitFeed } from '../quests/cockpit.js';
import {
  completeQuest,
  getChainGraph,
  getQuest,
  listChains,
  listFactions,
  listGroups,
  listMaps,
  listQuests,
  memberCurrentDone,
  potentialGains,
  questHistory,
  reputationOverview,
  uncompleteQuest,
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
questsRouter.get('/groups', READ, (_req, res) => res.json(listGroups()));
questsRouter.get('/chains/:id/graph', READ, (req, res) => {
  res.json(getChainGraph(Number(req.params.id)));
});
questsRouter.get('/gains', READ, (_req, res) => res.json(potentialGains()));
questsRouter.get('/reputation', READ, (_req, res) => res.json(reputationOverview()));
questsRouter.get('/maps', READ, (_req, res) => res.json(listMaps()));
questsRouter.get('/map', READ, (req, res) => {
  const mapId = req.query.map ? Number(req.query.map) : null;
  res.json(worldMap(mapId));
});

// ── Quests ─────────────────────────────────────────────────────────────────
questsRouter.get('/quests', READ, (req, res) => {
  const filters = {};
  if (req.query.faction) filters.factionId = Number(req.query.faction);
  if (req.query.chain) filters.chainId = Number(req.query.chain);
  if (req.query.group) filters.groupId = Number(req.query.group);
  if (req.query.occurrence) filters.occurrence = String(req.query.occurrence);
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
    return res.json({ inputs: inputs.map((i) => ({ inputId: i.id, label: i.label, refCode: i.refCode, needed: i.quantite, totalHave: 0, locations: [] })) });
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
    const candidates = new Set([normName(input.label), normName(codexNameById(input.refCode))]);
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
      label: input.label,
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
  if (!member) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildCockpitFeed(member));
});

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import { findByCockpitToken } from '../users.js';
import { buildCockpitFeed } from '../quests/cockpit.js';
import {
  completeQuest,
  getChainGraph,
  getQuest,
  listChains,
  listFactions,
  listGroups,
  listQuests,
  memberCurrentDone,
  potentialGains,
  questHistory,
  reputationOverview,
  uncompleteQuest,
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

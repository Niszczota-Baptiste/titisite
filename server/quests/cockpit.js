// Minefield cockpit feed — PULL model.
//
// The cockpit is a local Python app on the user's PC (no public URL), so it
// cannot receive a push. Instead it polls a secret, per-member token URL
// (GET /api/quests/cockpit/:token.json, no cookie) and gets everything it needs
// to display reminders: which recurring quests are available right now (not yet
// done this period), which deadlines are approaching, the member's personal
// item list (`wanted`), and the potential gains.
//
// Per-member tuning (managed from the « Cockpit » admin page):
// - cockpit_quest_follows: no row → every quest is sent (default); at least one
//   row → only followed quests appear in `available` and `deadlines`.
// - cockpit_items: the member's own wanted list (NOT the per-workspace group
//   wishlist `minecraft_wanted`).
//
// Nothing here mutates state — the feed is a pure read, so it is idempotent and
// self-healing across resets (period_key is recomputed every poll). A member
// with wants_quest_reminders = 0 gets an empty reminder set.

import { codexNameById } from '../codex.js';
import { db } from '../db.js';
import { currentPeriodKey, nextResetAt } from './period.js';
import { customItemNameByRef, memberCurrentDone, potentialGains } from './store.js';

const DEADLINE_HORIZON_S = 72 * 3600; // surface a due date within 72 h

// Label affichable : saisi, sinon nom custom/codex du ref_code — le cockpit ne
// doit jamais afficher un ref brut (« custom:1 »).
const withName = (l) => ({
  ...l,
  label: l.label || customItemNameByRef(l.refCode) || codexNameById(l.refCode) || l.label,
});

function rewardsBrief(questId) {
  return db.prepare(`
    SELECT kind, label, quantite, faction_id AS factionId, ref_code AS refCode FROM quest_rewards
    WHERE quest_id = ? ORDER BY ordre, id
  `).all(questId).map(withName);
}

function inputsBrief(questId) {
  return db.prepare(`
    SELECT kind, label, quantite, ref_code AS refCode, faction_id AS factionId, icon
    FROM quest_inputs WHERE quest_id = ? ORDER BY ordre, id
  `).all(questId).map(withName);
}

function mapPointsBrief(questId) {
  return db.prepare(`
    SELECT label, role, x, y, z FROM quest_map_points WHERE quest_id = ? ORDER BY ordre, id
  `).all(questId);
}

// Set of followed quest ids, or null when the member follows nothing (= send
// everything, the default behaviour before follows existed).
function followedQuestIds(memberId) {
  const rows = db.prepare(`SELECT quest_id FROM cockpit_quest_follows WHERE user_id = ?`).all(memberId);
  return rows.length ? new Set(rows.map((r) => r.quest_id)) : null;
}

// The member's own not-done items, sorted by priority then position. The
// linked workspace resolves to its display name (or null).
function wantedItems(memberId) {
  return db.prepare(`
    SELECT i.id, i.name, i.quantity, i.priority, i.note, w.name AS workspace, i.x, i.y, i.z
    FROM cockpit_items i
    LEFT JOIN workspaces w ON w.id = i.workspace_id
    WHERE i.user_id = ? AND i.done = 0
    ORDER BY i.priority, i.position, i.id
  `).all(memberId);
}

export function buildCockpitFeed(member, now = new Date()) {
  const nowS = Math.floor(now.getTime() / 1000);
  const done = memberCurrentDone(member.id);
  const wantsReminders = member.wants_quest_reminders === 1;
  const follows = followedQuestIds(member.id);

  const recurring = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type, f.nom AS faction_nom, f.couleur AS faction_couleur
    FROM quests q LEFT JOIN factions f ON f.id = q.faction_id
    WHERE q.occurrence_type IN ('journaliere','hebdomadaire','mensuelle')
    ORDER BY q.occurrence_type, q.titre
  `).all();

  const available = { journaliere: [], hebdomadaire: [], mensuelle: [] };
  for (const q of recurring) {
    if (done[q.id]) continue; // already done this period
    if (follows && !follows.has(q.id)) continue; // not followed → not sent
    available[q.occurrence_type].push({
      id: q.id,
      titre: q.titre,
      faction: q.faction_nom,
      factionCouleur: q.faction_couleur,
      periodKey: currentPeriodKey(q.occurrence_type),
      nextResetAt: nextResetAt(q.occurrence_type),
      inputs: inputsBrief(q.id),
      rewards: rewardsBrief(q.id),
      mapPoints: mapPointsBrief(q.id),
    });
  }

  const deadlineRows = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type, q.due_date, f.nom AS faction_nom
    FROM quests q LEFT JOIN factions f ON f.id = q.faction_id
    WHERE q.due_date IS NOT NULL AND q.due_date >= ? AND q.due_date <= ?
    ORDER BY q.due_date ASC
  `).all(nowS, nowS + DEADLINE_HORIZON_S);
  const deadlines = deadlineRows
    .filter((q) => !done[q.id] && (!follows || follows.has(q.id)))
    .map((q) => ({
      id: q.id,
      titre: q.titre,
      faction: q.faction_nom,
      dueDate: q.due_date,
      inputs: inputsBrief(q.id),
      rewards: rewardsBrief(q.id),
      mapPoints: mapPointsBrief(q.id),
    }));

  const wanted = wantedItems(member.id);

  const totalAvailable = available.journaliere.length
    + available.hebdomadaire.length + available.mensuelle.length;

  return {
    member: { id: member.id, name: member.name },
    generatedAt: nowS,
    remindersEnabled: wantsReminders,
    // When reminders are disabled the actionable lists are emptied, but the
    // reference data (gains) is still served so the cockpit can show context.
    available: wantsReminders ? available : { journaliere: [], hebdomadaire: [], mensuelle: [] },
    deadlines: wantsReminders ? deadlines : [],
    wanted: wantsReminders ? wanted : [],
    counts: {
      availableTotal: wantsReminders ? totalAvailable : 0,
      deadlines: wantsReminders ? deadlines.length : 0,
      wanted: wantsReminders ? wanted.length : 0,
    },
    potentialGains: potentialGains(),
  };
}

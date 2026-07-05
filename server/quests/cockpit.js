// Minefield cockpit feed — PULL model.
//
// The cockpit is a local Python app on the user's PC (no public URL), so it
// cannot receive a push. Instead it polls a secret, per-member token URL
// (GET /api/quests/cockpit/:token.json, no cookie) and gets everything it needs
// to display reminders: which recurring quests are available right now (not yet
// done this period), which deadlines are approaching, and the potential gains.
//
// Nothing here mutates state — the feed is a pure read, so it is idempotent and
// self-healing across resets (period_key is recomputed every poll). A member
// with wants_quest_reminders = 0 gets an empty reminder set.

import { db } from '../db.js';
import { currentPeriodKey, nextResetAt } from './period.js';
import { memberCurrentDone, potentialGains } from './store.js';

const DEADLINE_HORIZON_S = 72 * 3600; // surface a due date within 72 h

function rewardsBrief(questId) {
  return db.prepare(`
    SELECT kind, label, quantite, faction_id AS factionId, ref_code AS refCode FROM quest_rewards
    WHERE quest_id = ? ORDER BY ordre, id
  `).all(questId);
}

export function buildCockpitFeed(member, now = new Date()) {
  const nowS = Math.floor(now.getTime() / 1000);
  const done = memberCurrentDone(member.id);
  const wantsReminders = member.wants_quest_reminders === 1;

  const recurring = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type, f.nom AS faction_nom, f.couleur AS faction_couleur
    FROM quests q LEFT JOIN factions f ON f.id = q.faction_id
    WHERE q.occurrence_type IN ('journaliere','hebdomadaire','mensuelle')
    ORDER BY q.occurrence_type, q.titre
  `).all();

  const available = { journaliere: [], hebdomadaire: [], mensuelle: [] };
  for (const q of recurring) {
    if (done[q.id]) continue; // already done this period
    available[q.occurrence_type].push({
      id: q.id,
      titre: q.titre,
      faction: q.faction_nom,
      factionCouleur: q.faction_couleur,
      periodKey: currentPeriodKey(q.occurrence_type),
      nextResetAt: nextResetAt(q.occurrence_type),
      rewards: rewardsBrief(q.id),
    });
  }

  const deadlineRows = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type, q.due_date, f.nom AS faction_nom
    FROM quests q LEFT JOIN factions f ON f.id = q.faction_id
    WHERE q.due_date IS NOT NULL AND q.due_date >= ? AND q.due_date <= ?
    ORDER BY q.due_date ASC
  `).all(nowS, nowS + DEADLINE_HORIZON_S);
  const deadlines = deadlineRows
    .filter((q) => !done[q.id])
    .map((q) => ({ id: q.id, titre: q.titre, faction: q.faction_nom, dueDate: q.due_date }));

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
    counts: {
      availableTotal: wantsReminders ? totalAvailable : 0,
      deadlines: wantsReminders ? deadlines.length : 0,
    },
    potentialGains: potentialGains(),
  };
}

// Data-access layer for the quest tracker. Pure SQL (better-sqlite3), same
// conventions as the rest of the server: snake_case columns in, camelCase
// objects out; nested children are replaced wholesale inside a transaction on
// write. No reputation score is stored — rewards only *document* gains.

import { db } from '../db.js';
import { currentPeriodKey, nextResetAt, RECURRING } from './period.js';

// ── Mappers ──────────────────────────────────────────────────────────────

function mapTier(r) {
  return { id: r.id, factionId: r.faction_id, nomPalier: r.nom_palier, seuil: r.seuil, ordre: r.ordre };
}

function mapFaction(r) {
  if (!r) return null;
  return {
    id: r.id,
    nom: r.nom,
    couleur: r.couleur,
    type: r.type,
    description: r.description,
    sortOrder: r.sort_order,
    tiers: db.prepare(`SELECT * FROM faction_tiers WHERE faction_id = ? ORDER BY ordre, seuil, id`)
      .all(r.id).map(mapTier),
  };
}

function mapChain(r) {
  if (!r) return null;
  return {
    id: r.id, nom: r.nom, factionId: r.faction_id, description: r.description, sortOrder: r.sort_order,
  };
}

function mapLine(r) {
  return {
    id: r.id, kind: r.kind, refCode: r.ref_code, factionId: r.faction_id,
    quantite: r.quantite, unlockQuestId: r.unlock_quest_id ?? null,
    label: r.label, icon: r.icon, ordre: r.ordre,
  };
}

function mapPrereq(r) {
  return {
    id: r.id, kind: r.kind, refQuestId: r.ref_quest_id, factionId: r.faction_id,
    tierId: r.tier_id, refCode: r.ref_code, valeur: r.valeur, label: r.label, ordre: r.ordre,
  };
}

function mapPoint(r) {
  return { id: r.id, label: r.label, role: r.role, x: r.x, y: r.y, z: r.z, ordre: r.ordre };
}

// Summary row (list view): quest + resolved faction/chain names + child counts.
function mapQuestSummary(r) {
  return {
    id: r.id,
    titre: r.titre,
    description: r.description,
    occurrenceType: r.occurrence_type,
    factionId: r.faction_id,
    factionNom: r.faction_nom ?? null,
    factionCouleur: r.faction_couleur ?? null,
    chainId: r.chain_id,
    chainNom: r.chain_nom ?? null,
    chainRank: r.chain_rank,
    dueDate: r.due_date ?? null,
    createdBy: r.created_by,
    createdByName: r.created_by_name ?? null,
    updatedAt: r.updated_at,
    periodKey: currentPeriodKey(r.occurrence_type),
    nextResetAt: nextResetAt(r.occurrence_type),
  };
}

const QUEST_SUMMARY_SELECT = `
  SELECT q.*, f.nom AS faction_nom, f.couleur AS faction_couleur,
         c.nom AS chain_nom, u.name AS created_by_name
  FROM quests q
  LEFT JOIN factions f ON f.id = q.faction_id
  LEFT JOIN quest_chains c ON c.id = q.chain_id
  LEFT JOIN users u ON u.id = q.created_by
`;

// ── Factions & tiers ─────────────────────────────────────────────────────

export function listFactions() {
  return db.prepare(`SELECT * FROM factions ORDER BY sort_order, id`).all().map(mapFaction);
}

export function getFaction(id) {
  return mapFaction(db.prepare(`SELECT * FROM factions WHERE id = ?`).get(id));
}

const replaceTiers = db.transaction((factionId, tiers) => {
  db.prepare(`DELETE FROM faction_tiers WHERE faction_id = ?`).run(factionId);
  const ins = db.prepare(
    `INSERT INTO faction_tiers (faction_id, nom_palier, seuil, ordre) VALUES (?, ?, ?, ?)`,
  );
  (tiers || []).forEach((t, i) => ins.run(factionId, t.nomPalier || '', Number(t.seuil) || 0, i));
});

export function createFaction(data, userId) {
  const info = db.prepare(`
    INSERT INTO factions (nom, couleur, type, description, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM factions), 0), ?, ?)
  `).run(data.nom, data.couleur || '#c9a8e8', data.type || 'faction', data.description || '', userId, userId);
  replaceTiers(info.lastInsertRowid, data.tiers);
  return getFaction(info.lastInsertRowid);
}

export function updateFaction(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM factions WHERE id = ?`).get(id);
  if (!exists) return null;
  db.prepare(`
    UPDATE factions SET nom = ?, couleur = ?, type = ?, description = ?,
      updated_by = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(data.nom, data.couleur || '#c9a8e8', data.type || 'faction', data.description || '', userId, id);
  if (Array.isArray(data.tiers)) replaceTiers(id, data.tiers);
  return getFaction(id);
}

export function deleteFaction(id) {
  return db.prepare(`DELETE FROM factions WHERE id = ?`).run(id).changes > 0;
}

// ── Chains ───────────────────────────────────────────────────────────────

export function listChains() {
  return db.prepare(`SELECT * FROM quest_chains ORDER BY sort_order, id`).all().map(mapChain);
}

export function createChain(data, userId) {
  const info = db.prepare(`
    INSERT INTO quest_chains (nom, faction_id, description, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM quest_chains), 0), ?, ?)
  `).run(data.nom, data.factionId ?? null, data.description || '', userId, userId);
  return mapChain(db.prepare(`SELECT * FROM quest_chains WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateChain(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM quest_chains WHERE id = ?`).get(id);
  if (!exists) return null;
  db.prepare(`
    UPDATE quest_chains SET nom = ?, faction_id = ?, description = ?,
      updated_by = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(data.nom, data.factionId ?? null, data.description || '', userId, id);
  return mapChain(db.prepare(`SELECT * FROM quest_chains WHERE id = ?`).get(id));
}

export function deleteChain(id) {
  return db.prepare(`DELETE FROM quest_chains WHERE id = ?`).run(id).changes > 0;
}

// Graph of a chain: nodes = quests in the chain + any quest directly linked by
// an edge to one of them (so cross-chain branches are visible), plus the edges.
export function getChainGraph(chainId) {
  const inChain = db.prepare(`${QUEST_SUMMARY_SELECT} WHERE q.chain_id = ? ORDER BY q.chain_rank, q.id`)
    .all(chainId).map(mapQuestSummary);
  if (inChain.length === 0) return { nodes: [], edges: [] };
  const ids = inChain.map((q) => q.id);
  const ph = ids.map(() => '?').join(',');
  const edges = db.prepare(
    `SELECT id, from_quest_id, to_quest_id FROM quest_edges
     WHERE from_quest_id IN (${ph}) OR to_quest_id IN (${ph})`,
  ).all(...ids, ...ids).map((e) => ({ id: e.id, from: e.from_quest_id, to: e.to_quest_id }));

  // Pull in referenced quests that aren't in the chain (branch endpoints).
  const nodeIds = new Set(ids);
  const extra = [];
  for (const e of edges) {
    for (const nid of [e.from, e.to]) {
      if (!nodeIds.has(nid)) { nodeIds.add(nid); extra.push(nid); }
    }
  }
  let externalNodes = [];
  if (extra.length) {
    const eph = extra.map(() => '?').join(',');
    externalNodes = db.prepare(`${QUEST_SUMMARY_SELECT} WHERE q.id IN (${eph})`)
      .all(...extra).map(mapQuestSummary).map((q) => ({ ...q, external: true }));
  }
  return { nodes: [...inChain, ...externalNodes], edges };
}

// ── Quests ───────────────────────────────────────────────────────────────

export function listQuests(filters = {}) {
  const where = [];
  const args = [];
  if (filters.factionId != null) { where.push('q.faction_id = ?'); args.push(filters.factionId); }
  if (filters.chainId != null) { where.push('q.chain_id = ?'); args.push(filters.chainId); }
  if (filters.occurrence) { where.push('q.occurrence_type = ?'); args.push(filters.occurrence); }
  const sql = `${QUEST_SUMMARY_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY q.chain_id IS NULL, q.chain_id, q.chain_rank, q.titre`;
  return db.prepare(sql).all(...args).map(mapQuestSummary);
}

export function getQuest(id) {
  const r = db.prepare(`${QUEST_SUMMARY_SELECT} WHERE q.id = ?`).get(id);
  if (!r) return null;
  const base = mapQuestSummary(r);
  const inputs = db.prepare(`SELECT * FROM quest_inputs WHERE quest_id = ? ORDER BY ordre, id`).all(id).map(mapLine);
  const rewards = db.prepare(`SELECT * FROM quest_rewards WHERE quest_id = ? ORDER BY ordre, id`).all(id).map(mapLine);
  const prerequisites = db.prepare(`SELECT * FROM quest_prerequisites WHERE quest_id = ? ORDER BY ordre, id`).all(id).map(mapPrereq);
  const mapPoints = db.prepare(`SELECT * FROM quest_map_points WHERE quest_id = ? ORDER BY ordre, id`).all(id).map(mapPoint);
  const nextQuests = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type FROM quest_edges e
    JOIN quests q ON q.id = e.to_quest_id WHERE e.from_quest_id = ? ORDER BY q.chain_rank, q.id
  `).all(id).map((q) => ({ id: q.id, titre: q.titre, occurrenceType: q.occurrence_type }));
  const prevQuests = db.prepare(`
    SELECT q.id, q.titre, q.occurrence_type FROM quest_edges e
    JOIN quests q ON q.id = e.from_quest_id WHERE e.to_quest_id = ? ORDER BY q.chain_rank, q.id
  `).all(id).map((q) => ({ id: q.id, titre: q.titre, occurrenceType: q.occurrence_type }));
  return { ...base, inputs, rewards, prerequisites, mapPoints, nextQuests, prevQuests };
}

function replaceInputs(questId, rows) {
  db.prepare(`DELETE FROM quest_inputs WHERE quest_id = ?`).run(questId);
  const ins = db.prepare(`
    INSERT INTO quest_inputs (quest_id, kind, ref_code, faction_id, quantite, label, icon, ordre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (rows || []).forEach((l, i) => ins.run(
    questId, l.kind, l.refCode ?? null, l.factionId ?? null,
    l.quantite ?? null, l.label || '', l.icon ?? null, i,
  ));
}

function replaceRewards(questId, rows) {
  db.prepare(`DELETE FROM quest_rewards WHERE quest_id = ?`).run(questId);
  const ins = db.prepare(`
    INSERT INTO quest_rewards (quest_id, kind, ref_code, faction_id, quantite, unlock_quest_id, label, icon, ordre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (rows || []).forEach((l, i) => ins.run(
    questId, l.kind, l.refCode ?? null, l.factionId ?? null,
    l.quantite ?? null, l.unlockQuestId ?? null, l.label || '', l.icon ?? null, i,
  ));
}

function replacePrereqs(questId, rows) {
  db.prepare(`DELETE FROM quest_prerequisites WHERE quest_id = ?`).run(questId);
  const ins = db.prepare(`
    INSERT INTO quest_prerequisites (quest_id, kind, ref_quest_id, faction_id, tier_id, ref_code, valeur, label, ordre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (rows || []).forEach((p, i) => ins.run(
    questId, p.kind, p.refQuestId ?? null, p.factionId ?? null, p.tierId ?? null,
    p.refCode ?? null, p.valeur ?? null, p.label || '', i,
  ));
}

function replacePoints(questId, rows) {
  db.prepare(`DELETE FROM quest_map_points WHERE quest_id = ?`).run(questId);
  const ins = db.prepare(`
    INSERT INTO quest_map_points (quest_id, label, role, x, y, z, ordre) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  (rows || []).slice(0, 2).forEach((p, i) => ins.run(
    questId, p.label || '', p.role || 'autre', Math.trunc(+p.x || 0), Math.trunc(+p.y || 0), Math.trunc(+p.z || 0), i,
  ));
}

// Unlock edges: derived from the reward lines of kind 'deblocage' (unlockQuestId).
function replaceEdges(questId, rewards) {
  db.prepare(`DELETE FROM quest_edges WHERE from_quest_id = ?`).run(questId);
  const targets = new Set(
    (rewards || [])
      .filter((r) => r.kind === 'deblocage' && r.unlockQuestId)
      .map((r) => Number(r.unlockQuestId))
      .filter((t) => t && t !== questId),
  );
  const ins = db.prepare(`INSERT OR IGNORE INTO quest_edges (from_quest_id, to_quest_id) VALUES (?, ?)`);
  for (const t of targets) ins.run(questId, t);
}

const insertQuestTx = db.transaction((data, userId) => {
  const info = db.prepare(`
    INSERT INTO quests (titre, description, occurrence_type, faction_id, chain_id, chain_rank, due_date, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.titre, data.description || '', data.occurrenceType || 'simple',
    data.factionId ?? null, data.chainId ?? null, Number(data.chainRank) || 0,
    data.dueDate ?? null, userId, userId,
  );
  const id = info.lastInsertRowid;
  replaceInputs(id, data.inputs);
  replaceRewards(id, data.rewards);
  replacePrereqs(id, data.prerequisites);
  replacePoints(id, data.mapPoints);
  replaceEdges(id, data.rewards);
  return id;
});

export function createQuest(data, userId) {
  return getQuest(insertQuestTx(data, userId));
}

const updateQuestTx = db.transaction((id, data, userId) => {
  db.prepare(`
    UPDATE quests SET titre = ?, description = ?, occurrence_type = ?, faction_id = ?,
      chain_id = ?, chain_rank = ?, due_date = ?, updated_by = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    data.titre, data.description || '', data.occurrenceType || 'simple',
    data.factionId ?? null, data.chainId ?? null, Number(data.chainRank) || 0,
    data.dueDate ?? null, userId, id,
  );
  if (Array.isArray(data.inputs)) replaceInputs(id, data.inputs);
  if (Array.isArray(data.rewards)) { replaceRewards(id, data.rewards); replaceEdges(id, data.rewards); }
  if (Array.isArray(data.prerequisites)) replacePrereqs(id, data.prerequisites);
  if (Array.isArray(data.mapPoints)) replacePoints(id, data.mapPoints);
});

export function updateQuest(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM quests WHERE id = ?`).get(id);
  if (!exists) return null;
  updateQuestTx(id, data, userId);
  return getQuest(id);
}

export function deleteQuest(id) {
  return db.prepare(`DELETE FROM quests WHERE id = ?`).run(id).changes > 0;
}

// ── Completion (per member, per current period) ──────────────────────────

function questOccurrence(questId) {
  const r = db.prepare(`SELECT occurrence_type FROM quests WHERE id = ?`).get(questId);
  return r ? r.occurrence_type : null;
}

export function completeQuest(questId, memberId) {
  const occ = questOccurrence(questId);
  if (!occ) return null;
  const periodKey = currentPeriodKey(occ);
  db.prepare(`
    INSERT OR IGNORE INTO quest_completions (quest_id, member_id, period_key) VALUES (?, ?, ?)
  `).run(questId, memberId, periodKey);
  return { questId, periodKey, done: true };
}

export function uncompleteQuest(questId, memberId) {
  const occ = questOccurrence(questId);
  if (!occ) return null;
  const periodKey = currentPeriodKey(occ);
  db.prepare(`
    DELETE FROM quest_completions WHERE quest_id = ? AND member_id = ? AND period_key = ?
  `).run(questId, memberId, periodKey);
  return { questId, periodKey, done: false };
}

// Map of questId → true for quests the member has completed in the *current*
// period. Computed by matching each quest's current period_key.
export function memberCurrentDone(memberId) {
  const rows = db.prepare(`
    SELECT c.quest_id, c.period_key, q.occurrence_type
    FROM quest_completions c JOIN quests q ON q.id = c.quest_id
    WHERE c.member_id = ?
  `).all(memberId);
  const done = {};
  for (const r of rows) {
    if (r.period_key === currentPeriodKey(r.occurrence_type)) done[r.quest_id] = true;
  }
  return done;
}

// Completion history for one quest (all members, most recent first).
export function questHistory(questId, memberId = null) {
  const rows = memberId == null
    ? db.prepare(`
        SELECT c.*, u.name AS member_name FROM quest_completions c
        LEFT JOIN users u ON u.id = c.member_id
        WHERE c.quest_id = ? ORDER BY c.completed_at DESC LIMIT 100
      `).all(questId)
    : db.prepare(`
        SELECT c.*, u.name AS member_name FROM quest_completions c
        LEFT JOIN users u ON u.id = c.member_id
        WHERE c.quest_id = ? AND c.member_id = ? ORDER BY c.completed_at DESC LIMIT 100
      `).all(questId, memberId);
  return rows.map((r) => ({
    id: r.id, questId: r.quest_id, memberId: r.member_id, memberName: r.member_name,
    periodKey: r.period_key, completedAt: r.completed_at,
  }));
}

// ── Potential gains ("si tu fais tout") ──────────────────────────────────
// Aggregates reward lines per occurrence type: total PA and total reputation
// per faction if every quest of that cadence is completed once. No score is
// stored — this is a pure read-time sum documenting the ceiling per period.

export function potentialGains() {
  const out = {};
  for (const occ of ['journaliere', 'hebdomadaire', 'mensuelle', 'simple']) {
    const pa = db.prepare(`
      SELECT COALESCE(SUM(r.quantite), 0) AS n FROM quest_rewards r
      JOIN quests q ON q.id = r.quest_id
      WHERE q.occurrence_type = ? AND r.kind = 'pa'
    `).get(occ).n;
    const reputations = db.prepare(`
      SELECT r.faction_id, f.nom, f.couleur, COALESCE(SUM(r.quantite), 0) AS total
      FROM quest_rewards r
      JOIN quests q ON q.id = r.quest_id
      LEFT JOIN factions f ON f.id = r.faction_id
      WHERE q.occurrence_type = ? AND r.kind = 'reputation' AND r.faction_id IS NOT NULL
      GROUP BY r.faction_id ORDER BY total DESC
    `).all(occ).map((x) => ({ factionId: x.faction_id, nom: x.nom, couleur: x.couleur, total: x.total }));
    const questCount = db.prepare(`SELECT COUNT(*) AS n FROM quests WHERE occurrence_type = ?`).get(occ).n;
    // eslint-disable-next-line security/detect-object-injection -- `occ` iterates a hardcoded occurrence list
    out[occ] = { pa, reputations, questCount };
  }
  return out;
}

// Reputation reference view: every faction with its tiers + the quests that
// grant reputation to it (documenting, not scoring).
export function reputationOverview() {
  const factions = listFactions();
  return factions.map((f) => {
    const quests = db.prepare(`
      SELECT DISTINCT q.id, q.titre, q.occurrence_type, r.quantite
      FROM quest_rewards r JOIN quests q ON q.id = r.quest_id
      WHERE r.kind = 'reputation' AND r.faction_id = ?
      ORDER BY q.titre
    `).all(f.id).map((q) => ({
      id: q.id, titre: q.titre, occurrenceType: q.occurrence_type, quantite: q.quantite,
    }));
    return { ...f, grantingQuests: quests };
  });
}

export { RECURRING };

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
  return { id: r.id, label: r.label, role: r.role, x: r.x, y: r.y, z: r.z, mapId: r.map_id, ordre: r.ordre };
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

// ── Groups (user-defined organizational buckets) ─────────────────────────

function mapGroup(r) {
  if (!r) return null;
  return {
    id: r.id, nom: r.nom, couleur: r.couleur, description: r.description,
    sortOrder: r.sort_order, questCount: r.quest_count ?? undefined,
  };
}

export function listGroups() {
  return db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM quest_group_items i WHERE i.group_id = g.id) AS quest_count
    FROM quest_groups g ORDER BY g.sort_order, g.id
  `).all().map(mapGroup);
}

export function createGroup(data, userId) {
  const info = db.prepare(`
    INSERT INTO quest_groups (nom, couleur, description, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM quest_groups), 0), ?, ?)
  `).run(data.nom, data.couleur || '#c9a8e8', data.description || '', userId, userId);
  return mapGroup(db.prepare(`SELECT * FROM quest_groups WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateGroup(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM quest_groups WHERE id = ?`).get(id);
  if (!exists) return null;
  db.prepare(`
    UPDATE quest_groups SET nom = ?, couleur = ?, description = ?,
      updated_by = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(data.nom, data.couleur || '#c9a8e8', data.description || '', userId, id);
  return mapGroup(db.prepare(`SELECT * FROM quest_groups WHERE id = ?`).get(id));
}

export function deleteGroup(id) {
  return db.prepare(`DELETE FROM quest_groups WHERE id = ?`).run(id).changes > 0;
}

// Groups a single quest belongs to (light: id/nom/couleur for chips).
function groupsForQuest(questId) {
  return db.prepare(`
    SELECT g.id, g.nom, g.couleur FROM quest_group_items i
    JOIN quest_groups g ON g.id = i.group_id
    WHERE i.quest_id = ? ORDER BY g.sort_order, g.id
  `).all(questId);
}

// Batch fetch groups for many quests → { questId: [ {id,nom,couleur} ] }.
function groupsForQuests(ids) {
  if (ids.length === 0) return {};
  const ph = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT i.quest_id, g.id, g.nom, g.couleur FROM quest_group_items i
    JOIN quest_groups g ON g.id = i.group_id
    WHERE i.quest_id IN (${ph}) ORDER BY g.sort_order, g.id
  `).all(...ids);
  const out = {};
  for (const r of rows) {
    (out[r.quest_id] ||= []).push({ id: r.id, nom: r.nom, couleur: r.couleur });
  }
  return out;
}

function replaceGroupItems(questId, groupIds) {
  db.prepare(`DELETE FROM quest_group_items WHERE quest_id = ?`).run(questId);
  const ins = db.prepare(`INSERT OR IGNORE INTO quest_group_items (group_id, quest_id) VALUES (?, ?)`);
  for (const gid of new Set((groupIds || []).map(Number).filter(Boolean))) ins.run(gid, questId);
}

// ── Custom items (objets renommés + enchantements) ───────────────────────
// Un item du codex rebaptisé (ex. « Chair de zombie » → « Chair de noyé »),
// avec une liste libre d'enchantements. Les lignes de quêtes le référencent
// par ref_code = 'custom:<id>'.

function mapCustomItem(r) {
  if (!r) return null;
  let enchantements = [];
  try {
    const parsed = JSON.parse(r.enchantements);
    if (Array.isArray(parsed)) enchantements = parsed.map(String);
  } catch { /* blob illisible → liste vide */ }
  return {
    id: r.id, nom: r.nom, refCode: r.ref_code, enchantements,
    note: r.note, sortOrder: r.sort_order, updatedAt: r.updated_at,
  };
}

const enchantsJson = (list) => JSON.stringify(
  (Array.isArray(list) ? list : [])
    .map((e) => String(e).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20),
);

export function listCustomItems() {
  return db.prepare(`SELECT * FROM quest_custom_items ORDER BY sort_order, id`).all().map(mapCustomItem);
}

export function getCustomItem(id) {
  return mapCustomItem(db.prepare(`SELECT * FROM quest_custom_items WHERE id = ?`).get(id));
}

// Nom custom depuis un ref_code 'custom:<id>' (null si autre forme / inconnu).
export function customItemNameByRef(refCode) {
  const m = /^custom:(\d+)$/.exec(String(refCode || ''));
  if (!m) return null;
  const r = db.prepare(`SELECT nom FROM quest_custom_items WHERE id = ?`).get(Number(m[1]));
  return r ? r.nom : null;
}

export function createCustomItem(data, userId) {
  const info = db.prepare(`
    INSERT INTO quest_custom_items (nom, ref_code, enchantements, note, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM quest_custom_items), 0), ?, ?)
  `).run(
    String(data.nom).trim(), data.refCode || null, enchantsJson(data.enchantements),
    String(data.note || '').trim().slice(0, 500), userId, userId,
  );
  return getCustomItem(info.lastInsertRowid);
}

export function updateCustomItem(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM quest_custom_items WHERE id = ?`).get(id);
  if (!exists) return null;
  db.prepare(`
    UPDATE quest_custom_items SET nom = ?, ref_code = ?, enchantements = ?, note = ?,
      updated_by = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(
    String(data.nom).trim(), data.refCode || null, enchantsJson(data.enchantements),
    String(data.note || '').trim().slice(0, 500), userId, id,
  );
  return getCustomItem(id);
}

export function deleteCustomItem(id) {
  return db.prepare(`DELETE FROM quest_custom_items WHERE id = ?`).run(id).changes > 0;
}

// ── Quests ───────────────────────────────────────────────────────────────

export function listQuests(filters = {}) {
  const where = [];
  const args = [];
  if (filters.factionId != null) { where.push('q.faction_id = ?'); args.push(filters.factionId); }
  if (filters.chainId != null) { where.push('q.chain_id = ?'); args.push(filters.chainId); }
  if (filters.occurrence) { where.push('q.occurrence_type = ?'); args.push(filters.occurrence); }
  if (filters.groupId != null) {
    where.push('q.id IN (SELECT quest_id FROM quest_group_items WHERE group_id = ?)');
    args.push(filters.groupId);
  }
  const sql = `${QUEST_SUMMARY_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY q.chain_id IS NULL, q.chain_id, q.chain_rank, q.titre`;
  const quests = db.prepare(sql).all(...args).map(mapQuestSummary);
  const groups = groupsForQuests(quests.map((q) => q.id));
  return quests.map((q) => ({ ...q, groups: groups[q.id] || [] }));
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
  const groups = groupsForQuest(id);
  return { ...base, inputs, rewards, prerequisites, mapPoints, nextQuests, prevQuests, groups };
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
    INSERT INTO quest_map_points (quest_id, label, role, x, y, z, map_id, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const fallbackMap = defaultMapId();
  (rows || []).slice(0, 2).forEach((p, i) => ins.run(
    questId, p.label || '', p.role || 'autre',
    Math.trunc(+p.x || 0), Math.trunc(+p.y || 0), Math.trunc(+p.z || 0),
    p.mapId ?? fallbackMap, i,
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
  replaceGroupItems(id, data.groupIds);
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
  if (Array.isArray(data.groupIds)) replaceGroupItems(id, data.groupIds);
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

// ── Maps (multiple named worlds/regions, each with its own default view) ──

function mapMap(r) {
  if (!r) return null;
  return {
    id: r.id, nom: r.nom, description: r.description, couleur: r.couleur,
    centerX: r.center_x, centerZ: r.center_z, defaultSpan: r.default_span, sortOrder: r.sort_order,
    imageFilename: r.image_filename || null,
    imageUrl: r.image_filename ? `/api/images/${r.image_filename}` : null,
    imgCenterX: r.img_center_x, imgCenterZ: r.img_center_z, imgSpan: r.img_span,
  };
}

// Extract a stored filename from either a bare UUID or a /api/images/<f> URL.
function imageFilenameOf(v) {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/\/api\/images\/([\w.-]+)$/);
  return m ? m[1] : (/^[\w.-]+$/.test(s) ? s : null);
}

// id of the default (first) map. A NULL map_id on a point/POI resolves here.
export function defaultMapId() {
  const r = db.prepare(`SELECT id FROM quest_maps ORDER BY sort_order, id LIMIT 1`).get();
  return r ? r.id : null;
}

export function listMaps() {
  return db.prepare(`SELECT * FROM quest_maps ORDER BY sort_order, id`).all().map(mapMap);
}

export function createMap(data, userId) {
  const span = Math.max(16, Math.trunc(+data.defaultSpan || 512));
  const info = db.prepare(`
    INSERT INTO quest_maps
      (nom, description, couleur, center_x, center_z, default_span, image_filename, img_center_x, img_center_z, img_span, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM quest_maps), 0), ?, ?)
  `).run(
    data.nom, data.description || '', data.couleur || '#c9a8e8',
    Math.trunc(+data.centerX || 0), Math.trunc(+data.centerZ || 0), span,
    imageFilenameOf(data.imageFilename),
    Math.trunc(+data.imgCenterX || 0), Math.trunc(+data.imgCenterZ || 0), Math.max(16, Math.trunc(+data.imgSpan || span)),
    userId, userId,
  );
  return mapMap(db.prepare(`SELECT * FROM quest_maps WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateMap(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM quest_maps WHERE id = ?`).get(id);
  if (!exists) return null;
  const span = Math.max(16, Math.trunc(+data.defaultSpan || 512));
  db.prepare(`
    UPDATE quest_maps SET nom = ?, description = ?, couleur = ?, center_x = ?, center_z = ?,
      default_span = ?, image_filename = ?, img_center_x = ?, img_center_z = ?, img_span = ?,
      updated_by = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(
    data.nom, data.description || '', data.couleur || '#c9a8e8',
    Math.trunc(+data.centerX || 0), Math.trunc(+data.centerZ || 0), span,
    imageFilenameOf(data.imageFilename),
    Math.trunc(+data.imgCenterX || 0), Math.trunc(+data.imgCenterZ || 0), Math.max(16, Math.trunc(+data.imgSpan || span)),
    userId, id,
  );
  return mapMap(db.prepare(`SELECT * FROM quest_maps WHERE id = ?`).get(id));
}

// Refuses to delete the last remaining map. Points/POIs of the deleted map fall
// back to the default map (FK SET NULL + NULL-resolves-to-default read rule).
export function deleteMap(id) {
  if (db.prepare(`SELECT COUNT(*) AS n FROM quest_maps`).get().n <= 1) return 'last_map';
  return db.prepare(`DELETE FROM quest_maps WHERE id = ?`).run(id).changes > 0;
}

// SQL fragment matching a map column, where the default map also owns NULLs.
function mapWhere(col, mapId) {
  if (mapId != null && mapId === defaultMapId()) return { sql: `(${col} = ? OR ${col} IS NULL)`, args: [mapId] };
  return { sql: `${col} = ?`, args: [mapId] };
}

// ── World map: aggregated quest points + standalone POIs (per map) ────────

export function allQuestMapPoints(mapId) {
  const w = mapWhere('p.map_id', mapId);
  return db.prepare(`
    SELECT p.id, p.quest_id, p.label, p.role, p.x, p.y, p.z, p.map_id,
           q.titre AS quest_titre, f.couleur AS faction_couleur
    FROM quest_map_points p
    JOIN quests q ON q.id = p.quest_id
    LEFT JOIN factions f ON f.id = q.faction_id
    WHERE ${w.sql}
    ORDER BY q.titre, p.ordre
  `).all(...w.args).map((r) => ({
    id: r.id, questId: r.quest_id, questTitre: r.quest_titre, mapId: r.map_id,
    label: r.label, role: r.role, x: r.x, y: r.y, z: r.z, factionCouleur: r.faction_couleur,
  }));
}

function mapPoi(r) {
  if (!r) return null;
  return {
    id: r.id, label: r.label, category: r.category, note: r.note, couleur: r.couleur,
    x: r.x, y: r.y, z: r.z, mapId: r.map_id, createdBy: r.created_by, updatedAt: r.updated_at,
  };
}

export function listPois(mapId) {
  if (mapId == null) return db.prepare(`SELECT * FROM quest_map_pois ORDER BY category, label`).all().map(mapPoi);
  const w = mapWhere('map_id', mapId);
  return db.prepare(`SELECT * FROM quest_map_pois WHERE ${w.sql} ORDER BY category, label`).all(...w.args).map(mapPoi);
}

export function createPoi(data, userId) {
  const mapId = data.mapId ?? defaultMapId();
  const info = db.prepare(`
    INSERT INTO quest_map_pois (label, category, note, couleur, x, y, z, map_id, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.label, data.category || 'autre', data.note || '', data.couleur || '',
    Math.trunc(+data.x || 0), Math.trunc(+data.y || 0), Math.trunc(+data.z || 0), mapId, userId, userId,
  );
  return mapPoi(db.prepare(`SELECT * FROM quest_map_pois WHERE id = ?`).get(info.lastInsertRowid));
}

export function updatePoi(id, data, userId) {
  const exists = db.prepare(`SELECT id FROM quest_map_pois WHERE id = ?`).get(id);
  if (!exists) return null;
  const mapId = data.mapId ?? defaultMapId();
  db.prepare(`
    UPDATE quest_map_pois SET label = ?, category = ?, note = ?, couleur = ?,
      x = ?, y = ?, z = ?, map_id = ?, updated_by = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    data.label, data.category || 'autre', data.note || '', data.couleur || '',
    Math.trunc(+data.x || 0), Math.trunc(+data.y || 0), Math.trunc(+data.z || 0), mapId, userId, id,
  );
  return mapPoi(db.prepare(`SELECT * FROM quest_map_pois WHERE id = ?`).get(id));
}

export function deletePoi(id) {
  return db.prepare(`DELETE FROM quest_map_pois WHERE id = ?`).run(id).changes > 0;
}

// Everything the « Carte » tab needs for one map. Falls back to the default map.
export function worldMap(mapId) {
  const id = mapId != null ? mapId : defaultMapId();
  return { questPoints: allQuestMapPoints(id), pois: listPois(id) };
}

export { RECURRING };

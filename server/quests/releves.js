// Ce qu'on a RÉELLEMENT vu se produire, par opposition à ce qu'on a supposé en
// saisissant les fiches. Deux journaux, une seule idée : le serveur de jeu ne
// publie pas ses tables, donc la mesure prime sur la déclaration.
//
//   1. `quest_reward_observations` — le tirage d'une quête (« j'ai rendu la
//      récolte, j'ai eu 2 géodes »). Les `probabilite` de `quest_rewards` sont
//      tapées à la main faute de mieux ; dès qu'il y a des relevés, ce sont eux
//      qui pilotent l'affichage et les gains potentiels.
//   2. `quest_rotation_draws` — la quête qui EST sortie aujourd'hui dans une
//      rotation (« la Fédération des Marchands a demandé Ape Atoll »). Dix
//      quêtes déclarées, une seule proposée par jour : sans relevé, la liste
//      annonce dix livraisons à faire.
//
// Mêmes conventions que le reste du module : snake_case en base, camelCase en
// sortie, agrégats en GROUP BY (jamais une requête par ligne), et les taux
// (intervalle de Wilson compris) se calculent CÔTÉ CLIENT à partir des comptes
// bruts renvoyés ici — la fonction est pure et testée là-bas.

import { db } from '../db.js';
import { currentPeriodKey, nextResetAt } from './period.js';

// ── 1. Journal de tirage des récompenses ──────────────────────────────────

/**
 * Clé d'identité d'un résultat de tirage. Une ligne de récompense déclarée est
 * identifiée par son id ; un résultat obtenu hors liste l'est par son libellé
 * normalisé, sinon « Rien » et « rien » compteraient pour deux.
 */
export const drawKey = (rewardId, label) => (
  rewardId != null ? `reward:${rewardId}` : `libre:${normLabel(label)}`
);

const normLabel = (v) => String(v || '')
  .trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Agrégat des tirages d'une quête : total et répartition par résultat.
 * `parResultat` porte la même forme que le résumé des ouvertures de contenant
 * (`key` / `label` / `n` / `quantiteTotale`) pour que le croisement côté client
 * soit le MÊME code dans les deux cas.
 */
export function drawSummary(questId) {
  const rows = db.prepare(`
    SELECT o.reward_id, o.label, COUNT(*) AS n, SUM(o.quantite) AS qte,
           r.label AS reward_label, r.kind AS reward_kind
    FROM quest_reward_observations o
    LEFT JOIN quest_rewards r ON r.id = o.reward_id
    WHERE o.quest_id = ?
    GROUP BY o.reward_id, CASE WHEN o.reward_id IS NULL THEN lower(o.label) ELSE '' END
  `).all(questId);
  // Le regroupement final se fait sur `drawKey`, pas sur le lower() de SQLite :
  // « Rien » et « rien » y tombent déjà ensemble, mais pas « Géode » et
  // « géode » (les accents), et deux clés identiques dans `parResultat`
  // feraient compter deux fois le même résultat côté client.
  const parCle = new Map();
  for (const r of rows) {
    const key = drawKey(r.reward_id, r.label);
    if (!parCle.has(key)) {
      parCle.set(key, {
        key,
        rewardId: r.reward_id ?? null,
        // Le libellé de la ligne déclarée gagne quand elle existe encore :
        // elle a pu être renommée depuis le relevé.
        label: r.reward_label || r.label || r.reward_kind || '',
        n: 0,
        quantiteTotale: 0,
      });
    }
    const agg = parCle.get(key);
    agg.n += r.n;
    agg.quantiteTotale += r.qte ?? 0;
  }
  const parResultat = [...parCle.values()].sort((a, b) => b.n - a.n);
  return { total: parResultat.reduce((s, r) => s + r.n, 0), parResultat };
}

/** Les N derniers tirages relevés (fil d'activité de la fiche). */
export function listDraws(questId, limit = 50) {
  return db.prepare(`
    SELECT o.*, u.name AS member_name, r.label AS reward_label
    FROM quest_reward_observations o
    LEFT JOIN users u ON u.id = o.member_id
    LEFT JOIN quest_rewards r ON r.id = o.reward_id
    WHERE o.quest_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT ?
  `).all(questId, limit).map((r) => ({
    id: r.id,
    questId: r.quest_id,
    rewardId: r.reward_id ?? null,
    label: r.reward_label || r.label || '',
    quantite: r.quantite,
    memberId: r.member_id,
    memberName: r.member_name,
    createdAt: r.created_at,
  }));
}

export function addDraw(questId, data, memberId) {
  // Une ligne de récompense d'UNE AUTRE quête ne peut pas être le résultat de
  // celle-ci : on retombe alors sur un résultat libre plutôt que de mentir sur
  // le rattachement.
  const rewardId = data.rewardId == null || data.rewardId === '' ? null : Number(data.rewardId);
  const valide = rewardId != null && db.prepare(
    `SELECT id FROM quest_rewards WHERE id = ? AND quest_id = ?`,
  ).get(rewardId, questId);
  const info = db.prepare(`
    INSERT INTO quest_reward_observations (quest_id, reward_id, label, quantite, member_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    questId,
    valide ? rewardId : null,
    String(data.label || '').trim().slice(0, 120),
    Math.max(1, Math.trunc(+data.quantite || 1)),
    memberId,
  );
  return db.prepare(`SELECT id, member_id AS memberId FROM quest_reward_observations WHERE id = ?`)
    .get(info.lastInsertRowid);
}

export function getDraw(id) {
  return db.prepare(`
    SELECT id, quest_id AS questId, member_id AS memberId FROM quest_reward_observations WHERE id = ?
  `).get(id);
}

export function deleteDraw(id) {
  return db.prepare(`DELETE FROM quest_reward_observations WHERE id = ?`).run(id).changes > 0;
}

/**
 * Remise à zéro du journal de tirage d'une quête — le cas « le serveur a
 * changé les récompenses ». `memberId` non nul = seulement ses propres relevés.
 * Les lignes de récompense DÉCLARÉES ne sont jamais touchées : c'est
 * l'observation qui est périmée, pas la fiche.
 */
export function clearDraws(questId, memberId = null) {
  return memberId == null
    ? db.prepare(`DELETE FROM quest_reward_observations WHERE quest_id = ?`).run(questId).changes
    : db.prepare(`DELETE FROM quest_reward_observations WHERE quest_id = ? AND member_id = ?`)
      .run(questId, memberId).changes;
}

// ── 2. Rotations ──────────────────────────────────────────────────────────

/** Les groupes marqués « rotation », avec la cadence de leur tirage. */
export function listRotationGroups() {
  return db.prepare(`
    SELECT id, nom, couleur, description, rotation_occurrence, rotation_pnj, rotation_partagee
    FROM quest_groups WHERE rotation = 1 AND owner_id IS NULL ORDER BY sort_order, id
  `).all().map((g) => ({
    id: g.id,
    nom: g.nom,
    couleur: g.couleur,
    description: g.description,
    occurrence: g.rotation_occurrence || 'journaliere',
    pnj: g.rotation_pnj || '',
    partagee: !!g.rotation_partagee,
  }));
}

export function getRotationGroup(groupId) {
  return listRotationGroups().find((g) => g.id === Number(groupId)) || null;
}

const rotationQuests = (groupId) => db.prepare(`
  SELECT q.id, q.titre, q.occurrence_type, f.nom AS faction_nom, f.couleur AS faction_couleur
  FROM quest_group_items i
  JOIN quests q ON q.id = i.quest_id
  LEFT JOIN factions f ON f.id = q.faction_id
  WHERE i.group_id = ? ORDER BY q.titre
`).all(groupId).map((q) => ({
  id: q.id, titre: q.titre, occurrenceType: q.occurrence_type,
  factionNom: q.faction_nom, factionCouleur: q.faction_couleur,
}));

/** Tous les relevés d'une rotation, du plus récent au plus ancien. */
function rotationRows(groupId) {
  return db.prepare(`
    SELECT d.*, q.titre, u.name AS member_name
    FROM quest_rotation_draws d
    JOIN quests q ON q.id = d.quest_id
    LEFT JOIN users u ON u.id = d.member_id
    WHERE d.group_id = ? ORDER BY d.created_at DESC, d.id DESC
  `).all(groupId);
}

/**
 * Statistiques d'une rotation : combien de fois chaque quête est sortie.
 *
 * En rotation PARTAGÉE, une période ne vaut qu'UNE observation quelle que
 * soit le nombre de membres qui l'ont relevée — sinon une journée notée par
 * trois personnes pèserait trois fois. Quand deux membres rapportent des
 * quêtes différentes pour la même période, la période est comptée pour la
 * quête majoritaire et signalée dans `conflits` : c'est un désaccord à
 * trancher, pas une donnée à moyenner en silence.
 */
export function rotationStats(groupId, partagee = true) {
  const rows = rotationRows(groupId);
  const parQuete = new Map();
  const conflits = [];
  let total = 0;

  const compte = (questId, titre, n = 1) => {
    if (!parQuete.has(questId)) parQuete.set(questId, { questId, titre, n: 0 });
    parQuete.get(questId).n += n;
  };

  if (partagee) {
    const parPeriode = new Map();
    for (const r of rows) {
      if (!parPeriode.has(r.period_key)) parPeriode.set(r.period_key, []);
      parPeriode.get(r.period_key).push(r);
    }
    for (const [periodKey, liste] of parPeriode) {
      const votes = new Map();
      for (const r of liste) votes.set(r.quest_id, (votes.get(r.quest_id) || 0) + 1);
      const [gagnant] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
      if (votes.size > 1) {
        conflits.push({
          periodKey,
          quetes: [...votes.keys()].map((id) => liste.find((r) => r.quest_id === id).titre),
        });
      }
      compte(gagnant[0], liste.find((r) => r.quest_id === gagnant[0]).titre);
      total += 1;
    }
  } else {
    for (const r of rows) { compte(r.quest_id, r.titre); total += 1; }
  }

  const quetes = rotationQuests(groupId);
  // Les quêtes jamais tirées font partie du résultat : « 0 fois sur 40 » dit
  // qu'elle n'est peut-être pas dans la rotation, et c'est une information.
  for (const q of quetes) if (!parQuete.has(q.id)) compte(q.id, q.titre, 0);

  return {
    total,
    conflits,
    parQuete: [...parQuete.values()]
      .map((x) => ({ ...x, p: total > 0 ? (x.n / total) * 100 : 0 }))
      .sort((a, b) => b.n - a.n || a.titre.localeCompare(b.titre, 'fr')),
  };
}

// La ligne la plus rapportée d'un lot (à égalité : la plus ancienne, qui est
// aussi la première de `rows`).
function majoritaire(rows) {
  const votes = new Map();
  for (const r of rows) votes.set(r.quest_id, (votes.get(r.quest_id) || 0) + 1);
  let meilleur = rows[0];
  let max = 0;
  for (const r of rows) {
    const n = votes.get(r.quest_id);
    if (n > max) { max = n; meilleur = r; }
  }
  return meilleur;
}

/** Le tirage relevé pour la période courante (le plus rapporté en partagé). */
export function currentDraw(group, memberId = null) {
  const periodKey = currentPeriodKey(group.occurrence);
  const rows = db.prepare(`
    SELECT d.*, q.titre, u.name AS member_name
    FROM quest_rotation_draws d
    JOIN quests q ON q.id = d.quest_id
    LEFT JOIN users u ON u.id = d.member_id
    WHERE d.group_id = ? AND d.period_key = ?
    ORDER BY d.created_at
  `).all(group.id, periodKey);
  if (rows.length === 0) return null;
  // Rotation personnelle : c'est SON tirage qui compte, pas celui du voisin.
  // Rotation partagée : le tirage majoritaire, comme dans la statistique — à
  // égalité, le premier relevé.
  const retenue = group.partagee ? majoritaire(rows) : rows.find((r) => r.member_id === memberId);
  if (!retenue) return null;
  return {
    questId: retenue.quest_id,
    titre: retenue.titre,
    memberName: retenue.member_name,
    createdAt: retenue.created_at,
    // Un désaccord entre membres se voit, il ne se lisse pas.
    desaccord: group.partagee && new Set(rows.map((r) => r.quest_id)).size > 1,
  };
}

/** Relève le tirage de la période courante (remplace le sien s'il existe). */
export function setDraw(group, questId, memberId) {
  const dansLeGroupe = db.prepare(
    `SELECT quest_id FROM quest_group_items WHERE group_id = ? AND quest_id = ?`,
  ).get(group.id, questId);
  if (!dansLeGroupe) return null;
  const periodKey = currentPeriodKey(group.occurrence);
  db.prepare(`
    INSERT INTO quest_rotation_draws (group_id, quest_id, period_key, member_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (group_id, period_key, member_id)
      DO UPDATE SET quest_id = excluded.quest_id, created_at = strftime('%s','now')
  `).run(group.id, questId, periodKey, memberId);
  return { groupId: group.id, questId, periodKey };
}

/** Annule son propre relevé pour la période courante. */
export function clearCurrentDraw(group, memberId) {
  return db.prepare(`
    DELETE FROM quest_rotation_draws WHERE group_id = ? AND period_key = ? AND member_id = ?
  `).run(group.id, currentPeriodKey(group.occurrence), memberId).changes > 0;
}

/**
 * Vue complète d'une rotation pour l'écran : le tirage du jour, la liste des
 * quêtes possibles, les fréquences relevées et le prochain reset.
 */
export function rotationView(group, memberId = null) {
  return {
    ...group,
    periodKey: currentPeriodKey(group.occurrence),
    nextResetAt: nextResetAt(group.occurrence),
    quetes: rotationQuests(group.id),
    tirage: currentDraw(group, memberId),
    stats: rotationStats(group.id, group.partagee),
    historique: rotationRows(group.id).slice(0, 30).map((r) => ({
      id: r.id,
      questId: r.quest_id,
      titre: r.titre,
      periodKey: r.period_key,
      memberName: r.member_name,
      createdAt: r.created_at,
    })),
  };
}

export function listRotations(memberId = null) {
  return listRotationGroups().map((g) => rotationView(g, memberId));
}

/**
 * Rotations auxquelles appartient chaque quête d'un lot, avec le tirage courant
 * — de quoi marquer les cartes de la liste (« c'est celle du jour ») sans une
 * requête par quête. Renvoie { questId: [{ groupId, nom, couleur, duJour }] }.
 */
export function rotationsForQuests(questIds, memberId = null) {
  if (!questIds || questIds.length === 0) return {};
  const groupes = listRotationGroups();
  if (groupes.length === 0) return {};
  const tirages = new Map(groupes.map((g) => [g.id, currentDraw(g, memberId)]));
  const ph = questIds.map(() => '?').join(',');
  const gh = groupes.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT quest_id, group_id FROM quest_group_items
    WHERE quest_id IN (${ph}) AND group_id IN (${gh})
  `).all(...questIds, ...groupes.map((g) => g.id));
  const out = {};
  for (const r of rows) {
    const g = groupes.find((x) => x.id === r.group_id);
    const tirage = tirages.get(r.group_id);
    (out[r.quest_id] ||= []).push({
      groupId: g.id,
      nom: g.nom,
      couleur: g.couleur,
      pnj: g.pnj,
      // null = personne n'a encore relevé le tirage de la période.
      duJour: tirage ? tirage.questId === r.quest_id : null,
    });
  }
  return out;
}

// Catalogue d'items uniques : accès données (better-sqlite3, mêmes conventions
// que quests/store.js — colonnes snake_case en entrée, objets camelCase en
// sortie, enfants remplacés en bloc dans une transaction à l'écriture).
//
// L'entité vit dans `quest_custom_items`, promue en catalogue : un item unique
// EST l'ancien « item custom », d'où la référence inchangée `custom:<id>` dans
// les lignes de quêtes. Toute la page « Où trouver quoi » est DÉRIVÉE de ces
// références — rien n'y est ressaisi à la main, sauf les sources manuelles.

import { codexNameById } from '../codex.js';
import { db } from '../db.js';
import { uniqueSlug } from '../slugify.js';

// Référence d'un item unique dans une ligne de quête / d'offre.
export const uniqueRef = (id) => `custom:${id}`;
export const parseUniqueRef = (ref) => {
  const m = /^custom:(\d+)$/.exec(String(ref || ''));
  return m ? Number(m[1]) : null;
};

const parseList = (blob) => {
  try {
    const parsed = JSON.parse(blob);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; /* blob illisible → liste vide */ }
};

export const listJson = (list, { max = 20, len = 80 } = {}) => JSON.stringify(
  (Array.isArray(list) ? list : [])
    .map((e) => String(e).trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max),
);

// ── Raretés ───────────────────────────────────────────────────────────────

function mapRarity(r) {
  if (!r) return null;
  return { id: r.id, nom: r.nom, couleur: r.couleur, ordre: r.ordre };
}

export function listRarities() {
  return db.prepare(`SELECT * FROM unique_item_rarities ORDER BY ordre, id`).all().map(mapRarity);
}

export function createRarity(data, userId) {
  const info = db.prepare(`
    INSERT INTO unique_item_rarities (nom, couleur, ordre, created_by, updated_by)
    VALUES (?, ?, COALESCE((SELECT MAX(ordre)+1 FROM unique_item_rarities), 1), ?, ?)
  `).run(String(data.nom).trim().slice(0, 60), data.couleur || '#c9a8e8', userId, userId);
  return mapRarity(db.prepare(`SELECT * FROM unique_item_rarities WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateRarity(id, data, userId) {
  if (!db.prepare(`SELECT id FROM unique_item_rarities WHERE id = ?`).get(id)) return null;
  db.prepare(`
    UPDATE unique_item_rarities SET nom = ?, couleur = ?, ordre = COALESCE(?, ordre),
      updated_by = ?, updated_at = strftime('%s','now') WHERE id = ?
  `).run(
    String(data.nom).trim().slice(0, 60), data.couleur || '#c9a8e8',
    data.ordre == null ? null : Math.trunc(+data.ordre) || 0, userId, id,
  );
  return mapRarity(db.prepare(`SELECT * FROM unique_item_rarities WHERE id = ?`).get(id));
}

// Les items gardent leur ligne (rarete_id → NULL par la FK).
export function deleteRarity(id) {
  return db.prepare(`DELETE FROM unique_item_rarities WHERE id = ?`).run(id).changes > 0;
}

/** Réordonne l'échelle d'un coup (liste d'ids dans l'ordre voulu). */
export function reorderRarities(ids, userId) {
  const upd = db.prepare(`UPDATE unique_item_rarities SET ordre = ?, updated_by = ? WHERE id = ?`);
  db.transaction(() => {
    (ids || []).forEach((id, i) => upd.run(i + 1, userId, Number(id)));
  })();
  return listRarities();
}

// ── Items uniques ─────────────────────────────────────────────────────────

// Garde les clés historiques (`refCode`, `note`) : /quests/custom-items et
// customCatalogEntries() côté front s'appuient dessus. Les nouveaux champs
// s'ajoutent à côté, jamais en remplacement.
function mapItem(r) {
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug || null,
    nom: r.nom,
    refCode: r.ref_code,          // = baseItemId (item support du codex)
    baseItemId: r.ref_code,
    baseNom: codexNameById(r.ref_code),
    iconeOverride: r.icone_override || null,
    lore: r.lore || '',
    rareteId: r.rarete_id ?? null,
    rarete: r.rarete_nom ? { id: r.rarete_id, nom: r.rarete_nom, couleur: r.rarete_couleur, ordre: r.rarete_ordre } : null,
    categorie: r.categorie || 'autre',
    factionId: r.faction_id ?? null,
    factionNom: r.faction_nom ?? null,
    factionCouleur: r.faction_couleur ?? null,
    estVendable: !!r.est_vendable,
    prixVente: r.prix_vente ?? null,
    prixUnite: r.prix_unite || 'pa',
    estOuvrable: !!r.est_ouvrable,
    enchantements: parseList(r.enchantements),
    stats: parseList(r.stats),
    tags: parseList(r.tags),
    note: r.note || '',
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

const ITEM_SELECT = `
  SELECT i.*, ra.nom AS rarete_nom, ra.couleur AS rarete_couleur, ra.ordre AS rarete_ordre,
         f.nom AS faction_nom, f.couleur AS faction_couleur
  FROM quest_custom_items i
  LEFT JOIN unique_item_rarities ra ON ra.id = i.rarete_id
  LEFT JOIN factions f ON f.id = i.faction_id
`;

/**
 * Catalogue complet + compteurs de sources/usages. Les compteurs sont calculés
 * en 6 requêtes agrégées (GROUP BY sur tout le catalogue), jamais une requête
 * par item : la page tient sans effort avec quelques centaines d'items.
 */
export function listUniqueItems() {
  const items = db.prepare(`${ITEM_SELECT} ORDER BY i.sort_order, i.id`).all().map(mapItem);
  if (items.length === 0) return [];

  const counts = new Map();
  const add = (id, key, n) => {
    if (id == null || !Number.isFinite(n)) return;
    if (!counts.has(id)) counts.set(id, { sources: 0, usages: 0, loot: 0, ouvertures: 0 });
    // eslint-disable-next-line security/detect-object-injection -- `key` vient des appels internes ci-dessous, jamais du client
    counts.get(id)[key] += n;
  };
  // Agrégats groupés par `ref_code = 'custom:<id>'` → compteur par item.
  const addByRef = (rows, key) => {
    for (const r of rows) add(parseUniqueRef(r.ref), key, r.n);
  };
  const addById = (rows, key) => {
    for (const r of rows) add(r.id, key, r.n);
  };

  // Sources : récompense de quête (crafts inclus), contenu de contenant, achat,
  // source manuelle.
  addByRef(db.prepare(`
    SELECT ref_code AS ref, COUNT(*) AS n FROM quest_rewards
    WHERE kind = 'item' AND ref_code LIKE 'custom:%' GROUP BY ref_code
  `).all(), 'sources');
  addById(db.prepare(`
    SELECT resultat_unique_id AS id, COUNT(*) AS n FROM loot_entries
    WHERE resultat_unique_id IS NOT NULL GROUP BY resultat_unique_id
  `).all(), 'sources');
  addByRef(db.prepare(`
    SELECT ref_code AS ref, COUNT(*) AS n FROM quest_offer_lines
    WHERE sens = 'recoit' AND ref_code LIKE 'custom:%' GROUP BY ref_code
  `).all(), 'sources');
  addById(db.prepare(`
    SELECT unique_item_id AS id, COUNT(*) AS n FROM unique_item_sources GROUP BY unique_item_id
  `).all(), 'sources');

  // Usages : entrée de quête (ingrédients de craft inclus) et monnaie d'échange.
  addByRef(db.prepare(`
    SELECT ref_code AS ref, COUNT(*) AS n FROM quest_inputs
    WHERE kind = 'item' AND ref_code LIKE 'custom:%' GROUP BY ref_code
  `).all(), 'usages');
  addByRef(db.prepare(`
    SELECT ref_code AS ref, COUNT(*) AS n FROM quest_offer_lines
    WHERE sens = 'donne' AND ref_code LIKE 'custom:%' GROUP BY ref_code
  `).all(), 'usages');

  // Taille de la table de butin + nombre d'ouvertures loguées (contenants).
  addById(db.prepare(`
    SELECT unique_item_id AS id, COUNT(*) AS n FROM loot_entries GROUP BY unique_item_id
  `).all(), 'loot');
  addById(db.prepare(`
    SELECT unique_item_id AS id, COUNT(*) AS n FROM loot_observations GROUP BY unique_item_id
  `).all(), 'ouvertures');

  const zero = { sources: 0, usages: 0, loot: 0, ouvertures: 0 };
  return items.map((it) => ({ ...it, counts: counts.get(it.id) || zero }));
}

export function getUniqueItemRow(id) {
  return mapItem(db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id));
}

/** Fiche complète : item + table de butin + sources manuelles + observations. */
export function getUniqueItem(id) {
  const item = getUniqueItemRow(id);
  if (!item) return null;
  return {
    ...item,
    loot: listLoot(id),
    sourcesManuelles: listManualSources(id),
    observations: observationSummary(id),
  };
}

export function uniqueItemExists(id) {
  return !!db.prepare(`SELECT id FROM quest_custom_items WHERE id = ?`).get(id);
}

export function rarityExists(id) {
  return !!db.prepare(`SELECT id FROM unique_item_rarities WHERE id = ?`).get(id);
}

export function factionExists(id) {
  return !!db.prepare(`SELECT id FROM factions WHERE id = ?`).get(id);
}

// Champs scalaires d'un item, partagés création/mise à jour.
function itemColumns(data) {
  return [
    String(data.nom).trim().slice(0, 120),
    data.refCode || data.baseItemId || null,
    String(data.lore || '').slice(0, 2000),
    data.rareteId ?? null,
    String(data.categorie || 'autre'),
    data.factionId ?? null,
    data.iconeOverride || null,
    data.estVendable ? 1 : 0,
    data.prixVente == null || data.prixVente === '' ? null : Number(data.prixVente),
    String(data.prixUnite || 'pa'),
    data.estOuvrable ? 1 : 0,
    listJson(data.enchantements),
    listJson(data.stats),
    listJson(data.tags, { max: 20, len: 40 }),
    String(data.note || '').trim().slice(0, 4000),
  ];
}

const createItemTx = db.transaction((data, userId) => {
  const slug = uniqueSlug('quest_custom_items', data.slug || data.nom);
  const info = db.prepare(`
    INSERT INTO quest_custom_items
      (nom, ref_code, lore, rarete_id, categorie, faction_id, icone_override,
       est_vendable, prix_vente, prix_unite, est_ouvrable, enchantements, stats, tags, note,
       slug, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, COALESCE((SELECT MAX(sort_order)+1 FROM quest_custom_items), 0), ?, ?)
  `).run(...itemColumns(data), slug, userId, userId);
  const id = info.lastInsertRowid;
  if (Array.isArray(data.loot)) replaceLoot(id, data.loot);
  if (Array.isArray(data.sourcesManuelles)) replaceManualSources(id, data.sourcesManuelles);
  return id;
});

export function createUniqueItem(data, userId) {
  return getUniqueItem(createItemTx(data, userId));
}

const updateItemTx = db.transaction((id, data, userId) => {
  // Le slug ne suit PAS le renommage : c'est une adresse stable (liens partagés).
  const current = db.prepare(`SELECT slug FROM quest_custom_items WHERE id = ?`).get(id);
  const slug = data.slug
    ? uniqueSlug('quest_custom_items', data.slug, { excludeId: id })
    : (current?.slug || uniqueSlug('quest_custom_items', data.nom, { excludeId: id }));
  db.prepare(`
    UPDATE quest_custom_items SET nom = ?, ref_code = ?, lore = ?, rarete_id = ?, categorie = ?,
      faction_id = ?, icone_override = ?, est_vendable = ?, prix_vente = ?, prix_unite = ?,
      est_ouvrable = ?, enchantements = ?, stats = ?, tags = ?, note = ?,
      slug = ?, updated_by = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(...itemColumns(data), slug, userId, id);
  if (Array.isArray(data.loot)) replaceLoot(id, data.loot);
  if (Array.isArray(data.sourcesManuelles)) replaceManualSources(id, data.sourcesManuelles);
});

export function updateUniqueItem(id, data, userId) {
  if (!uniqueItemExists(id)) return null;
  updateItemTx(id, data, userId);
  return getUniqueItem(id);
}

export function deleteUniqueItem(id) {
  return db.prepare(`DELETE FROM quest_custom_items WHERE id = ?`).run(id).changes > 0;
}

// ── Table de butin ────────────────────────────────────────────────────────

function mapLoot(r) {
  const label = r.label_affiche
    || (r.resultat_unique_id ? r.cible_nom : null)
    || codexNameById(r.resultat_ref)
    || r.resultat_ref
    || '';
  return {
    id: r.id,
    uniqueItemId: r.unique_item_id,
    resultatType: r.resultat_type,
    resultatRef: r.resultat_ref,
    resultatUniqueId: r.resultat_unique_id ?? null,
    factionId: r.faction_id ?? null,
    labelAffiche: r.label_affiche || '',
    label,
    // Prix/rareté de la cible : de quoi calculer l'espérance côté client sans
    // aller rechercher chaque item unique un par un.
    ciblePrix: r.cible_prix ?? null,
    ciblePrixUnite: r.cible_prix_unite ?? null,
    cibleRareteCouleur: r.cible_rarete_couleur ?? null,
    quantiteMin: r.quantite_min,
    quantiteMax: r.quantite_max,
    probabilite: r.probabilite,
    probabiliteSource: r.probabilite_source,
    ordre: r.ordre,
  };
}

export function listLoot(uniqueItemId) {
  return db.prepare(`
    SELECT l.*, c.nom AS cible_nom, c.prix_vente AS cible_prix, c.prix_unite AS cible_prix_unite,
           ra.couleur AS cible_rarete_couleur
    FROM loot_entries l
    LEFT JOIN quest_custom_items c ON c.id = l.resultat_unique_id
    LEFT JOIN unique_item_rarities ra ON ra.id = c.rarete_id
    WHERE l.unique_item_id = ? ORDER BY l.ordre, l.id
  `).all(uniqueItemId).map(mapLoot);
}

function replaceLoot(uniqueItemId, rows) {
  db.prepare(`DELETE FROM loot_entries WHERE unique_item_id = ?`).run(uniqueItemId);
  const ins = db.prepare(`
    INSERT INTO loot_entries
      (unique_item_id, resultat_type, resultat_ref, resultat_unique_id, faction_id,
       label_affiche, quantite_min, quantite_max, probabilite, probabilite_source, ordre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (rows || []).forEach((l, i) => {
    const type = l.resultatType || 'item_referentiel';
    // Un résultat « item unique » peut arriver sous forme de ref 'custom:<id>'
    // (le picker renvoie ça) : on normalise vers la FK, seule source de vérité.
    const uid = type === 'unique_item'
      ? (l.resultatUniqueId ?? parseUniqueRef(l.resultatRef))
      : null;
    ins.run(
      uniqueItemId, type,
      type === 'unique_item' ? null : (l.resultatRef ?? null),
      uid ?? null,
      l.factionId ?? null,
      String(l.labelAffiche || '').slice(0, 120),
      Math.max(0, Math.trunc(+l.quantiteMin || 0)) || 1,
      Math.max(0, Math.trunc(+l.quantiteMax || 0)) || 1,
      Math.min(100, Math.max(0, Number(l.probabilite) || 0)),
      l.probabiliteSource || 'estimee',
      i,
    );
  });
}

/**
 * Un contenant ne doit pas pouvoir se contenir lui-même, directement ou via une
 * chaîne d'ouvertures. Parcours en profondeur du graphe contenant → résultats,
 * en tenant compte des lignes CANDIDATES (pas encore écrites).
 * Renvoie true si `candidates` introduirait un cycle.
 */
export function lootWouldCycle(containerId, candidates) {
  const targets = (candidates || [])
    .filter((l) => (l.resultatType || 'item_referentiel') === 'unique_item')
    .map((l) => l.resultatUniqueId ?? parseUniqueRef(l.resultatRef))
    .filter((x) => Number.isFinite(x));
  if (targets.length === 0) return false;
  if (targets.includes(Number(containerId))) return true;

  const childrenOf = db.prepare(`
    SELECT resultat_unique_id AS id FROM loot_entries
    WHERE unique_item_id = ? AND resultat_unique_id IS NOT NULL
  `);
  const seen = new Set([Number(containerId)]);
  const stack = [...targets];
  while (stack.length) {
    const node = stack.pop();
    if (node === Number(containerId)) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const r of childrenOf.all(node)) stack.push(r.id);
  }
  return false;
}

// ── Journal d'ouvertures ──────────────────────────────────────────────────

// Clé d'identité d'un résultat, pour regrouper observations et lignes déclarées.
const resultKey = (type, ref, uniqueId) => (
  type === 'unique_item' ? `unique:${uniqueId}`
    : type === 'item_referentiel' ? `item:${ref || ''}`
      : `${type}:${ref || ''}`
);

export const lootResultKey = resultKey;

/**
 * Agrégat des ouvertures d'un contenant : total et répartition par résultat.
 * L'intervalle de confiance est calculé CÔTÉ CLIENT (fonction pure testable) —
 * ici on ne renvoie que les comptes bruts.
 */
export function observationSummary(uniqueItemId) {
  const rows = db.prepare(`
    SELECT o.resultat_type, o.resultat_ref, o.resultat_unique_id, o.label_affiche,
           COUNT(*) AS n, SUM(o.quantite) AS qte, c.nom AS cible_nom
    FROM loot_observations o
    LEFT JOIN quest_custom_items c ON c.id = o.resultat_unique_id
    WHERE o.unique_item_id = ?
    GROUP BY o.resultat_type, o.resultat_ref, o.resultat_unique_id
    ORDER BY n DESC
  `).all(uniqueItemId);
  const total = rows.reduce((s, r) => s + r.n, 0);
  return {
    total,
    parResultat: rows.map((r) => ({
      key: resultKey(r.resultat_type, r.resultat_ref, r.resultat_unique_id),
      resultatType: r.resultat_type,
      resultatRef: r.resultat_ref,
      resultatUniqueId: r.resultat_unique_id ?? null,
      label: r.label_affiche || r.cible_nom || codexNameById(r.resultat_ref) || r.resultat_ref || '',
      n: r.n,
      quantiteTotale: r.qte ?? 0,
    })),
  };
}

/** Les N dernières ouvertures loguées (fil d'activité de la fiche). */
export function listObservations(uniqueItemId, limit = 50) {
  return db.prepare(`
    SELECT o.*, u.name AS member_name, c.nom AS cible_nom
    FROM loot_observations o
    LEFT JOIN users u ON u.id = o.member_id
    LEFT JOIN quest_custom_items c ON c.id = o.resultat_unique_id
    WHERE o.unique_item_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT ?
  `).all(uniqueItemId, limit).map((r) => ({
    id: r.id,
    uniqueItemId: r.unique_item_id,
    lootEntryId: r.loot_entry_id ?? null,
    resultatType: r.resultat_type,
    resultatRef: r.resultat_ref,
    resultatUniqueId: r.resultat_unique_id ?? null,
    label: r.label_affiche || r.cible_nom || codexNameById(r.resultat_ref) || r.resultat_ref || '',
    quantite: r.quantite,
    memberId: r.member_id,
    memberName: r.member_name,
    createdAt: r.created_at,
  }));
}

export function addObservation(uniqueItemId, data, memberId) {
  const type = data.resultatType || 'item_referentiel';
  const uid = type === 'unique_item'
    ? (data.resultatUniqueId ?? parseUniqueRef(data.resultatRef))
    : null;
  const info = db.prepare(`
    INSERT INTO loot_observations
      (unique_item_id, loot_entry_id, resultat_type, resultat_ref, resultat_unique_id,
       label_affiche, quantite, member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uniqueItemId,
    data.lootEntryId ?? null,
    type,
    type === 'unique_item' ? null : (data.resultatRef ?? null),
    uid ?? null,
    String(data.labelAffiche || '').slice(0, 120),
    Math.max(1, Math.trunc(+data.quantite || 1)),
    memberId,
  );
  return db.prepare(`SELECT id, member_id FROM loot_observations WHERE id = ?`).get(info.lastInsertRowid);
}

export function getObservation(id) {
  return db.prepare(`SELECT id, unique_item_id AS uniqueItemId, member_id AS memberId FROM loot_observations WHERE id = ?`).get(id);
}

export function deleteObservation(id) {
  return db.prepare(`DELETE FROM loot_observations WHERE id = ?`).run(id).changes > 0;
}

/**
 * Remise à zéro du journal d'ouvertures d'un contenant : après une mise à jour
 * du serveur de jeu, les taux relevés ne décrivent plus la table actuelle et
 * fausseraient le verdict « vendre ou ouvrir ? ». `memberId` non nul = on
 * n'efface que les relevés de ce membre. La table DÉCLARÉE (`loot_entries`)
 * n'est jamais touchée : c'est l'observation qui est périmée, pas la table.
 * Renvoie le nombre de lignes effacées.
 */
export function clearObservations(uniqueItemId, memberId = null) {
  return memberId == null
    ? db.prepare(`DELETE FROM loot_observations WHERE unique_item_id = ?`)
      .run(uniqueItemId).changes
    : db.prepare(`DELETE FROM loot_observations WHERE unique_item_id = ? AND member_id = ?`)
      .run(uniqueItemId, memberId).changes;
}

// ── Sources manuelles ─────────────────────────────────────────────────────

function mapManualSource(r) {
  return {
    id: r.id, uniqueItemId: r.unique_item_id, kind: r.kind, label: r.label, note: r.note,
    mapId: r.map_id ?? null, x: r.x, y: r.y, z: r.z, ordre: r.ordre,
  };
}

export function listManualSources(uniqueItemId) {
  return db.prepare(`SELECT * FROM unique_item_sources WHERE unique_item_id = ? ORDER BY ordre, id`)
    .all(uniqueItemId).map(mapManualSource);
}

// ── Index inversé : « où trouver quoi » + « à quoi ça sert » ──────────────
// TOUT est dérivé des relations existantes (récompenses, tables de butin,
// recettes, offres) — seule `unique_item_sources` est saisie à la main. Rien
// n'est donc à maintenir en double : une quête qui donne l'objet le déclare
// une fois, et il apparaît ici.

// Libellé affichable d'une ligne de quête/offre : label saisi, sinon nom de
// l'item unique, sinon nom codex, sinon la référence brute.
function refLabel(label, refCode, uniqueNom) {
  return label || uniqueNom || codexNameById(refCode) || refCode || '';
}

// Lignes (entrées ou récompenses) d'un lot de quêtes, en UNE requête.
function linesForQuests(table, questIds) {
  if (questIds.length === 0) return new Map();
  const ph = questIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT l.quest_id, l.kind, l.ref_code, l.quantite, l.label, c.nom AS unique_nom, c.id AS unique_id
    FROM ${table} l
    LEFT JOIN quest_custom_items c ON ('custom:' || c.id) = l.ref_code
    WHERE l.quest_id IN (${ph}) ORDER BY l.ordre, l.id
  `).all(...questIds);
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.quest_id)) out.set(r.quest_id, []);
    out.get(r.quest_id).push({
      kind: r.kind,
      refCode: r.ref_code,
      uniqueItemId: r.unique_id ?? null,
      quantite: r.quantite,
      label: refLabel(r.label, r.ref_code, r.unique_nom),
    });
  }
  return out;
}

// Quêtes dont une ligne (`quest_inputs` ou `quest_rewards`) vise cet item.
// Les récompenses peuvent être ALÉATOIRES : on remonte alors la probabilité et
// la fourchette, pour que « où trouver quoi » affiche « 8 % dans … » comme il
// le fait déjà pour les contenants. Les entrées n'ont pas ces colonnes.
function questsReferencing(table, ref) {
  const alea = table === 'quest_rewards';
  const colonnes = alea
    ? 'l.probabilite, l.probabilite_source, l.quantite_min, l.quantite_max'
    : 'NULL AS probabilite, NULL AS probabilite_source, NULL AS quantite_min, NULL AS quantite_max';
  return db.prepare(`
    SELECT q.id, q.titre, q.categorie, q.occurrence_type, q.faction_id,
           f.nom AS faction_nom, f.couleur AS faction_couleur, l.quantite, ${colonnes}
    FROM ${table} l
    JOIN quests q ON q.id = l.quest_id
    LEFT JOIN factions f ON f.id = q.faction_id
    WHERE l.kind = 'item' AND l.ref_code = ?
    ORDER BY q.titre
  `).all(ref).map((q) => ({
    questId: q.id,
    titre: q.titre,
    categorie: q.categorie,
    occurrenceType: q.occurrence_type,
    factionId: q.faction_id,
    factionNom: q.faction_nom,
    factionCouleur: q.faction_couleur,
    quantite: q.quantite,
    probabilite: q.probabilite ?? null,
    probabiliteSource: q.probabilite_source ?? null,
    quantiteMin: q.quantite_min ?? null,
    quantiteMax: q.quantite_max ?? null,
  }));
}

// Offres portant une ligne dans le sens demandé, avec la contrepartie.
function offersReferencing(ref, sens) {
  const offers = db.prepare(`
    SELECT o.id, o.quest_id, o.vendeur, o.stock, o.limite, o.note,
           o.map_id, o.x, o.y, o.z, q.titre AS quest_titre
    FROM quest_offers o
    JOIN quest_offer_lines l ON l.offer_id = o.id
    JOIN quests q ON q.id = o.quest_id
    WHERE l.sens = ? AND l.ref_code = ?
    GROUP BY o.id ORDER BY q.titre, o.ordre
  `).all(sens, ref);
  if (offers.length === 0) return [];
  const ph = offers.map(() => '?').join(',');
  const lines = db.prepare(`
    SELECT l.*, c.nom AS unique_nom, c.id AS unique_id FROM quest_offer_lines l
    LEFT JOIN quest_custom_items c ON ('custom:' || c.id) = l.ref_code
    WHERE l.offer_id IN (${ph}) ORDER BY l.sens, l.ordre, l.id
  `).all(...offers.map((o) => o.id));
  const byOffer = new Map();
  for (const l of lines) {
    if (!byOffer.has(l.offer_id)) byOffer.set(l.offer_id, { donne: [], recoit: [] });
    byOffer.get(l.offer_id)[l.sens].push({
      kind: l.kind,
      refCode: l.ref_code,
      uniqueItemId: l.unique_id ?? null,
      quantite: l.quantite,
      label: refLabel(l.label, l.ref_code, l.unique_nom),
    });
  }
  return offers.map((o) => ({
    offerId: o.id,
    questId: o.quest_id,
    questTitre: o.quest_titre,
    vendeur: o.vendeur,
    stock: o.stock ?? null,
    limite: o.limite || '',
    note: o.note || '',
    mapId: o.map_id ?? null,
    x: o.x, y: o.y, z: o.z,
    ...(byOffer.get(o.id) || { donne: [], recoit: [] }),
  }));
}

/**
 * Toutes les façons d'obtenir un item (`sources`) et tout ce à quoi il sert
 * (`usages`). 8 requêtes bornées, aucune boucle de requêtes par résultat.
 */
export function itemSources(id) {
  const ref = uniqueRef(id);

  // 1+3. Récompenses de quête, séparées en « quête » et « craft » selon la
  // catégorie de la quête qui les octroie.
  const donneurs = questsReferencing('quest_rewards', ref);
  const crafts = donneurs.filter((q) => q.categorie === 'craft');
  const recompenses = donneurs.filter((q) => q.categorie !== 'craft');
  const ingredientsParQuete = linesForQuests('quest_inputs', crafts.map((q) => q.questId));

  // 2. Contenants ouvrables qui peuvent le produire.
  const contenants = db.prepare(`
    SELECT l.probabilite, l.probabilite_source, l.quantite_min, l.quantite_max,
           c.id, c.nom, c.slug, ra.couleur AS rarete_couleur, ra.nom AS rarete_nom
    FROM loot_entries l
    JOIN quest_custom_items c ON c.id = l.unique_item_id
    LEFT JOIN unique_item_rarities ra ON ra.id = c.rarete_id
    WHERE l.resultat_unique_id = ? ORDER BY l.probabilite DESC
  `).all(id).map((r) => ({
    uniqueItemId: r.id,
    nom: r.nom,
    slug: r.slug,
    rareteNom: r.rarete_nom,
    rareteCouleur: r.rarete_couleur,
    probabilite: r.probabilite,
    probabiliteSource: r.probabilite_source,
    quantiteMin: r.quantite_min,
    quantiteMax: r.quantite_max,
  }));

  // 5. Sources manuelles.
  const manuelles = listManualSources(id);

  // Usages : entrées de quêtes, ingrédients de craft, monnaie d'échange.
  const consommateurs = questsReferencing('quest_inputs', ref);
  const craftsConsommateurs = consommateurs.filter((q) => q.categorie === 'craft');
  const quetesEntrees = consommateurs.filter((q) => q.categorie !== 'craft');
  const resultatsParQuete = linesForQuests('quest_rewards', craftsConsommateurs.map((q) => q.questId));

  return {
    uniqueItemId: id,
    sources: {
      recompenses,
      contenants,
      crafts: crafts.map((q) => ({ ...q, ingredients: ingredientsParQuete.get(q.questId) || [] })),
      achats: offersReferencing(ref, 'recoit'),
      manuelles,
    },
    usages: {
      craftsConsommateurs: craftsConsommateurs.map((q) => ({
        ...q, resultats: (resultatsParQuete.get(q.questId) || []).filter((l) => l.kind === 'item'),
      })),
      quetesEntrees,
      monnaie: offersReferencing(ref, 'donne'),
    },
  };
}

function replaceManualSources(uniqueItemId, rows) {
  db.prepare(`DELETE FROM unique_item_sources WHERE unique_item_id = ?`).run(uniqueItemId);
  const ins = db.prepare(`
    INSERT INTO unique_item_sources (unique_item_id, kind, label, note, map_id, x, y, z, ordre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const num = (v) => (v == null || v === '' ? null : Math.trunc(+v) || 0);
  (rows || []).forEach((s, i) => ins.run(
    uniqueItemId, s.kind || 'autre', String(s.label || '').slice(0, 120),
    String(s.note || '').slice(0, 500), s.mapId ?? null,
    num(s.x), num(s.y), num(s.z), i,
  ));
}

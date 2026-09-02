// Accès données du module « Items customs » (better-sqlite3).
//
// Conventions du dépôt : colonnes snake_case en entrée, objets camelCase en
// sortie, enfants (attributs, enchantements) remplacés EN BLOC dans une
// transaction à l'écriture — un item n'a jamais d'état intermédiaire visible.
//
// La puissance n'est jamais stockée : elle est recalculée à la lecture depuis
// le barème courant. Une valeur figée en base se serait désynchronisée au
// premier poids corrigé, et c'est justement le genre d'incohérence que ce
// module existe pour supprimer.

import { db } from '../db.js';
import { uniqueSlug } from '../slugify.js';
import { buildGiveCommand } from './command.js';
import {
  ATTRIBUT_CLES, ENCHANT_CLES, SLOTS, computePower, defaultWeights,
} from './power.js';

/** Façons d'obtenir un item, reprises de la colonne AQUISITION du tableur. */
export const ACQUISITIONS = new Map([
  ['craftable', 'Craftable'],
  ['craft_achat', 'Craft / Achat'],
  ['craft_schema', 'Craft sur schéma'],
  ['quest_event', 'Quête / Événement'],
  ['boutique', 'Boutique'],
  ['autre', 'Autre'],
]);

/** Cycle de vie. `a_tester` = les lignes rouges du document d'origine. */
export const STATUTS = new Map([
  ['a_tester', 'À tester / équilibrer'],
  ['en_jeu', 'En jeu'],
  ['abandonne', 'Abandonné'],
]);

const txt = (v, max = 400) => String(v ?? '').trim().slice(0, max);
// `null` explicite doit rester `null` : `+null` vaut 0, et un `panoplie_id = 0`
// viole la clé étrangère au lieu de dire « aucune panoplie ».
const int = (v) => {
  if (v === null || v === undefined || v === '') return null;
  return Number.isFinite(+v) ? Math.trunc(+v) : null;
};

// ── Barème ────────────────────────────────────────────────────────────────

/**
 * Amorce le barème s'il est vide. Idempotent, et volontairement appelé à la
 * lecture plutôt qu'au boot : une base migrée depuis une version antérieure
 * doit se remplir toute seule, sans script de rattrapage.
 *
 * Les poids AJOUTÉS par une version ultérieure du module (un enchantement
 * oublié) sont insérés au passage — `INSERT OR IGNORE` ne touche jamais un
 * poids déjà réglé par un admin.
 */
export function ensureWeights() {
  const ins = db.prepare(`
    INSERT OR IGNORE INTO mf_power_weights (cle, genre, poids, reference, note)
    VALUES (?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const w of defaultWeights()) ins.run(w.cle, w.genre, w.poids, w.reference, w.note);
  })();
}

const mapWeight = (r) => ({
  cle: r.cle, genre: r.genre, poids: r.poids, reference: r.reference, note: r.note || '',
  updatedAt: r.updated_at,
});

export function listWeights() {
  ensureWeights();
  return db.prepare(`SELECT * FROM mf_power_weights ORDER BY genre, cle`).all().map(mapWeight);
}

/** Barème sous la forme attendue par computePower. */
export function weightsMap() {
  ensureWeights();
  const m = new Map();
  for (const r of db.prepare(`SELECT cle, poids, reference FROM mf_power_weights`).all()) {
    m.set(r.cle, { poids: r.poids, reference: r.reference });
  }
  return m;
}

export function updateWeight(cle, data, userId) {
  ensureWeights();
  const row = db.prepare(`SELECT * FROM mf_power_weights WHERE cle = ?`).get(cle);
  if (!row) return null;
  db.prepare(`
    UPDATE mf_power_weights SET poids = ?, reference = ?, updated_by = ?,
      updated_at = strftime('%s','now') WHERE cle = ?
  `).run(
    Number.isFinite(+data.poids) ? +data.poids : row.poids,
    Number.isFinite(+data.reference) && +data.reference !== 0 ? +data.reference : row.reference,
    userId, cle,
  );
  return mapWeight(db.prepare(`SELECT * FROM mf_power_weights WHERE cle = ?`).get(cle));
}

/** Remet TOUT le barème aux valeurs d'amorçage (l'onglet Barème le propose). */
export function resetWeights(userId) {
  const upd = db.prepare(`
    UPDATE mf_power_weights SET poids = ?, reference = ?, note = ?, updated_by = ?,
      updated_at = strftime('%s','now') WHERE cle = ?
  `);
  db.transaction(() => {
    ensureWeights();
    for (const w of defaultWeights()) upd.run(w.poids, w.reference, w.note, userId, w.cle);
  })();
  return listWeights();
}

// ── Tiers ─────────────────────────────────────────────────────────────────

const mapTier = (r) => (r ? {
  id: r.id, nom: r.nom, couleur: r.couleur, echelle: r.echelle,
  budget: r.budget, note: r.note || '', ordre: r.ordre, items: r.items ?? 0,
} : null);

export function listTiers() {
  return db.prepare(`
    SELECT t.*, COUNT(i.id) AS items
    FROM mf_item_tiers t LEFT JOIN mf_items i ON i.tier_id = t.id
    GROUP BY t.id ORDER BY t.echelle, t.ordre, t.id
  `).all().map(mapTier);
}

export function createTier(data, userId) {
  const info = db.prepare(`
    INSERT INTO mf_item_tiers (nom, couleur, echelle, budget, note, ordre, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(ordre)+1 FROM mf_item_tiers), 1), ?, ?)
  `).run(
    txt(data.nom, 60) || 'Tier', txt(data.couleur, 20) || '#c9a8e8',
    txt(data.echelle, 40) || 'standard', Math.max(0, +data.budget || 0), txt(data.note, 400),
    userId, userId,
  );
  return mapTier(db.prepare(`SELECT * FROM mf_item_tiers WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateTier(id, data, userId) {
  if (!db.prepare(`SELECT id FROM mf_item_tiers WHERE id = ?`).get(id)) return null;
  db.prepare(`
    UPDATE mf_item_tiers SET nom = ?, couleur = ?, echelle = ?, budget = ?, note = ?,
      ordre = COALESCE(?, ordre), updated_by = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    txt(data.nom, 60) || 'Tier', txt(data.couleur, 20) || '#c9a8e8',
    txt(data.echelle, 40) || 'standard', Math.max(0, +data.budget || 0), txt(data.note, 400),
    int(data.ordre), userId, id,
  );
  return mapTier(db.prepare(`SELECT * FROM mf_item_tiers WHERE id = ?`).get(id));
}

/** Les items gardent leur ligne — `tier_id` passe à NULL par la FK. */
export const deleteTier = (id) => db.prepare(`DELETE FROM mf_item_tiers WHERE id = ?`).run(id).changes > 0;

export function reorderTiers(ids, userId) {
  const upd = db.prepare(`UPDATE mf_item_tiers SET ordre = ?, updated_by = ? WHERE id = ?`);
  db.transaction(() => { (ids || []).forEach((id, i) => upd.run(i + 1, userId, Number(id))); })();
  return listTiers();
}

// ── Séries de CMD ─────────────────────────────────────────────────────────

const mapSerie = (r) => (r ? {
  id: r.id, code: r.code, nom: r.nom, couleur: r.couleur, note: r.note || '',
  ordre: r.ordre, items: r.items ?? 0, cmdMax: r.cmd_max ?? null,
} : null);

export function listSeries() {
  return db.prepare(`
    SELECT s.*, COUNT(i.id) AS items, MAX(i.cmd) AS cmd_max
    FROM mf_item_series s LEFT JOIN mf_items i ON i.serie_id = s.id
    GROUP BY s.id ORDER BY s.ordre, s.code
  `).all().map(mapSerie);
}

/** Le code d'une série est le préfixe du CMD : 2 chiffres, « 01 », « 02 »… */
const serieCode = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 2).padStart(2, '0');

export function createSerie(data, userId) {
  const info = db.prepare(`
    INSERT INTO mf_item_series (code, nom, couleur, note, ordre, created_by, updated_by)
    VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(ordre)+1 FROM mf_item_series), 1), ?, ?)
  `).run(
    serieCode(data.code), txt(data.nom, 80) || 'Série', txt(data.couleur, 20) || '#c9a8e8',
    txt(data.note, 400), userId, userId,
  );
  return mapSerie(db.prepare(`SELECT * FROM mf_item_series WHERE id = ?`).get(info.lastInsertRowid));
}

export function updateSerie(id, data, userId) {
  if (!db.prepare(`SELECT id FROM mf_item_series WHERE id = ?`).get(id)) return null;
  db.prepare(`
    UPDATE mf_item_series SET code = ?, nom = ?, couleur = ?, note = ?,
      ordre = COALESCE(?, ordre), updated_by = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    serieCode(data.code), txt(data.nom, 80) || 'Série', txt(data.couleur, 20) || '#c9a8e8',
    txt(data.note, 400), int(data.ordre), userId, id,
  );
  return mapSerie(db.prepare(`SELECT * FROM mf_item_series WHERE id = ?`).get(id));
}

export const deleteSerie = (id) => db.prepare(`DELETE FROM mf_item_series WHERE id = ?`).run(id).changes > 0;

/**
 * Prochain CMD libre d'une série. Le document d'origine demande de « rester
 * dans l'ordre croissant » pour que le resource pack reste réalisable — une
 * consigne qu'aucun tableur ne peut faire respecter. Ici c'est le serveur qui
 * la tient : on repart du plus grand CMD de la série et on prend le suivant,
 * en sautant ceux déjà pris (l'index unique sur `cmd` les refuserait de toute
 * façon, autant proposer directement un numéro valide).
 */
export function nextCmd(serieId) {
  // Passe par listSeries() : mapSerie() attend les colonnes agrégées du JOIN,
  // un `SELECT *` nu renverrait une série qui prétend n'avoir aucun item.
  const serie = listSeries().find((s) => s.id === Number(serieId));
  if (!serie) return null;
  const base = Number(serie.code) * 1000;
  const max = serie.cmdMax;
  const pris = new Set(db.prepare(`SELECT cmd FROM mf_items WHERE cmd IS NOT NULL`).all().map((r) => r.cmd));
  let candidat = Number.isFinite(max) && max >= base ? max + 1 : base + 1;
  while (pris.has(candidat) && candidat < base + 1000) candidat += 1;
  return { serie, cmd: candidat, plage: [base + 1, base + 999] };
}

// ── Panoplies ─────────────────────────────────────────────────────────────

const mapPanoplie = (r) => (r ? {
  id: r.id, slug: r.slug || null, nom: r.nom, couleur: r.couleur, taille: r.taille,
  bonus: r.bonus || '', note: r.note || '', ordre: r.ordre, membres: r.membres ?? 0,
} : null);

export function listPanoplies() {
  return db.prepare(`
    SELECT p.*, COUNT(i.id) AS membres
    FROM mf_item_panoplies p LEFT JOIN mf_items i ON i.panoplie_id = p.id
    GROUP BY p.id ORDER BY p.ordre, p.nom
  `).all().map(mapPanoplie);
}

export function createPanoplie(data, userId) {
  const nom = txt(data.nom, 80) || 'Panoplie';
  const info = db.prepare(`
    INSERT INTO mf_item_panoplies (slug, nom, couleur, taille, bonus, note, ordre, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(ordre)+1 FROM mf_item_panoplies), 1), ?, ?)
  `).run(
    uniqueSlug('mf_item_panoplies', nom), nom, txt(data.couleur, 20) || '#c9a8e8',
    Math.max(0, int(data.taille) || 0), txt(data.bonus, 400), txt(data.note, 400), userId, userId,
  );
  return mapPanoplie(db.prepare(`SELECT * FROM mf_item_panoplies WHERE id = ?`).get(info.lastInsertRowid));
}

export function updatePanoplie(id, data, userId) {
  if (!db.prepare(`SELECT id FROM mf_item_panoplies WHERE id = ?`).get(id)) return null;
  const nom = txt(data.nom, 80) || 'Panoplie';
  db.prepare(`
    UPDATE mf_item_panoplies SET slug = ?, nom = ?, couleur = ?, taille = ?, bonus = ?, note = ?,
      ordre = COALESCE(?, ordre), updated_by = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(
    uniqueSlug('mf_item_panoplies', nom, { excludeId: id }), nom, txt(data.couleur, 20) || '#c9a8e8',
    Math.max(0, int(data.taille) || 0), txt(data.bonus, 400), txt(data.note, 400),
    int(data.ordre), userId, id,
  );
  return mapPanoplie(db.prepare(`SELECT * FROM mf_item_panoplies WHERE id = ?`).get(id));
}

export const deletePanoplie = (id) => db.prepare(`DELETE FROM mf_item_panoplies WHERE id = ?`).run(id).changes > 0;

// ── Items ─────────────────────────────────────────────────────────────────

function childrenOf(ids) {
  const attributs = new Map();
  const enchantements = new Map();
  if (ids.length === 0) return { attributs, enchantements };
  const marks = ids.map(() => '?').join(',');
  for (const r of db.prepare(`SELECT * FROM mf_item_attributes WHERE item_id IN (${marks}) ORDER BY ordre, id`).all(...ids)) {
    if (!attributs.has(r.item_id)) attributs.set(r.item_id, []);
    attributs.get(r.item_id).push({ id: r.id, attribut: r.attribut, valeur: r.valeur, mode: r.mode, slot: r.slot });
  }
  for (const r of db.prepare(`SELECT * FROM mf_item_enchants WHERE item_id IN (${marks}) ORDER BY ordre, id`).all(...ids)) {
    if (!enchantements.has(r.item_id)) enchantements.set(r.item_id, []);
    enchantements.get(r.item_id).push({ id: r.id, enchant: r.enchant, niveau: r.niveau });
  }
  return { attributs, enchantements };
}

function mapItem(r, kids, ctx) {
  if (!r) return null;
  const attributs = kids.attributs.get(r.id) || [];
  const enchantements = kids.enchantements.get(r.id) || [];
  // `Unbreakable` n'est pas un enchantement mais le document le range dans la
  // même colonne : on le stocke comme tel et on le ressort en drapeau.
  const unbreakable = enchantements.some((e) => e.enchant === 'unbreakable_flag');
  const item = {
    id: r.id,
    slug: r.slug || null,
    nom: r.nom,
    description: r.description || '',
    baseItem: r.base_item || '',
    tierId: r.tier_id, tierNom: r.tier_nom || null, tierCouleur: r.tier_couleur || null,
    serieId: r.serie_id, serieNom: r.serie_nom || null, serieCode: r.serie_code || null,
    panoplieId: r.panoplie_id, panoplieNom: r.panoplie_nom || null, panoplieCouleur: r.panoplie_couleur || null,
    cmd: r.cmd,
    acquisition: r.acquisition,
    ressources: r.ressources || '',
    prix: r.prix || '',
    commande: r.commande || '',
    statut: r.statut,
    responsable: r.responsable || '',
    note: r.note || '',
    uniqueItemId: r.unique_item_id,
    uniqueItemNom: r.unique_item_nom || null,
    attributs,
    enchantements: enchantements.filter((e) => e.enchant !== 'unbreakable_flag'),
    unbreakable,
    auteur: r.auteur_nom || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  item.puissance = computePower(item, ctx.weights, { tiers: ctx.tiers, tierId: r.tier_id });
  item.commandeGeneree = buildGiveCommand(item);
  return item;
}

const SELECT_ITEM = `
  SELECT i.*, t.nom AS tier_nom, t.couleur AS tier_couleur,
         s.nom AS serie_nom, s.code AS serie_code,
         p.nom AS panoplie_nom, p.couleur AS panoplie_couleur,
         q.nom AS unique_item_nom, u.name AS auteur_nom
  FROM mf_items i
  LEFT JOIN mf_item_tiers t     ON t.id = i.tier_id
  LEFT JOIN mf_item_series s    ON s.id = i.serie_id
  LEFT JOIN mf_item_panoplies p ON p.id = i.panoplie_id
  LEFT JOIN quest_custom_items q ON q.id = i.unique_item_id
  LEFT JOIN users u             ON u.id = i.created_by
`;

/**
 * Liste filtrée. Tout le catalogue tient largement en mémoire (quelques
 * centaines d'items) : on charge, on calcule la puissance, et le tri par
 * puissance devient possible — impossible en SQL puisqu'elle est dérivée.
 */
export function listItems(filters = {}) {
  const where = [];
  const args = [];
  if (filters.tier) { where.push('i.tier_id = ?'); args.push(Number(filters.tier)); }
  if (filters.serie) { where.push('i.serie_id = ?'); args.push(Number(filters.serie)); }
  if (filters.panoplie) { where.push('i.panoplie_id = ?'); args.push(Number(filters.panoplie)); }
  if (filters.statut && STATUTS.has(filters.statut)) { where.push('i.statut = ?'); args.push(filters.statut); }
  if (filters.acquisition && ACQUISITIONS.has(filters.acquisition)) { where.push('i.acquisition = ?'); args.push(filters.acquisition); }
  if (filters.q) {
    where.push('(i.nom LIKE ? OR i.description LIKE ? OR i.base_item LIKE ? OR i.responsable LIKE ?)');
    const like = `%${String(filters.q).slice(0, 60)}%`;
    args.push(like, like, like, like);
  }
  const rows = db.prepare(
    `${SELECT_ITEM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.ordre, i.nom`,
  ).all(...args);
  const kids = childrenOf(rows.map((r) => r.id));
  const ctx = { weights: weightsMap(), tiers: listTiers() };
  return rows.map((r) => mapItem(r, kids, ctx));
}

export function getItem(idOrSlug) {
  const isId = /^\d+$/.test(String(idOrSlug));
  const row = db.prepare(`${SELECT_ITEM} WHERE ${isId ? 'i.id = ?' : 'i.slug = ?'}`)
    .get(isId ? Number(idOrSlug) : String(idOrSlug));
  if (!row) return null;
  const kids = childrenOf([row.id]);
  return mapItem(row, kids, { weights: weightsMap(), tiers: listTiers() });
}

/** Normalise les enfants avant écriture — bornes, clés inconnues écartées. */
function cleanChildren(data) {
  const attributs = (Array.isArray(data.attributs) ? data.attributs : [])
    .filter((a) => ATTRIBUT_CLES.has(a?.attribut))
    .slice(0, 20)
    .map((a, i) => ({
      attribut: a.attribut,
      valeur: Number.isFinite(+a.valeur) ? +a.valeur : 0,
      mode: a.mode === 'pourcent' ? 'pourcent' : 'flat',
      slot: SLOTS.includes(a.slot) ? a.slot : 'any',
      ordre: i,
    }));
  const enchantements = (Array.isArray(data.enchantements) ? data.enchantements : [])
    .filter((e) => ENCHANT_CLES.has(e?.enchant))
    .slice(0, 40)
    .map((e, i) => ({
      enchant: e.enchant,
      niveau: Math.max(0, Math.min(255, int(e.niveau) || 1)),
      ordre: i,
    }));
  // Le drapeau incassable voyage dans la table des enchantements sous une clé
  // réservée : c'est bien une propriété de l'item, pas un enchantement, mais
  // lui donner sa propre colonne pour un booléen ne vaut pas une migration.
  if (data.unbreakable) enchantements.push({ enchant: 'unbreakable_flag', niveau: 1, ordre: 99 });
  return { attributs, enchantements };
}

function writeChildren(itemId, data) {
  const { attributs, enchantements } = cleanChildren(data);
  db.prepare(`DELETE FROM mf_item_attributes WHERE item_id = ?`).run(itemId);
  db.prepare(`DELETE FROM mf_item_enchants WHERE item_id = ?`).run(itemId);
  const insA = db.prepare(`INSERT INTO mf_item_attributes (item_id, attribut, valeur, mode, slot, ordre) VALUES (?,?,?,?,?,?)`);
  const insE = db.prepare(`INSERT INTO mf_item_enchants (item_id, enchant, niveau, ordre) VALUES (?,?,?,?)`);
  for (const a of attributs) insA.run(itemId, a.attribut, a.valeur, a.mode, a.slot, a.ordre);
  for (const e of enchantements) insE.run(itemId, e.enchant, e.niveau, e.ordre);
}

const itemScalars = (data) => [
  txt(data.nom, 120) || 'Item',
  txt(data.description, 2000),
  txt(data.baseItem, 120),
  int(data.tierId), int(data.serieId), int(data.panoplieId),
  int(data.cmd),
  ACQUISITIONS.has(data.acquisition) ? data.acquisition : 'craftable',
  txt(data.ressources, 1000),
  txt(data.prix, 200),
  txt(data.commande, 4000),
  STATUTS.has(data.statut) ? data.statut : 'a_tester',
  txt(data.responsable, 120),
  txt(data.note, 2000),
  int(data.uniqueItemId),
];

/** Levée si le CMD est déjà pris — l'index unique le refuserait sans message. */
function assertCmdLibre(cmd, excludeId = null) {
  if (cmd == null) return;
  const row = db.prepare(`SELECT id, nom FROM mf_items WHERE cmd = ? AND id <> ?`).get(cmd, excludeId ?? -1);
  if (row) {
    const err = new Error('cmd_taken');
    err.detail = { cmd, item: { id: row.id, nom: row.nom } };
    throw err;
  }
}

export function createItem(data, userId) {
  const nom = txt(data.nom, 120) || 'Item';
  const cmd = int(data.cmd);
  assertCmdLibre(cmd);
  return db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO mf_items (slug, nom, description, base_item, tier_id, serie_id, panoplie_id,
        cmd, acquisition, ressources, prix, commande, statut, responsable, note, unique_item_id,
        created_by, updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(uniqueSlug('mf_items', nom), ...itemScalars(data), userId, userId);
    writeChildren(info.lastInsertRowid, data);
    return getItem(info.lastInsertRowid);
  })();
}

export function updateItem(id, data, userId) {
  if (!db.prepare(`SELECT id FROM mf_items WHERE id = ?`).get(id)) return null;
  const nom = txt(data.nom, 120) || 'Item';
  assertCmdLibre(int(data.cmd), id);
  return db.transaction(() => {
    db.prepare(`
      UPDATE mf_items SET slug = ?, nom = ?, description = ?, base_item = ?, tier_id = ?,
        serie_id = ?, panoplie_id = ?, cmd = ?, acquisition = ?, ressources = ?, prix = ?,
        commande = ?, statut = ?, responsable = ?, note = ?, unique_item_id = ?,
        updated_by = ?, updated_at = strftime('%s','now')
      WHERE id = ?
    `).run(uniqueSlug('mf_items', nom, { excludeId: id }), ...itemScalars(data), userId, id);
    writeChildren(id, data);
    return getItem(id);
  })();
}

export const deleteItem = (id) => db.prepare(`DELETE FROM mf_items WHERE id = ?`).run(id).changes > 0;

/**
 * Puissance d'un brouillon jamais enregistré — l'aperçu vivant du formulaire.
 *
 * Le front NE recalcule PAS de son côté : une seconde implémentation finirait
 * par diverger de celle-ci, et c'est l'aperçu affiché pendant qu'on règle un
 * item qui doit être exact.
 */
export function previewPower(draft) {
  const tiers = listTiers();
  const item = {
    baseItem: txt(draft?.baseItem, 120),
    unbreakable: !!draft?.unbreakable,
    ...cleanChildren(draft || {}),
  };
  item.enchantements = item.enchantements.filter((e) => e.enchant !== 'unbreakable_flag');
  const puissance = computePower(item, weightsMap(), { tiers, tierId: int(draft?.tierId) });
  return {
    puissance,
    commandeGeneree: buildGiveCommand({
      nom: txt(draft?.nom, 120), description: txt(draft?.description, 2000),
      baseItem: item.baseItem, cmd: int(draft?.cmd), slug: txt(draft?.nom, 120),
      attributs: item.attributs, enchantements: item.enchantements, unbreakable: item.unbreakable,
    }),
  };
}

// Validation + normalisation du document d'un plan de salle des coffres.
//
// Le client envoie le document entier à chaque sauvegarde ; on le renormalise
// systématiquement pour que ce qui est stocké soit canonique (mêmes clés, même
// ordre de champs, pas de propriété parasite). Deux bénéfices : le diff entre
// deux révisions reste lisible, et l'export futur (.schem / pipeline Anvil) part
// d'une structure garantie.
//
// Le seul contenant du modèle est le **coffre sans fond** de Minefield : un bloc
// 1×1×1 de 72 slots, ouvrable de n'importe où (donc ni orientation, ni paire, ni
// contrainte d'accès). Un coffre peut être *dédié* à un ou plusieurs items du
// codex — c'est une désignation de rangement, jamais un inventaire : aucune
// quantité n'est stockée nulle part.

export class VaultValidationError extends Error {
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail) => { throw new VaultValidationError(code, detail); };

export const DIM_MIN = 1;
// Large mais fini : une dimension aberrante rendrait le canvas et la vue 3D
// inutilisables bien avant d'atteindre ce plafond.
export const DIM_MAX = 1024;

export const CIRCULATION_KINDS = ['couloir', 'escalier', 'entree'];
// Capacité d'un coffre sans fond, en slots (72 stacks).
export const CHEST_SLOTS = 72;
// Un coffre reste lisible avec quelques types dedans ; au-delà, c'est une zone
// qu'il faut découper, pas un coffre qu'il faut charger.
const MAX_ITEMS_PER_CHEST = 24;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const HEX_RE = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;

const asInt = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback);
const asStr = (v, max) => String(v ?? '').slice(0, max);
const asBool = (v) => v === true || v === 1;
const asColor = (v, fallback) => (HEX_RE.test(String(v || '')) ? String(v) : fallback);

const ZONE_COLOR = '#c9a8e8';
const FLOOR_COLOR = '#c8a24a';

/** Un coffre sans fond occupe exactement une case. */
export const chestCells = (chest) => [[chest.x, chest.z]];

export function normalizeDims(input) {
  const src = input || {};
  const dims = {
    x: asInt(src.x, 125),
    y: asInt(src.y, 200),
    z: asInt(src.z, 125),
  };
  for (const [axis, v] of Object.entries(dims)) {
    if (v < DIM_MIN || v > DIM_MAX) fail('invalid_dims', `${axis}=${v}`);
  }
  return dims;
}

/** `worldOrigin` est optionnel : null = plan en coordonnées locales seules. */
export function normalizeOrigin(input) {
  if (!input || typeof input !== 'object') return null;
  const { x, y, z } = input;
  if (x == null && y == null && z == null) return null;
  return { x: asInt(x, 0), y: asInt(y, 0), z: asInt(z, 0) };
}

// Identifiants : fournis par le client (« z1 », « c42 »…). Un id manquant est
// généré, un doublon est une erreur — le régénérer casserait silencieusement
// les références (zoneId, floorId, fromFloorId…).
function idFactory(prefix) {
  const seen = new Set();
  let n = 0;
  return (raw) => {
    let id = typeof raw === 'string' && ID_RE.test(raw) ? raw : '';
    if (!id) {
      do { n += 1; id = `${prefix}${n}`; } while (seen.has(id));
    }
    if (seen.has(id)) fail('duplicate_id', id);
    seen.add(id);
    return id;
  };
}

function normalizeFloors(raw, dims) {
  const list = Array.isArray(raw) ? raw : [];
  const nextId = idFactory('f');
  const floors = list.map((f) => {
    const yMin = asInt(f?.yMin, 0);
    const yMax = asInt(f?.yMax, yMin);
    if (yMin < 0 || yMax >= dims.y || yMin > yMax) {
      fail('invalid_floor_range', `${yMin}..${yMax}`);
    }
    return {
      id: nextId(f?.id),
      name: asStr(f?.name, 80),
      yMin,
      yMax,
      color: asColor(f?.color, FLOOR_COLOR),
    };
  });

  // Tranches Y libres mais non chevauchantes (règle explicite du modèle).
  let previous = null;
  for (const floor of [...floors].sort((a, b) => a.yMin - b.yMin)) {
    if (previous && floor.yMin <= previous.yMax) {
      fail('floors_overlap', `${previous.name || previous.id} / ${floor.name || floor.id}`);
    }
    previous = floor;
  }
  return floors;
}

function normalizeZones(raw, dims, floors) {
  const list = Array.isArray(raw) ? raw : [];
  const floorById = new Map(floors.map((f) => [f.id, f]));
  const nextId = idFactory('z');
  return list.map((z) => {
    const r = z?.rect || {};
    const x0 = Math.min(asInt(r.x0, 0), asInt(r.x1, 0));
    const x1 = Math.max(asInt(r.x0, 0), asInt(r.x1, 0));
    const z0 = Math.min(asInt(r.z0, 0), asInt(r.z1, 0));
    const z1 = Math.max(asInt(r.z0, 0), asInt(r.z1, 0));
    if (x0 < 0 || z0 < 0 || x1 >= dims.x || z1 >= dims.z) {
      fail('zone_out_of_bounds', `${x0},${z0} → ${x1},${z1}`);
    }
    const floorId = typeof z?.floorId === 'string' ? z.floorId : '';
    const floor = floorById.get(floorId);
    if (!floor) fail('unknown_floor', floorId || '(vide)');

    // Une zone occupe un VOLUME : une hauteur propre à l'intérieur de l'étage
    // (« 100 × 5 × 100 »), c'est elle qui définit les niveaux de rangement.
    // Par défaut, toute la hauteur de l'étage.
    let yMin = asInt(z?.yMin, floor.yMin);
    let yMax = asInt(z?.yMax, floor.yMax);
    if (yMin > yMax) [yMin, yMax] = [yMax, yMin];
    yMin = Math.min(Math.max(yMin, floor.yMin), floor.yMax);
    yMax = Math.min(Math.max(yMax, floor.yMin), floor.yMax);

    // Catégories : ids de la table globale vault_categories. Dédoublonnés ;
    // un id supprimé entre-temps est ignoré à l'affichage, pas au stockage —
    // on ne veut pas qu'une suppression de catégorie réécrive tous les plans.
    const categoryIds = [...new Set(
      (Array.isArray(z?.categoryIds) ? z.categoryIds : [])
        .map((c) => asInt(c, 0))
        .filter((c) => c > 0),
    )];

    return {
      id: nextId(z?.id),
      floorId,
      rect: { x0, z0, x1, z1 },
      yMin,
      yMax,
      name: asStr(z?.name, 80),
      color: asColor(z?.color, ZONE_COLOR),
      categoryIds,
      // Réserve manuelle, en slots : le besoin annoncé, face aux coffres posés.
      reservedSlots: Math.max(0, asInt(z?.reservedSlots, 0)),
      // Zone tampon gardée libre pour une future MàJ Minecraft : hachurée dans
      // les trois vues, exclue des calculs de capacité.
      reserved: asBool(z?.reserved),
      notes: asStr(z?.notes, 2000),
    };
  });
}

// Items désignés d'un coffre : des ids de codex, sans quantité. C'est le
// « plan dans le plan » — ce qu'on rangera ici, pas ce qui s'y trouve.
function normalizeItems(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.map((v) => String(v ?? '').slice(0, 120)).filter(Boolean))]
    .slice(0, MAX_ITEMS_PER_CHEST);
}

function normalizeChests(raw, dims, zoneIds) {
  const list = Array.isArray(raw) ? raw : [];
  const nextId = idFactory('c');
  return list.map((c) => {
    const x = asInt(c?.x, 0);
    const y = asInt(c?.y, 0);
    const z = asInt(c?.z, 0);
    if (x < 0 || z < 0 || x >= dims.x || z >= dims.z) fail('chest_out_of_bounds', `${x},${z}`);
    if (y < 0 || y >= dims.y) fail('chest_out_of_bounds', `y=${y}`);

    const chest = {
      id: nextId(c?.id),
      zoneId: null,
      x,
      y,
      z,
      items: normalizeItems(c?.items),
      label: asStr(c?.label, 60),
    };
    // Une zone supprimée ne doit pas empêcher la sauvegarde : le coffre devient
    // « hors zone » et le panneau de warnings le signalera.
    if (typeof c?.zoneId === 'string' && zoneIds.has(c.zoneId)) chest.zoneId = c.zoneId;
    return chest;
  });
}

function normalizeCells(raw, dims) {
  const seen = new Set();
  const cells = [];
  for (const cell of Array.isArray(raw) ? raw : []) {
    if (!Array.isArray(cell) || cell.length < 2) continue;
    const x = asInt(cell[0], -1);
    const z = asInt(cell[1], -1);
    if (x < 0 || z < 0 || x >= dims.x || z >= dims.z) continue;
    const key = `${x},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push([x, z]);
  }
  return cells;
}

function normalizeCell(raw, dims, what) {
  if (!Array.isArray(raw) || raw.length < 2) fail('invalid_cell', what);
  const x = asInt(raw[0], -1);
  const z = asInt(raw[1], -1);
  if (x < 0 || z < 0 || x >= dims.x || z >= dims.z) fail('invalid_cell', `${what} @ ${x},${z}`);
  return [x, z];
}

function normalizeCirculation(raw, dims, floorIds) {
  const list = Array.isArray(raw) ? raw : [];
  const nextId = idFactory('p');
  return list.map((p) => {
    const kind = CIRCULATION_KINDS.includes(p?.kind) ? p.kind : 'couloir';
    const id = nextId(p?.id);
    const floorId = typeof p?.floorId === 'string' ? p.floorId : '';

    if (kind === 'escalier') {
      // Un escalier appartient à son étage de départ ; `floorId` reste rempli
      // pour que le rendu 2D n'ait pas à faire de cas particulier.
      const fromFloorId = typeof p?.fromFloorId === 'string' ? p.fromFloorId : floorId;
      const toFloorId = typeof p?.toFloorId === 'string' ? p.toFloorId : '';
      if (!floorIds.has(fromFloorId)) fail('unknown_floor', fromFloorId || '(vide)');
      if (!floorIds.has(toFloorId)) fail('unknown_floor', toFloorId || '(vide)');
      if (fromFloorId === toFloorId) fail('stair_same_floor', fromFloorId);
      return {
        id, kind, floorId: fromFloorId, cell: normalizeCell(p?.cell, dims, id), fromFloorId, toFloorId,
      };
    }

    if (!floorIds.has(floorId)) fail('unknown_floor', floorId || '(vide)');
    if (kind === 'entree') {
      return { id, kind, floorId, cell: normalizeCell(p?.cell, dims, id), label: asStr(p?.label, 80) };
    }
    return { id, kind, floorId, cells: normalizeCells(p?.cells, dims) };
  });
}

/**
 * Normalise le document complet. Lève `VaultValidationError` sur une incohérence
 * structurelle (dimensions, étages qui se chevauchent, référence inconnue,
 * élément hors gabarit). Les incohérences *de conception* — zones qui se
 * chevauchent, coffre hors zone, étage sans escalier — ne sont pas des
 * erreurs ici : ce sont les warnings non bloquants du panneau, sinon un plan
 * en cours d'édition deviendrait insauvegardable.
 *
 * Sert aussi de migration : les plans écrits avant le passage au tout
 * coffre sans fond perdent `kind`/`facing` (un double devient un coffre à sa
 * case d'ancrage) et les zones héritent de la hauteur de leur étage.
 */
export function normalizeDoc(doc, dims) {
  const src = doc && typeof doc === 'object' ? doc : {};
  const floors = normalizeFloors(src.floors, dims);
  const floorIds = new Set(floors.map((f) => f.id));
  const zones = normalizeZones(src.zones, dims, floors);
  const zoneIds = new Set(zones.map((z) => z.id));
  const chests = normalizeChests(src.chests, dims, zoneIds);
  const circulation = normalizeCirculation(src.circulation, dims, floorIds);
  return { floors, zones, chests, circulation };
}

export const EMPTY_DOC = { floors: [], zones: [], chests: [], circulation: [] };

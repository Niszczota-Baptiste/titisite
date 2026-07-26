// Validation + normalisation du document d'un plan de salle des coffres.
//
// Le client envoie le document entier à chaque sauvegarde ; on le renormalise
// systématiquement pour que ce qui est stocké soit canonique (mêmes clés, même
// ordre de champs, pas de propriété parasite). Deux bénéfices : le diff entre
// deux révisions reste lisible, et l'export futur (.schem / pipeline Anvil) part
// d'une structure garantie.
//
// Ce module ne connaît AUCUNE ressource : un coffre est une case et un type,
// jamais un inventaire.

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

export const CHEST_KINDS = ['single', 'double'];
export const FACINGS = ['north', 'south', 'east', 'west'];
export const CIRCULATION_KINDS = ['couloir', 'escalier', 'entree'];

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const HEX_RE = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;

const isInt = (v) => Number.isInteger(v);
const asInt = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback);
const asStr = (v, max) => String(v ?? '').slice(0, max);
const asBool = (v) => v === true || v === 1;
const asColor = (v, fallback) => (HEX_RE.test(String(v || '')) ? String(v) : fallback);

const ZONE_COLOR = '#c9a8e8';
const FLOOR_COLOR = '#c8a24a';

/**
 * Une case d'un coffre double : l'ancre (x, z) plus la case voisine.
 *
 * L'axe de la paire est déduit de l'orientation, comme en jeu — un double
 * coffre orienté nord/sud est accolé le long de X, est/ouest le long de Z. Rien
 * n'est donc stocké en plus, et une rotation (touche R) réoriente la paire.
 */
export function pairAxis(facing) {
  return facing === 'north' || facing === 'south' ? 'x' : 'z';
}

/** Cases occupées par un coffre : 1 case (simple) ou 2 (double). */
export function chestCells(chest) {
  if (chest.kind !== 'double') return [[chest.x, chest.z]];
  return pairAxis(chest.facing) === 'x'
    ? [[chest.x, chest.z], [chest.x + 1, chest.z]]
    : [[chest.x, chest.z], [chest.x, chest.z + 1]];
}

export function normalizeDims(input) {
  const src = input || {};
  const dims = {
    x: asInt(src.x, 125),
    y: asInt(src.y, 200),
    z: asInt(src.z, 125),
  };
  for (const axis of ['x', 'y', 'z']) {
    // eslint-disable-next-line security/detect-object-injection -- axis vient d'une liste littérale
    const v = dims[axis];
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
  const sorted = [...floors].sort((a, b) => a.yMin - b.yMin);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].yMin <= sorted[i - 1].yMax) {
      fail('floors_overlap', `${sorted[i - 1].name || sorted[i - 1].id} / ${sorted[i].name || sorted[i].id}`);
    }
  }
  return floors;
}

function normalizeZones(raw, dims, floorIds) {
  const list = Array.isArray(raw) ? raw : [];
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
    if (!floorIds.has(floorId)) fail('unknown_floor', floorId || '(vide)');

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
      name: asStr(z?.name, 80),
      color: asColor(z?.color, ZONE_COLOR),
      categoryIds,
      // Réserve manuelle, en slots. C'est le seul « besoin » du modèle : aucun
      // item ni aucune quantité n'est stocké dans un coffre.
      reservedSlots: Math.max(0, asInt(z?.reservedSlots, 0)),
      // Zone tampon gardée libre pour une future MàJ Minecraft : hachurée dans
      // les trois vues, exclue des calculs de capacité.
      reserved: asBool(z?.reserved),
      notes: asStr(z?.notes, 2000),
    };
  });
}

function normalizeChests(raw, dims, zoneIds) {
  const list = Array.isArray(raw) ? raw : [];
  const nextId = idFactory('c');
  return list.map((c) => {
    const x = asInt(c?.x, 0);
    const y = asInt(c?.y, 0);
    const z = asInt(c?.z, 0);
    const kind = CHEST_KINDS.includes(c?.kind) ? c.kind : 'single';
    const facing = FACINGS.includes(c?.facing) ? c.facing : 'south';
    const chest = { id: nextId(c?.id), zoneId: null, x, y, z, kind, facing, label: asStr(c?.label, 60) };

    for (const [cx, cz] of chestCells(chest)) {
      if (cx < 0 || cz < 0 || cx >= dims.x || cz >= dims.z) {
        fail('chest_out_of_bounds', `${chest.id} @ ${cx},${cz}`);
      }
    }
    if (y < 0 || y >= dims.y) fail('chest_out_of_bounds', `${chest.id} @ y=${y}`);

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
 * chevauchent, coffre inaccessible, étage sans escalier — ne sont pas des
 * erreurs ici : ce sont les warnings non bloquants du panneau, sinon un plan
 * en cours d'édition deviendrait insauvegardable.
 */
export function normalizeDoc(doc, dims) {
  const src = doc && typeof doc === 'object' ? doc : {};
  const floors = normalizeFloors(src.floors, dims);
  const floorIds = new Set(floors.map((f) => f.id));
  const zones = normalizeZones(src.zones, dims, floorIds);
  const zoneIds = new Set(zones.map((z) => z.id));
  const chests = normalizeChests(src.chests, dims, zoneIds);
  const circulation = normalizeCirculation(src.circulation, dims, floorIds);
  return { floors, zones, chests, circulation };
}

export const EMPTY_DOC = { floors: [], zones: [], chests: [], circulation: [] };

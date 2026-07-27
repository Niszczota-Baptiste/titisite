// Capacité et validations douces du plan — fonctions pures.
//
// Miroir client de server/vault/capacity.js (le front ne peut pas importer du
// serveur) : mêmes règles, mais on descend au niveau de la zone, de la catégorie
// et du coffre, et on produit les warnings du panneau.
//
// Le seul contenant est le coffre sans fond : 72 slots, 1×1×1, ouvrable de
// n'importe où — donc pas de contrainte d'accès. « Disponible » = coffres × 72,
// « besoin » = la réserve manuelle de la zone. Les items affectés à un coffre
// sont une désignation de rangement, jamais un stock : aucune quantité.

// Extension explicite : ces deux modules sont purs et testés par `node --test`
// (test/vault-geometry.test.js), qui résout les imports sans l'aide de Vite.
import { rectArea, rectsOverlap } from './planGeometry.js';

export const CHEST_SLOTS = 72;
export const chestSlots = () => CHEST_SLOTS;

export const zoneLevels = (zone) => Math.max(1, (zone?.yMax ?? 0) - (zone?.yMin ?? 0) + 1);
export const zoneVolume = (zone) => rectArea(zone.rect) * zoneLevels(zone);

export function levelOf(ratio) {
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

/** Capacité d'une zone : coffres posés vs réserve annoncée. */
export function zoneStats(zone, chests) {
  const own = chests.filter((c) => c.zoneId === zone.id);
  const slots = own.length * CHEST_SLOTS;
  const needed = zone.reserved ? 0 : (zone.reservedSlots || 0);
  const ratio = slots > 0 ? needed / slots : (needed > 0 ? Infinity : 0);
  const assigned = own.filter((c) => c.items?.length > 0).length;
  return {
    chests: own.length,
    slots,
    needed,
    delta: slots - needed,
    ratio,
    level: zone.reserved ? 'ok' : levelOf(ratio),
    area: rectArea(zone.rect),
    levels: zoneLevels(zone),
    volume: zoneVolume(zone),
    assigned,
    free: own.length - assigned,
  };
}

export function planTotals(doc, dims) {
  const zoneById = new Map(doc.zones.map((z) => [z.id, z]));
  let usable = 0;
  let assigned = 0;
  const items = new Set();
  for (const c of doc.chests) {
    if (!zoneById.get(c.zoneId)?.reserved) usable += 1;
    if (c.items?.length > 0) {
      assigned += 1;
      for (const id of c.items) items.add(id);
    }
  }
  let needed = 0;
  let reservedZones = 0;
  let reservedVolume = 0;
  for (const z of doc.zones) {
    if (z.reserved) {
      reservedZones += 1;
      reservedVolume += zoneVolume(z);
      continue;
    }
    needed += z.reservedSlots || 0;
  }
  const slots = usable * CHEST_SLOTS;
  const volume = dims.x * dims.y * dims.z;
  return {
    floors: doc.floors.length,
    zones: doc.zones.length,
    chests: doc.chests.length,
    slots,
    needed,
    delta: slots - needed,
    ratio: slots > 0 ? needed / slots : (needed > 0 ? Infinity : 0),
    assignedChests: assigned,
    freeChests: doc.chests.length - assigned,
    distinctItems: items.size,
    reservedZones,
    reservedVolumePct: volume > 0 ? (reservedVolume / volume) * 100 : 0,
  };
}

/**
 * Tableau de bord par catégorie : une zone reverse sa réserve et ses coffres à
 * chacune de ses catégories. Les zones sans catégorie sont regroupées sous
 * « Non catégorisé ».
 */
export function categoryBreakdown(doc, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows = new Map();
  const bump = (key, name, color) => {
    if (!rows.has(key)) rows.set(key, { key, name, color, zones: 0, chests: 0, slots: 0, needed: 0, assigned: 0 });
    return rows.get(key);
  };
  for (const zone of doc.zones) {
    if (zone.reserved) continue;
    const stats = zoneStats(zone, doc.chests);
    const ids = (zone.categoryIds || []).filter((id) => byId.has(id));
    const targets = ids.length > 0
      ? ids.map((id) => bump(`c${id}`, byId.get(id).name, byId.get(id).color))
      : [bump('none', 'Non catégorisé', 'rgba(180,170,200,0.5)')];
    for (const row of targets) {
      row.zones += 1;
      row.chests += stats.chests;
      row.slots += stats.slots;
      row.needed += stats.needed;
      row.assigned += stats.assigned;
    }
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      delta: r.slots - r.needed,
      level: levelOf(r.slots > 0 ? r.needed / r.slots : (r.needed > 0 ? Infinity : 0)),
    }))
    .sort((a, b) => a.delta - b.delta);
}

// ── Validations douces ────────────────────────────────────────────────────
// Jamais bloquantes : elles décrivent des défauts de conception, pas des
// documents invalides (ceux-là sont refusés par le serveur). Le coffre sans
// fond s'ouvrant de n'importe où, l'accessibilité n'en fait plus partie.

export function computeWarnings(doc) {
  const out = [];
  const zoneById = new Map(doc.zones.map((z) => [z.id, z]));

  // Zones qui se chevauchent — au sol ET en hauteur (deux zones peuvent
  // légitimement partager une empreinte si elles occupent des niveaux distincts).
  for (let i = 0; i < doc.zones.length; i += 1) {
    for (let j = i + 1; j < doc.zones.length; j += 1) {
      const a = doc.zones[i]; const b = doc.zones[j];
      if (a.floorId !== b.floorId || !rectsOverlap(a.rect, b.rect)) continue;
      if (a.yMax < b.yMin || b.yMax < a.yMin) continue;
      out.push({
        id: `overlap:${a.id}:${b.id}`,
        kind: 'zones_overlap',
        floorId: a.floorId,
        target: { type: 'zone', id: a.id },
        message: `Les zones « ${a.name || a.id} » et « ${b.name || b.id} » se chevauchent (niveaux compris).`,
      });
    }
  }

  // Coffres : hors zone, superposés, hors des niveaux de leur zone.
  const occupancy = new Map();
  for (const chest of doc.chests) {
    const zone = chest.zoneId ? zoneById.get(chest.zoneId) : null;
    const floorId = zone?.floorId
      ?? doc.floors.find((f) => chest.y >= f.yMin && chest.y <= f.yMax)?.id
      ?? null;

    if (!zone) {
      out.push({
        id: `nozone:${chest.id}`,
        kind: 'chest_outside_zone',
        floorId,
        target: { type: 'chest', id: chest.id },
        message: `Coffre en ${chest.x}, ${chest.y}, ${chest.z} hors de toute zone.`,
      });
    } else if (chest.y < zone.yMin || chest.y > zone.yMax) {
      out.push({
        id: `offlevel:${chest.id}`,
        kind: 'chest_off_level',
        floorId,
        target: { type: 'chest', id: chest.id },
        message: `Coffre en Y ${chest.y} en dehors des niveaux de « ${zone.name || zone.id} » (${zone.yMin}–${zone.yMax}).`,
      });
    }

    const key = `${chest.y}:${chest.x},${chest.z}`;
    const other = occupancy.get(key);
    if (other) {
      out.push({
        id: `stack:${other}:${chest.id}`,
        kind: 'chests_overlap',
        floorId,
        target: { type: 'chest', id: chest.id },
        message: `Deux coffres occupent la case ${chest.x}, ${chest.z} (Y ${chest.y}).`,
      });
    } else {
      occupancy.set(key, chest.id);
    }
  }

  // Un même item rangé à deux endroits : c'est légitime (stock déporté) mais
  // ça se signale, sinon l'annuaire devient ambigu.
  const places = new Map();
  for (const chest of doc.chests) {
    for (const item of chest.items || []) {
      if (!places.has(item)) places.set(item, []);
      places.get(item).push(chest);
    }
  }
  for (const [item, list] of places) {
    if (list.length < 2) continue;
    out.push({
      id: `dup:${item}`,
      kind: 'item_duplicated',
      floorId: zoneById.get(list[0].zoneId)?.floorId ?? null,
      target: { type: 'chest', id: list[0].id },
      message: `« ${item} » est affecté à ${list.length} coffres.`,
    });
  }

  // Étages sans liaison d'escalier (inutile de le dire quand il n'y a qu'un étage).
  if (doc.floors.length > 1) {
    const linked = new Set();
    for (const p of doc.circulation) {
      if (p.kind !== 'escalier') continue;
      linked.add(p.fromFloorId); linked.add(p.toFloorId);
    }
    for (const f of doc.floors) {
      if (linked.has(f.id)) continue;
      out.push({
        id: `nostair:${f.id}`,
        kind: 'floor_no_stairs',
        floorId: f.id,
        target: { type: 'floor', id: f.id },
        message: `L'étage « ${f.name || f.id} » n'est relié par aucun escalier.`,
      });
    }
  }

  // Zones dont la réserve dépasse ce que les coffres posés offrent.
  for (const zone of doc.zones) {
    if (zone.reserved) continue;
    const s = zoneStats(zone, doc.chests);
    if (s.needed > s.slots) {
      out.push({
        id: `over:${zone.id}`,
        kind: 'zone_over_capacity',
        floorId: zone.floorId,
        target: { type: 'zone', id: zone.id },
        message: `« ${zone.name || zone.id} » : réserve de ${s.needed} slots pour ${s.slots} disponibles.`,
      });
    }
  }

  return out;
}

export const WARNING_LABELS = {
  zones_overlap: 'Zones superposées',
  chest_outside_zone: 'Coffre hors zone',
  chest_off_level: 'Coffre hors niveaux',
  chests_overlap: 'Coffres superposés',
  item_duplicated: 'Item rangé en double',
  floor_no_stairs: 'Étage isolé',
  zone_over_capacity: 'Réserve > capacité',
};

/**
 * L'annuaire : une ligne par item affecté, avec l'endroit exact où il va.
 * C'est la sortie utile du plan — ce qu'on garde ouvert en rangeant en jeu.
 */
export function storageIndex(doc, { itemName = (id) => id } = {}) {
  const zoneById = new Map(doc.zones.map((z) => [z.id, z]));
  const floorById = new Map(doc.floors.map((f) => [f.id, f]));
  const rows = [];
  for (const chest of doc.chests) {
    for (const item of chest.items || []) {
      const zone = chest.zoneId ? zoneById.get(chest.zoneId) : null;
      rows.push({
        item,
        name: itemName(item),
        chestId: chest.id,
        zone: zone || null,
        floor: zone ? floorById.get(zone.floorId) : null,
        x: chest.x,
        y: chest.y,
        z: chest.z,
        label: chest.label || '',
      });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

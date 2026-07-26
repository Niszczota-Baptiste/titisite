// Capacité et validations douces du plan — fonctions pures.
//
// Miroir client de server/vault/capacity.js (le front ne peut pas importer du
// serveur) : mêmes règles, mais on descend au niveau de la zone et de la
// catégorie, et on produit les warnings du panneau.
//
// Rappel du modèle : aucune ressource n'est stockée. « Disponible » = ce que les
// coffres posés offrent, « besoin » = la réserve manuelle saisie sur la zone.

// Extension explicite : ces deux modules sont purs et testés par `node --test`
// (test/vault-geometry.test.js), qui résout les imports sans l'aide de Vite.
import { accessSet, cellKey, chestCells, rectArea, rectsOverlap } from './planGeometry.js';

export const CHEST_SLOTS = { single: 27, double: 54 };
export const chestSlots = (chest) => (chest.kind === 'double' ? CHEST_SLOTS.double : CHEST_SLOTS.single);

export function levelOf(ratio) {
  if (ratio > 1) return 'over';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

/** Capacité d'une zone : coffres posés vs réserve annoncée. */
export function zoneStats(zone, chests) {
  const own = chests.filter((c) => c.zoneId === zone.id);
  const slots = own.reduce((n, c) => n + chestSlots(c), 0);
  const needed = zone.reserved ? 0 : (zone.reservedSlots || 0);
  const ratio = slots > 0 ? needed / slots : (needed > 0 ? Infinity : 0);
  return {
    chests: own.length,
    slots,
    needed,
    delta: slots - needed,
    ratio,
    level: zone.reserved ? 'ok' : levelOf(ratio),
    area: rectArea(zone.rect),
  };
}

export function planTotals(doc, dims) {
  const zoneById = new Map(doc.zones.map((z) => [z.id, z]));
  let slots = 0;
  let doubles = 0;
  for (const c of doc.chests) {
    if (c.zoneId && zoneById.get(c.zoneId)?.reserved) continue;
    if (c.kind === 'double') doubles += 1;
    slots += chestSlots(c);
  }
  let needed = 0;
  let reservedZones = 0;
  let reservedVolume = 0;
  const floorById = new Map(doc.floors.map((f) => [f.id, f]));
  for (const z of doc.zones) {
    if (z.reserved) {
      reservedZones += 1;
      const f = floorById.get(z.floorId);
      reservedVolume += rectArea(z.rect) * (f ? f.yMax - f.yMin + 1 : 1);
      continue;
    }
    needed += z.reservedSlots || 0;
  }
  const volume = dims.x * dims.y * dims.z;
  return {
    floors: doc.floors.length,
    zones: doc.zones.length,
    chests: doc.chests.length,
    doubles,
    singles: doc.chests.length - doubles,
    slots,
    needed,
    delta: slots - needed,
    ratio: slots > 0 ? needed / slots : (needed > 0 ? Infinity : 0),
    reservedZones,
    reservedVolumePct: volume > 0 ? (reservedVolume / volume) * 100 : 0,
  };
}

/**
 * Tableau de bord par catégorie : une zone reverse sa réserve et ses slots à
 * chacune de ses catégories (une zone peut en porter plusieurs). Les zones sans
 * catégorie sont regroupées sous « Non catégorisé ».
 */
export function categoryBreakdown(doc, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows = new Map();
  const bump = (key, name, color) => {
    if (!rows.has(key)) rows.set(key, { key, name, color, zones: 0, slots: 0, needed: 0 });
    return rows.get(key);
  };
  for (const zone of doc.zones) {
    if (zone.reserved) continue;
    const stats = zoneStats(zone, doc.chests);
    const ids = (zone.categoryIds || []).filter((id) => byId.has(id));
    if (ids.length === 0) {
      const row = bump('none', 'Non catégorisé', 'rgba(180,170,200,0.5)');
      row.zones += 1; row.slots += stats.slots; row.needed += stats.needed;
      continue;
    }
    for (const id of ids) {
      const cat = byId.get(id);
      const row = bump(`c${id}`, cat.name, cat.color);
      row.zones += 1; row.slots += stats.slots; row.needed += stats.needed;
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, delta: r.slots - r.needed, level: levelOf(r.slots > 0 ? r.needed / r.slots : (r.needed > 0 ? Infinity : 0)) }))
    .sort((a, b) => a.delta - b.delta);
}

// ── Validations douces ────────────────────────────────────────────────────
// Jamais bloquantes : elles décrivent des défauts de conception, pas des
// documents invalides (ceux-là sont refusés par le serveur).

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function computeWarnings(doc) {
  const out = [];
  const floorById = new Map(doc.floors.map((f) => [f.id, f]));
  const zoneById = new Map(doc.zones.map((z) => [z.id, z]));
  const accessByFloor = new Map(
    doc.floors.map((f) => [f.id, accessSet(doc.circulation, f.id)]),
  );

  // Zones qui se chevauchent (même étage).
  for (let i = 0; i < doc.zones.length; i += 1) {
    for (let j = i + 1; j < doc.zones.length; j += 1) {
      const a = doc.zones[i]; const b = doc.zones[j];
      if (a.floorId !== b.floorId || !rectsOverlap(a.rect, b.rect)) continue;
      out.push({
        id: `overlap:${a.id}:${b.id}`,
        kind: 'zones_overlap',
        floorId: a.floorId,
        target: { type: 'zone', id: a.id },
        message: `Les zones « ${a.name || a.id} » et « ${b.name || b.id} » se chevauchent.`,
      });
    }
  }

  // Coffres : hors zone, inaccessibles, superposés.
  const occupancy = new Map();
  for (const chest of doc.chests) {
    const zone = chest.zoneId ? zoneById.get(chest.zoneId) : null;
    const floor = zone ? floorById.get(zone.floorId) : doc.floors.find((f) => chest.y >= f.yMin && chest.y <= f.yMax);
    const floorId = floor?.id || null;

    if (!zone) {
      out.push({
        id: `nozone:${chest.id}`,
        kind: 'chest_outside_zone',
        floorId,
        target: { type: 'chest', id: chest.id },
        message: `Coffre en ${chest.x}, ${chest.y}, ${chest.z} hors de toute zone.`,
      });
    }

    const access = floorId ? accessByFloor.get(floorId) : null;
    if (access && access.size > 0) {
      const reachable = chestCells(chest).some(([x, z]) => NEIGHBOURS
        .some(([dx, dz]) => access.has(cellKey(x + dx, z + dz))));
      if (!reachable) {
        out.push({
          id: `noaccess:${chest.id}`,
          kind: 'chest_no_access',
          floorId,
          target: { type: 'chest', id: chest.id },
          message: `Coffre en ${chest.x}, ${chest.y}, ${chest.z} sans circulation adjacente.`,
        });
      }
    }

    for (const [x, z] of chestCells(chest)) {
      const key = `${chest.y}:${x},${z}`;
      const other = occupancy.get(key);
      if (other) {
        out.push({
          id: `stack:${other}:${chest.id}`,
          kind: 'chests_overlap',
          floorId,
          target: { type: 'chest', id: chest.id },
          message: `Deux coffres occupent la case ${x}, ${z} (y=${chest.y}).`,
        });
      } else {
        occupancy.set(key, chest.id);
      }
    }
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
  chest_no_access: 'Coffre inaccessible',
  chests_overlap: 'Coffres superposés',
  floor_no_stairs: 'Étage isolé',
  zone_over_capacity: 'Réserve > capacité',
};

// Capacité d'un plan de salle des coffres — purement structurelle.
//
// Le seul contenant est le coffre sans fond de Minefield : 72 slots, 1×1×1.
// « Disponible » = nombre de coffres posés × 72. « Besoin » = la réserve
// manuelle saisie sur la zone, en slots. Aucune quantité de ressource n'entre
// dans ce calcul : le module conçoit la salle, il ne suit pas son contenu — un
// coffre peut être *dédié* à des items, c'est une désignation de rangement.
//
// Les zones marquées `reserved` (tampon pour une future MàJ Minecraft) sont
// exclues des totaux et comptées à part.

import { CHEST_SLOTS } from './validate.js';

export { CHEST_SLOTS };

export const zoneArea = (zone) => {
  const r = zone?.rect;
  if (!r) return 0;
  return (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
};

export const zoneLevels = (zone) => Math.max(1, (zone?.yMax ?? 0) - (zone?.yMin ?? 0) + 1);

/** Résumé d'un plan — sert les cartes de la liste et le tableau de bord. */
export function planStats(doc, dims) {
  const floors = Array.isArray(doc?.floors) ? doc.floors : [];
  const zones = Array.isArray(doc?.zones) ? doc.zones : [];
  const chests = Array.isArray(doc?.chests) ? doc.chests : [];

  const zoneById = new Map(zones.map((z) => [z.id, z]));

  let usable = 0;
  let assigned = 0;
  const items = new Set();
  for (const c of chests) {
    // Un coffre posé dans une zone réservée ne compte pas dans la capacité
    // utile — la zone est censée rester vide jusqu'à la MàJ.
    const zone = c.zoneId ? zoneById.get(c.zoneId) : null;
    if (!zone?.reserved) usable += 1;
    if (c.items?.length > 0) {
      assigned += 1;
      for (const id of c.items) items.add(id);
    }
  }

  let reservedSlots = 0;
  let reservedZones = 0;
  let reservedVolume = 0;
  for (const z of zones) {
    if (z.reserved) {
      reservedZones += 1;
      reservedVolume += zoneArea(z) * zoneLevels(z);
      continue;
    }
    reservedSlots += z.reservedSlots || 0;
  }

  const slots = usable * CHEST_SLOTS;
  const volume = dims ? dims.x * dims.y * dims.z : 0;
  return {
    floors: floors.length,
    zones: zones.length,
    chests: chests.length,
    slots,
    reservedSlots,
    // > 0 = il manque des coffres pour couvrir la réserve annoncée.
    deficit: Math.max(0, reservedSlots - slots),
    // Coffres déjà affectés à au moins un item, et nombre d'items distincts
    // rangés : c'est l'avancement du « plan dans le plan ».
    assignedChests: assigned,
    distinctItems: items.size,
    reservedZones,
    reservedVolume,
    reservedVolumePct: volume > 0 ? Math.round((reservedVolume / volume) * 1000) / 10 : 0,
  };
}

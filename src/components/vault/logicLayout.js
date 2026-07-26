// Mise en page de la vue Logique — pure, sans DOM.
//
// Le diagramme n'est jamais édité à la main : il est recalculé depuis le
// document à chaque modification. Lecture façon plan de magasin : une bande par
// étage (le plus haut en premier), les zones en colonnes dans la bande, les
// escaliers en liaisons verticales dans la gouttière de gauche, les entrées
// accrochées à leur étage.

import { zoneStats } from './capacity';

export const LAYOUT = {
  cols: 4,
  zoneW: 168,
  zoneH: 76,
  gap: 14,
  bandPadTop: 40,
  bandPadBottom: 16,
  gutter: 104,
  top: 20,
  side: 16,
};

export function layoutLogic(doc, categories = []) {
  const L = LAYOUT;
  const catById = new Map(categories.map((c) => [c.id, c]));
  const floors = [...doc.floors].sort((a, b) => b.yMin - a.yMin);

  const bands = [];
  let y = L.top;
  for (const floor of floors) {
    const zones = doc.zones.filter((z) => z.floorId === floor.id);
    const entries = doc.circulation.filter((p) => p.kind === 'entree' && p.floorId === floor.id);
    const rows = Math.max(1, Math.ceil(zones.length / L.cols));
    const height = L.bandPadTop + rows * (L.zoneH + L.gap) - L.gap + L.bandPadBottom;

    bands.push({
      id: floor.id,
      name: floor.name || floor.id,
      color: floor.color,
      yMin: floor.yMin,
      yMax: floor.yMax,
      y,
      height,
      entries: entries.map((e, i) => ({ id: e.id, label: e.label || 'Entrée', y: y + L.bandPadTop + i * 22 })),
      zones: zones.map((z, i) => {
        const stats = zoneStats(z, doc.chests);
        return {
          id: z.id,
          name: z.name || z.id,
          color: z.color,
          reserved: !!z.reserved,
          categories: (z.categoryIds || []).map((cid) => catById.get(cid)).filter(Boolean),
          stats,
          x: L.gutter + (i % L.cols) * (L.zoneW + L.gap),
          y: y + L.bandPadTop + Math.floor(i / L.cols) * (L.zoneH + L.gap),
          w: L.zoneW,
          h: L.zoneH,
        };
      }),
    });
    y += height + L.gap;
  }

  const bandById = new Map(bands.map((b) => [b.id, b]));
  const links = [];
  let lane = 0;
  for (const p of doc.circulation) {
    if (p.kind !== 'escalier') continue;
    const from = bandById.get(p.fromFloorId);
    const to = bandById.get(p.toFloorId);
    if (!from || !to) continue;
    lane += 1;
    links.push({
      id: p.id,
      x: 26 + ((lane - 1) % 3) * 14,
      y1: from.y + from.height / 2,
      y2: to.y + to.height / 2,
      label: `${p.cell?.[0] ?? '?'}, ${p.cell?.[1] ?? '?'}`,
    });
  }

  const width = L.gutter + L.cols * (L.zoneW + L.gap) - L.gap + L.side;
  return { bands, links, width, height: Math.max(y, L.top + 60) };
}

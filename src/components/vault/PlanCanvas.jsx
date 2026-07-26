import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  accessSet, buildRow, cellAt, cellKey, chestCells, chestIndex, clampRect, fitView, inBounds,
  lineCells, panBy, rectContains, rectFrom, worldToScreen, zoneAt, zoomAt,
} from './planGeometry';
import { zoneStats } from './capacity';
import {
  CHEST, CHEST_DIM, CHUNK, CORRIDOR, ENTRY, GRID, GRID_STRONG, GOLD, LEVELS, STAIR,
} from './theme';

// Vue Plan : canvas 2D natif (125×125 = 15 625 cases par étage — pas de DOM par
// case). Le composant possède la vue (pan/zoom) et le geste en cours ; toute
// modification du document remonte par `onEdit(mutate)`.

export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const FACING_ARROW = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

export function PlanCanvas({
  doc, dims, worldOrigin, floor, currentY, tool, options, selection, categories = [],
  overlays, onEdit, onSelect, onHover, focus,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [hover, setHover] = useState(null);
  const [ghost, setGhost] = useState(null);
  const drag = useRef(null);
  const spaceDown = useRef(false);

  // Les gestes lisent l'état courant par ref : les écouteurs restent stables.
  const state = useRef({});
  state.current = { doc, dims, floor, currentY, tool, options, selection, view };

  // ── Dimensionnement ────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 560 });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setView((v) => v || fitView(dims, size.w, size.h));
  }, [dims, size.w, size.h]);

  const resetView = useCallback(() => setView(fitView(dims, size.w, size.h)), [dims, size.w, size.h]);

  // Centrage sur un élément (clic dans le panneau warnings / la vue logique).
  useEffect(() => {
    if (!focus || !view) return;
    let target = null;
    if (focus.type === 'zone') {
      const z = doc.zones.find((x) => x.id === focus.id);
      if (z) target = { x: (z.rect.x0 + z.rect.x1) / 2, z: (z.rect.z0 + z.rect.z1) / 2 };
    } else if (focus.type === 'chest') {
      const c = doc.chests.find((x) => x.id === focus.id);
      if (c) target = { x: c.x + 0.5, z: c.z + 0.5 };
    }
    if (target) {
      setView((v) => ({ ...v, x: target.x - size.w / (2 * v.scale), z: target.z - size.h / (2 * v.scale) }));
    }
    // Volontairement piloté par `focus` seul : recentrer à chaque frappe de
    // l'utilisateur (doc, taille…) rendrait le canvas incontrôlable.
    /* eslint-disable-next-line */
  }, [focus]);

  // ── Rendu ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view || !floor) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, {
      doc, dims, floor, currentY, view, size, hover, ghost, selection, overlays, categories,
    });
  }, [doc, dims, floor, currentY, view, size, hover, ghost, selection, overlays, categories]);

  // ── Gestes ─────────────────────────────────────────────────────────────

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  };

  // React attache `onWheel` en écouteur passif : preventDefault y est ignoré et
  // la page défilerait sous le curseur. D'où l'écouteur natif non passif.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setView((v) => (v ? zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top) : v));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e) => {
    const { sx, sy } = pointFrom(e);
    const s = state.current;
    if (!s.view || !s.floor) return;
    canvasRef.current.setPointerCapture(e.pointerId);
    const cell = cellAt(s.view, sx, sy);

    // Pan : molette, clic droit, ou barre d'espace maintenue.
    if (e.button === 1 || e.button === 2 || spaceDown.current) {
      drag.current = { mode: 'pan', last: { sx, sy } };
      return;
    }
    if (e.button !== 0) return;

    const shift = e.shiftKey;
    if (s.tool === 'select') {
      const chest = chestIndex(chestsOfFloor(s.doc, s.floor, s.currentY)).get(cellKey(cell.x, cell.z));
      if (chest && s.selection?.type === 'chest' && s.selection.ids.includes(chest.id)) {
        drag.current = { mode: 'move', from: cell, offset: { x: 0, z: 0 } };
        return;
      }
      if (chest) {
        onSelect({ type: 'chest', ids: [chest.id] });
        drag.current = { mode: 'move', from: cell, offset: { x: 0, z: 0 }, ids: [chest.id] };
        return;
      }
      drag.current = { mode: 'marquee', from: cell };
      return;
    }
    if (s.tool === 'zone') { drag.current = { mode: 'zone', from: cell }; return; }
    if (s.tool === 'row')  { drag.current = { mode: 'row', from: cell, single: shift }; return; }
    if (s.tool === 'corridor' || s.tool === 'erase') {
      drag.current = { mode: s.tool, cells: [], last: cell };
      applyBrush(cell, cell);
      return;
    }
    if (s.tool === 'chest') { placeChest(cell); return; }
    if (s.tool === 'stair') { placeStair(cell); return; }
    if (s.tool === 'entry') { placeEntry(cell); return; }
  };

  const onPointerMove = (e) => {
    const { sx, sy } = pointFrom(e);
    const s = state.current;
    if (!s.view) return;
    const cell = cellAt(s.view, sx, sy);
    setHover(cell);
    onHover?.(inBounds(s.dims, cell.x, cell.z) ? cell : null);

    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      setView((v) => panBy(v, sx - d.last.sx, sy - d.last.sy));
      d.last = { sx, sy };
      return;
    }
    if (d.mode === 'zone' || d.mode === 'marquee') {
      setGhost({ kind: d.mode, rect: clampRect(rectFrom(d.from, cell), s.dims) });
      return;
    }
    if (d.mode === 'row') {
      setGhost({ kind: 'row', chests: previewRow(d.from, cell, d.single) });
      return;
    }
    if (d.mode === 'move') {
      setGhost({ kind: 'move', dx: cell.x - d.from.x, dz: cell.z - d.from.z });
      return;
    }
    if (d.mode === 'corridor' || d.mode === 'erase') {
      applyBrush(d.last, cell);
      d.last = cell;
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    const s = state.current;
    const { sx, sy } = pointFrom(e);
    const cell = cellAt(s.view, sx, sy);

    if (d.mode === 'zone') commitZone(clampRect(rectFrom(d.from, cell), s.dims));
    else if (d.mode === 'row') commitRow(previewRow(d.from, cell, d.single));
    else if (d.mode === 'marquee') commitMarquee(clampRect(rectFrom(d.from, cell), s.dims));
    else if (d.mode === 'move') commitMove(cell.x - d.from.x, cell.z - d.from.z, d.ids);
  };

  // ── Actions ────────────────────────────────────────────────────────────

  const chestsHere = (s = state.current) => chestsOfFloor(s.doc, s.floor, s.currentY);

  function previewRow(from, to, single) {
    const s = state.current;
    return buildRow(from, to, {
      dims: s.dims,
      y: s.currentY,
      zoneId: zoneAt(s.doc.zones, s.floor.id, from.x, from.z)?.id ?? null,
      single: single || s.options.chestKind === 'single',
      facing: s.options.autoFacing ? null : s.options.facing,
      access: accessSet(s.doc.circulation, s.floor.id),
    });
  }

  function commitRow(chests) {
    if (chests.length === 0) return;
    onEdit((d) => ({ ...d, chests: [...d.chests, ...chests] }));
    onSelect({ type: 'chest', ids: chests.map((c) => c.id) });
  }

  function placeChest(cell) {
    const s = state.current;
    if (!inBounds(s.dims, cell.x, cell.z)) return;
    const chest = {
      id: newId('c'),
      zoneId: zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z)?.id ?? null,
      x: cell.x, y: s.currentY, z: cell.z,
      kind: s.options.chestKind, facing: s.options.facing, label: '',
    };
    if (!chestCells(chest).every(([x, z]) => inBounds(s.dims, x, z))) return;
    onEdit((d) => ({ ...d, chests: [...d.chests, chest] }));
    onSelect({ type: 'chest', ids: [chest.id] });
  }

  function commitZone(rect) {
    const s = state.current;
    if (rect.x1 - rect.x0 < 1 && rect.z1 - rect.z0 < 1) return;
    const zone = {
      id: newId('z'),
      floorId: s.floor.id,
      rect,
      name: `Zone ${s.doc.zones.filter((z) => z.floorId === s.floor.id).length + 1}`,
      color: s.options.zoneColor,
      categoryIds: [],
      reservedSlots: 0,
      reserved: false,
      notes: '',
    };
    onEdit((d) => ({ ...d, zones: [...d.zones, zone] }));
    onSelect({ type: 'zone', ids: [zone.id] });
  }

  function commitMarquee(rect) {
    const s = state.current;
    const ids = chestsHere(s)
      .filter((c) => chestCells(c).some(([x, z]) => rectContains(rect, x, z)))
      .map((c) => c.id);
    if (ids.length > 0) onSelect({ type: 'chest', ids });
    else {
      const zone = zoneAt(s.doc.zones, s.floor.id, rect.x0, rect.z0);
      onSelect(zone ? { type: 'zone', ids: [zone.id] } : { type: null, ids: [] });
    }
  }

  function commitMove(dx, dz, explicitIds) {
    const s = state.current;
    // `explicitIds` : la sélection créée au pointerdown même geste — l'état
    // React n'est pas forcément encore descendu jusqu'ici.
    const list = explicitIds?.length ? explicitIds : s.selection?.ids;
    if ((dx === 0 && dz === 0) || !list?.length) return;
    const ids = new Set(list);
    onEdit((d) => {
      const moved = d.chests.map((c) => (ids.has(c.id) ? { ...c, x: c.x + dx, z: c.z + dz } : c));
      const ok = moved.every((c) => chestCells(c).every(([x, z]) => inBounds(s.dims, x, z)));
      return ok ? { ...d, chests: moved } : d;
    });
  }

  function placeStair(cell) {
    const s = state.current;
    const target = s.options.stairTarget;
    if (!target || target === s.floor.id || !inBounds(s.dims, cell.x, cell.z)) return;
    const stair = {
      id: newId('s'), kind: 'escalier', floorId: s.floor.id, cell: [cell.x, cell.z],
      fromFloorId: s.floor.id, toFloorId: target,
    };
    onEdit((d) => ({ ...d, circulation: [...d.circulation, stair] }));
  }

  function placeEntry(cell) {
    const s = state.current;
    if (!inBounds(s.dims, cell.x, cell.z)) return;
    const entry = {
      id: newId('e'), kind: 'entree', floorId: s.floor.id, cell: [cell.x, cell.z],
      label: `Entrée ${s.doc.circulation.filter((p) => p.kind === 'entree').length + 1}`,
    };
    onEdit((d) => ({ ...d, circulation: [...d.circulation, entry] }));
  }

  // Pinceau couloir / gomme : on peint toutes les cases traversées depuis le
  // dernier événement, sinon un geste rapide laisse des trous.
  function applyBrush(from, to) {
    const s = state.current;
    const cells = lineCells(from, to).filter(([x, z]) => inBounds(s.dims, x, z));
    if (cells.length === 0) return;
    const painted = new Set(cells.map(([x, z]) => cellKey(x, z)));

    if (s.tool === 'corridor') {
      onEdit((d) => {
        const idx = d.circulation.findIndex((p) => p.kind === 'couloir' && p.floorId === s.floor.id);
        const existing = idx >= 0 ? d.circulation[idx] : null;
        const keys = new Set((existing?.cells || []).map(([x, z]) => cellKey(x, z)));
        const added = cells.filter(([x, z]) => !keys.has(cellKey(x, z)));
        if (added.length === 0) return d;
        const merged = { ...(existing || { id: newId('p'), kind: 'couloir', floorId: s.floor.id, cells: [] }) };
        merged.cells = [...(existing?.cells || []), ...added];
        const circulation = [...d.circulation];
        if (idx >= 0) circulation[idx] = merged; else circulation.push(merged);
        return { ...d, circulation };
      });
      return;
    }

    // Gomme : coffres du niveau courant, puis circulation de l'étage. Les zones
    // ne s'effacent qu'explicitement depuis leur fiche (un rectangle entier
    // disparaîtrait sur un frôlement de souris).
    onEdit((d) => {
      const doomed = new Set();
      for (const c of chestsOfFloor(d, s.floor, s.currentY)) {
        if (chestCells(c).some(([x, z]) => painted.has(cellKey(x, z)))) doomed.add(c.id);
      }
      const circulation = [];
      let touched = doomed.size > 0;
      for (const p of d.circulation) {
        if (p.floorId !== s.floor.id) { circulation.push(p); continue; }
        if (p.kind === 'couloir') {
          const kept = p.cells.filter(([x, z]) => !painted.has(cellKey(x, z)));
          if (kept.length !== p.cells.length) touched = true;
          if (kept.length > 0) circulation.push({ ...p, cells: kept });
          continue;
        }
        if (p.cell && painted.has(cellKey(p.cell[0], p.cell[1]))) { touched = true; continue; }
        circulation.push(p);
      }
      if (!touched) return d;
      return { ...d, chests: d.chests.filter((c) => !doomed.has(c.id)), circulation };
    });
  }

  // ── Clavier ────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => { if (e.code === 'Space') spaceDown.current = true; };
    const up = (e) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const cursor = tool === 'select' ? 'default' : (tool === 'erase' ? 'not-allowed' : 'crosshair');

  // Niveau 1 du panneau items : on lâche une catégorie sur une zone.
  const onDrop = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-vault-category');
    const categoryId = Number(raw);
    const s = state.current;
    if (!categoryId || !s.view || !s.floor) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cell = cellAt(s.view, e.clientX - rect.left, e.clientY - rect.top);
    const zone = zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z);
    if (!zone) return;
    onEdit((d) => ({
      ...d,
      zones: d.zones.map((z) => (z.id === zone.id && !(z.categoryIds || []).includes(categoryId)
        ? { ...z, categoryIds: [...(z.categoryIds || []), categoryId] }
        : z)),
    }));
    onSelect({ type: 'zone', ids: [zone.id] });
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 380 }}>
      <canvas
        ref={canvasRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setHover(null); onHover?.(null); }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 10, cursor, touchAction: 'none' }}
      />
      <button
        type="button"
        onClick={resetView}
        style={{
          position: 'absolute', right: 10, bottom: 10, padding: '6px 10px', borderRadius: 8,
          background: 'rgba(10,6,24,0.8)', border: `1px solid rgba(${'232,200,106'},0.4)`,
          color: GOLD, fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: 'pointer',
        }}
      >Recentrer</button>
    </div>
  );
}

// Coffres visibles sur l'étage : ceux du niveau Y courant, plus ceux des autres
// niveaux du même étage (dessinés en fantôme pour aligner les rangées empilées).
export function chestsOfFloor(doc, floor, currentY) {
  return doc.chests.filter((c) => c.y >= floor.yMin && c.y <= floor.yMax && c.y === currentY);
}

function chestsOfFloorOtherY(doc, floor, currentY) {
  return doc.chests.filter((c) => c.y >= floor.yMin && c.y <= floor.yMax && c.y !== currentY);
}

// ── Dessin ────────────────────────────────────────────────────────────────

function render(ctx, s) {
  const { doc, dims, floor, currentY, view, size, hover, ghost, selection, overlays, categories } = s;
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.fillStyle = '#08051a';
  ctx.fillRect(0, 0, size.w, size.h);

  const [bx, bz] = worldToScreen(view, 0, 0);
  const bw = dims.x * view.scale;
  const bh = dims.z * view.scale;

  // Gabarit
  ctx.fillStyle = 'rgba(18,12,38,0.9)';
  ctx.fillRect(bx, bz, bw, bh);

  drawGrid(ctx, s, bx, bz, bw, bh);
  if (overlays.chunks) drawChunks(ctx, s, bx, bz);

  drawZones(ctx, s);
  drawCirculation(ctx, s);

  // Coffres des autres niveaux Y de l'étage, en repère.
  for (const c of chestsOfFloorOtherY(doc, floor, currentY)) drawChest(ctx, view, c, CHEST_DIM, false);

  const selected = new Set(selection?.type === 'chest' ? selection.ids : []);
  const levelByZone = new Map(doc.zones.map((z) => [z.id, zoneStats(z, doc.chests).level]));
  for (const c of chestsOfFloor(doc, floor, currentY)) {
    let color = CHEST;
    if (overlays.heatmap && c.zoneId) color = LEVELS[levelByZone.get(c.zoneId) || 'ok'].color;
    drawChest(ctx, view, c, color, selected.has(c.id));
  }

  if (overlays.labels) drawZoneLabels(ctx, s, categories);
  if (ghost) drawGhost(ctx, s);

  // Bordure du gabarit par-dessus tout.
  ctx.strokeStyle = 'rgba(232,200,106,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 0.5, bz + 0.5, bw, bh);

  if (hover && inBounds(dims, hover.x, hover.z)) {
    const [hx, hz] = worldToScreen(view, hover.x, hover.z);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx + 0.5, hz + 0.5, view.scale, view.scale);
  }
}

function drawGrid(ctx, { dims, view, size }, bx, bz) {
  const step = view.scale >= 7 ? 1 : (view.scale >= 3 ? 5 : (view.scale >= 1.4 ? 10 : 25));
  ctx.lineWidth = 1;
  ctx.beginPath();
  const first = Math.max(0, Math.floor(view.x / step) * step);
  for (let x = first; x <= dims.x; x += step) {
    const px = Math.round(bx + x * view.scale) + 0.5;
    if (px < -1 || px > size.w + 1) continue;
    ctx.moveTo(px, Math.max(0, bz));
    ctx.lineTo(px, Math.min(size.h, bz + dims.z * view.scale));
  }
  const firstZ = Math.max(0, Math.floor(view.z / step) * step);
  for (let z = firstZ; z <= dims.z; z += step) {
    const pz = Math.round(bz + z * view.scale) + 0.5;
    if (pz < -1 || pz > size.h + 1) continue;
    ctx.moveTo(Math.max(0, bx), pz);
    ctx.lineTo(Math.min(size.w, bx + dims.x * view.scale), pz);
  }
  ctx.strokeStyle = step === 1 ? GRID : GRID_STRONG;
  ctx.stroke();
}

function drawChunks(ctx, { dims, view }, bx, bz) {
  ctx.strokeStyle = CHUNK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= dims.x; x += 16) {
    const px = Math.round(bx + x * view.scale) + 0.5;
    ctx.moveTo(px, bz); ctx.lineTo(px, bz + dims.z * view.scale);
  }
  for (let z = 0; z <= dims.z; z += 16) {
    const pz = Math.round(bz + z * view.scale) + 0.5;
    ctx.moveTo(bx, pz); ctx.lineTo(bx + dims.x * view.scale, pz);
  }
  ctx.stroke();
}

const rectPx = (view, rect) => {
  const [x, z] = worldToScreen(view, rect.x0, rect.z0);
  return [x, z, (rect.x1 - rect.x0 + 1) * view.scale, (rect.z1 - rect.z0 + 1) * view.scale];
};

function drawZones(ctx, { doc, floor, view, selection }) {
  const selected = new Set(selection?.type === 'zone' ? selection.ids : []);
  for (const zone of doc.zones) {
    if (zone.floorId !== floor.id) continue;
    const [x, z, w, h] = rectPx(view, zone.rect);
    ctx.fillStyle = hexAlpha(zone.color, zone.reserved ? 0.08 : 0.18);
    ctx.fillRect(x, z, w, h);
    if (zone.reserved) hatch(ctx, x, z, w, h, hexAlpha(zone.color, 0.5));
    ctx.strokeStyle = selected.has(zone.id) ? '#ffffff' : hexAlpha(zone.color, 0.85);
    ctx.lineWidth = selected.has(zone.id) ? 2.5 : 1.5;
    ctx.strokeRect(x + 0.5, z + 0.5, w, h);
  }
}

function drawZoneLabels(ctx, { doc, floor, view }, categories) {
  const catById = new Map((categories || []).map((c) => [c.id, c]));
  ctx.textBaseline = 'top';
  for (const zone of doc.zones) {
    if (zone.floorId !== floor.id) continue;
    const [x, z, w] = rectPx(view, zone.rect);
    if (w < 46) continue;
    const stats = zoneStats(zone, doc.chests);
    ctx.font = "600 12px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(8,5,20,0.72)';
    const label = zone.name || zone.id;
    const sub = zone.reserved
      ? 'réservée MàJ'
      : `${stats.chests} coffres · ${stats.slots} slots${stats.needed ? ` / ${stats.needed}` : ''}`;
    const tw = Math.max(ctx.measureText(label).width, ctx.measureText(sub).width) + 12;
    ctx.fillRect(x + 4, z + 4, Math.min(tw, w - 8), 32);
    ctx.fillStyle = zone.color;
    ctx.fillText(label, x + 9, z + 7, w - 16);
    ctx.font = "500 10.5px 'Inter', sans-serif";
    ctx.fillStyle = zone.reserved ? 'rgba(232,200,106,0.9)' : LEVELS[stats.level].color;
    ctx.fillText(sub, x + 9, z + 22, w - 16);
    const cats = (zone.categoryIds || []).map((id) => catById.get(id)?.name).filter(Boolean);
    if (cats.length > 0 && w > 120) {
      ctx.fillStyle = 'rgba(220,214,240,0.7)';
      ctx.fillText(cats.join(' · '), x + 9, z + 38, w - 16);
    }
  }
}

function drawCirculation(ctx, { doc, floor, view }) {
  for (const p of doc.circulation) {
    if (p.floorId !== floor.id) continue;
    if (p.kind === 'couloir') {
      ctx.fillStyle = CORRIDOR;
      for (const [cx, cz] of p.cells) {
        const [x, z] = worldToScreen(view, cx, cz);
        ctx.fillRect(x, z, view.scale, view.scale);
      }
    }
  }
  for (const p of doc.circulation) {
    if (p.floorId !== floor.id || !p.cell) continue;
    const [x, z] = worldToScreen(view, p.cell[0], p.cell[1]);
    const size = Math.max(view.scale, 9);
    const color = p.kind === 'escalier' ? STAIR : ENTRY;
    ctx.fillStyle = hexAlpha(color, 0.85);
    ctx.fillRect(x, z, size, size);
    ctx.fillStyle = '#08051a';
    ctx.font = `700 ${Math.min(size * 0.8, 13)}px 'Inter', sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(p.kind === 'escalier' ? '↕' : '⌂', x + size / 2, z + size / 2 + 1);
    ctx.textAlign = 'left';
  }
}

function drawChest(ctx, view, chest, color, selected) {
  const cells = chestCells(chest);
  const x0 = Math.min(...cells.map((c) => c[0]));
  const z0 = Math.min(...cells.map((c) => c[1]));
  const w = (Math.max(...cells.map((c) => c[0])) - x0 + 1) * view.scale;
  const h = (Math.max(...cells.map((c) => c[1])) - z0 + 1) * view.scale;
  const [x, z] = worldToScreen(view, x0, z0);
  const pad = view.scale > 6 ? 1 : 0;
  ctx.fillStyle = color;
  ctx.fillRect(x + pad, z + pad, w - pad * 2, h - pad * 2);

  if (view.scale >= 6) {
    // Petite marque du côté ouvert : on lit l'orientation d'un coup d'œil.
    const [dx, dz] = FACING_ARROW[chest.facing] || [0, 1];
    ctx.fillStyle = 'rgba(8,5,20,0.75)';
    const t = Math.max(2, view.scale * 0.18);
    ctx.fillRect(
      x + w / 2 + (dx * (w / 2 - t)) - t / 2,
      z + h / 2 + (dz * (h / 2 - t)) - t / 2,
      t, t,
    );
  }
  if (selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, z + 0.5, w - 1, h - 1);
  }
}

function drawGhost(ctx, s) {
  const { view, ghost } = s;
  if (ghost.kind === 'zone' || ghost.kind === 'marquee') {
    const [x, z, w, h] = rectPx(view, ghost.rect);
    ctx.fillStyle = ghost.kind === 'zone' ? 'rgba(201,168,232,0.16)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, z, w, h);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = ghost.kind === 'zone' ? '#c9a8e8' : '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, z + 0.5, w, h);
    ctx.setLineDash([]);
    return;
  }
  if (ghost.kind === 'row') {
    for (const c of ghost.chests) drawChest(ctx, view, c, 'rgba(232,200,106,0.55)', false);
    return;
  }
  if (ghost.kind === 'move' && (ghost.dx || ghost.dz)) {
    const ids = new Set(s.selection?.ids || []);
    for (const c of s.doc.chests) {
      if (!ids.has(c.id)) continue;
      drawChest(ctx, view, { ...c, x: c.x + ghost.dx, z: c.z + ghost.dz }, 'rgba(255,255,255,0.45)', false);
    }
  }
}

function hatch(ctx, x, z, w, h, color) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, z, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -h; i < w; i += 9) {
    ctx.moveTo(x + i, z + h);
    ctx.lineTo(x + i + h, z);
  }
  ctx.stroke();
  ctx.restore();
}

function hexAlpha(hex, alpha) {
  const h = String(hex || '#c9a8e8').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  // eslint-disable-next-line no-bitwise
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  buildChests, cellAt, cellKey, chestIndex, clampRect, fitView, inBounds, lineCells, panBy,
  rectContains, rectFrom, straightLine, worldToScreen, zoneAt, zoneLevelRange, zoomAt,
} from './planGeometry';
import { zoneStats } from './capacity';
import {
  CHEST, CHEST_DIM, CHUNK, CORRIDOR, ENTRY, GRID, GRID_STRONG, GOLD, LEVELS, STAIR,
} from './theme';

// Vue Plan : canvas 2D natif (125×125 = 15 625 cases par étage — pas de DOM par
// case). Le composant possède la vue (pan/zoom) et le geste en cours ; toute
// modification du document remonte par `onEdit(mutate)`.
//
// Un coffre = une case, 72 slots, sans orientation (coffre sans fond). Le
// niveau Y courant est le plan de coupe : on voit les coffres de ce niveau en
// plein, ceux des autres niveaux de l'étage en repère.

export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// Cache d'icônes du codex : les images se chargent une fois, et le canvas se
// redessine quand elles arrivent.
const iconCache = new Map();
function getIcon(url, onLoad) {
  if (!url) return null;
  let img = iconCache.get(url);
  if (img === undefined) {
    img = new Image();
    img.onload = () => onLoad?.();
    img.onerror = () => iconCache.set(url, null);
    img.src = url;
    iconCache.set(url, img);
  }
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export function PlanCanvas({
  doc, dims, worldOrigin, floor, currentY, tool, options, selection, categories = [],
  codexById, overlays, onEdit, onSelect, onHover, focus,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState(null);
  // null tant que le conteneur n'a pas été mesuré : cadrer sur une taille
  // fictive figerait une échelle fausse (la vue est ensuite ancrée, pas recadrée).
  const [size, setSize] = useState(null);
  const [hover, setHover] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [, redraw] = useState(0);
  const drag = useRef(null);
  const spaceDown = useRef(false);
  const lastSize = useRef(null);

  // Les gestes lisent l'état courant par ref : les écouteurs restent stables.
  const state = useRef({});
  state.current = { doc, dims, floor, currentY, tool, options, selection, view };

  // ── Dimensionnement ────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => setSize((prev) => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return prev;
      return prev && prev.w === w && prev.h === h ? prev : { w, h };
    });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Premier rendu : on cadre le gabarit entier. Ensuite, un changement de
  // taille (la barre d'outils qui passe sur deux lignes selon l'outil, la
  // fenêtre redimensionnée) **ancre** la vue au lieu de la recadrer : même
  // échelle, même point du plan au centre. Sans ça, changer d'outil ferait
  // sauter le plan sous le curseur.
  useEffect(() => {
    if (!size) return;
    setView((v) => {
      const prev = lastSize.current;
      lastSize.current = size;
      if (!v) return fitView(dims, size.w, size.h);
      if (!prev || (prev.w === size.w && prev.h === size.h)) return v;
      const cx = v.x + prev.w / (2 * v.scale);
      const cz = v.z + prev.h / (2 * v.scale);
      return { ...v, x: cx - size.w / (2 * v.scale), z: cz - size.h / (2 * v.scale) };
    });
  }, [dims, size]);

  const resetView = useCallback(() => {
    if (size) setView(fitView(dims, size.w, size.h));
  }, [dims, size]);

  // Centrage sur un élément (clic dans le panneau warnings / la vue logique).
  useEffect(() => {
    if (!focus || !view || !size) return;
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
    if (!canvas || !view || !floor || !size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, {
      doc, dims, floor, currentY, view, size, hover, ghost, selection, overlays, categories,
      codexById, onIconLoad: () => redraw((n) => n + 1),
    });
  }, [doc, dims, floor, currentY, view, size, hover, ghost, selection, overlays, categories, codexById]);

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
        // Déjà dans la sélection : on prépare un déplacement de groupe, mais un
        // simple clic (sans glisser) isole ce coffre — sinon, après un mur, on
        // éditerait les 500 coffres en croyant n'en toucher qu'un.
        drag.current = { mode: 'move', from: cell, hitId: chest.id };
        return;
      }
      if (chest) {
        onSelect({ type: 'chest', ids: [chest.id] });
        drag.current = { mode: 'move', from: cell, hitId: chest.id, ids: [chest.id] };
        return;
      }
      drag.current = { mode: 'marquee', from: cell };
      return;
    }
    if (s.tool === 'zone') { drag.current = { mode: 'zone', from: cell }; return; }
    // Mur : un glissé au sol, monté sur tous les niveaux (Maj = niveau courant
    // seulement, pour compléter une rangée isolée).
    if (s.tool === 'wall') { drag.current = { mode: 'wall', from: cell, single: shift }; return; }
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
    if (d.mode === 'wall') {
      const preview = previewWall(d.from, cell, d.single);
      setGhost({ kind: 'wall', cells: preview.cells, levels: preview.levels.length, count: preview.chests.length });
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
    else if (d.mode === 'wall') commitChests(previewWall(d.from, cell, d.single).chests);
    else if (d.mode === 'marquee') commitMarquee(clampRect(rectFrom(d.from, cell), s.dims));
    else if (d.mode === 'move') {
      const dx = cell.x - d.from.x;
      const dz = cell.z - d.from.z;
      if (dx === 0 && dz === 0) {
        if (d.hitId) onSelect({ type: 'chest', ids: [d.hitId] });
      } else {
        commitMove(dx, dz, d.ids);
      }
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────

  const chestsHere = (s = state.current) => chestsOfFloor(s.doc, s.floor, s.currentY);

  // Cases déjà occupées (clé « y:x,z ») : un second passage complète le mur au
  // lieu d'empiler deux coffres sur la même case.
  function occupiedSet(doc) {
    const set = new Set();
    for (const c of doc.chests) set.add(`${c.y}:${cellKey(c.x, c.z)}`);
    return set;
  }

  function levelsFor(cell, single) {
    const s = state.current;
    if (single) return [s.currentY];
    const zone = zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z, s.currentY)
      || zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z);
    const levels = zoneLevelRange(zone, s.floor, s.options.maxLevels || 0);
    return levels.length > 0 ? levels : [s.currentY];
  }

  function previewWall(from, to, single) {
    const s = state.current;
    const cells = straightLine(from, to).filter(([x, z]) => inBounds(s.dims, x, z));
    const levels = levelsFor(from, single);
    const chests = buildChests(cells, levels, {
      dims: s.dims,
      occupied: occupiedSet(s.doc),
      // Chaque coffre prend la zone qui le recouvre *lui*, niveau compris : un
      // mur qui traverse deux zones se répartit correctement.
      zoneFor: (x, z, y) => zoneAt(s.doc.zones, s.floor.id, x, z, y)?.id ?? null,
    });
    return { cells, levels, chests };
  }

  function commitChests(chests) {
    if (chests.length === 0) return;
    onEdit((d) => ({ ...d, chests: [...d.chests, ...chests] }));
    onSelect({ type: 'chest', ids: chests.map((c) => c.id) });
  }

  function placeChest(cell) {
    const s = state.current;
    if (!inBounds(s.dims, cell.x, cell.z)) return;
    if (occupiedSet(s.doc).has(`${s.currentY}:${cellKey(cell.x, cell.z)}`)) return;
    const chest = {
      id: newId('c'),
      zoneId: zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z, s.currentY)?.id ?? null,
      x: cell.x, y: s.currentY, z: cell.z, items: [], label: '',
    };
    onEdit((d) => ({ ...d, chests: [...d.chests, chest] }));
    onSelect({ type: 'chest', ids: [chest.id] });
  }

  function commitZone(rect) {
    const s = state.current;
    if (rect.x1 - rect.x0 < 1 && rect.z1 - rect.z0 < 1) return;
    // Hauteur de la zone : par défaut, du niveau courant au sommet de l'étage
    // (« 100 × 5 × 100 »). Ajustable ensuite dans la fiche.
    const zone = {
      id: newId('z'),
      floorId: s.floor.id,
      rect,
      yMin: s.currentY,
      yMax: s.floor.yMax,
      name: `Zone ${s.doc.zones.filter((z) => z.floorId === s.floor.id).length + 1}`,
      color: s.options.zoneColor,
      categoryIds: [],
      reservedSlots: 0,
      reserved: false,
      notes: '',
    };
    // Une zone tracée par-dessus des coffres déjà posés les adopte (s'ils sont
    // encore orphelins) : sinon ils resteraient signalés « hors zone » alors
    // qu'ils sont visiblement dedans.
    onEdit((d) => ({
      ...d,
      zones: [...d.zones, zone],
      chests: d.chests.map((c) => (
        !c.zoneId && c.y >= zone.yMin && c.y <= zone.yMax && rectContains(rect, c.x, c.z)
          ? { ...c, zoneId: zone.id } : c)),
    }));
    onSelect({ type: 'zone', ids: [zone.id] });
  }

  function commitMarquee(rect) {
    const s = state.current;
    const ids = chestsHere(s).filter((c) => rectContains(rect, c.x, c.z)).map((c) => c.id);
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
      // Un coffre déplacé change de zone d'accueil : on la ré-évalue, sinon il
      // resterait compté dans la capacité de sa zone d'origine.
      const moved = d.chests.map((c) => (ids.has(c.id)
        ? {
          ...c,
          x: c.x + dx,
          z: c.z + dz,
          zoneId: zoneAt(d.zones, s.floor.id, c.x + dx, c.z + dz, c.y)?.id ?? null,
        }
        : c));
      const ok = moved.every((c) => inBounds(s.dims, c.x, c.z));
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
        if (painted.has(cellKey(c.x, c.z))) doomed.add(c.id);
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
    const zone = zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z, s.currentY)
      || zoneAt(s.doc.zones, s.floor.id, cell.x, cell.z);
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

  // Icônes des items affectés : lisibles seulement à partir d'un certain zoom,
  // c'est ce qui transforme le plan en plan de rangement.
  if (overlays.items && view.scale >= 9) drawChestItems(ctx, s);
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

function drawZones(ctx, { doc, floor, view, selection, currentY }) {
  const selected = new Set(selection?.type === 'zone' ? selection.ids : []);
  for (const zone of doc.zones) {
    if (zone.floorId !== floor.id) continue;
    // Une zone qui ne couvre pas le niveau de coupe reste visible, en retrait :
    // on garde le repère sans confondre les niveaux.
    const here = currentY >= zone.yMin && currentY <= zone.yMax;
    const [x, z, w, h] = rectPx(view, zone.rect);
    ctx.fillStyle = hexAlpha(zone.color, zone.reserved ? 0.08 : (here ? 0.18 : 0.05));
    ctx.fillRect(x, z, w, h);
    if (zone.reserved) hatch(ctx, x, z, w, h, hexAlpha(zone.color, 0.5));
    ctx.strokeStyle = selected.has(zone.id) ? '#ffffff' : hexAlpha(zone.color, here ? 0.85 : 0.3);
    ctx.lineWidth = selected.has(zone.id) ? 2.5 : 1.5;
    if (!here) ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 0.5, z + 0.5, w, h);
    ctx.setLineDash([]);
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
      : `${stats.chests} coffres · Y ${zone.yMin}–${zone.yMax}${stats.assigned ? ` · ${stats.assigned} rangés` : ''}`;
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

// Un coffre occupe une case. Rempli = au moins un item affecté, contour seul =
// coffre encore libre : d'un coup d'œil on voit ce qui reste à ranger.
function drawChest(ctx, view, chest, color, selected) {
  const [x, z] = worldToScreen(view, chest.x, chest.z);
  const size = view.scale;
  const pad = size > 6 ? 1 : 0;
  const assigned = chest.items?.length > 0;

  if (assigned) {
    ctx.fillStyle = color;
    ctx.fillRect(x + pad, z + pad, size - pad * 2, size - pad * 2);
  } else {
    ctx.fillStyle = 'rgba(232,200,106,0.16)';
    ctx.fillRect(x + pad, z + pad, size - pad * 2, size - pad * 2);
    if (size >= 5) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad + 0.5, z + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
    }
  }
  if (selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, z + 0.5, size - 1, size - 1);
  }
}

function drawChestItems(ctx, s) {
  const { doc, floor, currentY, view, codexById, onIconLoad } = s;
  const size = view.scale;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (const c of chestsOfFloor(doc, floor, currentY)) {
    const first = c.items?.[0];
    if (!first) continue;
    const entry = codexById?.get(first);
    const [x, z] = worldToScreen(view, c.x, c.z);
    const icon = getIcon(entry?.icon, onIconLoad);
    if (icon) {
      const pad = Math.max(1, size * 0.12);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon, x + pad, z + pad, size - pad * 2, size - pad * 2);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = 'rgba(8,5,20,0.8)';
      ctx.font = `700 ${Math.min(size * 0.5, 11)}px 'Inter', sans-serif`;
      ctx.fillText((entry?.nomFr || first).slice(0, 2).toUpperCase(), x + size / 2, z + size / 2);
    }
    if (c.items.length > 1 && size >= 16) {
      ctx.fillStyle = 'rgba(8,5,20,0.85)';
      ctx.font = "700 9px 'Inter', sans-serif";
      ctx.fillText(`+${c.items.length - 1}`, x + size - 8, z + size - 6);
    }
  }
  ctx.textAlign = 'left';
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
  if (ghost.kind === 'wall') {
    for (const [x, z] of ghost.cells) {
      const [sx, sz] = worldToScreen(view, x, z);
      ctx.fillStyle = 'rgba(232,200,106,0.5)';
      ctx.fillRect(sx, sz, view.scale, view.scale);
    }
    // Le mur monte sur plusieurs niveaux : le compte se lit sur le curseur.
    if (ghost.cells.length > 0) {
      const [lx, lz] = worldToScreen(view, ghost.cells.at(-1)[0], ghost.cells.at(-1)[1]);
      ctx.font = "700 12px 'Inter', sans-serif";
      const text = `${ghost.count} coffres · ${ghost.levels} niveau${ghost.levels > 1 ? 'x' : ''}`;
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = 'rgba(8,5,20,0.85)';
      ctx.fillRect(lx + 10, lz - 10, w, 20);
      ctx.fillStyle = '#e8c86a';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx + 16, lz + 1);
    }
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

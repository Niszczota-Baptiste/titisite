import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { paintWorld, paintWorldRegion } from '../../../writing/map/Map2D';
import { MAP_SHAPES, MAP_SIZES, normalizeTerrain } from '../../../writing/map/presets';
import { buildWorld, encodeGrid, MAX_H } from '../../../writing/map/terrain';
import { ACC, ACC_RGB, Button } from '../../ui';
import { DirtyBadge, SelectField } from './widgets';
import { MapImageImport } from './MapImageImport';

// Macro sizes for the giant 2D world maps (1 cell = 8/16/32 blocks).
const WORLD_SIZES = [
  { value: 256, label: 'Petit monde (256)' },
  { value: 384, label: 'Monde moyen (384)' },
  { value: 512, label: 'Grand monde (512)' },
  { value: 640, label: 'Monde géant (640)' },
  { value: 1024, label: 'Monde colossal (1024)' },
];
const BLOCK_SCALES = [
  { value: '8', label: '1 cellule = 8 blocs' },
  { value: '16', label: '1 cellule = 16 blocs' },
  { value: '32', label: '1 cellule = 32 blocs' },
];

// Hand-paint the world without touching JSON: brushes edit explicit
// height/biome grids, saved back into mapTerrain as a compact `grid` layer.
// The canvas pans (✋ tool) and zooms (wheel, toward the cursor) so even a
// 1024-cell world can be edited cell by cell; strokes repaint only the
// touched region of the offscreen world.

const TOOLS = [
  { value: 'naviguer', label: '✋ Naviguer' },
  { value: 'elever', label: '⬆ Élever' },
  { value: 'abaisser', label: '⬇ Abaisser' },
  { value: 'eau', label: '🌊 Eau' },
  { value: 'biome', label: '🎨 Biome' },
];

const MAX_K = 28;

// Generated base grids (no zones: plateaus/routes are applied at render time).
function generate(raw, baseBiome, world) {
  const w = buildWorld(raw, baseBiome, [], { world });
  return {
    size: w.grid,
    height: Array.from(w.height),
    biome: [...w.biome],
    waterLevel: w.waterLevel,
    biomes: w.terrain.biomes,
    waterColor: w.terrain.waterColor,
  };
}

// Lightweight world shape for the shared painters. Beaches are only computed
// inside the given cell box (whole grid when omitted) — per-stroke repaints
// stay cheap on colossal worlds.
function previewWorld(g, box = null) {
  const { size, height, biome, waterLevel } = g;
  const beach = new Uint8Array(size * size);
  const hAt = (i, j) => (i < 0 || j < 0 || i >= size || j >= size ? 0 : height[j * size + i]);
  const j0 = box ? Math.max(0, box.j0) : 0;
  const j1 = box ? Math.min(size - 1, box.j1) : size - 1;
  const i0 = box ? Math.max(0, box.i0) : 0;
  const i1 = box ? Math.min(size - 1, box.i1) : size - 1;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (height[j * size + i] < waterLevel) continue;
      if (hAt(i - 1, j) < waterLevel || hAt(i + 1, j) < waterLevel
        || hAt(i, j - 1) < waterLevel || hAt(i, j + 1) < waterLevel) beach[j * size + i] = 1;
    }
  }
  return {
    grid: size, height, biome, beach, waterLevel,
    path: new Uint8Array(size * size), bridge: new Uint8Array(size * size),
    routes: [], terrain: { biomes: g.biomes, waterColor: g.waterColor },
  };
}

export function TerrainPainter({ terrain, baseBiome, accent, onSave, saving, world = false }) {
  const boardRef = useRef(null);
  const viewport = useRef(null);
  const offscreen = useRef(null);  // { canvas, px } — full painted world
  const stroke = useRef(null);     // Set of cells already hit by the current stroke
  const pan = useRef(null);
  const [grids, setGrids] = useState(() => generate(terrain, baseBiome, world));
  const [genVersion, setGenVersion] = useState(0); // bumps force a full offscreen repaint
  const [tool, setTool] = useState(world ? 'naviguer' : 'elever');
  const [brush, setBrush] = useState(2);
  const [brushBiome, setBrushBiome] = useState(baseBiome);
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [W, setW] = useState(0);
  const [view, setView] = useState(null);

  const norm = useMemo(() => normalizeTerrain(terrain, baseBiome, { world }), [terrain, baseBiome, world]);
  const [shape, setShape] = useState(norm.shape);
  const [size, setSize] = useState(norm.size);
  const [blocksPerCell, setBlocksPerCell] = useState(norm.blocksPerCell);

  const G = grids.size;
  const fitK = W > 0 ? W / G : 1;
  const biomeOptions = Object.entries(grids.biomes).map(([value, b]) => ({ value, label: b.label || value }));

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (W > 0) setView((v) => v || { cx: 0, cz: 0, k: W / G });
  }, [W, G]);

  const clampView = useCallback((v) => ({
    k: Math.min(MAX_K, Math.max(fitK * 0.95, v.k)),
    cx: Math.min(G / 2, Math.max(-G / 2, v.cx)),
    cz: Math.min(G / 2, Math.max(-G / 2, v.cz)),
  }), [fitK, G]);

  // Full offscreen repaint: on mount, regeneration and accent change only.
  useEffect(() => {
    const off = document.createElement('canvas');
    const px = grids.size > 160 ? 1 : 6;
    paintWorld(off, previewWorld(grids), accent, { routes: false, px });
    offscreen.current = { canvas: off, px };
    setView((v) => (v ? { ...v } : v)); // trigger a blit
    // grids intentionally absent: strokes patch the offscreen in place, only
    // regeneration (genVersion) repaints it fully.
  }, [genVersion, accent]);

  // Blit the offscreen world through the current view.
  useEffect(() => {
    const el = viewport.current;
    const off = offscreen.current;
    if (!el || !off || !view || W === 0) return;
    if (el.width !== W || el.height !== W) { el.width = W; el.height = W; }
    const ctx = el.getContext('2d');
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
    const scale = view.k / off.px;
    ctx.drawImage(
      off.canvas,
      W / 2 - (view.cx + G / 2) * view.k,
      W / 2 - (view.cz + G / 2) * view.k,
      off.canvas.width * scale,
      off.canvas.height * scale,
    );
  }, [view, W, G, grids]);

  // Non-passive wheel: zoom toward the cursor, never scroll the page.
  const zoomAt = useRef(null);
  zoomAt.current = (e) => {
    if (!view) return;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const r = boardRef.current.getBoundingClientRect();
    const ax = view.cx + (e.clientX - r.left - W / 2) / view.k;
    const az = view.cz + (e.clientY - r.top - W / 2) / view.k;
    const k = Math.min(MAX_K, Math.max(fitK * 0.95, view.k * factor));
    const ratio = k / view.k;
    setView(clampView({ k, cx: ax - (ax - view.cx) / ratio, cz: az - (az - view.cz) / ratio }));
  };
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const handler = (e) => { e.preventDefault(); zoomAt.current?.(e); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const toCell = (clientX, clientY) => {
    const r = boardRef.current.getBoundingClientRect();
    return [
      Math.floor((view.cx + (clientX - r.left - W / 2) / view.k) + G / 2),
      Math.floor((view.cz + (clientY - r.top - W / 2) / view.k) + G / 2),
    ];
  };

  const applyBrush = (e) => {
    if (!view) return;
    const [ci, cj] = toCell(e.clientX, e.clientY);
    const r = brush - 0.4;
    let touched = false;
    const { size: S, waterLevel } = grids;
    const height = grids.height;
    const biome = grids.biome;
    for (let j = Math.max(0, cj - brush); j <= Math.min(S - 1, cj + brush); j++) {
      for (let i = Math.max(0, ci - brush); i <= Math.min(S - 1, ci + brush); i++) {
        if (Math.hypot(i - ci, j - cj) > r) continue;
        const k = j * S + i;
        if (stroke.current?.has(k)) continue;
        stroke.current?.add(k);
        if (tool === 'elever') height[k] = Math.min(MAX_H, Math.max(waterLevel, height[k]) + 1);
        else if (tool === 'abaisser') height[k] = Math.max(0, height[k] - 1);
        else if (tool === 'eau') height[k] = Math.max(0, waterLevel - 1);
        else if (tool === 'biome') biome[k] = brushBiome;
        touched = true;
      }
    }
    if (touched && offscreen.current) {
      // Patch just the brushed neighbourhood of the offscreen world (±2 cells:
      // relief shading and beaches reach one cell further than the brush).
      const box = { i0: ci - brush - 2, j0: cj - brush - 2, i1: ci + brush + 2, j1: cj + brush + 2 };
      paintWorldRegion(offscreen.current.canvas, previewWorld(grids, box), { px: offscreen.current.px, ...box });
      setDirty(true);
      setGrids({ ...grids });
    }
  };

  // Image import replaces the whole grid with sampled biomes/heights; the
  // genVersion bump triggers a full offscreen repaint (same path as regenerate)
  // so the user reviews and refines with the brush before « Enregistrer ».
  const applyImport = useCallback((height, biome) => {
    setGrids((g) => ({ ...g, height, biome }));
    setGenVersion((v) => v + 1);
    setDirty(true);
  }, []);

  const regenerate = (nextShape = shape, nextSize = size) => {
    const { grid: _g, ...rest } = terrain && typeof terrain === 'object' ? terrain : {};
    setGrids(generate({ ...rest, shape: nextShape, size: nextSize }, baseBiome, world));
    setGenVersion((v) => v + 1);
    setView(null);
    setDirty(true);
  };

  const save = () => {
    // Painted grid replaces the generated relief; generation-only fields are
    // dropped so the stored JSON stays honest about what drives the world.
    const { regions: _r, rivers: _ri, lakes: _l, grid: _g, ...rest } = terrain && typeof terrain === 'object' ? terrain : {};
    onSave({
      ...rest,
      size: grids.size,
      shape,
      ...(world ? { blocksPerCell } : {}),
      grid: encodeGrid(grids.size, grids.height, grids.biome),
    });
    setDirty(false);
  };

  const removeDrawing = () => {
    const { grid: _g, ...rest } = terrain && typeof terrain === 'object' ? terrain : {};
    onSave(Object.keys(rest).length ? rest : null);
    setGrids(generate(rest, baseBiome, world));
    setGenVersion((v) => v + 1);
    setView(null);
    setDirty(false);
  };

  const chip = (on) => ({
    background: on ? `rgba(${ACC_RGB},0.18)` : 'transparent',
    border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
    color: on ? ACC : 'rgba(180,170,200,0.75)', borderRadius: 16,
    padding: '5px 12px', cursor: 'pointer',
    fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: on ? 700 : 400,
  });

  const zoomPct = view ? Math.round((view.k / fitK) * 100) : 100;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {TOOLS.map((t) => (
          <button key={t.value} type="button" style={chip(tool === t.value)} onClick={() => setTool(t.value)}>{t.label}</button>
        ))}
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.7)', marginLeft: 8 }}>
          Pinceau {brush}
        </span>
        <input type="range" min="1" max="4" step="1" value={brush} onChange={(e) => setBrush(Number(e.target.value))} style={{ width: 90, accentColor: ACC }} />
        <Button variant="ghost" onClick={() => setImportOpen((o) => !o)} style={{ marginLeft: 8 }}>
          {importOpen ? "✕ Fermer l'import" : '🖼 Importer une image'}
        </Button>
        <span style={{ flex: 1 }} />
        <DirtyBadge dirty={dirty} />
        <Button onClick={save} disabled={!dirty || saving}>{saving ? '…' : 'Enregistrer le dessin'}</Button>
      </div>

      {importOpen && (
        <MapImageImport
          size={grids.size}
          waterLevel={grids.waterLevel}
          biomeOptions={biomeOptions}
          onImport={applyImport}
        />
      )}

      {tool === 'biome' && (
        <div style={{ maxWidth: 260, marginBottom: 4 }}>
          <SelectField label="Biome à peindre" value={brushBiome} onChange={setBrushBiome} options={biomeOptions} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          ref={boardRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            if (tool === 'naviguer') {
              pan.current = { x: e.clientX, y: e.clientY };
            } else {
              stroke.current = new Set();
              applyBrush(e);
            }
          }}
          onPointerMove={(e) => {
            if (pan.current && view) {
              const dx = e.clientX - pan.current.x;
              const dy = e.clientY - pan.current.y;
              pan.current = { x: e.clientX, y: e.clientY };
              setView(clampView({ ...view, cx: view.cx - dx / view.k, cz: view.cz - dy / view.k }));
              return;
            }
            if (stroke.current) applyBrush(e);
          }}
          onPointerUp={() => { stroke.current = null; pan.current = null; }}
          style={{
            position: 'relative', width: 'min(460px, 100%)', aspectRatio: '1',
            borderRadius: 12, overflow: 'hidden', cursor: tool === 'naviguer' ? 'grab' : 'crosshair',
            border: '1px solid rgba(80,50,130,0.3)', touchAction: 'none', background: '#0a1420',
          }}
        >
          <canvas ref={viewport} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(200,192,216,0.8)', background: 'rgba(9,5,22,0.8)', borderRadius: 8, padding: '3px 8px' }}>
              {zoomPct} %
            </span>
            <button
              type="button"
              title="Vue d'ensemble"
              onClick={() => setView({ cx: 0, cz: 0, k: fitK })}
              style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 12, width: 26, height: 26,
                background: 'rgba(9,5,22,0.8)', border: '1px solid rgba(80,50,130,0.4)',
                borderRadius: 8, color: '#ede8f8', cursor: 'pointer',
              }}
            >⌂</button>
          </div>
        </div>
        <div style={{ minWidth: 200, flex: '0 1 240px' }}>
          <SelectField label="Forme (régénère le relief)" value={shape} onChange={(v) => { setShape(v); regenerate(v, size); }} options={MAP_SHAPES} />
          <SelectField label="Taille de la carte" value={String(size)} onChange={(v) => { setSize(Number(v)); regenerate(shape, Number(v)); }} options={(world ? WORLD_SIZES : MAP_SIZES).map((s) => ({ value: String(s.value), label: s.label }))} />
          {world && (
            <>
              <SelectField label="Échelle" value={String(blocksPerCell)} onChange={(v) => { setBlocksPerCell(Number(v)); setDirty(true); }} options={BLOCK_SCALES} />
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'rgba(180,170,200,0.7)', marginBottom: 12 }}>
                ≈ {(size * blocksPerCell).toLocaleString('fr-FR')} × {(size * blocksPerCell).toLocaleString('fr-FR')} blocs
              </p>
            </>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button variant="ghost" onClick={() => regenerate()}>↺ Régénérer le relief</Button>
            <Button variant="danger" onClick={removeDrawing} disabled={saving}>Supprimer le dessin (revenir au généré)</Button>
          </div>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, lineHeight: 1.6, color: 'rgba(180,170,200,0.6)', marginTop: 10 }}>
            Molette = zoomer vers le curseur, outil ✋ = déplacer la vue. Peins
            directement sur la carte : relief, eau et biomes sont enregistrés
            tels quels. Les zones, routes et plages se posent automatiquement.
          </p>
        </div>
      </div>
    </div>
  );
}

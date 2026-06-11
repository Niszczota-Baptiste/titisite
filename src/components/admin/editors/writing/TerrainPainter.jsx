import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { paintWorld } from '../../../writing/map/Map2D';
import { MAP_SHAPES, MAP_SIZES, normalizeTerrain } from '../../../writing/map/presets';

import { buildWorld, encodeGrid, MAX_H } from '../../../writing/map/terrain';
import { ACC, ACC_RGB, Button } from '../../ui';
import { DirtyBadge, SelectField } from './widgets';

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
// height/biome grids on a top-down pixel map (the same renderer as the public
// 2D mode), saved back into mapTerrain as a compact `grid` layer that the
// engine uses verbatim. Generation (shape/size/regions…) only seeds the
// canvas — once painted, the drawing is the terrain.

const TOOLS = [
  { value: 'elever', label: '⬆ Élever' },
  { value: 'abaisser', label: '⬇ Abaisser' },
  { value: 'eau', label: '🌊 Eau' },
  { value: 'biome', label: '🎨 Biome' },
];

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

// Lightweight world shape for the shared 2D painter (no routes, fresh beaches).
function previewWorld(g) {
  const { size, height, biome, waterLevel } = g;
  const beach = new Uint8Array(size * size);
  const hAt = (i, j) => (i < 0 || j < 0 || i >= size || j >= size ? 0 : height[j * size + i]);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
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
  const canvas = useRef(null);
  const stroke = useRef(null); // Set of cells already hit by the current stroke
  const [grids, setGrids] = useState(() => generate(terrain, baseBiome, world));
  const [tool, setTool] = useState('elever');
  const [brush, setBrush] = useState(2);
  const [brushBiome, setBrushBiome] = useState(baseBiome);
  const [dirty, setDirty] = useState(false);

  const norm = useMemo(() => normalizeTerrain(terrain, baseBiome, { world }), [terrain, baseBiome, world]);
  const [shape, setShape] = useState(norm.shape);
  const [size, setSize] = useState(norm.size);
  const [blocksPerCell, setBlocksPerCell] = useState(norm.blocksPerCell);

  const biomeOptions = Object.entries(grids.biomes).map(([value, b]) => ({ value, label: b.label || value }));

  const repaint = useCallback((g) => {
    if (canvas.current) {
      paintWorld(canvas.current, previewWorld(g), accent, { routes: false, px: g.size > 160 ? 1 : 6 });
    }
  }, [accent]);

  useEffect(() => { repaint(grids); }, [grids, repaint]);

  const applyBrush = (e) => {
    const el = canvas.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ci = Math.floor(((e.clientX - rect.left) / rect.width) * grids.size);
    const cj = Math.floor(((e.clientY - rect.top) / rect.height) * grids.size);
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
    if (touched) {
      setDirty(true);
      setGrids({ ...grids });
    }
  };

  const regenerate = (nextShape = shape, nextSize = size) => {
    const { grid: _g, ...rest } = terrain && typeof terrain === 'object' ? terrain : {};
    setGrids(generate({ ...rest, shape: nextShape, size: nextSize }, baseBiome, world));
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
    setDirty(false);
  };

  const chip = (on) => ({
    background: on ? `rgba(${ACC_RGB},0.18)` : 'transparent',
    border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
    color: on ? ACC : 'rgba(180,170,200,0.75)', borderRadius: 16,
    padding: '5px 12px', cursor: 'pointer',
    fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: on ? 700 : 400,
  });

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
        <span style={{ flex: 1 }} />
        <DirtyBadge dirty={dirty} />
        <Button onClick={save} disabled={!dirty || saving}>{saving ? '…' : 'Enregistrer le dessin'}</Button>
      </div>

      {tool === 'biome' && (
        <div style={{ maxWidth: 260, marginBottom: 4 }}>
          <SelectField label="Biome à peindre" value={brushBiome} onChange={setBrushBiome} options={biomeOptions} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <canvas
          ref={canvas}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            stroke.current = new Set();
            applyBrush(e);
          }}
          onPointerMove={(e) => { if (stroke.current) applyBrush(e); }}
          onPointerUp={() => { stroke.current = null; }}
          style={{
            width: 'min(460px, 100%)', aspectRatio: '1', display: 'block',
            imageRendering: 'pixelated', borderRadius: 12, cursor: 'crosshair',
            border: '1px solid rgba(80,50,130,0.3)', touchAction: 'none',
          }}
        />
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
            Peins directement sur la carte : le relief, l'eau et les biomes
            sont enregistrés tels quels (plus besoin de JSON). Les zones,
            routes et plages se posent automatiquement dessus.
          </p>
        </div>
      </div>
    </div>
  );
}

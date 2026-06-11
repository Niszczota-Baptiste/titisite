import { useEffect, useMemo, useRef } from 'react';
import { hexToRgb } from '../tokens';
import { buildWorld } from './terrain';

// Minecraft-style 2D map, generated from the exact same world grids as the 3D
// view (terrain.js is three-free, so this mode never loads the 3D chunk).
// Terrain is painted once on a small canvas upscaled with pixelated rendering;
// zones are crisp DOM buttons on top — clickable, hoverable, accessible.

const shadeHex = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.min(255, Math.max(0, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

export function paintWorld(canvas, world, accent, { routes = true, px = 6 } = {}) {
  canvas.width = world.grid * px;
  canvas.height = world.grid * px;
  const ctx = canvas.getContext('2d');
  const { grid, height, biome, beach, path, bridge, waterLevel, terrain } = world;
  const idx = (i, j) => j * grid + i;
  const hAt = (i, j) => (i < 0 || j < 0 || i >= grid || j >= grid ? 0 : height[idx(i, j)]);
  const water = terrain.waterColor || '#1d4e6e';

  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const h = height[idx(i, j)];
      let color;
      if (h < waterLevel) {
        // Depth-shaded water; bridges drawn as planks.
        color = bridge[idx(i, j)] ? '#8a6844' : shadeHex(water, h > 0 ? 0.95 : 0.7);
      } else {
        const b = terrain.biomes[biome[idx(i, j)]] || terrain.biomes.plaines;
        let base = b.top;
        if (beach[idx(i, j)]) base = '#d8c084';
        if (path[idx(i, j)]) base = '#9c8f7a';
        // NW relief shading, the classic in-game map trick.
        const rel = h - hAt(i - 1, j - 1);
        const f = (0.95 + ((i * 7 + j * 13) % 5) * 0.02) * (rel > 0 ? 1.12 : rel < 0 ? 0.82 : 1);
        color = shadeHex(base, f);
      }
      ctx.fillStyle = color;
      ctx.fillRect(i * px, j * px, px, px);
    }
  }

  if (!routes) return;

  // Luminous 'arc' connections, dashed in the accent color.
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  for (const r of world.routes) {
    if (r.style !== 'arc' || r.points.length < 2) continue;
    const toPx = ([x, z]) => [(x + grid / 2) * px, (z + grid / 2) * px];
    ctx.beginPath();
    ctx.moveTo(...toPx(r.points[0]));
    ctx.lineTo(...toPx(r.points[r.points.length - 1]));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export function Map2D({
  map, zones, accent, hoveredId, selectedId, dimmedIds, onHover, onSelect,
}) {
  const canvas = useRef(null);
  const rgb = hexToRgb(accent) || '201,168,232';
  const world = useMemo(() => buildWorld(map.terrain, map.biome, zones), [map.terrain, map.biome, zones]);

  useEffect(() => {
    if (canvas.current) paintWorld(canvas.current, world, accent);
  }, [world, accent]);

  // World x/z → percentage position inside the square canvas box.
  const G = world.grid;
  const pos = (x, z) => ({ left: `${((x + G / 2) / G) * 100}%`, top: `${((z + G / 2) / G) * 100}%` });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: '100%', aspectRatio: '1', maxWidth: '100%' }}>
        <canvas
          ref={canvas}
          aria-hidden
          style={{
            width: '100%', height: '100%', display: 'block',
            imageRendering: 'pixelated', borderRadius: 12,
          }}
        />
        {zones.map((z) => {
          const dimmed = dimmedIds.has(z.id);
          const lit = hoveredId === z.id || selectedId === z.id;
          return (
            <button
              key={z.id}
              onClick={() => onSelect(z.id)}
              onMouseEnter={() => !dimmed && onHover(z.id)}
              onMouseLeave={() => onHover(null)}
              aria-label={`${z.title}${z.category ? ` (${z.category})` : ''}`}
              style={{
                position: 'absolute', ...pos(z.x, z.z), transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: 'none', border: 'none', cursor: dimmed ? 'default' : 'pointer',
                opacity: dimmed ? 0.3 : 1, padding: 4, transition: 'opacity 0.25s',
              }}
            >
              <span style={{
                width: lit ? 15 : 11, height: lit ? 15 : 11, transform: 'rotate(45deg)',
                background: selectedId === z.id ? accent : 'rgba(11,6,32,0.9)',
                border: `2px solid ${accent}`, borderRadius: 2,
                boxShadow: lit ? `0 0 12px rgba(${rgb},0.9)` : `0 0 6px rgba(0,0,0,0.6)`,
                transition: 'all 0.15s',
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, whiteSpace: 'nowrap',
                color: lit ? accent : '#ede8f8', background: 'rgba(8,5,20,0.75)',
                border: `1px solid rgba(${rgb},${lit ? 0.55 : 0.18})`,
                borderRadius: 6, padding: '1px 6px',
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{z.title}</span>
            </button>
          );
        })}

        {/* Quick preview of the hovered zone, same content as the 3D card */}
        {hoveredId != null && selectedId == null && (() => {
          const z = zones.find((x) => x.id === hoveredId);
          if (!z || dimmedIds.has(z.id)) return null;
          return (
            <div style={{
              position: 'absolute', ...pos(z.x, z.z), transform: 'translate(-50%, -130%)',
              width: 220, pointerEvents: 'none', zIndex: 5,
              background: 'rgba(11,6,32,0.94)', border: `1px solid rgba(${rgb},0.45)`,
              borderRadius: 12, padding: '11px 13px', boxShadow: '0 18px 48px rgba(0,0,0,0.6)', textAlign: 'left',
            }}>
              {z.category && <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: `rgba(${rgb},0.85)`, margin: '0 0 4px' }}>{z.category}</p>}
              <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: '#ede8f8', margin: 0 }}>{z.title}</p>
              {z.description && (
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, lineHeight: 1.5, color: 'rgba(200,192,216,0.85)', margin: '5px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{z.description}</p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

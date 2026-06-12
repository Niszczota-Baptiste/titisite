import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { hexToRgb } from '../tokens';
import { paintWorld } from './Map2D';
import { zoneMatches } from './MapHud';
import { MARKER_BY_KEY } from './presets';
import { buildWorld } from './terrain';
import { ZonePanel } from './ZonePanel';

// Giant 2D atlas of a universe (« carte-monde ») : the whole world at macro
// scale (1 cell = 8/16/32 blocks), freely pannable and zoomable like an
// in-game map wall. POI markers are tiered (kingdoms always labeled, hamlets
// on zoom), clicking a place plays a cinematic dive then opens its lore page
// — which carries its own local voxel map. Pure canvas + DOM: no three.js.

const MAX_ZOOM = 14;

function useView(world, container) {
  const [view, setView] = useState({ cx: 0, cz: 0, k: 4 });
  const fitK = useCallback(() => {
    const el = container.current;
    if (!el) return 2;
    return Math.max(0.4, Math.min(el.clientWidth, el.clientHeight) / world.grid);
  }, [world.grid, container]);

  useEffect(() => {
    setView({ cx: 0, cz: 0, k: fitK() });
  }, [fitK]);

  const clampView = useCallback((v) => {
    const k = Math.min(MAX_ZOOM, Math.max(fitK() * 0.9, v.k));
    const half = world.grid / 2;
    return {
      k,
      cx: Math.min(half, Math.max(-half, v.cx)),
      cz: Math.min(half, Math.max(-half, v.cz)),
    };
  }, [world.grid, fitK]);

  return [view, (v) => setView(clampView(v)), fitK];
}

export function WorldMapViewer({ worldmap, accent, characters, glossary, onNavigate }) {
  const isMobile = useIsMobile(720);
  const container = useRef(null);
  const viewport = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const flight = useRef(null);
  const rgb = hexToRgb(accent) || '201,168,232';

  const zones = worldmap.zones;
  const world = useMemo(
    () => buildWorld(worldmap.terrain, 'plaines', zones, { world: true }),
    [worldmap.terrain, zones],
  );
  const [view, setView, fitK] = useView(world, container);
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');

  const dimmedIds = useMemo(() => {
    if (!search.trim()) return new Set();
    return new Set(zones.filter((z) => !zoneMatches(z, search, '')).map((z) => z.id));
  }, [zones, search]);

  // The terrain is painted once on an offscreen canvas (1 px/cell on big
  // worlds), then every frame is just one scaled drawImage.
  const offscreen = useMemo(() => {
    const off = document.createElement('canvas');
    paintWorld(off, world, accent, { px: world.grid > 160 ? 1 : 4, zones });
    return off;
  }, [world, accent, zones]);

  const draw = useCallback(() => {
    const el = viewport.current;
    const off = offscreen;
    const box = container.current;
    if (!el || !off || !box) return;
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
    const ctx = el.getContext('2d');
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    const { cx, cz, k } = view;
    const G = world.grid;
    // world cell (i,j) → screen: (i - G/2 - cx) * k + W/2
    const sx = (W / 2) - (cx + G / 2) * k;
    const sy = (H / 2) - (cz + G / 2) * k;
    ctx.drawImage(off, sx, sy, G * k, G * k);
  }, [view, world, offscreen]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const toScreen = (x, z) => {
    const box = container.current;
    if (!box) return { left: 0, top: 0 };
    return {
      left: box.clientWidth / 2 + (x - view.cx) * view.k,
      top: box.clientHeight / 2 + (z - view.cz) * view.k,
    };
  };

  const screenToWorld = (px, py) => {
    const box = container.current;
    const r = box.getBoundingClientRect();
    return {
      x: view.cx + (px - r.left - box.clientWidth / 2) / view.k,
      z: view.cz + (py - r.top - box.clientHeight / 2) / view.k,
    };
  };

  // Cinematic dive: ease the view toward a POI, then run the action.
  const flyTo = (x, z, targetK, after) => {
    if (flight.current) cancelAnimationFrame(flight.current.raf);
    const from = { ...view };
    const start = performance.now();
    const dur = 750;
    const ease = (t) => 1 - (1 - t) ** 3;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = ease(t);
      setView({
        cx: from.cx + (x - from.cx) * e,
        cz: from.cz + (z - from.cz) * e,
        k: from.k + (targetK - from.k) * e,
      });
      if (t < 1) flight.current = { raf: requestAnimationFrame(step) };
      else { flight.current = null; after?.(); }
    };
    flight.current = { raf: requestAnimationFrame(step) };
  };

  const openZone = (z) => {
    if (z.link && z.link.startsWith('/')) {
      // Dive into the place, then open its lore page (with its local map).
      flyTo(z.x, z.z, Math.max(view.k, 9), () => onNavigate(z.link));
    } else {
      setSelectedId(z.id);
      flyTo(z.x, z.z, Math.max(view.k, 5));
    }
  };

  // Pan / pinch / wheel.
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: false };
  };
  const onPointerMove = (e) => {
    const pts = pointers.current;
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) gesture.current.moved = true;
      setView({ ...view, cx: view.cx - dx / view.k, cz: view.cz - dy / view.k });
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const distNow = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      if (g.pinch) {
        setView({ ...view, k: view.k * (distNow / g.pinch) });
      }
      g.pinch = distNow;
      g.moved = true;
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && gesture.current && !gesture.current.moved) setSelectedId(null);
    if (pointers.current.size < 2 && gesture.current) gesture.current.pinch = null;
  };
  const onWheel = (e) => {
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const at = screenToWorld(e.clientX, e.clientY);
    const k = Math.min(MAX_ZOOM, Math.max(fitK() * 0.9, view.k * factor));
    // Keep the point under the cursor stationary while zooming.
    const ratio = k / view.k;
    setView({
      k,
      cx: at.x - (at.x - view.cx) / ratio,
      cz: at.z - (at.z - view.cz) / ratio,
    });
  };

  // React registers `wheel` as passive, so preventDefault() there can't stop
  // the page from scrolling under the map. Attach a non-passive native
  // listener instead: the wheel zooms the map, never the page.
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const el = viewport.current;
    if (!el) return undefined;
    const handler = (e) => { e.preventDefault(); wheelRef.current(e); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const recenter = (term) => {
    setSearch(term);
    if (!term.trim()) return;
    const hit = zones.find((z) => zoneMatches(z, term, ''));
    if (hit) flyTo(hit.x, hit.z, Math.max(view.k, 5));
  };

  const selected = selectedId != null ? zones.find((z) => z.id === selectedId) : null;
  const blocksPerCell = world.terrain.blocksPerCell || 16;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  return (
    <div
      ref={container}
      role="region"
      aria-label={`Carte-monde ${worldmap.name}`}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18,
        height: isMobile ? 'min(74vh, 560px)' : 'clamp(460px, 66vh, 720px)',
        border: `1px solid rgba(${rgb},0.28)`, background: '#0a1420',
        boxShadow: `0 24px 80px rgba(0,0,0,0.5), inset 0 0 120px rgba(${rgb},0.05)`,
      }}
    >
      <canvas
        ref={viewport}
        aria-hidden
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }}
      />

      {/* POI markers — tier 3 always labeled, smaller places reveal on zoom */}
      {zones.map((z) => {
        const m = MARKER_BY_KEY[z.marker] || MARKER_BY_KEY.lieu;
        const dimmed = dimmedIds.has(z.id);
        const lit = hoveredId === z.id || selectedId === z.id;
        const labeled = lit || m.tier >= 3 || (m.tier === 2 && view.k >= 2.4) || view.k >= 5;
        const size = (m.tier === 3 ? 30 : m.tier === 2 ? 25 : 21) * (lit ? 1.15 : 1);
        const { left, top } = toScreen(z.x, z.z);
        if (left < -60 || top < -60) return null;
        if (z.marker === 'etiquette') {
          // Cartographic place name (mountain ranges, rivers…): rotated text,
          // sized by the zone's scale, no badge.
          const fs = (9 + 5 * (z.scale || 1)) * Math.min(2.2, Math.max(0.85, view.k / 2.6));
          return (
            <button type="button"
              key={z.id}
              onClick={() => !dimmed && openZone(z)}
              onMouseEnter={() => !dimmed && setHoveredId(z.id)}
              onMouseLeave={() => setHoveredId(null)}
              aria-label={z.title}
              style={{
                position: 'absolute', left, top,
                transform: `translate(-50%, -50%) rotate(${((z.rotation || 0) * 180) / Math.PI}deg)`,
                background: 'none', border: 'none', padding: 2,
                cursor: dimmed ? 'default' : 'pointer',
                opacity: dimmed ? 0.25 : 1, zIndex: lit ? 6 : 2,
                fontFamily: "'Georgia',serif", fontStyle: 'italic',
                fontSize: fs, letterSpacing: '0.22em', whiteSpace: 'nowrap',
                color: lit ? accent : 'rgba(240,238,250,0.88)',
                textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.7)',
              }}
            >{z.title}</button>
          );
        }
        return (
          <button type="button"
            key={z.id}
            onClick={() => !dimmed && openZone(z)}
            onMouseEnter={() => !dimmed && setHoveredId(z.id)}
            onMouseLeave={() => setHoveredId(null)}
            aria-label={`${z.title}${z.category ? ` (${z.category})` : ''}`}
            style={{
              position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: 'none', border: 'none', padding: 4,
              cursor: dimmed ? 'default' : 'pointer',
              opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.25s', zIndex: m.tier + (lit ? 4 : 0),
            }}
          >
            <span style={{
              width: size, height: size, borderRadius: '50%', fontSize: size * 0.52,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(11,6,32,0.88)',
              border: `2px solid ${lit ? accent : `rgba(${rgb},0.55)`}`,
              boxShadow: lit ? `0 0 14px rgba(${rgb},0.9)` : '0 2px 8px rgba(0,0,0,0.6)',
              transition: 'all 0.15s', color: '#ede8f8',
            }}>{m.icon}</span>
            {labeled && (
              <span style={{
                ...mono, fontSize: m.tier === 3 ? 11 : 10, whiteSpace: 'nowrap',
                color: lit ? accent : '#ede8f8', background: 'rgba(8,5,20,0.78)',
                border: `1px solid rgba(${rgb},${lit ? 0.55 : 0.2})`,
                borderRadius: 6, padding: '1px 6px', textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{z.title}</span>
            )}
          </button>
        );
      })}

      {/* Hover preview */}
      {hoveredId != null && selectedId == null && (() => {
        const z = zones.find((x) => x.id === hoveredId);
        if (!z || dimmedIds.has(z.id)) return null;
        const { left, top } = toScreen(z.x, z.z);
        return (
          <div style={{
            position: 'absolute', left, top: top - 26, transform: 'translate(-50%, -100%)',
            width: 220, pointerEvents: 'none', zIndex: 12,
            background: 'rgba(11,6,32,0.94)', border: `1px solid rgba(${rgb},0.45)`,
            borderRadius: 12, padding: '11px 13px', boxShadow: '0 18px 48px rgba(0,0,0,0.6)', textAlign: 'left',
          }}>
            {z.category && <p style={{ ...mono, fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: `rgba(${rgb},0.85)`, margin: '0 0 4px' }}>{z.category}</p>}
            <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: '#ede8f8', margin: 0 }}>{z.title}</p>
            {z.description && (
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, lineHeight: 1.5, color: 'rgba(200,192,216,0.85)', margin: '5px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{z.description}</p>
            )}
            {z.link?.startsWith('/') && (
              <p style={{ ...mono, fontSize: 9.5, color: `rgba(${rgb},0.8)`, margin: '6px 0 0' }}>cliquer pour explorer →</p>
            )}
          </div>
        );
      })()}

      {/* HUD: search + zoom + scale */}
      <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 20 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => recenter(e.target.value)}
          placeholder="Rechercher un lieu…"
          aria-label="Rechercher un lieu sur la carte-monde"
          style={{
            ...mono, width: isMobile ? 170 : 230, fontSize: 12,
            background: 'rgba(9,5,22,0.82)', backdropFilter: 'blur(8px)',
            border: `1px solid rgba(${rgb},0.3)`, borderRadius: 10,
            padding: '9px 12px', color: '#ede8f8', outline: 'none',
          }}
        />
      </div>
      <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[['+', 1.4], ['−', 1 / 1.4], ['⌂', 0]].map(([label, f]) => (
          <button type="button"
            key={label}
            aria-label={label === '+' ? 'Zoomer' : label === '−' ? 'Dézoomer' : 'Vue d’ensemble'}
            onClick={() => (f === 0
              ? setView({ cx: 0, cz: 0, k: fitK() })
              : setView({ ...view, k: Math.min(MAX_ZOOM, Math.max(fitK() * 0.9, view.k * f)) }))}
            style={{
              ...mono, width: 34, height: 34, fontSize: 15, cursor: 'pointer',
              background: 'rgba(9,5,22,0.82)', border: `1px solid rgba(${rgb},0.3)`,
              borderRadius: 10, color: accent,
            }}
          >{label}</button>
        ))}
      </div>
      <div style={{
        position: 'absolute', bottom: 14, left: 14, zIndex: 20, pointerEvents: 'none',
        ...mono, fontSize: 10, color: 'rgba(180,170,200,0.7)',
        background: 'rgba(9,5,22,0.7)', borderRadius: 8, padding: '5px 10px',
      }}>
        {worldmap.name} · {world.grid * blocksPerCell} × {world.grid * blocksPerCell} blocs · {zones.length} lieu{zones.length > 1 ? 'x' : ''}
      </div>
      <div style={{
        position: 'absolute', bottom: 14, right: 14, zIndex: 20, pointerEvents: 'none',
        ...mono, fontSize: 9.5, color: 'rgba(180,170,200,0.55)',
        background: 'rgba(9,5,22,0.7)', borderRadius: 8, padding: '5px 10px',
      }}>
        {isMobile ? 'glisser · pincer pour zoomer' : 'glisser pour explorer · molette pour zoomer'}
      </div>

      {selected && (
        <ZonePanel
          zone={selected}
          accent={accent}
          characters={characters}
          glossary={glossary}
          onClose={() => setSelectedId(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* Screen-reader / keyboard fallback */}
      <nav aria-label="Lieux de la carte-monde" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        <ul>
          {zones.map((z) => (
            <li key={z.id}><button type="button" onClick={() => openZone(z)}>{z.title}{z.category ? ` (${z.category})` : ''}</button></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// Tabs over the universe's world maps (Surface, Profondeurs…).
export function WorldAtlas({ worldmaps, accent, characters, glossary, onNavigate }) {
  const [active, setActive] = useState(0);
  const rgb = hexToRgb(accent) || '201,168,232';
  const current = worldmaps[Math.min(active, worldmaps.length - 1)];
  if (!current) return null;
  return (
    <div>
      {worldmaps.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {worldmaps.map((wm, i) => (
            <button type="button"
              key={wm.id}
              onClick={() => setActive(i)}
              style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, cursor: 'pointer',
                background: i === active ? `rgba(${rgb},0.2)` : 'rgba(9,5,22,0.6)',
                border: `1px solid rgba(${rgb},${i === active ? 0.6 : 0.25})`,
                color: i === active ? accent : 'rgba(200,192,216,0.8)',
                borderRadius: 10, padding: '6px 14px',
              }}
            >{wm.name}</button>
          ))}
        </div>
      )}
      <WorldMapViewer
        key={current.id}
        worldmap={current}
        accent={accent}
        characters={characters}
        glossary={glossary}
        onNavigate={onNavigate}
      />
    </div>
  );
}

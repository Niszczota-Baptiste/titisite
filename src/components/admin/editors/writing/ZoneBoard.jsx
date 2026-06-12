import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { paintWorld } from '../../../writing/map/Map2D';
import { MARKER_BY_KEY } from '../../../writing/map/presets';
import { ACC_RGB } from '../../ui';

// Shared 2D board for both map levels, now with free pan + zoom so giant
// worlds can be edited with pixel precision: wheel zooms toward the cursor,
// dragging the background pans. Zone markers stay draggable, and `pathEdit`
// switches to free-path editing (click adds a waypoint, dragging a handle
// moves it, double-click removes it) for road courses and territories.
//
// pathEdit: { points: [[x,z]…], endpoints: [[x,z],[x,z]] | null, closed,
//             color, onChange(points) }

const MAX_K = 28;

const segDist = (p, a, b) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
};

export function ZoneBoard({
  world, accent, zones, selectedId, onSelect, onMove, onMoveEnd, pathEdit, maxWidth = 640,
}) {
  const boardRef = useRef(null);
  const viewport = useRef(null);
  const drag = useRef(null);       // marker drag: zone id
  const handleDrag = useRef(null); // path-handle drag: { idx, moved }
  const pan = useRef(null);        // background pan: { moved }
  const [W, setW] = useState(0);   // square board size in px
  const [view, setView] = useState(null); // { cx, cz, k } — world center + px/cell

  const G = world.grid;
  const fitK = W > 0 ? W / G : 1;

  // Square board measure (the container is responsive).
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

  // Full world painted once offscreen; every frame is one scaled blit.
  const offscreen = useMemo(() => {
    const off = document.createElement('canvas');
    paintWorld(off, world, accent, { px: G > 160 ? 1 : 6, zones });
    return { canvas: off, px: G > 160 ? 1 : 6 };
  }, [world, accent, zones, G]);

  useEffect(() => {
    const el = viewport.current;
    if (!el || !view || W === 0) return;
    if (el.width !== W || el.height !== W) { el.width = W; el.height = W; }
    const ctx = el.getContext('2d');
    ctx.fillStyle = '#0a1420';
    ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = false;
    const scale = view.k / offscreen.px;
    const sx = W / 2 - (view.cx + G / 2) * view.k;
    const sy = W / 2 - (view.cz + G / 2) * view.k;
    ctx.drawImage(offscreen.canvas, sx, sy, offscreen.canvas.width * scale, offscreen.canvas.height * scale);
  }, [view, offscreen, W, G]);

  const toScreen = (x, z) => (view
    ? { left: W / 2 + (x - view.cx) * view.k, top: W / 2 + (z - view.cz) * view.k }
    : { left: 0, top: 0 });

  const screenToWorld = (clientX, clientY) => {
    const r = boardRef.current.getBoundingClientRect();
    const half = G / 2;
    const x = view.cx + (clientX - r.left - W / 2) / view.k;
    const z = view.cz + (clientY - r.top - W / 2) / view.k;
    return [
      Math.round(Math.min(half, Math.max(-half, x)) * 10) / 10,
      Math.round(Math.min(half, Math.max(-half, z)) * 10) / 10,
    ];
  };

  // Non-passive wheel: zoom toward the cursor without scrolling the page.
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

  const fullPath = pathEdit
    ? (pathEdit.endpoints ? [pathEdit.endpoints[0], ...pathEdit.points, pathEdit.endpoints[1]] : pathEdit.points)
    : null;

  const addPoint = (clientX, clientY) => {
    const pt = screenToWorld(clientX, clientY);
    const pts = [...pathEdit.points];
    if (pathEdit.closed || !pathEdit.endpoints || fullPath.length < 2) {
      pts.push(pt);
    } else {
      // Insert into the segment closest to the click so the course stays tidy.
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < fullPath.length - 1; k++) {
        const d = segDist(pt, fullPath[k], fullPath[k + 1]);
        if (d < bestD) { bestD = d; best = k; }
      }
      pts.splice(best, 0, pt);
    }
    pathEdit.onChange(pts);
  };

  const pathColor = pathEdit?.color || accent;
  const zoomPct = view ? Math.round((view.k / fitK) * 100) : 100;

  return (
    <div
      ref={boardRef}
      onPointerMove={(e) => {
        if (!view) return;
        if (handleDrag.current != null && pathEdit) {
          handleDrag.current.moved = true;
          const pts = [...pathEdit.points];
          pts[handleDrag.current.idx] = screenToWorld(e.clientX, e.clientY);
          pathEdit.onChange(pts);
          return;
        }
        if (drag.current != null) {
          const [x, z] = screenToWorld(e.clientX, e.clientY);
          onMove?.(drag.current, x, z);
          return;
        }
        if (pan.current) {
          const dx = e.clientX - pan.current.x;
          const dy = e.clientY - pan.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) pan.current.moved = true;
          pan.current.x = e.clientX;
          pan.current.y = e.clientY;
          setView(clampView({ ...view, cx: view.cx - dx / view.k, cz: view.cz - dy / view.k }));
        }
      }}
      onPointerUp={(e) => {
        if (drag.current != null) onMoveEnd?.(drag.current);
        drag.current = null;
        handleDrag.current = null;
        if (pan.current && !pan.current.moved && pathEdit) addPoint(e.clientX, e.clientY);
        pan.current = null;
      }}
      style={{
        position: 'relative', width: `min(${maxWidth}px, 100%)`, aspectRatio: '1',
        borderRadius: 14, overflow: 'hidden', border: `1px solid rgba(${ACC_RGB},0.25)`,
        marginBottom: 18, touchAction: 'none', background: '#0a1420',
        cursor: pathEdit ? 'crosshair' : 'grab',
      }}
    >
      <canvas
        ref={viewport}
        aria-hidden
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pan.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />

      {/* Zoom indicator + reset */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(200,192,216,0.8)', background: 'rgba(9,5,22,0.8)', borderRadius: 8, padding: '3px 8px' }}>
          {zoomPct} %
        </span>
        <button
          type="button"
          title="Vue d'ensemble"
          onClick={() => setView({ cx: 0, cz: 0, k: fitK })}
          style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 12, width: 26, height: 26,
            background: 'rgba(9,5,22,0.8)', border: `1px solid rgba(${ACC_RGB},0.35)`,
            borderRadius: 8, color: '#ede8f8', cursor: 'pointer',
          }}
        >⌂</button>
      </div>

      {/* Path being edited: live polyline/polygon + draggable handles */}
      {pathEdit && view && fullPath.length > 1 && (
        <svg width={W} height={W} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {(() => {
            const pts = fullPath.map(([x, z]) => {
              const { left, top } = toScreen(x, z);
              return `${left},${top}`;
            }).join(' ');
            return pathEdit.closed
              ? <polygon points={pts} fill={pathColor} fillOpacity="0.14" stroke={pathColor} strokeWidth="2" strokeDasharray="6 4" />
              : <polyline points={pts} fill="none" stroke={pathColor} strokeWidth="2.5" strokeDasharray="7 5" />;
          })()}
        </svg>
      )}
      {pathEdit && view && pathEdit.points.map((pt, idx) => (
        <button
          key={idx}
          type="button"
          title="Glisser pour déplacer · double-clic pour supprimer"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            handleDrag.current = { idx, moved: false };
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            pathEdit.onChange(pathEdit.points.filter((_, i) => i !== idx));
          }}
          style={{
            position: 'absolute', ...toScreen(pt[0], pt[1]), transform: 'translate(-50%, -50%)',
            width: 14, height: 14, borderRadius: '50%', padding: 0, zIndex: 8,
            background: pathColor, border: '2px solid #0b0620', cursor: 'grab',
            boxShadow: '0 0 8px rgba(0,0,0,0.7)', touchAction: 'none',
          }}
        />
      ))}
      {pathEdit && view && pathEdit.endpoints && pathEdit.endpoints.map((pt, i) => (
        <span key={`end-${i}`} style={{
          position: 'absolute', ...toScreen(pt[0], pt[1]), transform: 'translate(-50%, -50%)',
          width: 12, height: 12, borderRadius: 3, zIndex: 7, pointerEvents: 'none',
          background: '#0b0620', border: `2px solid ${pathColor}`,
        }} />
      ))}

      {/* Zone markers (frozen while a path is being edited) */}
      {view && zones.map((z) => {
        const m = MARKER_BY_KEY[z.marker] || MARKER_BY_KEY.lieu;
        const lit = selectedId === z.id;
        const { left, top } = toScreen(z.x, z.z);
        if (left < -40 || top < -40 || left > W + 40 || top > W + 40) return null;
        const common = {
          position: 'absolute', left, top, zIndex: lit ? 5 : 2,
          background: 'none', border: 'none', padding: 4,
          cursor: pathEdit ? 'default' : 'grab',
          pointerEvents: pathEdit ? 'none' : 'auto', touchAction: 'none',
          opacity: pathEdit ? 0.55 : 1,
        };
        const grab = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = z.id;
          onSelect?.(z.id);
        };
        const release = () => { if (drag.current != null) onMoveEnd?.(drag.current); drag.current = null; };
        if (z.marker === 'etiquette') {
          return (
            <button type="button"
              key={z.id}
              onPointerDown={grab}
              onPointerUp={release}
              aria-label={z.title}
              style={{
                ...common,
                transform: `translate(-50%, -50%) rotate(${((z.rotation || 0) * 180) / Math.PI}deg)`,
                fontFamily: "'Georgia',serif", fontStyle: 'italic', whiteSpace: 'nowrap',
                fontSize: 8 + 4 * (z.scale || 1), letterSpacing: '0.18em',
                color: lit ? accent : 'rgba(240,238,250,0.9)',
                textShadow: '0 1px 4px rgba(0,0,0,0.95)',
              }}
            >{z.title}</button>
          );
        }
        return (
          <button type="button"
            key={z.id}
            onPointerDown={grab}
            onPointerUp={release}
            aria-label={z.title}
            style={{
              ...common, transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}
          >
            <span style={{
              width: 26, height: 26, borderRadius: '50%', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(11,6,32,0.88)',
              border: `2px solid ${lit ? accent : `rgba(${ACC_RGB},0.55)`}`,
              boxShadow: lit ? `0 0 12px rgba(${ACC_RGB},0.9)` : '0 2px 8px rgba(0,0,0,0.6)',
            }}>{m.icon}</span>
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, whiteSpace: 'nowrap',
              color: lit ? accent : '#ede8f8', background: 'rgba(8,5,20,0.78)',
              border: `1px solid rgba(${ACC_RGB},${lit ? 0.55 : 0.2})`,
              borderRadius: 6, padding: '0 5px',
            }}>{z.title}</span>
          </button>
        );
      })}
    </div>
  );
}

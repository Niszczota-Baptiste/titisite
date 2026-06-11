import { useEffect, useRef } from 'react';
import { paintWorld } from '../../../writing/map/Map2D';
import { MARKER_BY_KEY } from '../../../writing/map/presets';
import { ACC_RGB } from '../../ui';

// Shared 2D board for both map levels: paints the world (territories
// included), shows draggable zone markers, and — when `pathEdit` is set —
// switches to free-path editing: click adds a waypoint, dragging a handle
// moves it, double-click removes it. Used for road courses (open polyline
// between two zones) and territories (closed polygon).
//
// pathEdit: { points: [[x,z]…], endpoints: [[x,z],[x,z]] | null, closed,
//             color, onChange(points) }

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
  const canvas = useRef(null);
  const boardRef = useRef(null);
  const drag = useRef(null);       // marker drag: zone id
  const handleDrag = useRef(null); // path-handle drag: { idx, moved }

  useEffect(() => {
    if (canvas.current) {
      paintWorld(canvas.current, world, accent, { px: world.grid > 160 ? 1 : 6, zones });
    }
  }, [world, accent, zones]);

  const G = world.grid;
  const pos = (x, z) => ({ left: `${((x + G / 2) / G) * 100}%`, top: `${((z + G / 2) / G) * 100}%` });

  const toWorld = (e) => {
    const r = boardRef.current.getBoundingClientRect();
    const half = G / 2;
    const x = ((e.clientX - r.left) / r.width) * G - half;
    const z = ((e.clientY - r.top) / r.height) * G - half;
    return [
      Math.round(Math.min(half, Math.max(-half, x)) * 10) / 10,
      Math.round(Math.min(half, Math.max(-half, z)) * 10) / 10,
    ];
  };

  const fullPath = pathEdit
    ? (pathEdit.endpoints ? [pathEdit.endpoints[0], ...pathEdit.points, pathEdit.endpoints[1]] : pathEdit.points)
    : null;

  const addPoint = (e) => {
    const pt = toWorld(e);
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

  const svgPts = (list) => list.map(([x, z]) => `${x + G / 2},${z + G / 2}`).join(' ');
  const pathColor = pathEdit?.color || accent;

  return (
    <div
      ref={boardRef}
      onPointerMove={(e) => {
        if (handleDrag.current != null && pathEdit) {
          handleDrag.current.moved = true;
          const pts = [...pathEdit.points];
          pts[handleDrag.current.idx] = toWorld(e);
          pathEdit.onChange(pts);
          return;
        }
        if (drag.current == null) return;
        const [x, z] = toWorld(e);
        onMove?.(drag.current, x, z);
      }}
      onPointerUp={() => {
        if (drag.current != null) onMoveEnd?.(drag.current);
        drag.current = null;
        handleDrag.current = null;
      }}
      style={{
        position: 'relative', width: `min(${maxWidth}px, 100%)`, aspectRatio: '1',
        borderRadius: 14, overflow: 'hidden', border: `1px solid rgba(${ACC_RGB},0.25)`,
        marginBottom: 18, touchAction: 'none', background: '#0a1420',
        cursor: pathEdit ? 'crosshair' : 'default',
      }}
    >
      <canvas
        ref={canvas}
        aria-hidden
        onClick={(e) => { if (pathEdit && !handleDrag.current?.moved) addPoint(e); }}
        style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }}
      />

      {/* Path being edited: live polyline/polygon + draggable handles */}
      {pathEdit && fullPath.length > 1 && (
        <svg
          viewBox={`0 0 ${G} ${G}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {pathEdit.closed
            ? <polygon points={svgPts(fullPath)} fill={pathColor} fillOpacity="0.14" stroke={pathColor} strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            : <polyline points={svgPts(fullPath)} fill="none" stroke={pathColor} strokeWidth="2.5" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
      {pathEdit && pathEdit.points.map((pt, idx) => (
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
            position: 'absolute', ...pos(pt[0], pt[1]), transform: 'translate(-50%, -50%)',
            width: 14, height: 14, borderRadius: '50%', padding: 0, zIndex: 8,
            background: pathColor, border: '2px solid #0b0620', cursor: 'grab',
            boxShadow: '0 0 8px rgba(0,0,0,0.7)', touchAction: 'none',
          }}
        />
      ))}
      {pathEdit && pathEdit.endpoints && pathEdit.endpoints.map((pt, i) => (
        <span key={`end-${i}`} style={{
          position: 'absolute', ...pos(pt[0], pt[1]), transform: 'translate(-50%, -50%)',
          width: 12, height: 12, borderRadius: 3, zIndex: 7, pointerEvents: 'none',
          background: '#0b0620', border: `2px solid ${pathColor}`,
        }} />
      ))}

      {/* Zone markers (frozen while a path is being edited) */}
      {zones.map((z) => {
        const m = MARKER_BY_KEY[z.marker] || MARKER_BY_KEY.lieu;
        const lit = selectedId === z.id;
        const common = {
          position: 'absolute', ...pos(z.x, z.z), zIndex: lit ? 5 : 2,
          background: 'none', border: 'none', padding: 4,
          cursor: pathEdit ? 'default' : 'grab',
          pointerEvents: pathEdit ? 'none' : 'auto', touchAction: 'none',
          opacity: pathEdit ? 0.55 : 1,
        };
        const grab = (e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = z.id;
          onSelect?.(z.id);
        };
        const release = () => { if (drag.current != null) onMoveEnd?.(drag.current); drag.current = null; };
        if (z.marker === 'etiquette') {
          return (
            <button
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
          <button
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

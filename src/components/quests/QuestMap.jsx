import { useMemo, useRef } from 'react';
import { ACC, ACC_RGB, INK, MUTED, POINT_ROLES, hexToRgb } from './theme';

// Neutral, editable coordinate grid — reuses the Minecraft-map aesthetic of the
// writing Map2D (pixel grid + diamond markers) but plots RAW in-game X/Z (the
// writing map generates terrain from a biome and can't ingest server coords).
// Read-only on the quest sheet; click-to-place in the editor.
//
// Props:
//   points      [{ label, role, x, y, z }]
//   selected    index of the highlighted point (or null)
//   onSelect    (index) => void
//   editable    when true, clicking the grid moves the `active` point's X/Z
//   active      index of the point being placed (editor)
//   onPlace     (index, x, z) => void

const SIZE = 320;           // canvas px (square)
const DEFAULT_SPAN = 256;   // world blocks shown when points don't define a span

function computeView(points) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  if (xs.length === 0) {
    return { cx: 0, cz: 0, span: DEFAULT_SPAN };
  }
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(64, (maxX - minX), (maxZ - minZ)) * 1.6 || DEFAULT_SPAN;
  return { cx, cz, span };
}

export function QuestMap({ points = [], selected = null, onSelect, editable = false, active = null, onPlace }) {
  const boxRef = useRef(null);
  const view = useMemo(() => computeView(points), [points]);

  // world → percentage inside the square
  const toPct = (x, z) => ({
    left: `${((x - view.cx) / view.span + 0.5) * 100}%`,
    top: `${((z - view.cz) / view.span + 0.5) * 100}%`,
  });
  // click px → world coords
  const fromClient = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    const fx = (clientX - r.left) / r.width - 0.5;
    const fz = (clientY - r.top) / r.height - 0.5;
    return {
      x: Math.round(view.cx + fx * view.span),
      z: Math.round(view.cz + fz * view.span),
    };
  };

  const handleClick = (e) => {
    if (!editable || active == null || !onPlace) return;
    const { x, z } = fromClient(e.clientX, e.clientY);
    onPlace(active, x, z);
  };

  // Grid line spacing in world units → snapped to a "nice" step.
  const step = niceStep(view.span);
  const lines = gridLines(view, step);

  return (
    <div>
      <div
        ref={boxRef}
        onClick={handleClick}
        role={editable ? 'application' : 'img'}
        aria-label="Carte des points de quête (grille de coordonnées)"
        style={{
          position: 'relative', width: SIZE, maxWidth: '100%', aspectRatio: '1',
          background: 'radial-gradient(circle at 50% 40%, rgba(30,20,55,0.9), rgba(8,5,20,0.96))',
          border: `1px solid rgba(${ACC_RGB},0.25)`, borderRadius: 12, overflow: 'hidden',
          cursor: editable && active != null ? 'crosshair' : 'default',
        }}
      >
        {/* grid */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
          {lines.v.map((l) => (
            <line key={`v${l.world}`} x1={`${l.pct}%`} y1="0" x2={`${l.pct}%`} y2="100%"
              stroke={l.axis ? `rgba(${ACC_RGB},0.5)` : 'rgba(120,90,180,0.14)'} strokeWidth={l.axis ? 1.2 : 1} />
          ))}
          {lines.h.map((l) => (
            <line key={`h${l.world}`} x1="0" y1={`${l.pct}%`} x2="100%" y2={`${l.pct}%`}
              stroke={l.axis ? `rgba(${ACC_RGB},0.5)` : 'rgba(120,90,180,0.14)'} strokeWidth={l.axis ? 1.2 : 1} />
          ))}
        </svg>

        {/* markers */}
        {points.map((p, i) => {
          const role = POINT_ROLES[p.role] || POINT_ROLES.autre;
          const rgb = hexToRgb(role.color);
          const lit = selected === i || active === i;
          return (
            <button
              type="button"
              key={i}
              onClick={(e) => { e.stopPropagation(); onSelect?.(i); }}
              title={`${p.label || role.label} — X ${p.x} / Y ${p.y} / Z ${p.z}`}
              style={{
                position: 'absolute', ...toPct(p.x, p.z), transform: 'translate(-50%,-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'none', border: 'none', cursor: 'pointer', padding: 3,
              }}
            >
              <span style={{
                width: lit ? 16 : 12, height: lit ? 16 : 12, transform: 'rotate(45deg)',
                background: lit ? role.color : 'rgba(11,6,32,0.9)',
                border: `2px solid ${role.color}`, borderRadius: 2,
                boxShadow: lit ? `0 0 12px rgba(${rgb},0.9)` : `0 0 6px rgba(0,0,0,0.6)`,
                transition: 'all 0.15s',
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 9, whiteSpace: 'nowrap',
                color: lit ? role.color : INK, background: 'rgba(8,5,20,0.8)',
                border: `1px solid rgba(${rgb},${lit ? 0.6 : 0.2})`, borderRadius: 5, padding: '0 5px',
              }}>{role.icon} {p.label || role.label}</span>
            </button>
          );
        })}

        {points.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 12,
            textAlign: 'center', padding: 20,
          }}>
            {editable ? 'Ajoute un point, puis clique sur la grille pour le placer.' : 'Aucun point de carte.'}
          </div>
        )}
      </div>

      {/* explicit X/Y/Z list, always legible */}
      {points.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {points.map((p, i) => {
            const role = POINT_ROLES[p.role] || POINT_ROLES.autre;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSelect?.(i)}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                    background: selected === i ? `rgba(${hexToRgb(role.color)},0.14)` : 'rgba(20,14,38,0.5)',
                    border: `1px solid ${selected === i ? role.color : 'rgba(80,50,130,0.25)'}`,
                    borderRadius: 8, color: INK, fontFamily: "'Inter',sans-serif", fontSize: 12.5,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{role.icon}</span>
                  <span style={{ fontWeight: 600 }}>{p.label || role.label}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: MUTED }}>
                    X {p.x} · Y {p.y} · Z {p.z}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function niceStep(span) {
  const target = span / 6; // ~6 divisions
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

function gridLines(view, step) {
  const half = view.span / 2;
  const v = []; const h = [];
  const startX = Math.ceil((view.cx - half) / step) * step;
  for (let x = startX; x <= view.cx + half; x += step) {
    v.push({ world: x, pct: ((x - view.cx) / view.span + 0.5) * 100, axis: x === 0 });
  }
  const startZ = Math.ceil((view.cz - half) / step) * step;
  for (let z = startZ; z <= view.cz + half; z += step) {
    h.push({ world: z, pct: ((z - view.cz) / view.span + 0.5) * 100, axis: z === 0 });
  }
  return { v, h };
}

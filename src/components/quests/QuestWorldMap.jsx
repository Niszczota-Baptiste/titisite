import { useRef, useState } from 'react';
import {
  ACC, ACC_RGB, INK, MUTED, POINT_ROLES, POI_CATEGORIES, hexToRgb,
} from './theme';
import { computeView, gridLines, niceStep } from './mapGrid';

// Aggregated, pannable/zoomable world map: every quest's map points on one grid
// plus standalone POIs (buildings, farm zones…). Clicking a quest point opens
// the quest; in edit mode, clicking a POI edits it and clicking empty grid (with
// « + Point » armed) drops a new POI at those coordinates.

const CLICK_SLOP = 4; // px of movement below which a drag counts as a click

export function QuestWorldMap({
  questPoints = [], pois = [], canEdit = false, initialView = null, image = null,
  onOpenQuest, onEditPoi, onAddAt, onSaveView,
}) {
  const boxRef = useRef(null);
  const drag = useRef(null);
  const fit = () => computeView([...questPoints, ...pois], { defaultSpan: 512, padFactor: 1.8, minSpan: 128 });
  // Start from the map's configured centre/span (world isn't always at 0,0);
  // fall back to auto-fitting the points if the map has no configured view.
  const [view, setView] = useState(() => (initialView || fit()));
  const [addMode, setAddMode] = useState(false);
  const [showQuests, setShowQuests] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [showGrid, setShowGrid] = useState(!image);
  const [imgOpacity, setImgOpacity] = useState(1);
  const [imgDim, setImgDim] = useState(null); // natural { w, h } of the background image
  const [hover, setHover] = useState(null); // { kind, id }

  const pos = (x, z) => ({
    left: `${((x - view.cx) / view.span + 0.5) * 100}%`,
    top: `${((z - view.cz) / view.span + 0.5) * 100}%`,
  });
  // Background image placed in world space: centred on (image.cx, image.cz),
  // image.span blocks wide, height derived from its natural aspect ratio.
  const imgStyle = () => {
    const aspect = imgDim ? imgDim.h / imgDim.w : 1;
    const spanX = image.span;
    const spanZ = spanX * aspect;
    return {
      position: 'absolute',
      left: `${((image.cx - spanX / 2 - view.cx) / view.span + 0.5) * 100}%`,
      top: `${((image.cz - spanZ / 2 - view.cz) / view.span + 0.5) * 100}%`,
      width: `${(spanX / view.span) * 100}%`,
      height: `${(spanZ / view.span) * 100}%`,
      opacity: imgOpacity, pointerEvents: 'none', userSelect: 'none',
    };
  };
  const worldAt = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return {
      x: Math.round(view.cx + ((clientX - r.left) / r.width - 0.5) * view.span),
      z: Math.round(view.cz + ((clientY - r.top) / r.height - 0.5) * view.span),
    };
  };

  const zoom = (factor) => setView((v) => ({ ...v, span: clamp(v.span * factor, 32, 200000) }));
  const recenter = () => setView(initialView || fit());

  const onDown = (e) => {
    drag.current = { x0: e.clientX, y0: e.clientY, cx: view.cx, cz: view.cz, moved: 0 };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const dx = e.clientX - drag.current.x0;
    const dy = e.clientY - drag.current.y0;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx) + Math.abs(dy));
    setView((v) => ({
      ...v,
      cx: drag.current.cx - (dx / r.width) * v.span,
      cz: drag.current.cz - (dy / r.height) * v.span,
    }));
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved < CLICK_SLOP && addMode && canEdit && onAddAt) {
      const { x, z } = worldAt(e.clientX, e.clientY);
      onAddAt(x, z);
      setAddMode(false);
    }
  };

  const step = niceStep(view.span);
  const lines = gridLines(view, step);

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <TB onClick={() => zoom(0.75)} title="Zoom avant">＋</TB>
        <TB onClick={() => zoom(1.3333)} title="Zoom arrière">－</TB>
        <TB onClick={recenter} title="Revenir au centre de la carte">Recentrer</TB>
        <TB onClick={() => setView(fit())} title="Cadrer sur tous les points">Ajuster</TB>
        {canEdit && onSaveView && (
          <TB onClick={() => onSaveView(Math.round(view.cx), Math.round(view.cz), Math.round(view.span))}
            title="Mémoriser la vue actuelle comme centre/zoom par défaut de cette carte">💾 Vue par défaut</TB>
        )}
        <Toggle on={showQuests} onClick={() => setShowQuests((v) => !v)} color={ACC}>◆ Quêtes ({questPoints.length})</Toggle>
        <Toggle on={showPois} onClick={() => setShowPois((v) => !v)} color="#e8c86a">● Points ({pois.length})</Toggle>
        {image && <Toggle on={showGrid} onClick={() => setShowGrid((v) => !v)} color="#7bd3e8"># Grille</Toggle>}
        {image && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }} title="Opacité de l'image de fond">
            🖼
            <input type="range" min="0.15" max="1" step="0.05" value={imgOpacity}
              onChange={(e) => setImgOpacity(+e.target.value)} style={{ accentColor: ACC, width: 70 }} />
          </label>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setAddMode((v) => !v)}
            style={{
              marginLeft: 'auto', padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
              fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 700,
              background: addMode ? '#7be3a8' : 'transparent', color: addMode ? '#08130b' : '#7be3a8',
              border: '1px solid #7be3a8',
            }}
          >{addMode ? '✓ Clique la carte…' : '+ Ajouter un point'}</button>
        )}
      </div>

      {/* map */}
      <div
        ref={boxRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => { drag.current = null; }}
        style={{
          position: 'relative', width: '100%', maxWidth: 620, aspectRatio: '1',
          margin: '0 auto', userSelect: 'none',
          background: 'radial-gradient(circle at 50% 40%, rgba(30,20,55,0.9), rgba(8,5,20,0.96))',
          border: `1px solid rgba(${ACC_RGB},0.25)`, borderRadius: 12, overflow: 'hidden',
          cursor: addMode ? 'crosshair' : (drag.current ? 'grabbing' : 'grab'),
        }}
      >
        {image && (
          <img
            src={image.url} alt="" draggable={false}
            onLoad={(e) => setImgDim({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            style={imgStyle()}
          />
        )}
        {showGrid && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
            {lines.v.map((l) => (
              <line key={`v${l.world}`} x1={`${l.pct}%`} y1="0" x2={`${l.pct}%`} y2="100%"
                stroke={l.axis ? `rgba(${ACC_RGB},0.5)` : `rgba(120,90,180,${image ? 0.09 : 0.13})`} strokeWidth={l.axis ? 1.2 : 1} />
            ))}
            {lines.h.map((l) => (
              <line key={`h${l.world}`} x1="0" y1={`${l.pct}%`} x2="100%" y2={`${l.pct}%`}
                stroke={l.axis ? `rgba(${ACC_RGB},0.5)` : `rgba(120,90,180,${image ? 0.09 : 0.13})`} strokeWidth={l.axis ? 1.2 : 1} />
            ))}
          </svg>
        )}

        {/* quest points (diamonds) */}
        {showQuests && questPoints.map((p) => {
          const role = POINT_ROLES[p.role] || POINT_ROLES.autre;
          const color = p.factionCouleur || role.color;
          const lit = hover?.kind === 'q' && hover.id === p.id;
          return (
            <Marker key={`q${p.id}`} pos={pos(p.x, p.z)} lit={lit} shape="diamond" color={color}
              icon={role.icon} label={p.questTitre}
              onEnter={() => setHover({ kind: 'q', id: p.id })} onLeave={() => setHover(null)}
              onClick={(e) => { e.stopPropagation(); onOpenQuest?.(p.questId); }}
              sub={`${role.label} · X ${p.x} Y ${p.y} Z ${p.z}`} />
          );
        })}

        {/* standalone POIs (circles) */}
        {showPois && pois.map((p) => {
          const cat = POI_CATEGORIES[p.category] || POI_CATEGORIES.autre;
          const color = p.couleur || cat.color;
          const lit = hover?.kind === 'p' && hover.id === p.id;
          return (
            <Marker key={`p${p.id}`} pos={pos(p.x, p.z)} lit={lit} shape="circle" color={color}
              icon={cat.icon} label={p.label}
              onEnter={() => setHover({ kind: 'p', id: p.id })} onLeave={() => setHover(null)}
              onClick={(e) => { e.stopPropagation(); if (canEdit) onEditPoi?.(p); }}
              sub={`${cat.label} · X ${p.x} Y ${p.y} Z ${p.z}${p.note ? ` — ${p.note}` : ''}`} />
          );
        })}

        {questPoints.length + pois.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13, textAlign: 'center', padding: 24,
          }}>
            Aucun point pour l'instant. {canEdit ? 'Ajoute des points de carte aux quêtes, ou pose un point libre ci-dessus.' : ''}
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: 8, color: MUTED, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
        centre X {Math.round(view.cx)} / Z {Math.round(view.cz)} · grille {step} blocs · glisse pour te déplacer, ＋/－ pour zoomer
      </p>
    </div>
  );
}

function Marker({ pos, lit, shape, color, icon, label, sub, onEnter, onLeave, onClick }) {
  const rgb = hexToRgb(color);
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      title={`${label} — ${sub}`}
      style={{
        position: 'absolute', ...pos, transform: 'translate(-50%,-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: 3, zIndex: lit ? 6 : 2,
      }}
    >
      <span style={{
        width: lit ? 15 : 11, height: lit ? 15 : 11,
        transform: shape === 'diamond' ? 'rotate(45deg)' : 'none',
        borderRadius: shape === 'circle' ? '50%' : 2,
        background: lit ? color : 'rgba(11,6,32,0.9)', border: `2px solid ${color}`,
        boxShadow: lit ? `0 0 12px rgba(${rgb},0.9)` : `0 0 5px rgba(0,0,0,0.6)`, transition: 'all 0.12s',
      }} />
      {lit && (
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, whiteSpace: 'nowrap',
          color, background: 'rgba(8,5,20,0.85)', border: `1px solid rgba(${rgb},0.55)`,
          borderRadius: 5, padding: '0 5px',
        }}>{icon} {label}</span>
      )}
    </button>
  );
}

function TB({ children, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
      fontSize: 13, fontWeight: 700, background: 'rgba(20,14,38,0.7)', color: INK,
      border: `1px solid rgba(${ACC_RGB},0.25)`,
    }}>{children}</button>
  );
}

function Toggle({ children, on, onClick, color }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
      fontSize: 12.5, fontWeight: 600, color: on ? color : MUTED,
      background: on ? `rgba(${hexToRgb(color)},0.14)` : 'transparent',
      border: `1px solid ${on ? color : 'rgba(80,50,130,0.3)'}`, opacity: on ? 1 : 0.6,
    }}>{children}</button>
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

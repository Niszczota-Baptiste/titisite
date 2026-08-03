import { useEffect, useRef, useState } from 'react';
import { computeView, gridLines, niceStep } from '../quests/mapGrid';
import {
  TILE_SIZE, bearingDirection, imagePlacement, measureDistance, tileRect,
  tilesInView, toPct, worldToTile, zoomAt,
} from './mapMath';
import { ACC, ACC_RGB, ENTRY_TYPES, GOLD, INK, MUTED, hexToRgb } from './theme';

// La pièce maîtresse : carte pannable/zoomable (molette comprise) sur le
// patron de QuestWorldMap, avec l'image de fond calibrée par les deux points
// de référence du render, des formes distinctes par type d'entrée, le mode
// « origine » (rose des vents 8 axes + alignements) et la mesure de distance.

const CLICK_SLOP = 4;
const ROSE_AXES = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
  [180, 'S'], [225, 'SO'], [270, 'O'], [315, 'NO'],
];

// Une forme par type — la couleur seule ne suffit pas (daltonisme, image de
// fond chargée). clip-path pour triangle/hexagone, transform pour le losange.
const SHAPES = {
  structure: 'diamond', texte: 'square', mecanisme: 'hexagon',
  observation: 'circle', pnj: 'circle', evenement: 'triangle', objet: 'square',
};

export function LoreMap({
  points, map, mode, origin, onSetOrigin, ring, tolerance,
  measure, onMeasureClick, onOpenEntry, onAddAt, onDrawClick, onTileClick,
  shapes = [], draft = null, tiles = [],
}) {
  const boxRef = useRef(null);
  const drag = useRef(null);
  const [imgDim, setImgDim] = useState(null); // { w, h } naturel du render
  const [showGrid, setShowGrid] = useState(true);
  const [imgOpacity, setImgOpacity] = useState(1);
  const [hover, setHover] = useState(null);
  const [tileHover, setTileHover] = useState(null); // { tileX, tileZ } en mode tuile

  const placement = map?.imageUrl && imgDim
    ? imagePlacement(map, imgDim.h / imgDim.w)
    : null;

  const fitAll = () => {
    if (placement) {
      return {
        cx: placement.left + placement.spanX / 2,
        cz: placement.top + placement.spanZ / 2,
        span: Math.max(placement.spanX, placement.spanZ) * 1.05,
      };
    }
    // Sans render global, on cadre sur ce qui existe : les points, sinon les
    // tuiles déjà uploadées (leur centre), sinon le spawn.
    if (points.length > 0) {
      return computeView(points, { defaultSpan: 2048, padFactor: 1.25, minSpan: 512 });
    }
    if (tiles.length > 0) {
      const centres = tiles.map((t) => {
        const r = tileRect(t.tileX, t.tileZ);
        return { x: r.left + r.size / 2, z: r.top + r.size / 2 };
      });
      return computeView(centres, { defaultSpan: 512, padFactor: 1.6, minSpan: 384 });
    }
    return { cx: 0, cz: 0, span: 1024 };
  };
  const [view, setView] = useState(fitAll);

  // Le render se charge après le premier rendu : recadrer dessus une fois ses
  // dimensions connues (sinon la vue reste calée sur les points).
  const hadImage = useRef(false);
  useEffect(() => {
    if (placement && !hadImage.current) {
      hadImage.current = true;
      setView(fitAll());
    }
  }, [placement]);

  // Les tuiles arrivent elles aussi après le montage (une requête par carte).
  // Sans ce recadrage, une carte SANS entrée géolocalisée resterait plantée
  // sur la vue par défaut alors que ses cartes sont à des milliers de blocs.
  const hadTiles = useRef(tiles.length > 0);
  useEffect(() => {
    if (tiles.length > 0 && !hadTiles.current) {
      hadTiles.current = true;
      if (points.length === 0 && !placement) setView(fitAll());
    }
  }, [tiles.length]);

  const pos = (x, z) => {
    const p = toPct(view, x, z);
    return { left: `${p.left}%`, top: `${p.top}%` };
  };
  const worldAt = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return {
      x: Math.round(view.cx + ((clientX - r.left) / r.width - 0.5) * view.span),
      z: Math.round(view.cz + ((clientY - r.top) / r.height - 0.5) * view.span),
    };
  };

  // Zoom molette centré sur le curseur — listener manuel : React attache
  // wheel en passif, preventDefault y serait ignoré (la page scrollerait).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const w = worldAt(e.clientX, e.clientY);
      setView((v) => zoomAt(v, w, e.deltaY > 0 ? 1.18 : 1 / 1.18));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view]);

  const onDown = (e) => {
    drag.current = { x0: e.clientX, y0: e.clientY, cx: view.cx, cz: view.cz, moved: 0 };
  };
  const onMove = (e) => {
    if (mode === 'tile' && boxRef.current) {
      const w = worldAt(e.clientX, e.clientY);
      const t = worldToTile(w.x, w.z);
      setTileHover((prev) => (prev && prev.tileX === t.tileX && prev.tileZ === t.tileZ ? prev : t));
    }
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
    if (!d || d.moved >= CLICK_SLOP) return;
    const w = worldAt(e.clientX, e.clientY);
    if (mode === 'origin') onSetOrigin(w);
    else if (mode === 'measure') onMeasureClick(w);
    else if (mode === 'add') onAddAt?.(w);
    else if (mode === 'draw') onDrawClick?.(w);
    else if (mode === 'tile') onTileClick?.(worldToTile(w.x, w.z));
  };

  // Un clic sur un marqueur s'accroche à ses coordonnées exactes (origine,
  // mesure, sommet de tracé) — hors mode, il ouvre la fiche.
  const onMarkerClick = (e, p) => {
    e.stopPropagation();
    if (mode === 'origin') onSetOrigin({ x: p.x, z: p.z });
    else if (mode === 'measure') onMeasureClick({ x: p.x, z: p.z });
    else if (mode === 'add') onAddAt?.({ x: p.x, z: p.z });
    else if (mode === 'draw') onDrawClick?.({ x: p.x, z: p.z });
    else onOpenEntry?.(p.id);
  };

  // Tracés : SVG en viewBox 0-100 non uniforme pour pouvoir donner des sommets
  // en « pourcents » à <polyline> (les attributs points n'acceptent pas les %),
  // avec non-scaling-stroke pour garder des traits nets.
  const shapePts = (pts) => pts
    .map(([sx, sz]) => { const p = toPct(view, sx, sz); return `${p.left},${p.top}`; })
    .join(' ');

  // Sous ~4000 blocs de large, la grille suit la trame des cartes (bords de
  // tuiles à i·128−64) : on voit alors exactement les cartes à capturer.
  // Au-delà elle redevient « ronde », sinon l'écran serait noir de traits.
  const tileGrid = view.span <= 4096;
  const step = tileGrid ? TILE_SIZE : niceStep(view.span);
  const viewTiles = tilesInView(view);
  const lines = tileGrid
    ? {
      v: [...new Set(viewTiles.map((t) => tileRect(t.tileX, 0).left))]
        .map((world) => ({ world, pct: toPct(view, world, 0).left, axis: world === -64 })),
      h: [...new Set(viewTiles.map((t) => tileRect(0, t.tileZ).top))]
        .map((world) => ({ world, pct: toPct(view, 0, world).top, axis: world === -64 })),
    }
    : gridLines(view, step);
  const ringById = ring ? new Map(ring.map((r) => [r.id, r])) : null;

  // Tuiles uploadées, indexées pour un rendu O(vue) et non O(toutes les tuiles).
  const tileByKey = new Map(tiles.map((t) => [`${t.tileX},${t.tileZ}`, t]));
  const tileStyle = (tileX, tileZ) => {
    const r = tileRect(tileX, tileZ);
    const p = toPct(view, r.left, r.top);
    return {
      position: 'absolute',
      left: `${p.left}%`,
      top: `${p.top}%`,
      width: `${(r.size / view.span) * 100}%`,
      height: `${(r.size / view.span) * 100}%`,
    };
  };
  const hoverTile = mode === 'tile' ? tileHover : null;

  const imgStyle = () => ({
    position: 'absolute',
    left: `${toPct(view, placement.left, placement.top).left}%`,
    top: `${toPct(view, placement.left, placement.top).top}%`,
    width: `${(placement.spanX / view.span) * 100}%`,
    height: `${(placement.spanZ / view.span) * 100}%`,
    opacity: imgOpacity,
    pointerEvents: 'none',
    userSelect: 'none',
  });

  return (
    <div>
      {/* barre de vue */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <TB onClick={() => setView((v) => zoomAt(v, { x: v.cx, z: v.cz }, 0.75))} title="Zoom avant">＋</TB>
        <TB onClick={() => setView((v) => zoomAt(v, { x: v.cx, z: v.cz }, 1.3333))} title="Zoom arrière">－</TB>
        <TB onClick={() => setView(fitAll())} title={placement ? 'Cadrer sur le render' : 'Cadrer sur les points'}>Recentrer</TB>
        <TB onClick={() => setView(computeView(points, { defaultSpan: 2048, padFactor: 1.25, minSpan: 512 }))} title="Cadrer sur tous les points">Ajuster</TB>
        <Toggle on={showGrid} onClick={() => setShowGrid((v) => !v)} color="#7bd3e8"># Grille</Toggle>
        {map?.imageUrl && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }} title="Opacité du render">
            🖼
            <input type="range" min="0.15" max="1" step="0.05" value={imgOpacity}
              onChange={(e) => setImgOpacity(+e.target.value)} style={{ accentColor: ACC, width: 70 }} />
          </label>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: MUTED }}>
          {mode === 'origin' && '🧭 clique un point (ou le vide) pour poser l\'origine'}
          {mode === 'measure' && '📏 deux clics = une distance'}
          {mode === 'add' && '➕ clique l\'emplacement de la nouvelle entrée'}
          {mode === 'draw' && '✏️ clique les sommets (un marqueur = accroché dessus)'}
          {mode === 'tile' && '🧩 clique une case pour y déposer ta capture de carte'}
        </span>
      </div>

      {/* cadre carte */}
      <div
        ref={boxRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => { drag.current = null; setTileHover(null); }}
        style={{
          position: 'relative', width: '100%', aspectRatio: '4 / 3',
          userSelect: 'none', overflow: 'hidden', borderRadius: 12,
          background: 'radial-gradient(circle at 50% 40%, rgba(14,34,24,0.9), rgba(5,10,8,0.97))',
          border: `1px solid rgba(${ACC_RGB},0.25)`,
          cursor: mode !== 'pan' ? 'crosshair' : (drag.current ? 'grabbing' : 'grab'),
        }}
      >
        {map?.imageUrl && (
          <img
            src={map.imageUrl} alt="" draggable={false}
            onLoad={(e) => setImgDim({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            style={placement ? imgStyle() : { display: 'none' }}
          />
        )}

        {/* cartes uploadées : une image par case de 128×128 blocs */}
        {viewTiles.map((t) => {
          const tile = tileByKey.get(`${t.tileX},${t.tileZ}`);
          if (!tile) return null;
          return (
            <img
              key={`t${t.tileX},${t.tileZ}`} src={tile.url} alt="" draggable={false}
              style={{ ...tileStyle(t.tileX, t.tileZ), opacity: imgOpacity, pointerEvents: 'none', userSelect: 'none' }}
            />
          );
        })}

        {/* mode tuile : cases vides esquissées + case survolée en surbrillance */}
        {mode === 'tile' && viewTiles.map((t) => {
          const filled = tileByKey.has(`${t.tileX},${t.tileZ}`);
          const lit = hoverTile && hoverTile.tileX === t.tileX && hoverTile.tileZ === t.tileZ;
          return (
            <div
              key={`th${t.tileX},${t.tileZ}`}
              style={{
                ...tileStyle(t.tileX, t.tileZ), pointerEvents: 'none',
                border: lit ? `2px solid ${GOLD}` : `1px dashed rgba(${ACC_RGB},${filled ? 0.25 : 0.45})`,
                background: lit ? `rgba(${hexToRgb(GOLD)},0.18)` : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                color: lit ? GOLD : `rgba(${ACC_RGB},0.6)`,
              }}
            >
              {lit ? `${t.tileX} , ${t.tileZ}` : (filled ? '' : '+')}
            </div>
          );
        })}

        {showGrid && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
            {lines.v.map((l) => (
              <line key={`v${l.world}`} x1={`${l.pct}%`} y1="0" x2={`${l.pct}%`} y2="100%"
                stroke={l.axis ? `rgba(${ACC_RGB},0.5)` : `rgba(90,160,120,${placement ? 0.08 : 0.12})`} strokeWidth={l.axis ? 1.2 : 1} />
            ))}
            {lines.h.map((l) => (
              <line key={`h${l.world}`} x1="0" y1={`${l.pct}%`} x2="100%" y2={`${l.pct}%`}
                stroke={l.axis ? `rgba(${ACC_RGB},0.5)` : `rgba(90,160,120,${placement ? 0.08 : 0.12})`} strokeWidth={l.axis ? 1.2 : 1} />
            ))}
          </svg>
        )}

        {/* tracés d'enquête (lignes / polygones) + brouillon en cours */}
        {(shapes.length > 0 || draft) && (
          <svg
            width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden
          >
            {shapes.map((s) => (s.points.length >= 2 ? (
              s.closed ? (
                <polygon key={s.id} points={shapePts(s.points)} fill={`rgba(${hexToRgb(s.color)},0.09)`}
                  stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              ) : (
                <polyline key={s.id} points={shapePts(s.points)} fill="none"
                  stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
              )
            ) : null))}
            {draft && draft.points.length >= 2 && (
              <polyline points={shapePts(draft.points)} fill="none" stroke={draft.color}
                strokeWidth="1.6" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        )}
        {/* étiquettes et sommets des tracés (hors SVG : le viewBox non uniforme déformerait le texte) */}
        {shapes.map((s) => (s.name && s.points.length >= 2 ? (
          <span key={`lb${s.id}`} style={{
            position: 'absolute', ...pos(s.points[0][0], s.points[0][1]),
            transform: 'translate(6px, -110%)', pointerEvents: 'none',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10, whiteSpace: 'nowrap',
            color: s.color, background: 'rgba(6,12,9,0.82)',
            border: `1px solid rgba(${hexToRgb(s.color)},0.5)`, borderRadius: 5, padding: '0 5px',
          }}>✏ {s.name}</span>
        ) : null))}
        {draft?.points.map(([dx2, dz2], i) => (
          <span key={`dv${i}`} style={{
            position: 'absolute', ...pos(dx2, dz2), transform: 'translate(-50%,-50%)',
            width: 8, height: 8, borderRadius: '50%', background: draft.color,
            boxShadow: '0 0 6px rgba(0,0,0,0.7)', pointerEvents: 'none',
          }} />
        ))}

        {/* rose des vents à 8 axes depuis l'origine */}
        {origin && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
            {ROSE_AXES.map(([deg, label]) => {
              const dir = bearingDirection(deg);
              const o = toPct(view, origin.x, origin.z);
              const e2 = toPct(view, origin.x + dir.dx * view.span * 1.6, origin.z + dir.dz * view.span * 1.6);
              const lp = toPct(view, origin.x + dir.dx * view.span * 0.44, origin.z + dir.dz * view.span * 0.44);
              const cardinal = deg % 90 === 0;
              return (
                <g key={deg}>
                  <line x1={`${o.left}%`} y1={`${o.top}%`} x2={`${e2.left}%`} y2={`${e2.top}%`}
                    stroke={cardinal ? `rgba(${hexToRgb(GOLD)},0.55)` : `rgba(${hexToRgb(GOLD)},0.28)`}
                    strokeWidth={cardinal ? 1.4 : 1} strokeDasharray={cardinal ? '' : '5 5'} />
                  <text x={`${lp.left}%`} y={`${lp.top}%`} fill={GOLD} fontSize="11"
                    fontFamily="'JetBrains Mono',monospace" textAnchor="middle" opacity="0.85">{label}</text>
                </g>
              );
            })}
          </svg>
        )}

        {/* trait de mesure */}
        {measure?.a && (
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
            {(() => {
              const a = toPct(view, measure.a.x, measure.a.z);
              const b = measure.b ? toPct(view, measure.b.x, measure.b.z) : null;
              const mid = b ? { left: (a.left + b.left) / 2, top: (a.top + b.top) / 2 } : null;
              return (
                <g>
                  <circle cx={`${a.left}%`} cy={`${a.top}%`} r="4" fill="#7bd3e8" />
                  {b && (
                    <>
                      <line x1={`${a.left}%`} y1={`${a.top}%`} x2={`${b.left}%`} y2={`${b.top}%`}
                        stroke="#7bd3e8" strokeWidth="1.6" strokeDasharray="7 4" />
                      <circle cx={`${b.left}%`} cy={`${b.top}%`} r="4" fill="#7bd3e8" />
                      <text x={`${mid.left}%`} y={`${mid.top - 1.5}%`} fill="#7bd3e8" fontSize="12.5" fontWeight="700"
                        fontFamily="'JetBrains Mono',monospace" textAnchor="middle"
                        style={{ paintOrder: 'stroke', stroke: 'rgba(5,10,8,0.9)', strokeWidth: 4 }}>
                        {Math.round(measureDistance(measure.a, measure.b))} blocs
                      </text>
                    </>
                  )}
                </g>
              );
            })()}
          </svg>
        )}

        {/* origine : réticule */}
        {origin && (
          <div style={{ position: 'absolute', ...pos(origin.x, origin.z), transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
            <div style={{
              width: 17, height: 17, borderRadius: '50%', border: `2.5px solid ${GOLD}`,
              boxShadow: `0 0 14px rgba(${hexToRgb(GOLD)},0.9)`,
            }} />
          </div>
        )}

        {/* entrées */}
        {points.map((p) => {
          const info = ringById?.get(p.id);
          const lit = hover === p.id;
          return (
            <Marker
              key={p.id} p={p} pos={pos(p.x, p.z)} lit={lit}
              ringInfo={origin ? info : null} tolerance={tolerance}
              onEnter={() => setHover(p.id)} onLeave={() => setHover(null)}
              onClick={(e) => onMarkerClick(e, p)}
            />
          );
        })}

        {points.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13, textAlign: 'center', padding: 24, pointerEvents: 'none',
          }}>
            Aucune entrée géolocalisée dans cette dimension (ou tous les types sont filtrés).
          </div>
        )}
      </div>

      <p style={{ textAlign: 'center', marginTop: 8, color: MUTED, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
        centre X {Math.round(view.cx)} / Z {Math.round(view.cz)} · grille {step} blocs · glisse pour te déplacer, molette pour zoomer
      </p>
    </div>
  );
}

function Marker({ p, pos, lit, ringInfo, onEnter, onLeave, onClick }) {
  const t = ENTRY_TYPES[p.entryType] || ENTRY_TYPES.observation;
  const shape = SHAPES[p.entryType] || 'circle';
  const aligned = !!ringInfo?.aligned;
  // En mode origine, les points alignés sur un axe ressortent, les autres
  // s'estompent — c'est tout l'intérêt de la rose.
  const dimmed = ringInfo !== null && ringInfo !== undefined && !aligned;
  const size = lit ? 15 : (aligned ? 14 : 11);
  const base = {
    width: size, height: size, background: lit || aligned ? t.color : 'rgba(8,14,10,0.92)',
    border: `2px solid ${t.color}`, boxSizing: 'border-box',
    boxShadow: aligned
      ? `0 0 13px rgba(${hexToRgb(GOLD)},0.95)`
      : (lit ? `0 0 12px rgba(${hexToRgb(t.color)},0.9)` : '0 0 5px rgba(0,0,0,0.6)'),
    transition: 'all 0.12s',
  };
  if (shape === 'diamond') base.transform = 'rotate(45deg)';
  else if (shape === 'circle') base.borderRadius = '50%';
  else if (shape === 'triangle') {
    base.clipPath = 'polygon(50% 0%, 100% 100%, 0% 100%)';
    base.background = t.color; base.border = 'none';
  } else if (shape === 'hexagon') {
    base.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
    base.background = t.color; base.border = 'none';
  } else base.borderRadius = 2;

  const sub = `X ${p.x}${p.y != null ? ` Y ${p.y}` : ''} Z ${p.z}`
    + (ringInfo ? ` · ${Math.round(ringInfo.distance)} blocs, cap ${Math.round(ringInfo.bearingDeg)}° ${ringInfo.cardinal8}` : '');

  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      title={`${p.title} — ${sub}`}
      style={{
        position: 'absolute', ...pos, transform: 'translate(-50%,-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', cursor: 'pointer', padding: 3,
        zIndex: lit ? 7 : (aligned ? 5 : 2), opacity: dimmed ? 0.38 : 1,
      }}
    >
      <span style={base} />
      {lit && p.thumbUrl && (
        <img
          src={p.thumbUrl} alt=""
          style={{
            height: 64, maxWidth: 110, objectFit: 'cover', borderRadius: 6, display: 'block',
            border: `1px solid rgba(${hexToRgb(t.color)},0.55)`, boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
          }}
        />
      )}
      {(lit || aligned) && (
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, whiteSpace: 'nowrap',
          color: aligned && !lit ? GOLD : t.color, background: 'rgba(6,12,9,0.88)',
          border: `1px solid rgba(${hexToRgb(aligned && !lit ? GOLD : t.color)},0.55)`,
          borderRadius: 5, padding: '0 5px',
        }}>
          {t.icon} {lit ? p.title : `${ringInfo.cardinal8} · ${Math.round(ringInfo.distance)}`}
          {lit && ringInfo ? ` — ${ringInfo.cardinal8} ${Math.round(ringInfo.bearingDeg)}° · ${Math.round(ringInfo.distance)} blocs` : ''}
        </span>
      )}
    </button>
  );
}

function TB({ children, onClick, title }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
      fontSize: 13, fontWeight: 700, background: 'rgba(9,20,14,0.7)', color: INK,
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
      border: `1px solid ${on ? color : 'rgba(60,110,80,0.3)'}`, opacity: on ? 1 : 0.6,
    }}>{children}</button>
  );
}

export { SHAPES };

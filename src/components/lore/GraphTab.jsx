import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  ACC, ENTRY_TYPES, INK, MUTED, RELATIONS, STANCES, STATUSES, hexToRgb,
} from './theme';

// Vue réseau : entrées reliées (lore_links, traits pleins) et hypothèses avec
// leurs preuves (lore_evidence, pointillés colorés par position). Simulation
// de forces maison (~60 lignes) — même choix que ChainGraph côté quêtes :
// pas de d3-force pour une soixantaine de nœuds.

export function GraphTab({ onOpenEntry, onOpenHypothesis, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [showIsolated, setShowIsolated] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.lore.graph()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (!data) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err || 'Chargement…'}</p>;
  }

  const connected = new Set();
  for (const e of data.edges) {
    if (e.kind === 'link') { connected.add(`e${e.fromEntryId}`); connected.add(`e${e.toEntryId}`); }
    else { connected.add(`h${e.hypothesisId}`); connected.add(`e${e.entryId}`); }
  }
  const nodes = data.nodes
    .map((n) => ({ ...n, key: `${n.kind === 'entry' ? 'e' : 'h'}${n.id}` }))
    .filter((n) => showIsolated || connected.has(n.key));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10, fontFamily: "'Inter',sans-serif" }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: MUTED, cursor: 'pointer' }}>
          <input type="checkbox" checked={showIsolated} onChange={(e) => setShowIsolated(e.target.checked)}
            style={{ accentColor: ACC, width: 14, height: 14 }} />
          Afficher aussi les nœuds isolés ({data.nodes.length - connected.size})
        </label>
        <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: MUTED }}>
          ─ relation · ┄ preuve · glisse un nœud pour l'écarter
        </span>
      </div>
      <ForceGraph
        key={`${showIsolated}-${refreshKey}`}
        nodes={nodes} edges={data.edges}
        onOpenEntry={onOpenEntry} onOpenHypothesis={onOpenHypothesis}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontFamily: "'Inter',sans-serif", fontSize: 11.5 }}>
        <span style={{ color: MUTED }}>Entrées :</span>
        {Object.entries(ENTRY_TYPES).map(([k, t]) => (
          <span key={k} style={{ color: t.color }}>● {t.label}</span>
        ))}
        <span style={{ color: MUTED, marginLeft: 8 }}>Hypothèses :</span>
        {Object.entries(STATUSES).map(([k, s2]) => (
          <span key={k} style={{ color: s2.color }}>■ {s2.label}</span>
        ))}
      </div>
    </div>
  );
}

const W = 1000;
const H = 620;

function ForceGraph({ nodes, edges, onOpenEntry, onOpenHypothesis }) {
  // Positions/vitesses vivent dans une ref (mutées à chaque tick) ; un
  // compteur d'état déclenche le re-rendu. Init en cercle déterministe.
  const sim = useRef(null);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState(null);
  const dragging = useRef(null);
  const svgRef = useRef(null);

  const index = useMemo(() => new Map(nodes.map((n, i) => [n.key, i])), [nodes]);
  const springs = useMemo(() => edges
    .map((e) => (e.kind === 'link'
      ? { a: index.get(`e${e.fromEntryId}`), b: index.get(`e${e.toEntryId}`), e }
      : { a: index.get(`h${e.hypothesisId}`), b: index.get(`e${e.entryId}`), e }))
    .filter((s) => s.a !== undefined && s.b !== undefined), [edges, index]);

  if (sim.current === null || sim.current.n !== nodes.length) {
    const R = Math.min(W, H) * 0.38;
    sim.current = {
      n: nodes.length,
      x: nodes.map((_, i) => W / 2 + R * Math.cos((i / Math.max(1, nodes.length)) * 2 * Math.PI)),
      y: nodes.map((_, i) => H / 2 + R * Math.sin((i / Math.max(1, nodes.length)) * 2 * Math.PI)),
      vx: nodes.map(() => 0),
      vy: nodes.map(() => 0),
      alpha: 1,
    };
  }

  useEffect(() => {
    let raf;
    const step = () => {
      const s = sim.current;
      if (s.alpha > 0.012) {
        // Répulsion de Coulomb (O(n²), n ≤ ~60), ressorts sur les arêtes,
        // gravité douce vers le centre, amortissement + refroidissement.
        for (let i = 0; i < s.n; i += 1) {
          for (let j = i + 1; j < s.n; j += 1) {
            let dx = s.x[j] - s.x[i];
            let dy = s.y[j] - s.y[i];
            const d2 = Math.max(80, dx * dx + dy * dy);
            const f = (5200 * s.alpha) / d2;
            const d = Math.sqrt(d2);
            dx /= d; dy /= d;
            s.vx[i] -= dx * f; s.vy[i] -= dy * f;
            s.vx[j] += dx * f; s.vy[j] += dy * f;
          }
        }
        for (const sp of springs) {
          const dx = s.x[sp.b] - s.x[sp.a];
          const dy = s.y[sp.b] - s.y[sp.a];
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = ((d - 110) / d) * 0.02 * s.alpha * 6;
          s.vx[sp.a] += dx * f; s.vy[sp.a] += dy * f;
          s.vx[sp.b] -= dx * f; s.vy[sp.b] -= dy * f;
        }
        for (let i = 0; i < s.n; i += 1) {
          if (dragging.current?.i === i) continue; // le nœud tenu ne bouge que sous la souris
          s.vx[i] += (W / 2 - s.x[i]) * 0.0012 * s.alpha * 6;
          s.vy[i] += (H / 2 - s.y[i]) * 0.0012 * s.alpha * 6;
          s.vx[i] *= 0.82; s.vy[i] *= 0.82;
          s.x[i] = Math.max(30, Math.min(W - 30, s.x[i] + s.vx[i]));
          s.y[i] = Math.max(24, Math.min(H - 24, s.y[i] + s.vy[i]));
        }
        s.alpha *= 0.985;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [springs]);

  const toSvg = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };
  const onMove = (e) => {
    const d = dragging.current;
    if (!d) return;
    const p = toSvg(e.clientX, e.clientY);
    sim.current.x[d.i] = Math.max(30, Math.min(W - 30, p.x));
    sim.current.y[d.i] = Math.max(24, Math.min(H - 24, p.y));
    sim.current.alpha = Math.max(sim.current.alpha, 0.3); // réveille la simulation
    d.moved = true;
    setTick((t) => t + 1);
  };
  const endDrag = (n) => {
    const d = dragging.current;
    dragging.current = null;
    if (d && !d.moved && n) {
      if (n.kind === 'entry') onOpenEntry?.(n.id);
      else onOpenHypothesis?.(n.id);
    }
  };

  const s = sim.current;
  const neighbor = new Set();
  if (hover) {
    for (const sp of springs) {
      const ka = nodes[sp.a].key;
      const kb = nodes[sp.b].key;
      if (ka === hover || kb === hover) { neighbor.add(ka); neighbor.add(kb); }
    }
  }

  return (
    <svg
      ref={svgRef} viewBox={`0 0 ${W} ${H}`}
      onMouseMove={onMove}
      onMouseUp={() => endDrag(null)}
      onMouseLeave={() => { dragging.current = null; }}
      style={{
        width: '100%', aspectRatio: `${W} / ${H}`, display: 'block', borderRadius: 12,
        background: 'radial-gradient(circle at 50% 40%, rgba(14,34,24,0.9), rgba(5,10,8,0.97))',
        border: '1px solid rgba(123,227,168,0.25)', userSelect: 'none',
      }}
    >
      {springs.map((sp, i) => {
        const isEvidence = sp.e.kind === 'evidence';
        const stance = isEvidence ? (STANCES[sp.e.stance] || STANCES.neutral) : null;
        const color = isEvidence ? stance.color : 'rgba(150,200,170,0.55)';
        const lit = hover && (nodes[sp.a].key === hover || nodes[sp.b].key === hover);
        return (
          <line
            key={i}
            x1={s.x[sp.a]} y1={s.y[sp.a]} x2={s.x[sp.b]} y2={s.y[sp.b]}
            stroke={color} strokeWidth={lit ? 2.2 : 1.3}
            strokeDasharray={isEvidence ? '5 4' : ''}
            opacity={hover && !lit ? 0.18 : (isEvidence ? 0.75 : 0.6)}
          >
            <title>
              {isEvidence
                ? `${stance.icon} ${stance.label}`
                : (RELATIONS[sp.e.relationType]?.label || sp.e.relationType)}
            </title>
          </line>
        );
      })}
      {nodes.map((n, i) => {
        const isEntry = n.kind === 'entry';
        const meta = isEntry
          ? (ENTRY_TYPES[n.entryType] || ENTRY_TYPES.observation)
          : (STATUSES[n.status] || STATUSES.open);
        const lit = hover === n.key;
        const dim = hover && !lit && !neighbor.has(n.key);
        const r = isEntry ? (lit ? 9 : 7) : (lit ? 12 : 10);
        return (
          <g
            key={n.key}
            transform={`translate(${s.x[i]},${s.y[i]})`}
            opacity={dim ? 0.22 : 1}
            onMouseEnter={() => setHover(n.key)}
            onMouseLeave={() => setHover(null)}
            onMouseDown={(e) => { e.preventDefault(); dragging.current = { i, moved: false }; }}
            onMouseUp={(e) => { e.stopPropagation(); endDrag(n); }}
            style={{ cursor: 'pointer' }}
          >
            {isEntry ? (
              <circle r={r} fill={lit ? meta.color : 'rgba(8,14,10,0.9)'} stroke={meta.color} strokeWidth="2" />
            ) : (
              <rect x={-r} y={-r} width={r * 2} height={r * 2} rx="3"
                fill={lit ? meta.color : 'rgba(8,14,10,0.9)'} stroke={meta.color} strokeWidth="2" />
            )}
            <text
              y={r + 13} textAnchor="middle"
              fill={lit ? INK : `rgba(${hexToRgb(meta.color)},0.9)`}
              fontSize={lit ? 12 : 10.5} fontFamily="'Inter',sans-serif" fontWeight={lit ? 700 : 500}
              style={{ paintOrder: 'stroke', stroke: 'rgba(5,10,8,0.85)', strokeWidth: 3 }}
            >
              {n.title.length > 26 && !lit ? `${n.title.slice(0, 25)}…` : n.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

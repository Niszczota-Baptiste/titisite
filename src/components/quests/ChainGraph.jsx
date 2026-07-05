import { useMemo } from 'react';
import { ACC, ACC_RGB, INK, MUTED, OCCURRENCES, panel } from './theme';

// Layered layout of a chain's unlock graph. Linear chains render as a single
// row; branches ("plusieurs chaînes depuis un même point") fan out into extra
// rows. Longest-path depth = column; nodes sharing a depth stack vertically.

const COL_W = 200;
const ROW_H = 86;
const NODE_W = 168;
const NODE_H = 58;
const PAD = 24;

function layout(nodes, edges) {
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  // Relax edges |nodes| times → longest path depth (cycle-safe: bounded).
  for (let i = 0; i < nodes.length; i += 1) {
    let changed = false;
    for (const e of edges) {
      if (!depth.has(e.from) || !depth.has(e.to)) continue;
      const d = depth.get(e.from) + 1;
      if (d > depth.get(e.to)) { depth.set(e.to, d); changed = true; }
    }
    if (!changed) break;
  }
  const byDepth = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id) || 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  }
  const pos = new Map();
  let maxRow = 0;
  for (const [d, group] of byDepth) {
    group.sort((a, b) => (a.chainRank || 0) - (b.chainRank || 0) || a.id - b.id);
    group.forEach((n, row) => {
      pos.set(n.id, { x: PAD + d * COL_W, y: PAD + row * ROW_H, d, row });
      maxRow = Math.max(maxRow, row);
    });
  }
  const width = PAD * 2 + (Math.max(0, byDepth.size - 1)) * COL_W + NODE_W;
  const height = PAD * 2 + maxRow * ROW_H + NODE_H;
  return { pos, width, height };
}

export function ChainGraph({ graph, done = {}, onOpen }) {
  const { pos, width, height } = useMemo(() => layout(graph.nodes, graph.edges), [graph]);
  if (graph.nodes.length === 0) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Cette chaîne n'a pas encore de quête.</p>;
  }

  return (
    <div style={{ ...panel, padding: 12, overflow: 'auto' }}>
      <div style={{ position: 'relative', width, height, minWidth: '100%' }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
          <defs>
            <marker id="qarrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={`rgba(${ACC_RGB},0.6)`} />
            </marker>
          </defs>
          {graph.edges.map((e, i) => {
            const a = pos.get(e.from); const b = pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2;
            const x2 = b.x; const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none" stroke={`rgba(${ACC_RGB},0.45)`} strokeWidth="2" markerEnd="url(#qarrow)"
              />
            );
          })}
        </svg>

        {graph.nodes.map((n) => {
          const p = pos.get(n.id);
          const occ = OCCURRENCES[n.occurrenceType] || OCCURRENCES.simple;
          const isDone = !!done[n.id];
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onOpen?.(n.id)}
              title={n.titre}
              style={{
                position: 'absolute', left: p.x, top: p.y, width: NODE_W, height: NODE_H,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                padding: '6px 10px', textAlign: 'left', cursor: 'pointer',
                background: isDone ? 'rgba(123,227,168,0.12)' : 'rgba(20,14,38,0.92)',
                border: `2px solid ${isDone ? 'rgba(123,227,168,0.55)' : occ.color}`,
                opacity: n.external ? 0.72 : 1,
                borderRadius: 10, color: INK,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: isDone ? '#7be3a8' : occ.color, fontFamily: "'JetBrains Mono',monospace" }}>
                {occ.icon} {occ.short}{n.chainRank ? ` · ${n.chainRank}` : ''}{isDone ? ' · ✓' : ''}
              </span>
              <span style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, lineHeight: 1.15,
                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>{n.titre}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

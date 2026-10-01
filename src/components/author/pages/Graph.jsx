import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthor } from '../context';
import { CHARACTER_RELATIONS, KINDS, KIND_ORDER, RELATIONS, kindMeta } from '../kinds';
import { useShellPage } from '../Shell';
import { Btn, ErrorLine, KindAvatar, cx, entityPath, normalizeQuery } from '../ui';

// Graphe des relations : tous les éléments reliés, disposés par une simulation
// de forces maison (pas de d3 pour quelques centaines de nœuds). Glisser le
// fond = déplacer la vue, molette / pincement = zoom, glisser un nœud = le
// placer. Un clic sélectionne et montre ses liens ; ?focus=<id> isole un
// élément et son voisinage. Les positions sont mémorisées sur l'appareil.

const DEFAULT_KINDS = ['character', 'place', 'lore', 'event', 'chapter'];

export function Graph() {
  const { pid, P, version } = useAuthor();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kinds, setKinds] = useState(DEFAULT_KINDS);
  const [relFilter, setRelFilter] = useState('all'); // all | characters
  const [showIsolated, setShowIsolated] = useState(false);
  const [q, setQ] = useState('');
  const [depth, setDepth] = useState(2);
  const focusId = Number(params.get('focus')) || null;
  useShellPage({ crumbs: [{ label: 'Graphe des relations' }], title: 'Graphe', full: true });

  useEffect(() => {
    P.graph({ kinds: KIND_ORDER.join(',') }).then(setData).catch(setError);
  }, [P, version]);

  const view = useMemo(() => {
    if (!data) return null;
    let edges = data.edges;
    if (relFilter === 'characters') edges = edges.filter((e) => CHARACTER_RELATIONS.includes(e.kind));
    const kindSet = new Set(relFilter === 'characters' ? ['character'] : kinds);
    let nodes = data.nodes.filter((n) => kindSet.has(n.kind));
    const ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    if (focusId && ids.has(focusId)) {
      const keep = new Set([focusId]);
      let frontier = [focusId];
      for (let d = 0; d < depth; d += 1) {
        const next = [];
        for (const e of edges) {
          for (const f of frontier) {
            if (e.from === f && !keep.has(e.to)) { keep.add(e.to); next.push(e.to); }
            if (e.to === f && !keep.has(e.from)) { keep.add(e.from); next.push(e.from); }
          }
        }
        frontier = next;
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
    } else if (!showIsolated) {
      const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
      nodes = nodes.filter((n) => linked.has(n.id));
    }
    return { nodes, edges };
  }, [data, kinds, relFilter, showIsolated, focusId, depth]);

  const toggleKind = (k) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const setFocus = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('focus', id); else next.delete('focus');
    setParams(next, { replace: true });
  };

  return (
    <div className="au-graph-page">
      <div className="au-graph-bar">
        <div className="au-chips-row" style={{ margin: 0 }}>
          <button type="button" className={cx('au-chip', relFilter === 'characters' && 'is-sel')} onClick={() => setRelFilter((r) => (r === 'characters' ? 'all' : 'characters'))}>👥 Réseau des personnages</button>
          {relFilter === 'all' && KIND_ORDER.map((k) => (
            <button key={k} type="button" className={cx('au-chip', kinds.includes(k) && 'is-sel')} style={{ '--chip': KINDS[k].color }} onClick={() => toggleKind(k)}>
              <span className="au-dot" style={{ '--dot': KINDS[k].color }} /> {KINDS[k].plural}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="au-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Trouver un nœud…" style={{ width: 180 }} aria-label="Trouver un nœud" />
          {focusId ? (
            <>
              <select className="au-select" style={{ width: 'auto' }} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Profondeur">
                <option value={1}>Voisins directs</option><option value={2}>2 niveaux</option><option value={3}>3 niveaux</option>
              </select>
              <Btn size="small" onClick={() => setFocus(null)}>Tout le graphe</Btn>
            </>
          ) : (
            <label className="au-check-row" style={{ margin: 0 }}><input type="checkbox" className="au-check" checked={showIsolated} onChange={(e) => setShowIsolated(e.target.checked)} /> Isolés</label>
          )}
        </div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {view && (view.nodes.length === 0
        ? <div className="au-page is-narrow"><div className="au-empty"><div className="au-empty-ico">🕸️</div><strong>Rien à afficher</strong><div style={{ fontSize: 13 }}>Relie des éléments depuis leurs fiches (bouton « ＋ Relier ») pour faire apparaître le réseau.</div></div></div>
        : <ForceGraph key={`${relFilter}-${focusId}-${depth}`} pid={pid} nodes={view.nodes} edges={view.edges} query={q} focusId={focusId} onFocus={setFocus} />)}
    </div>
  );
}

function ForceGraph({ pid, nodes, edges, query, focusId, onFocus }) {
  const svgRef = useRef(null);
  const sim = useRef(null);
  const [, setTick] = useState(0);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState(focusId);
  const [hover, setHover] = useState(null);
  const gesture = useRef(null);
  const pointers = useRef(new Map());
  const storeKey = `au-graph-pos:${pid}`;

  const degree = useMemo(() => {
    const d = new Map();
    for (const e of edges) { d.set(e.from, (d.get(e.from) || 0) + 1); d.set(e.to, (d.get(e.to) || 0) + 1); }
    return d;
  }, [edges]);

  // Initialisation : positions mémorisées, sinon spirale déterministe.
  if (!sim.current) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { /* ignore */ }
    const pos = new Map();
    nodes.forEach((n, i) => {
      const s = saved[n.id];
      const a = i * 2.39996;
      const r = 30 * Math.sqrt(i + 1);
      pos.set(n.id, { x: s ? s[0] : Math.cos(a) * r, y: s ? s[1] : Math.sin(a) * r, vx: 0, vy: 0, fixed: false });
    });
    sim.current = { pos, alpha: Object.keys(saved).length >= nodes.length * 0.8 ? 0.25 : 1, raf: 0 };
  }

  const step = useCallback(() => {
    const s = sim.current;
    const list = nodes.map((n) => [n.id, s.pos.get(n.id)]);
    const k = s.alpha;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i][1];
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j][1];
        let dx = a.x - b.x; let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        if (d2 > 250000) continue;
        const f = (2400 / d2) * k;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      const a = s.pos.get(e.from); const b = s.pos.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 120) * 0.04 * k;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const [, p] of list) {
      if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
      p.vx += -p.x * 0.004 * k; p.vy += -p.y * 0.004 * k;
      p.vx *= 0.6; p.vy *= 0.6;
      p.x += Math.max(-40, Math.min(40, p.vx));
      p.y += Math.max(-40, Math.min(40, p.vy));
    }
    s.alpha *= 0.985;
  }, [nodes, edges]);

  const persist = useCallback(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
      for (const [id, p] of sim.current.pos) saved[id] = [Math.round(p.x), Math.round(p.y)];
      localStorage.setItem(storeKey, JSON.stringify(saved));
    } catch { /* quota */ }
  }, [storeKey]);

  const run = useCallback(() => {
    const s = sim.current;
    cancelAnimationFrame(s.raf);
    const loop = () => {
      // Plusieurs pas par image tant que le système est chaud.
      const n = s.alpha > 0.4 ? 3 : 1;
      for (let i = 0; i < n; i += 1) step();
      setTick((t) => t + 1);
      if (s.alpha > 0.02) s.raf = requestAnimationFrame(loop);
      else persist();
    };
    s.raf = requestAnimationFrame(loop);
  }, [step, persist]);

  // Cadrage initial : centre la vue sur le nuage (ou sur le nœud mis en avant).
  const frame = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const pts = [...sim.current.pos.values()];
    if (!pts.length) return;
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 80; const maxX = Math.max(...xs) + 80;
    const minY = Math.min(...ys) - 60; const maxY = Math.max(...ys) + 60;
    const k = Math.max(0.15, Math.min(1.6, Math.min(width / (maxX - minX), height / (maxY - minY))));
    setCam({ k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k });
  }, []);

  useEffect(() => {
    // Pré-calcul hors écran pour éviter l'explosion initiale.
    if (sim.current.alpha === 1) for (let i = 0; i < 120; i += 1) step();
    frame();
    run();
    const s = sim.current;
    return () => { cancelAnimationFrame(s.raf); persist(); };
  }, []); // eslint-disable-line

  const toWorld = (cx, cy) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (cx - r.left - cam.x) / cam.k, y: (cy - r.top - cam.y) / cam.k };
  };

  // Molette : zoom centré sur le curseur. Écouteur natif non passif (pour
  // bloquer le défilement de la page), enregistré une fois — la caméra est lue
  // dans une ref.
  const camRef = useRef(cam);
  camRef.current = cam;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const c = camRef.current;
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left; const my = e.clientY - r.top;
      const k = Math.max(0.1, Math.min(4, c.k * Math.exp(-e.deltaY * 0.0015)));
      setCam({ k, x: mx - ((mx - c.x) / c.k) * k, y: my - ((my - c.y) / c.k) * k });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e, nodeId = null) => {
    e.stopPropagation();
    svgRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), cam: { ...cam }, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (nodeId) {
      const p = sim.current.pos.get(nodeId);
      p.fixed = true;
      gesture.current = { type: 'node', id: nodeId, moved: false, sx: e.clientX, sy: e.clientY };
    } else {
      gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: { ...cam }, moved: false };
    }
  };
  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svgRef.current.getBoundingClientRect();
      const mx = g.mid.x - r.left; const my = g.mid.y - r.top;
      const k = Math.max(0.1, Math.min(4, g.cam.k * (dist / g.dist)));
      setCam({ k, x: mx - ((mx - g.cam.x) / g.cam.k) * k, y: my - ((my - g.cam.y) / g.cam.k) * k });
    } else if (g.type === 'pan') {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 3) g.moved = true;
      setCam({ ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy });
    } else if (g.type === 'node') {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 4) g.moved = true;
      if (!g.moved) return;
      const w = toWorld(e.clientX, e.clientY);
      const p = sim.current.pos.get(g.id);
      p.x = w.x; p.y = w.y;
      sim.current.alpha = Math.max(sim.current.alpha, 0.15);
      run();
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.type === 'node') {
      const p = sim.current.pos.get(g.id);
      p.fixed = false;
      if (!g.moved) setSelected((s) => (s === g.id ? null : g.id));
      persist();
    } else if (g?.type === 'pan' && !g.moved) {
      setSelected(null);
    }
    gesture.current = pointers.current.size ? gesture.current : null;
  };

  const nq = normalizeQuery(query);
  const matches = nq ? new Set(nodes.filter((n) => normalizeQuery(n.title).includes(nq)).map((n) => n.id)) : null;
  const active = selected ?? hover;
  const neighbors = useMemo(() => {
    if (!active) return null;
    const s = new Set([active]);
    for (const e of edges) { if (e.from === active) s.add(e.to); if (e.to === active) s.add(e.from); }
    return s;
  }, [active, edges]);

  const sel = nodes.find((n) => n.id === selected);
  const selLinks = sel ? edges.filter((e) => e.from === sel.id || e.to === sel.id) : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos = sim.current.pos;
  const showLabels = cam.k > 0.55;

  return (
    <div className="au-graph-wrap">
      <svg ref={svgRef} className="au-graph" onPointerDown={(e) => onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        role="img" aria-label={`Graphe : ${nodes.length} éléments, ${edges.length} relations`}>
        <defs>
          <marker id="au-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--au-faint)" />
          </marker>
        </defs>
        <g transform={`translate(${cam.x},${cam.y}) scale(${cam.k})`}>
          {edges.map((e) => {
            const a = pos.get(e.from); const b = pos.get(e.to);
            if (!a || !b) return null;
            const lit = neighbors && neighbors.has(e.from) && neighbors.has(e.to) && (e.from === active || e.to === active);
            const dim = neighbors && !lit;
            const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1;
            const rb = 8 + Math.sqrt(degree.get(e.to) || 0) * 3 + 3;
            const ex = b.x - (dx / d) * rb; const ey = b.y - (dy / d) * rb;
            return (
              <g key={e.id} opacity={dim ? 0.12 : 1}>
                <line x1={a.x} y1={a.y} x2={ex} y2={ey} stroke={lit ? kindMeta(byId.get(e.from)?.kind).color : 'var(--au-border-strong)'}
                  strokeWidth={lit ? 2 / Math.max(cam.k, 0.6) : 1.2 / Math.max(cam.k, 0.6)} markerEnd={e.symmetric ? undefined : 'url(#au-arrow)'} />
                {lit && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="au-graph-elabel" fontSize={11 / Math.max(cam.k, 0.7)}>{e.label}</text>}
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id);
            const r = 8 + Math.sqrt(degree.get(n.id) || 0) * 3;
            const color = n.color || kindMeta(n.kind).color;
            const dim = (neighbors && !neighbors.has(n.id)) || (matches && !matches.has(n.id));
            const strong = n.id === selected || (matches && matches.has(n.id)) || n.id === focusId;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.18 : 1} className="au-graph-node"
                onPointerDown={(e) => onPointerDown(e, n.id)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                onDoubleClick={() => onFocus(n.id)}>
                <circle r={r + (strong ? 4 : 0)} fill={`color-mix(in srgb, ${color} 28%, var(--au-bg))`} stroke={color} strokeWidth={strong ? 3 : 1.6} />
                <text textAnchor="middle" dy="0.36em" fontSize={r * 0.95} style={{ pointerEvents: 'none' }}>{n.icon || kindMeta(n.kind).icon}</text>
                {(showLabels || strong || n.id === hover || (degree.get(n.id) || 0) > 4) && (
                  <text y={r + 13} textAnchor="middle" className="au-graph-label" fontSize={12 / Math.max(cam.k, 0.75)}>{n.number ? `${n.number}. ` : ''}{n.title}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="au-graph-controls">
        <Btn size="small" icon onClick={() => setCam((c) => ({ ...c, k: Math.min(4, c.k * 1.25) }))} aria-label="Zoomer">＋</Btn>
        <Btn size="small" icon onClick={() => setCam((c) => ({ ...c, k: Math.max(0.1, c.k / 1.25) }))} aria-label="Dézoomer">－</Btn>
        <Btn size="small" icon onClick={frame} aria-label="Recadrer" title="Recadrer">⤢</Btn>
        <Btn size="small" icon title="Relancer la disposition" aria-label="Relancer la disposition" onClick={() => { sim.current.alpha = 0.8; run(); }}>↻</Btn>
      </div>
      <div className="au-graph-legend au-desktop-only">
        {KIND_ORDER.filter((k) => nodes.some((n) => n.kind === k)).map((k) => <span key={k}><span className="au-dot" style={{ '--dot': KINDS[k].color }} /> {KINDS[k].plural}</span>)}
        <span className="au-faint">{nodes.length} nœuds · {edges.length} liens · double-clic = isoler</span>
      </div>
      {sel && (
        <aside className="au-graph-panel">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <KindAvatar entity={sel} />
            <div style={{ minWidth: 0 }}>
              <div className="au-row-title">{sel.title}</div>
              <div className="au-row-meta">{kindMeta(sel.kind).label} · {selLinks.length} lien{selLinks.length > 1 ? 's' : ''}</div>
            </div>
            <button type="button" className="au-btn is-ghost is-small is-icon" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)} aria-label="Fermer">✕</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {selLinks.map((e) => {
              const other = byId.get(e.from === sel.id ? e.to : e.from);
              const label = e.symmetric || e.from === sel.id ? e.label : (RELATIONS[e.kind]?.reverse || e.label);
              return (
                <button key={e.id} type="button" className="au-menu-item" onClick={() => setSelected(other.id)}>
                  <span className="au-faint" style={{ fontSize: 11.5, minWidth: 90 }}>{label}</span> {other.icon || kindMeta(other.kind).icon} {other.title}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <Link to={entityPath(pid, sel)} className="au-btn is-primary is-small">Ouvrir la fiche</Link>
            <Btn size="small" onClick={() => onFocus(sel.id)}>Isoler</Btn>
          </div>
        </aside>
      )}
    </div>
  );
}

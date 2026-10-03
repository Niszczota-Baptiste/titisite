import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthor } from '../context';
import { useShellPage } from '../Shell';
import { Btn, Empty, ErrorLine, humanError, relativeTime } from '../ui';
import { BoardNode } from '../whiteboard/BoardNode';
import { boundsOf, edgePoints, fitCamera } from '../whiteboard/geometry';

// Tableaux blancs que l'auteur a choisi de partager, en lecture : on se
// déplace (glisser, molette, pincement), on ouvre les fiches, rien ne bouge.

export function GuestBoards() {
  const { pid, P, version } = useAuthor();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState(null);
  useShellPage({ crumbs: [{ label: 'Tableaux partagés' }], title: 'Tableaux' });
  useEffect(() => { P.boards.list().then(setBoards).catch(setError); }, [P, version]);
  return (
    <div className="au-page">
      <div className="au-page-head"><div><h1>🧩 Tableaux partagés</h1><div className="au-sub">Les tableaux blancs que l&apos;auteur a ouverts à la lecture.</div></div></div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {boards?.length === 0 && <Empty icon="🧩" title="Aucun tableau partagé">L&apos;auteur n&apos;a ouvert aucun tableau blanc pour l&apos;instant.</Empty>}
      <div className="au-cards">
        {boards?.map((b) => (
          <Link key={b.id} to={`/auteur/${pid}/tableaux/${b.id}`} className="au-ecard au-board-card">
            <div className="au-board-thumb" aria-hidden>🧩</div>
            <div className="au-ecard-top">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="au-row-title">{b.title}</div>
                <div className="au-row-meta">{b.nodeCount} élément{b.nodeCount > 1 ? 's' : ''} · {relativeTime(b.updatedAt)}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const noop = () => {};

export function GuestBoard() {
  const { boardId } = useParams();
  const { pid, P } = useAuthor();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const [cam, setCam] = useState(null);
  const wrap = useRef(null);
  const camRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  useShellPage({ crumbs: [{ label: 'Tableaux', to: `/auteur/${pid}/tableaux` }, { label: board?.title || '…' }], title: board?.title, full: true });

  useEffect(() => { P.boards.get(Number(boardId)).then(setBoard).catch(setError); }, [P, boardId]);
  useEffect(() => { camRef.current = cam; }, [cam]);

  const frame = useCallback(() => {
    if (!board || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    setCam(fitCamera(boundsOf(board.nodes), r.width, r.height));
  }, [board]);
  useEffect(() => { frame(); }, [frame]);

  const zoomAt = (factor, cx, cy) => setCam((c) => {
    if (!c) return c;
    const k = Math.min(3, Math.max(0.1, c.k * factor));
    const f = k / c.k;
    return { k, x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f };
  });

  // Molette = zoom (écouteur natif non passif pour pouvoir empêcher le défilement).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [board]);

  const onDown = (e) => {
    if (e.target.closest('a, button')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), cam: { ...camRef.current } };
    } else {
      gesture.current = { type: 'pan', x: e.clientX, y: e.clientY, cam: { ...camRef.current } };
    }
  };
  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const r = wrap.current.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      const k = Math.min(3, Math.max(0.1, g.cam.k * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist)));
      const f = k / g.cam.k;
      setCam({ k, x: mid.x - (mid.x - g.cam.x) * f, y: mid.y - (mid.y - g.cam.y) * f });
    } else if (g.type === 'pan') {
      setCam({ ...g.cam, x: g.cam.x + e.clientX - g.x, y: g.cam.y + e.clientY - g.y });
    }
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  if (error) {
    return (
      <div className="au-page is-narrow">
        <Empty icon="🧩" title={error.status === 404 ? 'Tableau introuvable' : 'Chargement impossible'}>
          {error.status === 404 ? 'Il n\'est peut-être plus partagé.' : humanError(error)}
        </Empty>
      </div>
    );
  }
  if (!board) return <div className="au-page"><p className="au-muted">Chargement…</p></div>;
  const nodes = new Map(board.nodes.map((n) => [n.id, n]));
  const center = () => { const r = wrap.current.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };

  return (
    <div className="au-wb is-hand is-readonly" ref={wrap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      aria-label={`Tableau : ${board.title}`}>
      {cam && (
        <div className="au-wb-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          <svg className="au-wb-edges" aria-hidden>
            <defs>
              <marker id="wb-end-ro" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {board.edges.map((ed) => {
              const a = nodes.get(ed.from); const b = nodes.get(ed.to);
              if (!a || !b) return null;
              const { p1, p2 } = edgePoints(a, b);
              const mx = (p1.x + p2.x) / 2; const my = (p1.y + p2.y) / 2;
              return (
                <g key={ed.id}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={ed.color || 'var(--au-muted)'} strokeWidth={2}
                    strokeDasharray={ed.style === 'dashed' ? '8 6' : undefined}
                    markerEnd={ed.arrow !== 'none' ? 'url(#wb-end-ro)' : undefined} markerStart={ed.arrow === 'both' ? 'url(#wb-end-ro)' : undefined} />
                  {ed.label && (
                    <g transform={`translate(${mx},${my})`}>
                      <rect x={-(ed.label.length * 3.6 + 10)} y={-11} width={ed.label.length * 7.2 + 20} height={22} rx={11} className="au-wb-elabel-bg" />
                      <text textAnchor="middle" dy="0.35em" className="au-wb-elabel">{ed.label}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          {board.nodes.map((n) => (
            <BoardNode key={n.id} node={n} pid={pid} selected={false} single={false} editing={false}
              onPointerDown={noop} onDoubleClick={noop} onContextMenu={noop} onEditDone={noop} />
          ))}
        </div>
      )}
      {board.nodes.length === 0 && <div className="au-wb-empty au-wb-ui"><strong>Tableau vide</strong></div>}
      <div className="au-wb-ui au-wb-ro-bar">
        <span className="au-pill">👁️ Lecture seule</span>
        <Btn size="small" icon onClick={() => zoomAt(1 / 1.25, ...center())} aria-label="Dézoomer">－</Btn>
        <Btn size="small" icon onClick={() => zoomAt(1.25, ...center())} aria-label="Zoomer">＋</Btn>
        <Btn size="small" icon onClick={frame} aria-label="Recadrer" title="Recadrer">⤢</Btn>
      </div>
    </div>
  );
}

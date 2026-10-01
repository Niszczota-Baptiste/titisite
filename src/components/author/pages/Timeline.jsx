import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { KINDS } from '../kinds';
import { useShellPage } from '../Shell';
import { Btn, Empty, ErrorLine, PromptDialog, Tabs, cx, entityPath, humanError } from '../ui';
import { CreateEntityDialog } from './EntityList';

// Chronologie : une ligne par échelle de temps (histoire ancienne, récit…),
// toutes sur le MÊME axe numérique (« position chronologique » des
// événements). On glisse un événement pour le dater ou le changer de ligne ;
// les événements non datés attendent dans un plateau et se posent sur l'axe
// par glisser-déposer. Sur téléphone, la vue liste est proposée par défaut.

const LANE_H = 46;
const CARD_W = 168;
const NONE = 'none';

// Une année s'écrit « 1180 », pas « 1 180 » : pas de séparateur de milliers
// sous 10 000.
function fmtKey(v) {
  return Number(v).toLocaleString('fr-FR', { useGrouping: Math.abs(v) >= 10000, maximumFractionDigits: 2 });
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

export function Timeline() {
  const { pid, P, timelines, version, bump } = useAuthor();
  const [params] = useSearchParams();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState(() => (window.innerWidth < 900 ? 'liste' : 'axe'));
  const [scale, setScale] = useState(null); // px par unité
  const [creating, setCreating] = useState(null);
  const [placing, setPlacing] = useState(null);
  const toast = useToast();
  const focusId = Number(params.get('focus')) || null;
  useShellPage({ crumbs: [{ label: 'Chronologie' }], title: 'Chronologie', full: view === 'axe' });

  const load = useCallback(() => P.entities.list({ kind: 'event', sort: 'date', limit: 1000 }).then((r) => setEvents(r.items)).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  const lanes = useMemo(() => {
    const list = timelines.map((t) => ({ key: String(t.id), id: t.id, name: t.name, color: t.color }));
    if ((events || []).some((e) => !e.timelineId)) list.push({ key: NONE, id: null, name: 'Sans ligne de temps', color: 'var(--au-faint)' });
    return list;
  }, [timelines, events]);

  const dated = useMemo(() => (events || []).filter((e) => e.sortKey !== null && e.sortKey !== undefined), [events]);
  const undated = useMemo(() => (events || []).filter((e) => e.sortKey === null || e.sortKey === undefined), [events]);

  const move = async (e, patch) => {
    setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
    try { await P.moveEvent(e.id, patch); bump(); } catch (err) { toast.error(humanError(err)); load(); }
  };

  return (
    <div className={view === 'axe' ? 'au-tl-page' : 'au-page is-narrow'}>
      <div className={cx('au-page-head', view === 'axe' && 'au-tl-head')}>
        <div>
          <h1>⏳ Chronologie</h1>
          <div className="au-sub">{events ? `${dated.length} événement${dated.length > 1 ? 's' : ''} daté${dated.length > 1 ? 's' : ''}${undated.length ? ` · ${undated.length} à dater` : ''}` : 'Chargement…'} · <Link to={`/auteur/${pid}/evenements`} style={{ color: 'var(--au-acc)' }}>liste complète</Link></div>
        </div>
        <div className="au-actions">
          <Tabs value={view} onChange={setView} options={[['axe', '⟷ Axe'], ['liste', '☰ Liste']]} />
          {view === 'axe' && scale && (
            <span style={{ display: 'flex', gap: 4 }}>
              <Btn size="small" icon onClick={() => setScale((s) => s / 1.5)} aria-label="Dézoomer">－</Btn>
              <Btn size="small" icon onClick={() => setScale((s) => s * 1.5)} aria-label="Zoomer">＋</Btn>
              <Btn size="small" icon onClick={() => setScale(null)} aria-label="Ajuster" title="Tout voir">⤢</Btn>
            </span>
          )}
          <Btn variant="primary" onClick={() => setCreating({})}>＋ Événement</Btn>
        </div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {events && events.length === 0 && (
        <div className="au-page is-narrow" style={{ paddingTop: 0 }}>
          <Empty icon="⏳" title="Aucun événement" action={<Btn variant="primary" onClick={() => setCreating({})}>＋ Premier événement</Btn>}>
            Un événement a une « position chronologique » (un nombre : année, jour…) qui le place sur l&apos;axe, et une date affichée libre.
          </Empty>
        </div>
      )}
      {events && events.length > 0 && view === 'axe' && (
        <TimelineAxis pid={pid} lanes={lanes} dated={dated} undated={undated} scale={scale} setScale={setScale}
          focusId={focusId} onMove={move} onCreateAt={(lane, sortKey) => setPlacing({ lane, sortKey })} />
      )}
      {events && events.length > 0 && view === 'liste' && <TimelineList pid={pid} lanes={lanes} events={events} />}
      <CreateEntityDialog open={!!creating} kind="event" onClose={() => setCreating(null)} defaults={creating || {}} onCreated={() => load()} />
      <PromptDialog open={!!placing} title="Nouvel événement" label={placing ? `Titre — position ${placing.sortKey}` : 'Titre'} confirmLabel="Créer"
        onClose={() => setPlacing(null)}
        onSubmit={async (title) => {
          const p = placing;
          setPlacing(null);
          try { await P.entities.create({ kind: 'event', title, sortKey: p.sortKey, timelineId: p.lane.id }); bump(); } catch (err) { toast.error(humanError(err)); }
        }} />
    </div>
  );
}

function TimelineAxis({ pid, lanes, dated, undated, scale, setScale, focusId, onMove, onCreateAt }) {
  const navigate = useNavigate();
  const scroller = useRef(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState(null); // { id, dx, dy, lane, sortKey }
  const [sel, setSel] = useState(focusId);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const keys = dated.flatMap((e) => [e.sortKey, e.endSortKey].filter((v) => v !== null && v !== undefined));
  const rawMin = keys.length ? Math.min(...keys) : 0;
  const rawMax = keys.length ? Math.max(...keys) : 100;
  const span = Math.max(rawMax - rawMin, 1);
  const min = rawMin - span * 0.08;
  const max = rawMax + span * 0.08;
  const fit = Math.max(1e-6, (width - 60 - CARD_W) / (max - min));
  const k = scale ?? fit;
  const pad = 30;
  const totalW = Math.max(width, (max - min) * k + pad * 2 + CARD_W);
  const xOf = (v) => pad + (v - min) * k;
  const vOf = (x) => min + (x - pad) / k;
  const step = niceStep(110 / k);
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(Number(t.toPrecision(12)));

  // Empilement : dans chaque ligne, un événement descend d'un cran s'il
  // chevauche le précédent (largeur de carte estimée).
  const layout = useMemo(() => {
    const out = new Map();
    for (const lane of lanes) {
      const rows = [];
      const list = dated.filter((e) => (lane.id === null ? !e.timelineId : e.timelineId === lane.id)).sort((a, b) => a.sortKey - b.sortKey);
      for (const e of list) {
        const x0 = xOf(e.sortKey);
        const x1 = Math.max(x0 + CARD_W, e.endSortKey !== null && e.endSortKey !== undefined ? xOf(e.endSortKey) : 0);
        let row = rows.findIndex((end) => end < x0 - 6);
        if (row < 0) { row = rows.length; rows.push(0); }
        rows[row] = x1;
        out.set(e.id, { row, x0, x1 });
      }
      out.set(`lane:${lane.key}`, Math.max(1, rows.length));
    }
    return out;
  }, [lanes, dated, k, min]); // eslint-disable-line

  // Chaque ligne réserve une bande pour son nom, au-dessus des événements.
  let top = 34;
  const laneTops = lanes.map((lane) => {
    const t = top;
    top += layout.get(`lane:${lane.key}`) * LANE_H + 30;
    return { ...lane, top: t, h: layout.get(`lane:${lane.key}`) * LANE_H + 20 };
  });
  const totalH = top + 10;

  useEffect(() => {
    if (!focusId || !scroller.current) return;
    const ev = dated.find((e) => e.id === focusId);
    if (ev) scroller.current.scrollLeft = Math.max(0, xOf(ev.sortKey) - width / 2);
  }, [focusId, dated.length]); // eslint-disable-line

  // Glisser : souris dès 4 px, doigt après un appui long (le défilement
  // horizontal natif reste disponible).
  const startDrag = (e, ev) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY, sl: scroller.current.scrollLeft };
    let active = false;
    let timer = null;
    let last = null;
    const lane0 = laneTops.find((l) => (l.id === null ? !ev.timelineId : l.id === ev.timelineId));
    const activate = () => { active = true; el.setPointerCapture?.(e.pointerId); if (e.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(10); };
    if (e.pointerType === 'touch') timer = setTimeout(activate, 300);
    const compute = (cx, cy) => {
      const dx = cx - start.x + (scroller.current.scrollLeft - start.sl);
      const r = scroller.current.getBoundingClientRect();
      const y = cy - r.top + scroller.current.scrollTop;
      const lane = laneTops.find((l) => y >= l.top - 9 && y < l.top + l.h + 9) || lane0;
      const fine = step / 10;
      const sortKey = Math.round((ev.sortKey + dx / k) / fine) * fine;
      return { dx, lane, sortKey: Number(sortKey.toPrecision(12)) };
    };
    const handleMove = (m) => {
      if (!active) {
        if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > (e.pointerType === 'touch' ? 10 : 4)) {
          if (e.pointerType === 'touch') { clearTimeout(timer); cleanup(); return; } // défilement
          activate();
        } else return;
      }
      last = compute(m.clientX, m.clientY);
      setDrag({ id: ev.id, ...last });
    };
    const handleTouchMove = (m) => { if (active) m.preventDefault(); };
    const handleUp = () => {
      clearTimeout(timer);
      cleanup();
      setDrag(null);
      if (!active) { setSel(ev.id); return; }
      if (!last) return;
      const patch = {};
      if (last.sortKey !== ev.sortKey) {
        patch.sortKey = last.sortKey;
        if (ev.endSortKey !== null && ev.endSortKey !== undefined) patch.endSortKey = Number((ev.endSortKey + (last.sortKey - ev.sortKey)).toPrecision(12));
      }
      if (last.lane && last.lane.id !== (ev.timelineId ?? null)) patch.timelineId = last.lane.id;
      if (Object.keys(patch).length) onMove(ev, patch);
    };
    function cleanup() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
  };

  // Déposer un événement non daté sur l'axe (glisser natif, ordinateur) ou le
  // placer au milieu de la vue (bouton, téléphone).
  const dropUndated = (e) => {
    const id = Number(e.dataTransfer.getData('text/au-event'));
    const ev = undated.find((x) => x.id === id);
    if (!ev) return;
    e.preventDefault();
    const r = scroller.current.getBoundingClientRect();
    const x = e.clientX - r.left + scroller.current.scrollLeft;
    const y = e.clientY - r.top + scroller.current.scrollTop;
    const lane = laneTops.find((l) => y >= l.top - 9 && y < l.top + l.h + 9);
    const v = Number((Math.round(vOf(x) / (step / 10)) * (step / 10)).toPrecision(12));
    onMove(ev, { sortKey: v, ...(lane ? { timelineId: lane.id } : {}) });
  };
  const placeUndated = (ev) => {
    const mid = vOf(scroller.current.scrollLeft + width / 2);
    onMove(ev, { sortKey: Number((Math.round(mid / step) * step).toPrecision(12)) });
  };

  const onLaneDouble = (e, lane) => {
    if (e.target.closest('.au-tl-ev')) return;
    const r = scroller.current.getBoundingClientRect();
    const x = e.clientX - r.left + scroller.current.scrollLeft;
    onCreateAt(lane, Number((Math.round(vOf(x) / (step / 10)) * (step / 10)).toPrecision(12)));
  };

  // Ctrl/⌘ + molette = zoom de l'axe (écouteur natif non passif pour bloquer
  // le zoom de la page).
  const kRef = useRef(k);
  kRef.current = k;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const fn = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale(kRef.current * Math.exp(-e.deltaY * 0.002));
    };
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, [setScale]);

  const selected = dated.find((e) => e.id === sel);

  return (
    <div className="au-tl">
      {undated.length > 0 && (
        <div className="au-tl-tray">
          <span className="au-faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>À dater :</span>
          {undated.map((ev) => (
            <span key={ev.id} className="au-tl-chip" draggable onDragStart={(e) => e.dataTransfer.setData('text/au-event', String(ev.id))}>
              ⚡ {ev.title}
              <button type="button" className="au-btn is-ghost is-small" onClick={() => placeUndated(ev)} title="Placer au centre de la vue">⇣</button>
            </span>
          ))}
        </div>
      )}
      <div className="au-tl-scroll" ref={scroller} onDragOver={(e) => e.preventDefault()} onDrop={dropUndated}>
        <div style={{ width: totalW, height: totalH, position: 'relative' }}>
          <div className="au-tl-axis">
            {ticks.map((t) => <span key={t} className="au-tl-tick" style={{ left: xOf(t) }}>{fmtKey(t)}</span>)}
          </div>
          {ticks.map((t) => <span key={`g${t}`} className="au-tl-grid" style={{ left: xOf(t), height: totalH }} />)}
          {laneTops.map((lane) => (
            <div key={lane.key} className="au-tl-lane" style={{ top: lane.top, height: lane.h, '--lane': lane.color }} onDoubleClick={(e) => onLaneDouble(e, lane)}>
              <span className="au-tl-lane-name">{lane.name}</span>
            </div>
          ))}
          {dated.map((ev) => {
            const lay = layout.get(ev.id);
            const lane = laneTops.find((l) => (l.id === null ? !ev.timelineId : l.id === ev.timelineId));
            if (!lay || !lane) return null;
            const isDrag = drag?.id === ev.id;
            const dLane = isDrag ? drag.lane : lane;
            const x = isDrag ? lay.x0 + drag.dx : lay.x0;
            const y = (isDrag ? dLane.top : lane.top) + 16 + (isDrag && dLane !== lane ? 0 : lay.row * LANE_H);
            const hasEnd = ev.endSortKey !== null && ev.endSortKey !== undefined;
            const barW = hasEnd ? Math.max(8, (ev.endSortKey - ev.sortKey) * k) : 0;
            return (
              <div key={ev.id} className={cx('au-tl-ev', `imp-${ev.importance}`, sel === ev.id && 'is-sel', isDrag && 'is-drag')}
                style={{ transform: `translate(${x}px, ${y}px)`, '--lane': lane.color }}
                onPointerDown={(e) => startDrag(e, ev)} onDoubleClick={() => navigate(entityPath(pid, ev))}
                title={`${ev.title} — ${ev.dateLabel || ev.sortKey}`}>
                {hasEnd && <span className="au-tl-bar" style={{ width: barW }} />}
                <span className="au-tl-dot" />
                <span className="au-tl-ev-text">
                  <span className="au-tl-ev-title">{ev.title}</span>
                  <span className="au-tl-ev-date">{isDrag ? fmtKey(drag.sortKey) : (ev.dateLabel || fmtKey(ev.sortKey))}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {selected && (
        <div className="au-tl-panel">
          <div className="au-row-title">{KINDS.event.icon} {selected.title}</div>
          <div className="au-row-meta">{selected.dateLabel || '—'} · position {selected.sortKey}{selected.endSortKey != null ? ` → ${selected.endSortKey}` : ''}</div>
          {selected.summary && <p className="au-muted" style={{ fontSize: 13, margin: '6px 0' }}>{selected.summary}</p>}
          <div style={{ display: 'flex', gap: 6 }}>
            <Link to={entityPath(pid, selected)} className="au-btn is-primary is-small">Ouvrir la fiche</Link>
            <Btn size="small" variant="ghost" onClick={() => setSel(null)}>Fermer</Btn>
          </div>
        </div>
      )}
      <div className="au-tl-hint au-desktop-only">Glisser un événement : le dater / changer de ligne · double-clic sur une ligne : créer · Ctrl + molette : zoom</div>
    </div>
  );
}

function TimelineList({ pid, lanes, events }) {
  return (
    <div>
      {lanes.map((lane) => {
        const list = events.filter((e) => (lane.id === null ? !e.timelineId : e.timelineId === lane.id))
          .sort((a, b) => (a.sortKey ?? Infinity) - (b.sortKey ?? Infinity));
        if (!list.length) return null;
        return (
          <section key={lane.key} className="au-tl-listlane" style={{ '--lane': lane.color }}>
            <h2><span className="au-dot" style={{ '--dot': lane.color }} /> {lane.name}</h2>
            <ol>
              {list.map((e) => (
                <li key={e.id}>
                  <Link to={entityPath(pid, e)} className="au-row">
                    <span className="au-tl-list-date">{e.dateLabel || (e.sortKey ?? 'non daté')}</span>
                    <span className="au-row-main">
                      <span className="au-row-title" style={{ display: 'block' }}>{e.importance === 3 ? '★ ' : ''}{e.title}</span>
                      {e.summary && <span className="au-row-meta" style={{ display: 'block' }}>{e.summary}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

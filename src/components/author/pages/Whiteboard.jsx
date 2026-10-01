import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { IMAGE_ACCEPT, useUpload } from '../MediaPanel';
import { useShellPage } from '../Shell';
import { Btn, ColorDots, Dialog, EntityPicker, ErrorLine, MOD, PromptDialog, cx, humanError, useMenu } from '../ui';
import { BoardNode } from '../whiteboard/BoardNode';
import {
  BOARD_COLORS, NODE_DEFAULTS, boundsOf, contains, edgePoints, fitCamera, newId, normRect, rectsIntersect,
} from '../whiteboard/geometry';
import { useBoard } from '../whiteboard/useBoard';

// Tableau blanc quasi infini : cartes, textes, commentaires, formes, cadres de
// groupe, images, éléments de l'univers (personnages, lieux…), reliés par des
// flèches légendées. Souris : glisser le fond = sélection au lasso (Espace ou
// clic molette = déplacer la vue), molette = défiler, Ctrl/⌘ + molette =
// zoom. Doigts : un doigt sur le fond = déplacer, deux doigts = zoom,
// appui long = menu. Tout s'enregistre seul, par lots.

const CULL_FROM = 150;

export function Whiteboard() {
  const { boardId } = useParams();
  const id = Number(boardId);
  const { pid, P, search } = useAuthor();
  const board = useBoard(id);
  const { graph, meta } = board;
  const navigate = useNavigate();
  const toast = useToast();
  const [openMenu, menuEl] = useMenu();
  const { upload, progress } = useUpload();

  const wrap = useRef(null);
  const fileInput = useRef(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [cam, setCam] = useState(null);
  const camRef = useRef(cam);
  camRef.current = cam;
  const [sel, setSel] = useState(() => new Set());
  const selRef = useRef(sel);
  selRef.current = sel;
  const [selEdge, setSelEdge] = useState(null);
  const [editing, setEditing] = useState(null);
  const [band, setBand] = useState(null);
  const [linkDraft, setLinkDraft] = useState(null);
  const [tool, setTool] = useState('select'); // select | hand
  const [picker, setPicker] = useState(null); // position monde
  const [renaming, setRenaming] = useState(false);
  const [templating, setTemplating] = useState(false);
  const gesture = useRef(null);
  const pointers = useRef(new Map());
  const space = useRef(false);
  const lastTap = useRef({ id: null, t: 0 });

  useShellPage({ crumbs: [{ label: 'Tableaux blancs', to: `/auteur/${pid}/tableaux` }, { label: meta?.title || '…' }], full: true, title: meta?.title });

  // ── Taille & caméra initiale ───────────────────────────────────────────
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!meta || cam) return;
    const v = meta.view;
    if (v && (v.x !== 0 || v.y !== 0 || v.zoom !== 1)) setCam({ x: v.x, y: v.y, k: v.zoom });
    else setCam(fitCamera(boundsOf([...graph.nodes.values()]), size.w, size.h));
  }, [meta]); // eslint-disable-line

  const updateCam = useCallback((c) => { setCam(c); board.saveView(c); }, [board]);

  const toWorld = useCallback((cx, cy) => {
    const r = wrap.current.getBoundingClientRect();
    const c = camRef.current;
    return { x: (cx - r.left - c.x) / c.k, y: (cy - r.top - c.y) / c.k };
  }, []);
  const viewCenter = () => toWorld(wrap.current.getBoundingClientRect().left + size.w / 2, wrap.current.getBoundingClientRect().top + size.h / 2);

  const zoomAt = useCallback((factor, sx, sy) => {
    const c = camRef.current;
    if (!c) return;
    const k = Math.max(0.08, Math.min(5, c.k * factor));
    updateCam({ k, x: sx - ((sx - c.x) / c.k) * k, y: sy - ((sy - c.y) / c.k) * k });
  }, [updateCam]);

  // Molette : défilement (trackpad à deux doigts) ; Ctrl/⌘ ou pincement = zoom.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.target.closest('.au-wb-ui, .au-wb-edit')) return;
      e.preventDefault();
      const c = camRef.current;
      if (!c) return;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else updateCam({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, updateCam]);

  // ── Création ──────────────────────────────────────────────────────────
  const maxZ = () => Math.max(0, ...[...board.nodesRef.current.nodes.values()].map((n) => n.z || 0));
  const addNode = useCallback((kind, at, extra = {}) => {
    const d = NODE_DEFAULTS[kind];
    const p = at || viewCenter();
    const node = {
      id: newId(), kind, w: d.w, h: d.h, color: d.color, shape: d.shape || 'rect', text: '', entityId: null, mediaId: null,
      z: kind === 'group' ? Math.min(0, ...[...board.nodesRef.current.nodes.values()].map((n) => n.z || 0)) - 1 : maxZ() + 1,
      ...extra,
    };
    node.x = Math.round(p.x - node.w / 2);
    node.y = Math.round(p.y - node.h / 2);
    board.upsertNodes([node]);
    setSel(new Set([node.id]));
    setSelEdge(null);
    if (['card', 'text', 'comment', 'shape', 'group'].includes(kind) && !extra.text) setEditing(node.id);
    return node;
  }, [board]); // eslint-disable-line

  const addEntity = (ent, at) => {
    addNode('entity', at, { entityId: ent.id, entity: { id: ent.id, kind: ent.kind, title: ent.title, icon: ent.icon, color: ent.color, summary: '' } });
  };

  const onImages = async (files, at) => {
    const done = await upload([...files].slice(0, 10), { purpose: 'board' });
    done.forEach((m, i) => {
      const w = 320;
      const h = m.width && m.height ? Math.round((w * m.height) / m.width) : 220;
      const p = at || viewCenter();
      addNode('image', { x: p.x + i * 30, y: p.y + i * 30 }, { w, h, mediaId: m.id, media: { url: m.url, thumbUrl: m.thumbUrl } });
    });
  };

  // ── Pointeur ──────────────────────────────────────────────────────────
  const onBgPointerDown = (e) => {
    if (e.target.closest('.au-wb-ui')) return;
    wrap.current.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    wrap.current.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      clearTimeout(gesture.current?.timer);
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { ...camRef.current } };
      return;
    }
    if (editing) setEditing(null);
    const panning = e.button === 1 || space.current || tool === 'hand' || (e.pointerType === 'touch' && tool !== 'lasso');
    if (panning) {
      const g = { type: 'pan', sx: e.clientX, sy: e.clientY, cam: { ...camRef.current }, moved: false };
      if (e.pointerType === 'touch') {
        const at = toWorld(e.clientX, e.clientY);
        g.timer = setTimeout(() => { if (!g.moved) { gesture.current = null; bgMenu({ clientX: e.clientX, clientY: e.clientY }, at); } }, 520);
      }
      gesture.current = g;
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    gesture.current = { type: 'band', x0: w.x, y0: w.y, additive: e.shiftKey, base: e.shiftKey ? new Set(selRef.current) : new Set() };
    if (!e.shiftKey) { setSel(new Set()); setSelEdge(null); }
  };

  // Gestionnaires passés aux nœuds : enveloppes STABLES (useCallback sans
  // dépendance) qui appellent la dernière version via une ref — sinon chaque
  // rendu invaliderait la mémoïsation de tous les nœuds.
  const latest = useRef({});
  latest.current.nodeDown = (e, node) => {
    if (e.target.closest('.au-wb-edit')) return;
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    wrap.current.setPointerCapture?.(e.pointerId);
    wrap.current.focus({ preventScroll: true });
    setSelEdge(null);
    const handle = e.target.closest('[data-handle]')?.dataset.handle;
    if (handle === 'resize') {
      gesture.current = { type: 'resize', id: node.id, sx: e.clientX, sy: e.clientY, start: { ...node } };
      return;
    }
    if (handle === 'connect') {
      const w = toWorld(e.clientX, e.clientY);
      gesture.current = { type: 'connect', from: node.id };
      setLinkDraft({ from: node.id, x: w.x, y: w.y });
      return;
    }
    // Double appui (tactile) = éditer.
    if (e.pointerType === 'touch') {
      const now = Date.now();
      if (lastTap.current.id === node.id && now - lastTap.current.t < 320) { lastTap.current = { id: null, t: 0 }; startEdit(node); return; }
      lastTap.current = { id: node.id, t: now };
    }
    let current = selRef.current;
    if (e.shiftKey) {
      current = new Set(current);
      if (current.has(node.id)) current.delete(node.id); else current.add(node.id);
      setSel(current);
    } else if (!current.has(node.id)) {
      current = new Set([node.id]);
      setSel(current);
    }
    // Un cadre emporte ce qu'il contient entièrement.
    const all = board.nodesRef.current.nodes;
    const moving = new Set(current);
    for (const nid of current) {
      const n = all.get(nid);
      if (n?.kind === 'group') for (const o of all.values()) if (o.id !== n.id && contains(n, o)) moving.add(o.id);
    }
    const start = new Map([...moving].map((nid) => [nid, all.get(nid)]).filter(([, n]) => n));
    const target = e.currentTarget;
    gesture.current = {
      type: 'drag', sx: e.clientX, sy: e.clientY, start, moved: false, node,
      timer: e.pointerType === 'touch' ? setTimeout(() => {
        if (gesture.current?.type === 'drag' && !gesture.current.moved) {
          gesture.current = null;
          nodeMenu({ clientX: e.clientX, clientY: e.clientY, currentTarget: target, preventDefault() {}, stopPropagation() {} }, node);
        }
      }, 520) : null,
    };
  };
  const onNodePointerDown = useCallback((e, node) => latest.current.nodeDown(e, node), []);

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const c = camRef.current;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = wrap.current.getBoundingClientRect();
      const k = Math.max(0.08, Math.min(5, g.cam.k * (dist / g.dist)));
      const mx = g.mid.x - r.left; const my = g.mid.y - r.top;
      setCam({ k, x: mx - ((mx - g.cam.x) / g.cam.k) * k + (mid.x - g.mid.x), y: my - ((my - g.cam.y) / g.cam.k) * k + (mid.y - g.mid.y) });
    } else if (g.type === 'pan') {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) { g.moved = true; clearTimeout(g.timer); }
      setCam({ ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy });
    } else if (g.type === 'band') {
      const w = toWorld(e.clientX, e.clientY);
      const rect = normRect(g.x0, g.y0, w.x, w.y);
      setBand(rect);
      const next = new Set(g.base);
      for (const n of board.nodesRef.current.nodes.values()) if (rectsIntersect(rect, n)) next.add(n.id);
      setSel(next);
    } else if (g.type === 'drag') {
      const dx = (e.clientX - g.sx) / c.k;
      const dy = (e.clientY - g.sy) / c.k;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < (e.pointerType === 'touch' ? 8 : 3)) return;
      g.moved = true;
      clearTimeout(g.timer);
      board.preview([...g.start.values()].map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })));
    } else if (g.type === 'resize') {
      const dx = (e.clientX - g.sx) / c.k;
      const dy = (e.clientY - g.sy) / c.k;
      board.preview([{ ...g.start, w: Math.max(40, g.start.w + dx), h: Math.max(30, g.start.h + dy) }]);
      g.moved = true;
    } else if (g.type === 'connect') {
      const w = toWorld(e.clientX, e.clientY);
      setLinkDraft((d) => d && { ...d, x: w.x, y: w.y });
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    clearTimeout(g.timer);
    if (g.type === 'pinch') {
      if (pointers.current.size === 0) { gesture.current = null; board.saveView(camRef.current); }
      return;
    }
    gesture.current = null;
    if (g.type === 'pan') {
      board.saveView(camRef.current);
      if (!g.moved && e.pointerType === 'touch') { setSel(new Set()); setSelEdge(null); }
    } else if (g.type === 'band') {
      setBand(null);
    } else if (g.type === 'drag' && g.moved) {
      const all = board.nodesRef.current.nodes;
      const before = new Map([...g.start].map(([nid, n]) => [`node:${nid}`, n]));
      board.commit([...g.start.keys()].map((nid) => all.get(nid)).filter(Boolean), before);
    } else if (g.type === 'resize' && g.moved) {
      const n = board.nodesRef.current.nodes.get(g.id);
      if (n) board.commit([n], new Map([[`node:${g.id}`, g.start]]));
    } else if (g.type === 'connect') {
      setLinkDraft(null);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]');
      const to = el?.dataset.node;
      if (to && to !== g.from) {
        const edge = { id: newId(), from: g.from, to, label: '', color: '', style: 'solid', arrow: 'end' };
        board.upsertEdges([edge]);
        setSelEdge(edge.id);
        setSel(new Set());
      }
    }
  };

  // ── Édition ───────────────────────────────────────────────────────────
  const startEdit = (node) => {
    if (node.kind === 'entity' && node.entity) { navigate(`/auteur/${pid}/e/${node.entity.id}`); return; }
    if (node.kind === 'image') return;
    setSel(new Set([node.id]));
    setEditing(node.id);
  };
  latest.current.dbl = (e, node) => { e.stopPropagation(); startEdit(node); };
  latest.current.editDone = (node, text) => {
    setEditing(null);
    const cur = board.nodesRef.current.nodes.get(node.id);
    if (cur && cur.text !== text) board.upsertNodes([{ ...cur, text }]);
  };
  const onDoubleClick = useCallback((e, node) => latest.current.dbl(e, node), []);
  const onEditDone = useCallback((node, text) => latest.current.editDone(node, text), []);

  const selected = () => [...selRef.current].map((nid) => board.nodesRef.current.nodes.get(nid)).filter(Boolean);
  const patchSelected = (patch) => board.upsertNodes(selected().map((n) => ({ ...n, ...(typeof patch === 'function' ? patch(n) : patch) })));
  const deleteSelection = () => {
    if (selEdge) { board.deleteEdges([selEdge]); setSelEdge(null); return; }
    if (selRef.current.size) { board.deleteNodes([...selRef.current]); setSel(new Set()); }
  };
  const duplicate = () => {
    const src = selected();
    if (!src.length) return;
    const map = new Map();
    const copies = src.map((n) => { const c = { ...n, id: newId(), x: n.x + 40, y: n.y + 40, z: maxZ() + 1 }; map.set(n.id, c.id); return c; });
    const edges = [...board.nodesRef.current.edges.values()].filter((ed) => map.has(ed.from) && map.has(ed.to))
      .map((ed) => ({ ...ed, id: newId(), from: map.get(ed.from), to: map.get(ed.to) }));
    board.upsertNodes(copies);
    if (edges.length) board.upsertEdges(edges);
    setSel(new Set(copies.map((c) => c.id)));
  };
  const frameSelection = () => {
    const b = boundsOf(selected());
    if (!b) return;
    const pad = 30;
    const node = addNode('group', { x: b.x + b.w / 2, y: b.y + b.h / 2 - 12 }, { w: b.w + pad * 2, h: b.h + pad * 2 + 24, text: 'Groupe' });
    setEditing(node.id);
  };
  const fitAll = () => updateCam(fitCamera(boundsOf([...graph.nodes.values()]), size.w, size.h));

  // ── Clavier ───────────────────────────────────────────────────────────
  const onKeyDown = (e) => {
    if (editing || e.target.closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === ' ') { space.current = true; return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) board.redo(); else board.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); board.redo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set(graph.nodes.keys())); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Escape') { setSel(new Set()); setSelEdge(null); return; }
    if (e.key === 'Enter' && sel.size === 1) { e.preventDefault(); startEdit(selected()[0]); return; }
    if (e.key === '+' || e.key === '=') { zoomAt(1.2, size.w / 2, size.h / 2); return; }
    if (e.key === '-') { zoomAt(1 / 1.2, size.w / 2, size.h / 2); return; }
    if (e.key.toLowerCase() === 'f' && !mod) { fitAll(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && sel.size) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const s = e.shiftKey ? 40 : 8;
      patchSelected((n) => ({ x: n.x + dx * s, y: n.y + dy * s }));
    }
  };
  const onKeyUp = (e) => { if (e.key === ' ') space.current = false; };

  // ── Menus ─────────────────────────────────────────────────────────────
  const addItems = (at) => [
    { label: 'Carte', icon: '🗒️', onClick: () => addNode('card', at) },
    { label: 'Texte', icon: '𝐓', onClick: () => addNode('text', at) },
    { label: 'Commentaire', icon: '💬', onClick: () => addNode('comment', at) },
    { label: 'Forme', icon: '◆', onClick: () => addNode('shape', at) },
    { label: 'Cadre de groupe', icon: '▭', onClick: () => addNode('group', at, { text: 'Groupe' }) },
    { label: 'Élément de l\'univers…', icon: '👤', onClick: () => setPicker(at) },
    { label: 'Image…', icon: '🖼️', onClick: () => { fileInput.current.dataset.at = JSON.stringify(at); fileInput.current.click(); } },
  ];
  const bgMenu = (e, at) => openMenu(e, addItems(at));
  const nodeMenu = (e, node) => {
    e.preventDefault?.();
    if (!selRef.current.has(node.id)) setSel(new Set([node.id]));
    openMenu(e, [
      node.kind === 'entity' && node.entity && { label: 'Ouvrir la fiche', icon: '↗', onClick: () => navigate(`/auteur/${pid}/e/${node.entity.id}`) },
      !['entity', 'image'].includes(node.kind) && { label: 'Modifier le texte', icon: '✎', onClick: () => startEdit(node) },
      node.kind === 'image' && { label: 'Légende…', icon: '✎', onClick: () => setEditing(node.id) },
      { label: 'Dupliquer', icon: '⧉', hint: `${MOD} D`, onClick: duplicate },
      { label: 'Premier plan', icon: '⬆', onClick: () => patchSelected({ z: maxZ() + 1 }) },
      { label: 'Arrière-plan', icon: '⬇', onClick: () => patchSelected({ z: Math.min(0, ...[...graph.nodes.values()].map((n) => n.z || 0)) - 1 }) },
      { label: 'Encadrer dans un groupe', icon: '▭', onClick: frameSelection },
      { sep: true },
      { label: 'Supprimer', icon: '🗑', danger: true, hint: 'Suppr', onClick: () => { board.deleteNodes([...new Set([...selRef.current, node.id])]); setSel(new Set()); } },
    ]);
  };
  latest.current.menu = (e, node) => { e.stopPropagation(); nodeMenu(e, node); };
  const onNodeContext = useCallback((e, node) => latest.current.menu(e, node), []);

  // ── Gabarits ──────────────────────────────────────────────────────────
  const template = async (kind) => {
    setTemplating(false);
    const c = viewCenter();
    const nodes = [];
    const edges = [];
    const mk = (k, x, y, text, extra = {}) => {
      const d = NODE_DEFAULTS[k];
      const n = { id: newId(), kind: k, x: Math.round(x - d.w / 2), y: Math.round(y - d.h / 2), w: d.w, h: d.h, z: 1, color: d.color, shape: d.shape || 'rect', text, entityId: null, mediaId: null, ...extra };
      nodes.push(n);
      return n;
    };
    const link = (a, b, label = '') => edges.push({ id: newId(), from: a.id, to: b.id, label, color: '', style: 'solid', arrow: 'end' });
    if (kind === 'mindmap') {
      const root = mk('shape', c.x, c.y, 'Idée centrale', { shape: 'ellipse', w: 220, h: 120, color: '#c9a8e8' });
      ['Personnages', 'Lieux', 'Conflits', 'Thèmes', 'Questions'].forEach((t, i, arr) => {
        const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
        link(root, mk('card', c.x + Math.cos(a) * 340, c.y + Math.sin(a) * 240, t, { color: BOARD_COLORS[(i + 1) % BOARD_COLORS.length] }));
      });
    } else if (kind === 'frise') {
      let prev = null;
      ['Origines', 'Déclencheur', 'Montée', 'Point de rupture', 'Dénouement'].forEach((t, i) => {
        const n = mk('card', c.x - 560 + i * 280, c.y, t, { color: BOARD_COLORS[i % BOARD_COLORS.length] });
        if (prev) link(prev, n);
        prev = n;
      });
    } else if (kind === 'hierarchie') {
      const top = mk('card', c.x, c.y - 200, 'Souverain', { color: '#e8d27c' });
      const mids = [-1, 0, 1].map((i) => mk('card', c.x + i * 300, c.y, ['Conseil', 'Armée', 'Clergé'][i + 1], { color: '#80c8e8' }));
      mids.forEach((m) => link(top, m));
      mids.forEach((m, i) => link(m, mk('card', c.x + (i - 1) * 300, c.y + 200, '…', { color: '#9ad4ae' })));
    } else if (kind === 'personnages') {
      try {
        const data = await P.graph({ kinds: 'character' });
        if (!data.nodes.length) { toast.info('Aucun personnage à placer.'); return; }
        const list = data.nodes.slice(0, 60);
        const R = Math.max(220, list.length * 34);
        const ids = new Map();
        list.forEach((n, i) => {
          const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
          const node = mk('entity', c.x + Math.cos(a) * R, c.y + Math.sin(a) * R * 0.7, '', {
            entityId: n.id, entity: { id: n.id, kind: n.kind, title: n.title, icon: n.icon, color: n.color, summary: '' },
          });
          ids.set(n.id, node);
        });
        for (const ed of data.edges) {
          if (ids.has(ed.from) && ids.has(ed.to)) {
            edges.push({ id: newId(), from: ids.get(ed.from).id, to: ids.get(ed.to).id, label: ed.label, color: '', style: 'solid', arrow: ed.symmetric ? 'none' : 'end' });
          }
        }
      } catch (err) { toast.error(humanError(err)); return; }
    }
    board.upsertNodes(nodes);
    if (edges.length) board.upsertEdges(edges);
    setSel(new Set());
    setTimeout(() => updateCam(fitCamera(boundsOf([...board.nodesRef.current.nodes.values()]), size.w, size.h)), 30);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────
  const visibleNodes = useMemo(() => {
    const all = [...graph.nodes.values()].sort((a, b) => (a.kind === 'group' ? -1 : 0) - (b.kind === 'group' ? -1 : 0) || (a.z || 0) - (b.z || 0));
    if (!cam || all.length < CULL_FROM) return all;
    const m = 300 / cam.k;
    const viewRect = { x: -cam.x / cam.k - m, y: -cam.y / cam.k - m, w: size.w / cam.k + 2 * m, h: size.h / cam.k + 2 * m };
    return all.filter((n) => rectsIntersect(viewRect, n) || sel.has(n.id) || editing === n.id);
  }, [graph.nodes, cam, size, sel, editing]);

  if (board.status === 'error' && !meta) {
    return <div className="au-page is-narrow"><ErrorLine error={board.error} /><Btn onClick={() => navigate(`/auteur/${pid}/tableaux`)}>← Tableaux</Btn></div>;
  }

  const edgeSel = selEdge ? graph.edges.get(selEdge) : null;
  const edgeMid = (() => {
    if (!edgeSel || !cam) return null;
    const a = graph.nodes.get(edgeSel.from); const b = graph.nodes.get(edgeSel.to);
    if (!a || !b) return null;
    const { p1, p2 } = edgePoints(a, b);
    return { x: ((p1.x + p2.x) / 2) * cam.k + cam.x, y: ((p1.y + p2.y) / 2) * cam.k + cam.y };
  })();
  const selList = [...sel].map((nid) => graph.nodes.get(nid)).filter(Boolean);

  return (
    <div className={cx('au-wb', tool === 'hand' && 'is-hand')} ref={wrap} tabIndex={0}
      onPointerDown={onBgPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown} onKeyUp={onKeyUp}
      onDoubleClick={(e) => { if (!e.target.closest('[data-node], .au-wb-ui, .au-wb-edge')) addNode('card', toWorld(e.clientX, e.clientY)); }}
      onContextMenu={(e) => { if (!e.target.closest('[data-node], .au-wb-ui')) bgMenu(e, toWorld(e.clientX, e.clientY)); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) onImages(e.dataTransfer.files, toWorld(e.clientX, e.clientY)); }}
      aria-label="Tableau blanc">
      {cam && (
        <div className="au-wb-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          <svg className="au-wb-edges" aria-hidden>
            <defs>
              <marker id="wb-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {[...graph.edges.values()].map((ed) => {
              const a = graph.nodes.get(ed.from); const b = graph.nodes.get(ed.to);
              if (!a || !b) return null;
              const { p1, p2 } = edgePoints(a, b);
              const color = ed.color || 'var(--au-muted)';
              const isSel = selEdge === ed.id;
              const mx = (p1.x + p2.x) / 2; const my = (p1.y + p2.y) / 2;
              return (
                <g key={ed.id} className="au-wb-edge">
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16 / cam.k} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onPointerDown={(e) => { e.stopPropagation(); setSelEdge(ed.id); setSel(new Set()); }} />
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSel ? 'var(--au-acc)' : color} strokeWidth={isSel ? 3 : 2}
                    strokeDasharray={ed.style === 'dashed' ? '8 6' : undefined}
                    markerEnd={ed.arrow !== 'none' ? 'url(#wb-end)' : undefined} markerStart={ed.arrow === 'both' ? 'url(#wb-end)' : undefined}
                    style={{ pointerEvents: 'none' }} />
                  {ed.label && (
                    <g transform={`translate(${mx},${my})`} style={{ pointerEvents: 'none' }}>
                      <rect x={-(ed.label.length * 3.6 + 10)} y={-11} width={ed.label.length * 7.2 + 20} height={22} rx={11} className="au-wb-elabel-bg" />
                      <text textAnchor="middle" dy="0.35em" className="au-wb-elabel">{ed.label}</text>
                    </g>
                  )}
                </g>
              );
            })}
            {linkDraft && graph.nodes.get(linkDraft.from) && (() => {
              const a = graph.nodes.get(linkDraft.from);
              return <line x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={linkDraft.x} y2={linkDraft.y} stroke="var(--au-acc)" strokeWidth={2} strokeDasharray="6 5" />;
            })()}
          </svg>
          {visibleNodes.map((n) => (
            <BoardNode key={n.id} node={n} pid={pid} selected={sel.has(n.id)} single={sel.size === 1} editing={editing === n.id}
              onPointerDown={onNodePointerDown} onDoubleClick={onDoubleClick} onContextMenu={onNodeContext} onEditDone={onEditDone} />
          ))}
          {band && <div className="au-wb-band" style={{ transform: `translate(${band.x}px, ${band.y}px)`, width: band.w, height: band.h }} />}
        </div>
      )}

      {graph.nodes.size === 0 && board.status !== 'loading' && (
        <div className="au-wb-empty au-wb-ui">
          <div style={{ fontSize: 30 }} aria-hidden>🧩</div>
          <strong>Page blanche</strong>
          <p className="au-muted">Double-clic (ou appui long) pour ajouter une carte, ou pars d&apos;un modèle :</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Btn size="small" onClick={() => template('mindmap')}>🧠 Carte mentale</Btn>
            <Btn size="small" onClick={() => template('frise')}>⏳ Frise</Btn>
            <Btn size="small" onClick={() => template('hierarchie')}>🏛️ Hiérarchie</Btn>
            <Btn size="small" onClick={() => template('personnages')}>👥 Réseau des personnages</Btn>
          </div>
        </div>
      )}

      <div className="au-wb-toolbar au-wb-ui" role="toolbar" aria-label="Outils">
        <button type="button" className={cx('au-tool', tool === 'select' && 'is-on')} onClick={() => setTool('select')} title="Sélection (lasso à la souris)">➚</button>
        <button type="button" className={cx('au-tool', tool === 'hand' && 'is-on')} onClick={() => setTool('hand')} title="Main : déplacer la vue (ou Espace)">✋</button>
        <button type="button" className={cx('au-tool au-mobile-only', tool === 'lasso' && 'is-on')} onClick={() => setTool(tool === 'lasso' ? 'select' : 'lasso')} title="Sélection multiple au doigt">⬚</button>
        <span className="au-wb-sep" />
        <button type="button" className="au-tool" onClick={() => addNode('card')} title="Carte">🗒️</button>
        <button type="button" className="au-tool" onClick={() => addNode('text')} title="Texte">𝐓</button>
        <button type="button" className="au-tool" onClick={() => addNode('comment')} title="Commentaire">💬</button>
        <button type="button" className="au-tool" onClick={() => addNode('shape')} title="Forme">◆</button>
        <button type="button" className="au-tool" onClick={() => addNode('group', null, { text: 'Groupe' })} title="Cadre de groupe">▭</button>
        <button type="button" className="au-tool" onClick={() => setPicker(viewCenter())} title="Personnage, lieu, chapitre…">👤</button>
        <button type="button" className="au-tool" onClick={() => { delete fileInput.current.dataset.at; fileInput.current.click(); }} title="Image" disabled={progress !== null}>{progress !== null ? `${Math.round(progress * 100)}` : '🖼️'}</button>
        <button type="button" className="au-tool" onClick={() => setTemplating(true)} title="Modèles">✦</button>
        <span className="au-wb-sep" />
        <button type="button" className="au-tool" onClick={board.undo} disabled={!board.canUndo} title={`Annuler (${MOD} Z)`}>↶</button>
        <button type="button" className="au-tool" onClick={board.redo} disabled={!board.canRedo} title={`Rétablir (${MOD} ⇧ Z)`}>↷</button>
      </div>

      <div className="au-wb-zoom au-wb-ui">
        <button type="button" className="au-tool" onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)} aria-label="Dézoomer">－</button>
        <button type="button" className="au-tool au-wb-pct" onClick={() => cam && updateCam({ ...cam, k: 1 })} title="Zoom 100 %">{cam ? Math.round(cam.k * 100) : 100} %</button>
        <button type="button" className="au-tool" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} aria-label="Zoomer">＋</button>
        <button type="button" className="au-tool" onClick={fitAll} title="Tout voir (F)" aria-label="Tout voir">⤢</button>
        <button type="button" className="au-tool" onClick={() => setRenaming(true)} title="Renommer le tableau" aria-label="Renommer">✎</button>
      </div>

      {(selList.length > 0 && !editing) && (
        <div className="au-wb-selbar au-wb-ui">
          <span className="au-faint" style={{ fontSize: 12 }}>{selList.length} sélectionné{selList.length > 1 ? 's' : ''}</span>
          <ColorDots value={selList[0].color} colors={BOARD_COLORS} onChange={(c) => patchSelected({ color: c })} />
          {selList.some((n) => n.kind === 'shape') && (
            <select className="au-select" style={{ width: 'auto', minHeight: 30 }} value={selList.find((n) => n.kind === 'shape').shape}
              onChange={(e) => patchSelected((n) => (n.kind === 'shape' ? { shape: e.target.value } : {}))} aria-label="Forme">
              <option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="diamond">Losange</option>
            </select>
          )}
          {selList.length > 1 && <Btn size="small" variant="ghost" onClick={frameSelection}>▭ Grouper</Btn>}
          <Btn size="small" variant="ghost" onClick={duplicate} title={`Dupliquer (${MOD} D)`}>⧉</Btn>
          <Btn size="small" variant="danger" onClick={deleteSelection} title="Supprimer (Suppr)">🗑</Btn>
        </div>
      )}

      {edgeSel && edgeMid && (
        <div className="au-wb-edgebar au-wb-ui" style={{ left: Math.min(Math.max(edgeMid.x, 170), size.w - 170), top: Math.min(Math.max(edgeMid.y + 20, 10), size.h - 120) }}
          onPointerDown={(e) => e.stopPropagation()}>
          <input className="au-input" defaultValue={edgeSel.label} key={edgeSel.id} placeholder="Libellé du lien…" maxLength={300} autoFocus
            onBlur={(e) => { if (e.target.value !== edgeSel.label) board.upsertEdges([{ ...edgeSel, label: e.target.value }]); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setSelEdge(null); }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="au-select" style={{ width: 'auto', minHeight: 30 }} value={edgeSel.arrow} onChange={(e) => board.upsertEdges([{ ...edgeSel, arrow: e.target.value }])} aria-label="Flèches">
              <option value="end">→</option><option value="both">↔</option><option value="none">—</option>
            </select>
            <Btn size="small" variant="ghost" on={edgeSel.style === 'dashed'} onClick={() => board.upsertEdges([{ ...edgeSel, style: edgeSel.style === 'dashed' ? 'solid' : 'dashed' }])}>┄</Btn>
            <ColorDots value={edgeSel.color} allowNone colors={BOARD_COLORS.slice(0, 6)} onChange={(c) => board.upsertEdges([{ ...edgeSel, color: c }])} />
            <Btn size="small" variant="danger" onClick={() => { board.deleteEdges([edgeSel.id]); setSelEdge(null); }} aria-label="Supprimer le lien">🗑</Btn>
          </div>
        </div>
      )}

      {board.conflict && (
        <div className="au-wb-conflict au-wb-ui" role="alert">
          <strong>Ce tableau a été modifié ailleurs.</strong> Tes derniers changements sont gardés.
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Btn size="small" variant="primary" onClick={board.reapply}>Réappliquer mes changements</Btn>
            <Btn size="small" variant="ghost" onClick={board.discard}>Recharger (abandonner les miens)</Btn>
          </div>
        </div>
      )}
      {board.status === 'error' && board.error && !board.conflict && (
        <div className="au-wb-conflict au-wb-ui" role="alert">⚠ {humanError(board.error)} — nouvel essai automatique. <Btn size="small" onClick={board.flush}>Réessayer</Btn></div>
      )}

      <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => {
        const at = e.target.dataset.at ? JSON.parse(e.target.dataset.at) : null;
        onImages(e.target.files, at);
        e.target.value = '';
      }} />
      <Dialog open={!!picker} onClose={() => setPicker(null)} title="Ajouter un élément de l'univers">
        <EntityPicker search={search} onPick={(ent) => { addEntity(ent, picker); setPicker(null); }} />
      </Dialog>
      <Dialog open={templating} onClose={() => setTemplating(false)} title="Modèles" width={460}>
        <div className="au-sheet-grid">
          <button type="button" onClick={() => template('mindmap')}><span className="au-tab-ico">🧠</span>Carte mentale</button>
          <button type="button" onClick={() => template('frise')}><span className="au-tab-ico">⏳</span>Frise</button>
          <button type="button" onClick={() => template('hierarchie')}><span className="au-tab-ico">🏛️</span>Hiérarchie</button>
          <button type="button" onClick={() => template('personnages')}><span className="au-tab-ico">👥</span>Réseau des personnages</button>
        </div>
        <p className="au-faint" style={{ fontSize: 12, marginTop: 10 }}>Le modèle s&apos;ajoute au centre de la vue ; « Réseau des personnages » reprend tes fiches et leurs relations.</p>
      </Dialog>
      <PromptDialog open={renaming} title="Renommer le tableau" label="Titre" initial={meta?.title || ''} onClose={() => setRenaming(false)}
        onSubmit={async (t) => { setRenaming(false); try { await board.rename(t); } catch (err) { toast.error(humanError(err)); } }} />
      {menuEl}
      <span className="au-wb-hint au-wb-ui au-desktop-only">
        Double-clic : carte · glisser le fond : sélection · Espace + glisser : déplacer · {MOD} + molette : zoom · ＋ sur un élément : relier
      </span>
    </div>
  );
}

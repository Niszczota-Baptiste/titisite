import { useCallback, useEffect, useRef, useState } from 'react';

// Glisser-déposer maison (aucune dépendance) pour les listes, le Kanban et le
// plan. Événements pointeur, donc souris ET tactile :
//   - souris : le glissement démarre après 5 px de mouvement (un clic reste
//     un clic) ;
//   - doigt : appui long (220 ms) — sans ça, impossible de faire défiler une
//     liste sur téléphone. Une fois le glissement lancé, le défilement natif
//     est bloqué et la page défile seule près des bords.
//
//   const dnd = useDnd({ onDrop: ({ id, from, to, index }) => … });
//   <div ref={dnd.container('col-a')}>
//     {items.map((it, i) => <>{dnd.marker('col-a', i)}<Card {...dnd.item(it.id, 'col-a')} /></>)}
//     {dnd.marker('col-a', items.length)}
//   </div>
//
// `index` = position d'insertion parmi les éléments du conteneur cible SANS
// l'élément déplacé (retirer puis insérer).

const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable="true"], [data-no-drag]';

function scrollParents(el) {
  const out = [];
  let n = el?.parentElement;
  while (n && n !== document.body) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY + s.overflowX)) out.push(n);
    n = n.parentElement;
  }
  return out;
}

export function useDnd({ onDrop, disabled = false } = {}) {
  const containers = useRef(new Map()); // key → { el, axis }
  const [drag, setDrag] = useState(null); // { id, from, over: { container, index } }
  const st = useRef(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const computeOver = useCallback((x, y) => {
    let found = null;
    for (const [key, c] of containers.current) {
      const r = c.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        // Le conteneur le plus petit l'emporte (listes imbriquées).
        if (!found || r.width * r.height < found.area) found = { key, c, area: r.width * r.height };
      }
    }
    if (!found) return st.current?.over || null;
    const { key, c } = found;
    const kids = [...c.el.querySelectorAll('[data-dnd-id]')]
      .filter((k) => k.closest('[data-dnd-container]') === c.el && k.dataset.dndId !== String(st.current.id));
    let index = 0;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      const mid = c.axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
      if ((c.axis === 'x' ? x : y) > mid) index += 1;
    }
    return { container: key, index };
  }, []);

  const cleanup = useCallback(() => {
    const s = st.current;
    if (!s) return;
    clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    s.ghost?.remove();
    s.sourceEl?.classList.remove('is-drag-source');
    document.documentElement.classList.remove('is-dragging-any');
    window.removeEventListener('pointermove', s.onMove);
    window.removeEventListener('pointerup', s.onUp);
    window.removeEventListener('pointercancel', s.onCancel);
    window.removeEventListener('touchmove', s.onTouchMove);
    window.removeEventListener('keydown', s.onKey, true);
    st.current = null;
    setDrag(null);
  }, []);

  const activate = useCallback(() => {
    const s = st.current;
    if (!s || s.active) return;
    s.active = true;
    const r = s.sourceEl.getBoundingClientRect();
    s.offX = s.x - r.left;
    s.offY = s.y - r.top;
    const ghost = s.sourceEl.cloneNode(true);
    ghost.classList.add('au-drag-ghost');
    ghost.removeAttribute('data-dnd-id');
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: '0px', top: '0px', margin: '0' });
    (s.sourceEl.closest('.au-root') || document.body).appendChild(ghost);
    s.ghost = ghost;
    s.sourceEl.classList.add('is-drag-source');
    document.documentElement.classList.add('is-dragging-any');
    if (s.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(10);
    s.scrollers = scrollParents(s.sourceEl);
    for (const c of containers.current.values()) for (const p of scrollParents(c.el)) if (!s.scrollers.includes(p)) s.scrollers.push(p);
    const tick = () => {
      if (!st.current) return;
      const { x, y } = st.current;
      for (const p of s.scrollers) {
        const pr = p.getBoundingClientRect();
        const edge = 56;
        if (p.scrollHeight > p.clientHeight && x >= pr.left && x <= pr.right) {
          if (y < pr.top + edge) p.scrollTop -= Math.ceil((pr.top + edge - y) / 4);
          else if (y > pr.bottom - edge) p.scrollTop += Math.ceil((y - (pr.bottom - edge)) / 4);
        }
        if (p.scrollWidth > p.clientWidth && y >= pr.top && y <= pr.bottom) {
          if (x < pr.left + edge) p.scrollLeft -= Math.ceil((pr.left + edge - x) / 4);
          else if (x > pr.right - edge) p.scrollLeft += Math.ceil((x - (pr.right - edge)) / 4);
        }
      }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    s.over = computeOver(s.x, s.y);
    ghost.style.transform = `translate(${s.x - s.offX}px, ${s.y - s.offY}px) rotate(1.5deg)`;
    setDrag({ id: s.id, from: s.from, over: s.over });
  }, [computeOver]);

  const item = useCallback((id, from, { handle = false } = {}) => ({
    'data-dnd-id': id,
    onPointerDown: (e) => {
      if (disabled || st.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const onHandle = e.target.closest('[data-dnd-handle]');
      if (handle && !onHandle) return;
      if (!onHandle && e.target.closest(INTERACTIVE) && e.target.closest(INTERACTIVE) !== e.currentTarget) return;
      const s = {
        id, from, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
        pointerType: e.pointerType, sourceEl: e.currentTarget, active: false,
      };
      s.onMove = (ev) => {
        s.x = ev.clientX; s.y = ev.clientY;
        if (!s.active) {
          const moved = Math.hypot(s.x - s.sx, s.y - s.sy);
          if (s.pointerType === 'touch') { if (moved > 8) cleanup(); return; }
          if (moved > 5) activate();
          return;
        }
        s.ghost.style.transform = `translate(${s.x - s.offX}px, ${s.y - s.offY}px) rotate(1.5deg)`;
        const over = computeOver(s.x, s.y);
        if (over && (over.container !== s.over?.container || over.index !== s.over?.index)) {
          s.over = over;
          setDrag({ id: s.id, from: s.from, over });
        }
      };
      s.onUp = () => {
        const done = s.active && s.over ? { id: s.id, from: s.from, to: s.over.container, index: s.over.index } : null;
        if (s.active) {
          // Le clic qui suit un glissement ne doit pas ouvrir la carte.
          const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
          window.addEventListener('click', stop, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
        }
        cleanup();
        if (done) onDropRef.current?.(done);
      };
      s.onCancel = () => cleanup();
      s.onTouchMove = (ev) => { if (s.active) ev.preventDefault(); };
      s.onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); cleanup(); } };
      if (e.pointerType === 'touch') s.timer = setTimeout(activate, 220);
      st.current = s;
      window.addEventListener('pointermove', s.onMove);
      window.addEventListener('pointerup', s.onUp);
      window.addEventListener('pointercancel', s.onCancel);
      window.addEventListener('touchmove', s.onTouchMove, { passive: false });
      window.addEventListener('keydown', s.onKey, true);
    },
  }), [disabled, activate, computeOver, cleanup]);

  const container = useCallback((key, { axis = 'y' } = {}) => (el) => {
    if (el) {
      el.setAttribute('data-dnd-container', '');
      containers.current.set(key, { el, axis });
    } else {
      containers.current.delete(key);
    }
  }, []);

  const marker = useCallback((key, index) => (
    drag?.over && drag.over.container === key && drag.over.index === index
      ? <div className="au-drop-marker" key={`m-${key}-${index}`} aria-hidden />
      : null
  ), [drag]);

  useEffect(() => cleanup, [cleanup]);

  return { item, container, marker, drag, isSource: (id) => drag?.id === id };
}

// Applique un déplacement à une liste simple : renvoie le nouvel ordre d'ids.
export function moveInList(ids, id, index) {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

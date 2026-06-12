import { useEffect, useRef, useState } from 'react';
import { protectProps, protectedImgStyle, Signature } from './shared';

const BASE_SPEED = 0.22; // rad/s — un tour complet en ~28s
const DRAG_RATIO = 0.0036; // px → rad

// Les cartes gardent une hauteur commune mais épousent le ratio de la photo,
// borné entre portrait 3/4 et 16/9 : un panorama s'affiche en carte large au
// lieu d'être rogné dans un cadre vertical (le format complet reste visible
// dans la lightbox et sur la page /photos).
function cardRatio(p) {
  if (!(p.w > 0 && p.h > 0)) return 3 / 4;
  return Math.min(Math.max(p.w / p.h, 3 / 4), 16 / 9);
}

// Manège de photos : les cartes tournent en rond, celle qui passe devant
// grossit et s'éclaire. Le rendu est piloté par requestAnimationFrame et
// écrit directement dans le DOM (aucun re-render par frame). Pause au
// survol, rotation manuelle au glisser (avec inertie), clic pour agrandir.
export function PhotoCarousel({ photos, acc, onOpen }) {
  const wrapRef = useRef(null);
  const cardRefs = useRef([]);
  const st = useRef({
    angle: 0, vel: 0, instVel: 0,
    dragging: false, lastX: 0, moved: 0,
    hovered: false, last: 0, raf: 0,
  });
  const [hovIdx, setHovIdx] = useState(-1);
  const n = photos.length;

  useEffect(() => {
    const s = st.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const layout = () => {
      const w = wrapRef.current?.clientWidth || 900;
      const radius = Math.min(w * 0.4, 420);
      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const theta = s.angle + (i * Math.PI * 2) / n;
        const depth = (Math.cos(theta) + 1) / 2; // 0 = derrière, 1 = devant
        const x = Math.sin(theta) * radius;
        el.style.transform =
          `translate(-50%,-50%) translateX(${x.toFixed(1)}px) scale(${(0.6 + depth * 0.52).toFixed(3)})`;
        el.style.opacity = (0.3 + depth * 0.7).toFixed(3);
        el.style.zIndex = String(1 + Math.round(depth * 100));
      }
    };

    const tick = (now) => {
      const dt = Math.min((now - (s.last || now)) / 1000, 0.05);
      s.last = now;
      if (!s.dragging) {
        const base = s.hovered || reduced ? 0 : BASE_SPEED;
        s.angle += (base + s.vel) * dt;
        s.vel *= Math.exp(-2.6 * dt); // l'inertie du glisser s'amortit
      }
      layout();
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.raf);
  }, [n]);

  const onPointerDown = (e) => {
    const s = st.current;
    s.dragging = true;
    s.lastX = e.clientX;
    s.moved = 0;
    s.vel = 0;
    s.instVel = 0;
    if (wrapRef.current) wrapRef.current.style.cursor = 'grabbing';
    const move = (ev) => {
      if (!s.dragging) return;
      const dx = ev.clientX - s.lastX;
      s.lastX = ev.clientX;
      s.moved += Math.abs(dx);
      s.angle += dx * DRAG_RATIO;
      s.instVel = dx * DRAG_RATIO * 60;
    };
    const up = () => {
      s.dragging = false;
      s.vel = Math.max(-2.5, Math.min(2.5, s.instVel));
      if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onMouseEnter={() => { st.current.hovered = true; }}
      onMouseLeave={() => { st.current.hovered = false; }}
      {...protectProps}
      style={{
        position: 'relative',
        height: 'clamp(300px, 48vw, 440px)',
        cursor: 'grab',
        touchAction: 'pan-y',
        userSelect: 'none',
      }}
    >
      {photos.map((p, i) => (
        <div
          key={p.id ?? p.url}
          ref={(el) => { cardRefs.current[i] = el; }}
          className="photo-card"
          data-interactive
          role="button"
          tabIndex={0}
          aria-label={p.alt || `Photographie ${i + 1}`}
          onClick={() => { if (st.current.moved <= 8) onOpen(i); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(i); } }}
          onMouseEnter={() => setHovIdx(i)}
          onMouseLeave={() => setHovIdx(-1)}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            height: 'clamp(226px, 34vw, 360px)', aspectRatio: String(cardRatio(p)),
            borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
            border: `1px solid ${hovIdx === i ? acc.hex + '55' : 'var(--border)'}`,
            background: 'var(--surface)',
            boxShadow: '0 20px 48px rgba(80,40,160,0.18)',
            transition: 'border-color 0.32s cubic-bezier(.22,1,.36,1)',
            willChange: 'transform, opacity',
          }}
        >
          <img
            src={p.url}
            alt={p.alt || ''}
            loading={i < 4 ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              ...protectedImgStyle,
            }}
          />
          <Signature strong={hovIdx === i} />
        </div>
      ))}
    </div>
  );
}

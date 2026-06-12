import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACCENTS } from '../../data/constants';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

const SIGNATURE = '© Baptiste Niszczota';

// Images are display-only: no context menu, no drag, no selection, and the
// <img> itself never receives pointer events (clicks land on the card).
const protectProps = {
  onContextMenu: (e) => e.preventDefault(),
  onDragStart: (e) => e.preventDefault(),
};

const protectedImgStyle = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitUserDrag: 'none',
  WebkitTouchCallout: 'none',
  pointerEvents: 'none',
};

function Signature({ strong }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute', bottom: 10, right: 14, zIndex: 2,
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 500,
        letterSpacing: '0.6px',
        color: `rgba(255,255,255,${strong ? 0.75 : 0.42})`,
        textShadow: '0 1px 8px rgba(0,0,0,0.55)',
        pointerEvents: 'none', userSelect: 'none',
        transition: 'color 0.32s ease',
      }}
    >
      {SIGNATURE}
    </span>
  );
}

export function Photos({ t, accent, items = [] }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const [filter, setFilter] = useState('all');
  const [lightbox, setLightbox] = useState(-1);

  const categories = useMemo(
    () => [...new Set(items.map((p) => p.category).filter(Boolean))],
    [items],
  );
  const vis = filter === 'all' ? items : items.filter((p) => p.category === filter);

  // The lightbox indexes into the filtered list — close it when that changes.
  useEffect(() => { setLightbox(-1); }, [filter]);

  return (
    <Section id="photos">
      <SectionHeader title={t.photos.title} subtitle={t.photos.subtitle} accent={accent} />

      {categories.length > 0 && (
        <div className="reveal" style={{ display: 'flex', gap: 8, marginBottom: 44, flexWrap: 'wrap' }}>
          {['all', ...categories].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                background: filter === k ? acc.hex : 'var(--filter-bg)',
                color: filter === k ? '#08051a' : 'var(--text-faint)',
                border: `1px solid ${filter === k ? acc.hex : 'var(--border)'}`,
                borderRadius: 20, padding: '6px 18px', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 13,
                fontWeight: filter === k ? 700 : 400,
                transition: 'all 0.2s', backdropFilter: 'blur(8px)',
              }}
            >
              {k === 'all' ? t.photos.all : k}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div
          className="reveal"
          style={{
            border: '1px dashed var(--border)', borderRadius: 14,
            padding: '52px 20px', textAlign: 'center',
            color: 'var(--text-faint)', fontFamily: "'Inter',sans-serif", fontSize: 13.5,
          }}
        >
          ◎ {t.photos.empty}
        </div>
      ) : (
        <div className="r-grid-photos">
          {vis.map((p, i) => (
            <PhotoCard key={p.id ?? p.url} p={p} acc={acc} index={i} onOpen={() => setLightbox(i)} />
          ))}
        </div>
      )}

      {lightbox >= 0 && vis[lightbox] && (
        <PhotoLightbox
          photos={vis}
          index={lightbox}
          setIndex={setLightbox}
          onClose={() => setLightbox(-1)}
          acc={acc}
        />
      )}
    </Section>
  );
}

function PhotoCard({ p, acc, index, onOpen }) {
  const [hov, setHov] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const cardRef = useRef(null);
  const rafRef = useRef(0);

  // Gentle 3D tilt following the cursor — written straight to the DOM (no
  // re-render per mousemove) and skipped on touch devices.
  const onMove = (e) => {
    const el = cardRef.current;
    if (!el || window.matchMedia('(pointer: coarse)').matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      el.style.transform =
        `perspective(900px) rotateX(${(-y * 3.5).toFixed(2)}deg) rotateY(${(x * 4.5).toFixed(2)}deg) translateY(-5px) scale(1.012)`;
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(rafRef.current);
    if (cardRef.current) cardRef.current.style.transform = '';
    setHov(false);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const ratio = p.w > 0 && p.h > 0 ? `${p.w} / ${p.h}` : undefined;

  return (
    <div className="reveal photo-reveal" style={{ transitionDelay: `${(index % 9) * 0.06}s` }}>
      <div
        ref={cardRef}
        className="photo-card"
        data-interactive
        role="button"
        tabIndex={0}
        aria-label={p.alt || `Photographie ${index + 1}`}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        onMouseEnter={() => setHov(true)}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        {...protectProps}
        style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 14, cursor: 'pointer',
          border: `1px solid ${hov ? acc.hex + '55' : 'var(--border)'}`,
          background: 'var(--surface)',
          boxShadow: hov ? '0 20px 48px rgba(80,40,160,0.18)' : 'none',
          transition: 'transform 0.32s cubic-bezier(.22,1,.36,1), box-shadow 0.32s cubic-bezier(.22,1,.36,1), border-color 0.32s cubic-bezier(.22,1,.36,1)',
          aspectRatio: ratio,
        }}
      >
        <img
          src={p.url}
          alt={p.alt || ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%', height: ratio ? '100%' : 'auto',
            objectFit: 'cover', display: 'block',
            transform: hov ? 'scale(1.055)' : 'none',
            opacity: loaded ? 1 : 0,
            transition: 'transform 0.85s cubic-bezier(.22,1,.36,1), opacity 0.5s ease',
            ...protectedImgStyle,
          }}
        />
        <Signature strong={hov} />
      </div>
    </div>
  );
}

function PhotoLightbox({ photos, index, setIndex, onClose, acc }) {
  // dir: 0 on open (zoom in), ±1 when navigating (slide from the side)
  const [dir, setDir] = useState(0);
  const touchX = useRef(null);
  const p = photos.at(index);

  const go = useCallback((d) => {
    setDir(d);
    setIndex((i) => (i + d + photos.length) % photos.length);
  }, [photos.length, setIndex]);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = prev; };
  }, [go, onClose]);

  // Preload neighbours so prev/next feels instant.
  useEffect(() => {
    [1, -1].forEach((d) => {
      const n = photos.at((index + d + photos.length) % photos.length);
      if (n?.url) { const im = new Image(); im.src = n.url; }
    });
  }, [index, photos]);

  if (!p) return null;

  const navBtn = {
    background: 'rgba(10,6,24,0.55)', border: '1px solid rgba(255,255,255,0.14)',
    color: 'rgba(255,255,255,0.85)', borderRadius: '50%',
    width: 44, height: 44, cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)', transition: 'all 0.2s',
  };
  const navHover = (e) => { e.currentTarget.style.borderColor = acc.hex; e.currentTarget.style.color = acc.hex; };
  const navOut = (e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; };

  return createPortal(
    <div
      onClick={onClose}
      {...protectProps}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 48 && photos.length > 1) go(dx < 0 ? 1 : -1);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={p.alt || 'Photographie'}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2,1,10,0.88)',
        backdropFilter: 'blur(16px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 'clamp(8px, 2vw, 24px)', padding: 'clamp(10px, 3vw, 32px)',
        animation: 'photoLightboxIn 0.3s ease both',
        userSelect: 'none',
      }}
    >
      {photos.length > 1 && (
        <button
          aria-label="Photo précédente"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          onMouseEnter={navHover} onMouseLeave={navOut}
          style={navBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <figure
        key={index}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', margin: 0, minWidth: 0,
          animation: `${dir === 0 ? 'photoZoomIn 0.38s' : dir > 0 ? 'photoSlideL 0.34s' : 'photoSlideR 0.34s'} cubic-bezier(.22,1,.36,1) both`,
        }}
      >
        <img
          src={p.url}
          alt={p.alt || ''}
          draggable={false}
          style={{
            maxWidth: '100%', maxHeight: '84vh', display: 'block',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
            ...protectedImgStyle,
          }}
        />
        <Signature strong />
      </figure>

      {photos.length > 1 && (
        <button
          aria-label="Photo suivante"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          onMouseEnter={navHover} onMouseLeave={navOut}
          style={navBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <button
        aria-label="Fermer"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onMouseEnter={navHover} onMouseLeave={navOut}
        style={{ ...navBtn, position: 'absolute', top: 18, right: 18, width: 38, height: 38 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>

      {photos.length > 1 && (
        <span
          style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5,
            color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px',
            pointerEvents: 'none',
          }}
        >
          {String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
        </span>
      )}
    </div>,
    document.body,
  );
}

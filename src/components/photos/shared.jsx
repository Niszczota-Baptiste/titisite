import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const SIGNATURE = '© Baptiste Niszczota';

// Images are display-only: no context menu, no drag, no selection, and the
// <img> itself never receives pointer events (clicks land on the card).
export const protectProps = {
  onContextMenu: (e) => e.preventDefault(),
  onDragStart: (e) => e.preventDefault(),
};

export const protectedImgStyle = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitUserDrag: 'none',
  WebkitTouchCallout: 'none',
  pointerEvents: 'none',
};

export function Signature({ strong }) {
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

export function PhotoLightbox({ photos, index, setIndex, onClose, acc }) {
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
        <button type="button"
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
        <button type="button"
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

      <button type="button"
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

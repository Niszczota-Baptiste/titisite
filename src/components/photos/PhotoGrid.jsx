import { useEffect, useMemo, useRef, useState } from 'react';
import { PhotoLightbox, protectProps, protectedImgStyle, Signature } from './shared';

// Masonry gallery with category filters and lightbox. Used by the /photos
// page (full gallery) and as the section fallback when the carousel doesn't
// make sense (fewer than 3 photos). Panoramas (ratio ≥ 2:1) break out of the
// columns and span the full width — squeezed into a column they'd become a
// sliver.
const PANO_RATIO = 2;
const isPano = (p) => p.w > 0 && p.h > 0 && p.w / p.h >= PANO_RATIO;

export function PhotoGrid({ items = [], t, acc }) {
  const [filter, setFilter] = useState('all');
  const [lightbox, setLightbox] = useState(-1);

  const categories = useMemo(
    () => [...new Set(items.map((p) => p.category).filter(Boolean))],
    [items],
  );
  const vis = filter === 'all' ? items : items.filter((p) => p.category === filter);

  // Blocs alternés : suites de photos normales (colonnes masonry) et
  // panoramas pleine largeur, dans l'ordre d'origine.
  const blocks = useMemo(() => {
    const out = [];
    vis.forEach((p, idx) => {
      if (isPano(p)) {
        out.push({ pano: { p, idx } });
      } else {
        const last = out[out.length - 1];
        if (last?.run) last.run.push({ p, idx });
        else out.push({ run: [{ p, idx }] });
      }
    });
    return out;
  }, [vis]);

  // The lightbox indexes into the filtered list — close it when that changes.
  useEffect(() => { setLightbox(-1); }, [filter]);

  return (
    <>
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

      {blocks.map((b, bi) =>
        b.pano ? (
          <div key={b.pano.p.id ?? b.pano.p.url} style={{ marginBottom: 18 }}>
            <PhotoCard p={b.pano.p} acc={acc} index={b.pano.idx} onOpen={() => setLightbox(b.pano.idx)} />
          </div>
        ) : (
          <div key={`run-${bi}`} className="r-grid-photos">
            {b.run.map(({ p, idx }) => (
              <PhotoCard key={p.id ?? p.url} p={p} acc={acc} index={idx} onOpen={() => setLightbox(idx)} />
            ))}
          </div>
        ),
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
    </>
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

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const TYPE_LABEL = { screenshot: 'Screenshot', schema: 'Schéma', carte: 'Carte' };

// Full-screen media viewer with caption + keyboard navigation. `items` is the
// flat ordered list of every media in the work so prev/next sweeps the whole
// reading view, `index` is the one to show.
export function Lightbox({ items, index, onClose, onNavigate }) {
  const has = index != null && items[index];

  const go = useCallback((d) => {
    const n = (index + d + items.length) % items.length;
    onNavigate(n);
  }, [index, items.length, onNavigate]);

  useEffect(() => {
    if (!has) return undefined;
    const fn = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = prev; };
  }, [has, go, onClose]);

  if (!has) return null;
  const item = items[index];

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(2,1,10,0.92)',
        backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <button type="button" onClick={onClose} aria-label="Fermer" style={btn('top: 16px; right: 20px')}>×</button>
      {items.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Précédent" style={btn('left: 16px; top: 50%; transform: translateY(-50%)')}>‹</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Suivant" style={btn('right: 16px; top: 50%; transform: translateY(-50%)')}>›</button>
        </>
      )}
      <img
        src={item.url}
        alt={item.caption || ''}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
      />
      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 16, textAlign: 'center', maxWidth: 680 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: 'rgba(201,168,232,0.7)', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {TYPE_LABEL[item.type] || item.type}{items.length > 1 ? ` · ${index + 1}/${items.length}` : ''}
        </span>
        {item.caption && (
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: 'rgba(214,206,230,0.85)', marginTop: 6, lineHeight: 1.6 }}>{item.caption}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function btn(pos) {
  const style = {
    position: 'absolute', width: 40, height: 40, borderRadius: '50%',
    background: 'rgba(10,4,24,0.7)', border: '1px solid rgba(201,168,232,0.3)',
    color: 'rgba(232,228,248,0.85)', cursor: 'pointer', fontSize: 22, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
  };
  pos.split(';').forEach((rule) => {
    const [k, v] = rule.split(':').map((s) => s.trim());
    if (k && v) style[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  });
  return style;
}

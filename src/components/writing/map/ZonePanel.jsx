import { useEffect, useRef } from 'react';
import { renderMarkdown } from '../markdown';
import { hexToRgb } from '../tokens';

const fmtEpoch = (s) => new Date(s * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Detail side panel of the selected zone. Plain DOM overlaid on the canvas;
// Markdown goes through the in-house XSS-safe renderer, so [[perso:…]] and
// {{kr:…}} tokens work on the map too.
export function ZonePanel({ zone, accent, characters, glossary, onClose, onNavigate }) {
  const rgb = hexToRgb(accent) || '201,168,232';
  const panel = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [zone.id, onClose]);

  const open = () => {
    if (!zone.link) return;
    if (zone.link.startsWith('/')) onNavigate(zone.link);
    else window.open(zone.link, '_blank', 'noopener');
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-label={`Détail de la zone ${zone.title}`}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 30,
        width: 'min(390px, 100%)', overflowY: 'auto', outline: 'none',
        background: 'rgba(9,5,22,0.92)', backdropFilter: 'blur(14px)',
        borderLeft: `1px solid rgba(${rgb},0.3)`,
        animation: 'wmap-slide-in 0.32s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <style>{'@keyframes wmap-slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }'}</style>
      <button
        onClick={onClose}
        aria-label="Fermer le panneau"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 2, width: 32, height: 32,
          background: 'rgba(11,6,32,0.85)', border: `1px solid rgba(${rgb},0.35)`, borderRadius: '50%',
          color: '#ede8f8', cursor: 'pointer', fontSize: 15, lineHeight: 1,
        }}
      >✕</button>

      {zone.coverImage && (
        <div style={{ position: 'relative', height: 170 }}>
          <img src={zone.coverImage} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(9,5,22,0.95))' }} />
        </div>
      )}

      <div style={{ padding: '18px 22px 28px' }}>
        {zone.category && (
          <p style={{ ...mono, fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: `rgba(${rgb},0.85)`, marginBottom: 8 }}>
            {zone.category}
          </p>
        )}
        <h3 style={{ fontFamily: "'Georgia',serif", fontSize: 26, fontWeight: 700, color: '#ede8f8', letterSpacing: '-0.5px', lineHeight: 1.15, marginBottom: 4 }}>
          {zone.title}
        </h3>
        {zone.subtitle && (
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: `rgba(${rgb},0.8)`, marginBottom: 10 }}>{zone.subtitle}</p>
        )}
        {(zone.date || zone.stats?.updatedAt) && (
          <p style={{ ...mono, fontSize: 10.5, color: 'rgba(180,170,200,0.65)', marginBottom: 12 }}>
            {zone.date || `Mis à jour le ${fmtEpoch(zone.stats.updatedAt)}`}
          </p>
        )}

        {zone.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {zone.tags.map((t) => (
              <span key={t} style={{ ...mono, fontSize: 10, color: `rgba(${rgb},0.9)`, border: `1px solid rgba(${rgb},0.3)`, borderRadius: 14, padding: '3px 9px' }}>{t}</span>
            ))}
          </div>
        )}

        {zone.stats && (zone.stats.chapters > 0 || zone.stats.words > 0) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              zone.stats.chapters > 0 && `${zone.stats.chapters} chapitre${zone.stats.chapters > 1 ? 's' : ''}`,
              zone.stats.words > 0 && `${zone.stats.words.toLocaleString('fr-FR')} mots`,
              zone.stats.readingMin > 0 && `≈ ${zone.stats.readingMin} min`,
            ].filter(Boolean).map((s) => (
              <span key={s} style={{ ...mono, fontSize: 10.5, color: 'rgba(200,192,216,0.85)', background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.2)`, borderRadius: 8, padding: '5px 10px' }}>{s}</span>
            ))}
          </div>
        )}

        {zone.description && (
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, lineHeight: 1.75, color: 'rgba(200,192,216,0.9)', marginBottom: 14 }}>
            {zone.description}
          </p>
        )}

        {zone.content && (
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, lineHeight: 1.75, color: 'rgba(200,192,216,0.9)', marginBottom: 18 }}>
            {renderMarkdown(zone.content, { accent, characters, glossary })}
          </div>
        )}

        {zone.link && (
          <button
            onClick={open}
            style={{
              width: '100%', background: `rgba(${rgb},0.14)`, border: `1px solid rgba(${rgb},0.45)`,
              color: accent, borderRadius: 10, padding: '11px 16px', cursor: 'pointer',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${rgb},0.24)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${rgb},0.14)`; }}
          >
            {zone.link.startsWith('/') ? 'Explorer →' : 'Ouvrir le lien ↗'}
          </button>
        )}
      </div>
    </aside>
  );
}

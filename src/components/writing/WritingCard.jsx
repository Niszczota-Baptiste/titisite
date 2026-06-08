import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hexToRgb } from './tokens';

const STATUS_BADGE = {
  wip:     { label: 'WIP', color: '#e8a87c', rgb: '232,168,124' },
  termine: { label: 'Terminé', color: '#9ad4ae', rgb: '154,212,174' },
  brouillon: { label: 'Brouillon', color: 'rgba(180,170,200,0.8)', rgb: '180,170,200' },
};

// A library card for one written work. Same visual grammar as ProjectCard
// (surface, hover lift, accent border) but with a cover image / waveform motif
// header instead of the code snippet.
export function WritingCard({ work }) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  const rgb = hexToRgb(work.accentColor) || '201,168,232';
  const acc = work.accentColor || '#c9a8e8';
  const badge = STATUS_BADGE[work.status];

  return (
    <div
      data-interactive
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => navigate(`/projets/ecriture/${work.slug}`)}
      style={{
        background: hov ? 'var(--surface-hov)' : 'var(--surface)',
        border: `1px solid ${hov ? `rgba(${rgb},0.5)` : 'var(--border)'}`,
        borderRadius: 16, cursor: 'pointer', overflow: 'hidden',
        transition: 'all 0.32s cubic-bezier(.22,1,.36,1)',
        transform: hov ? 'translateY(-5px)' : 'none',
        boxShadow: hov ? `0 20px 48px rgba(${rgb},0.18)` : 'none',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Cover / motif header */}
      <div style={{
        height: 150, position: 'relative', overflow: 'hidden',
        background: work.coverImage ? '#0a0618' : `linear-gradient(135deg, rgba(${rgb},0.22), rgba(${rgb},0.04))`,
        borderBottom: '1px solid var(--border-dim)',
      }}>
        {work.coverImage ? (
          <img src={work.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: hov ? 1 : 0.92, transition: 'opacity 0.3s' }} />
        ) : (
          <CoverMotif rgb={rgb} hov={hov} titleKr={work.titleKr} />
        )}
        {badge && (
          <span style={{
            position: 'absolute', top: 12, right: 12,
            background: `rgba(${badge.rgb},0.14)`, color: badge.color,
            border: `1px solid rgba(${badge.rgb},0.3)`,
            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
            fontFamily: "'Inter',sans-serif", backdropFilter: 'blur(8px)',
          }}>{badge.label}</span>
        )}
      </div>

      <div style={{ padding: '20px 24px 22px' }}>
        <h3 style={{
          fontFamily: "'Georgia',serif", fontSize: 22, fontWeight: 700,
          color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.3px',
          display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
        }}>
          {work.title}
          {work.titleKr && <span style={{ fontSize: 13, color: `rgba(${rgb},0.75)`, fontFamily: "'Inter',sans-serif" }}>{work.titleKr}</span>}
        </h3>
        {work.subtitle && (
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 13.5,
            color: 'var(--text-muted)', lineHeight: 1.6,
          }}>{work.subtitle}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <Waveform rgb={rgb} hov={hov} />
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5,
            color: `rgba(${rgb},0.6)`, letterSpacing: '0.5px',
          }}>lire →</span>
        </div>
      </div>
    </div>
  );
}

function CoverMotif({ rgb, hov, titleKr }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {titleKr && (
        <span style={{
          fontFamily: "'Noto Sans KR','Inter',sans-serif", fontSize: 56, fontWeight: 800,
          color: `rgba(${rgb},${hov ? 0.22 : 0.14})`, transition: 'color 0.4s',
          userSelect: 'none', letterSpacing: 4,
        }}>{titleKr}</span>
      )}
      <div style={{ position: 'absolute', bottom: 16, left: 20, display: 'flex', gap: 3, alignItems: 'flex-end', height: 26 }}>
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} style={{
            width: 2.5, borderRadius: 2, background: `rgb(${rgb})`,
            height: `${20 + Math.sin(i * 0.9) * 18 + (i % 3) * 6}%`,
            opacity: hov ? 0.55 : 0.3, transition: 'opacity 0.4s',
          }} />
        ))}
      </div>
    </div>
  );
}

function Waveform({ rgb, hov }) {
  return (
    <div style={{ display: 'flex', gap: 2.5, alignItems: 'center', height: 16 }}>
      {[3, 6, 4, 8, 5, 7, 3, 5].map((h, i) => (
        <div key={i} style={{
          width: 2.5, borderRadius: 2, background: `rgb(${rgb})`,
          height: h + 4, opacity: hov ? 0.7 : 0.4, transition: 'opacity 0.3s',
        }} />
      ))}
    </div>
  );
}

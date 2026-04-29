import { useState } from 'react';

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) {
    return { r: 201, g: 168, b: 232 };
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function MetricCard({ metric, delay }) {
  return (
    <div
      className="pdp-reveal"
      style={{
        transitionDelay: `${delay}s`,
        background: 'rgba(14,9,28,0.75)',
        border: '1px solid rgba(80,50,130,0.22)',
        borderRadius: 14,
        padding: '22px 20px',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg,${metric.color || '#c9a8e8'},transparent)`,
        }}
      />
      <p style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 38, fontWeight: 800,
        color: metric.color || '#c9a8e8', letterSpacing: '-1px', lineHeight: 1, marginBottom: 6,
      }}>{metric.value}</p>
      <p style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
        color: '#ede8f8', marginBottom: 3,
      }}>{metric.label}</p>
      {metric.sub && (
        <p style={{ fontSize: 12, color: '#5a4870' }}>{metric.sub}</p>
      )}
    </div>
  );
}

export function TechBadge({ tech }) {
  const [hov, setHov] = useState(false);
  const { r, g, b } = hexToRgb(tech.color);
  const color = tech.color || '#c9a8e8';
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? `rgba(${r},${g},${b},0.18)` : `rgba(${r},${g},${b},0.08)`,
        border: `1px solid rgba(${r},${g},${b},${hov ? 0.55 : 0.28})`,
        color,
        fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20,
        transition: 'all 0.2s', cursor: 'default',
        fontFamily: "'JetBrains Mono',monospace",
        boxShadow: hov ? `0 0 12px rgba(${r},${g},${b},0.25)` : 'none',
      }}
    >
      {tech.name}
    </span>
  );
}

export function DetailCard({ label, text, icon, color, delay }) {
  const { r, g, b } = hexToRgb(color);
  return (
    <div
      className="pdp-reveal"
      style={{
        transitionDelay: `${delay}s`,
        background: 'rgba(12,8,26,0.82)',
        border: `1px solid rgba(${r},${g},${b},0.2)`,
        borderRadius: 14,
        padding: '24px 22px',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: 2,
        background: `linear-gradient(90deg,rgba(${r},${g},${b},0.6),transparent)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700,
        }}>{label}</span>
      </div>
      <p style={{
        fontFamily: "'Inter',sans-serif", fontSize: 14,
        color: '#a898c8', lineHeight: 1.75, whiteSpace: 'pre-wrap',
      }}>{text}</p>
    </div>
  );
}

export function OtherCard({ p, lang, onOpen }) {
  const [hov, setHov] = useState(false);
  const typeShort = { web: 'WEB', mobile: 'MOB', experimental: 'EXP' }[p.type] || (p.type || '').toUpperCase().slice(0, 3);
  const typeColor = { EXP: '#c9a8e8', WEB: '#7eb8f7', MOB: '#9ad4ae' }[typeShort] || '#c9a8e8';
  const { r, g, b } = hexToRgb(typeColor);
  const desc = p.tagline || (p.desc?.[lang] || p.desc?.fr || '').slice(0, 90) +
    ((p.desc?.[lang] || p.desc?.fr || '').length > 90 ? '…' : '');
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(22,14,42,0.95)' : 'rgba(12,8,24,0.8)',
        border: `1px solid ${hov ? 'rgba(160,110,220,0.4)' : 'rgba(80,50,130,0.22)'}`,
        borderRadius: 14, padding: 20, cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.28s cubic-bezier(.22,1,.36,1)',
        transform: hov ? 'translateY(-3px)' : 'none',
        boxShadow: hov ? '0 12px 32px rgba(0,0,0,0.4)' : 'none',
        backdropFilter: 'blur(10px)',
        width: '100%', color: 'inherit', fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          background: `rgba(${r},${g},${b},0.12)`,
          border: `1px solid ${typeColor}44`,
          color: typeColor, fontSize: 9, fontWeight: 800,
          padding: '2px 8px', borderRadius: 4, letterSpacing: '1px',
          fontFamily: "'JetBrains Mono',monospace",
        }}>{typeShort}</span>
      </div>
      <h3 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700,
        color: '#ede8f8', marginBottom: 8, letterSpacing: '-0.2px',
      }}>/{p.title}</h3>
      <p style={{ fontSize: 13, color: '#6a5880', lineHeight: 1.6, marginBottom: 14 }}>{desc}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {(p.tags || []).slice(0, 3).map((t) => (
          <span key={t} style={{
            background: 'rgba(60,30,100,0.3)',
            border: '1px solid rgba(100,60,160,0.2)',
            color: '#7060a0', fontSize: 10, fontWeight: 600,
            padding: '2px 8px', borderRadius: 20,
            fontFamily: "'JetBrains Mono',monospace",
          }}>{t}</span>
        ))}
      </div>
      <span style={{
        fontSize: 12, color: hov ? '#c9a8e8' : '#4a3860',
        transition: 'color 0.2s',
      }}>open →</span>
    </button>
  );
}

export function SectionCmd({ cmd, title, trackNum = '01', delay = 0 }) {
  const miniDurs = ['0.55s', '0.8s', '0.6s', '0.7s', '0.5s', '0.75s'];
  return (
    <div className="pdp-reveal" style={{ transitionDelay: `${delay}s`, marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, overflow: 'hidden' }}>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          color: 'rgba(201,168,232,0.28)', fontWeight: 600, minWidth: 20, flexShrink: 0,
        }}>{trackNum}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14, flexShrink: 0 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              width: 2, borderRadius: 1, background: '#c9a8e8',
              opacity: 0.42, minHeight: 2,
              animation: `pdpWave${(i % 4) + 1} ${miniDurs[i]} ${i * 0.06}s ease-in-out infinite alternate`,
            }} />
          ))}
        </div>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          color: 'rgba(201,168,232,0.38)', whiteSpace: 'nowrap', flexShrink: 0,
        }}>{cmd}</span>
        <div style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg,rgba(201,168,232,0.12),transparent)',
          minWidth: 20,
        }} />
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: 'rgba(201,168,232,0.18)', flexShrink: 0,
        }}>∞</span>
      </div>
      <h2 style={{
        fontFamily: "'Space Grotesk',sans-serif",
        fontSize: 'clamp(22px,3vw,34px)', fontWeight: 700,
        color: '#ede8f8', letterSpacing: '-0.8px',
        borderLeft: '3px solid rgba(201,168,232,0.4)',
        paddingLeft: 16,
      }}>{title}</h2>
    </div>
  );
}

export function BrowserShot({ slug, imageUrl, alt }) {
  return (
    <div style={{
      background: 'rgba(8,5,20,0.92)',
      border: '1px solid rgba(120,80,200,0.32)',
      borderRadius: 14, overflow: 'hidden',
      backdropFilter: 'blur(16px)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
    }}>
      <div style={{
        height: 38, background: 'rgba(10,6,24,0.95)',
        borderBottom: '1px solid rgba(60,40,100,0.3)',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#4a3860',
          }}>{slug}.preview</span>
        </div>
        <div style={{ width: 48 }} />
      </div>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', display: 'block', aspectRatio: '16/10', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          aspectRatio: '16/10',
          background: 'linear-gradient(135deg,#0a0d20 0%,#12082a 50%,#0a0e1e 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 3px)',
            pointerEvents: 'none',
          }} />
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: 'rgba(80,50,130,0.2)',
            border: '1px dashed rgba(120,80,200,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>▣</div>
          <p style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            color: 'rgba(201,168,232,0.4)',
          }}>aperçu · {slug}</p>
          <div style={{
            position: 'absolute', bottom: 14, right: 16,
            display: 'flex', alignItems: 'flex-end', gap: 2, height: 20, opacity: 0.3,
          }}>
            {[8, 14, 10, 18, 12, 16, 9, 15].map((h, i) => (
              <div key={i} style={{ width: 2.5, height: h, borderRadius: 2, background: '#c9a8e8' }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { AmbientCanvas, PdpKeyframes } from '../project/detail/Ambient';
import { hexToRgb } from './tokens';

// Shared chrome for every page of the writing space: the ambient orb canvas
// background + a content layer above it. Mirrors ProjectDetailPage so the
// writing space feels like the same site.
export function ReaderShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', position: 'relative', background: '#050511', color: '#ede8f8' }}>
      <PdpKeyframes />
      <AmbientCanvas />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

export function ReaderNav({ crumb, accent = '#c9a8e8', onBack, right }) {
  const rgb = hexToRgb(accent) || '201,168,232';
  return (
    <nav style={{
      height: 52, background: 'rgba(5,5,17,0.88)',
      borderBottom: '1px solid rgba(60,40,100,0.25)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 clamp(16px,4vw,48px)', position: 'sticky', top: 0, zIndex: 50,
    }}>
      <button
        type="button"
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.78 }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.78')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
          {[3, 5, 2, 4, 3].map((h, i) => (
            <div key={i} style={{ width: 2, borderRadius: 1, background: `rgb(${rgb})`, height: h + 2, opacity: 0.55 }} />
          ))}
        </div>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgb(${rgb})` }}>← retour</span>
      </button>
      <span style={{ color: `rgba(${rgb},0.2)`, fontSize: 14 }}>|</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, minWidth: 0 }}>
        <span style={{ color: `rgba(${rgb},0.35)` }}>écriture</span>
        <span style={{ color: `rgba(${rgb},0.18)` }}>/</span>
        <span style={{ color: `rgb(${rgb})`, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{crumb}</span>
      </div>
      <div style={{ flex: 1 }} />
      {right}
      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: '#ede8f8', marginLeft: 12 }}>
        Baptiste<span style={{ color: `rgb(${rgb})` }}>.</span>
      </span>
    </nav>
  );
}

export function NotFound({ label, onBack, backLabel }) {
  return (
    <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <p style={{ fontFamily: "'JetBrains Mono',monospace", color: '#4a3860', fontSize: 14 }}>404 — {label}</p>
      <button onClick={onBack} style={{ background: 'transparent', border: '1px solid rgba(201,168,232,0.35)', color: '#c9a8e8', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace" }}>
        {backLabel || '← retour'}
      </button>
    </div>
  );
}

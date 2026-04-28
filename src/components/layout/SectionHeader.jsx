import { ACCENTS } from '../../data/constants';

export function SectionHeader({ title, subtitle, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  return (
    <div className="reveal" style={{ marginBottom: 58 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <div
          style={{
            width: 24, height: 2,
            background: `linear-gradient(90deg,${acc.hex},transparent)`,
            flexShrink: 0,
          }}
        />
        <h2
          style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: 'clamp(30px,4vw,50px)',
            fontWeight: 700, letterSpacing: '-1.2px', color: 'var(--text)',
          }}
        >
          {title}
        </h2>
      </div>
      {subtitle && (
        <p
          style={{
            fontFamily: "'Inter',sans-serif", fontSize: 14.5,
            color: 'var(--text-faint)', paddingLeft: 40,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

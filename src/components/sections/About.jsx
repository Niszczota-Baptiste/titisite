import { ACCENTS } from '../../data/constants';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

export function About({ t, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  return (
    <Section id="about">
      <SectionHeader title={t.about.title} accent={accent} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 80, alignItems: 'start' }}>
        <div className="reveal">
          <div
            style={{
              borderRadius: 22, overflow: 'hidden', position: 'relative',
              border: '1px solid var(--border)',
              boxShadow: `0 0 80px rgba(${acc.rgb},0.1)`,
            }}
          >
            <img
              src="/uploads/photo-1776888150170.jpg"
              alt="Baptiste Niszczota"
              loading="lazy"
              decoding="async"
              style={{ width: '100%', display: 'block', filter: 'saturate(0.82) contrast(1.04)' }}
            />
            <div
              style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(160deg,rgba(${acc.rgb},0.07) 0%,transparent 55%)`,
              }}
            />
          </div>
        </div>
        <div className="reveal" style={{ transitionDelay: '0.15s', paddingTop: 8 }}>
          <p
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: 15.5,
              color: 'var(--text-muted)', lineHeight: 1.9,
              marginBottom: 32, fontWeight: 300,
            }}
          >
            {t.about.bio}
          </p>
          <p
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: 14,
              color: 'var(--text-faint)', lineHeight: 1.8, marginBottom: 40,
              fontStyle: 'italic',
              borderLeft: `2px solid ${acc.hex}`, paddingLeft: 16,
            }}
          >
            {t.about.mindset}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 48 }}>
            {t.about.traits.map((tr) => (
              <span
                key={tr}
                style={{
                  background: 'var(--tag-bg)',
                  border: `1px solid rgba(${acc.rgb},0.28)`,
                  color: acc.hex, fontSize: 13, fontWeight: 500,
                  padding: '7px 18px', borderRadius: 20,
                  fontFamily: "'Inter',sans-serif",
                }}
              >
                {tr}
              </span>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 28 }}>
            <p
              style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700,
                color: acc.hex, letterSpacing: '1.5px', textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              {t.about.vision}
            </p>
            <p
              style={{
                fontFamily: "'Inter',sans-serif", fontSize: 15,
                color: 'var(--text-faint)', lineHeight: 1.8, fontStyle: 'italic',
              }}
            >
              {t.about.visionText}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

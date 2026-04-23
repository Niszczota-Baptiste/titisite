import { ACCENTS } from '../../data/constants';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

export function Education({ t, lang, accent, items = [] }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  return (
    <Section id="education" bg="var(--section-alt)">
      <SectionHeader title={t.education.title} accent={accent} />
      <div style={{ position: 'relative', paddingLeft: 44 }}>
        <div
          style={{
            position: 'absolute', left: 8, top: 0, bottom: 0, width: 1,
            background: 'linear-gradient(to bottom,var(--border) 80%,transparent)',
          }}
        />
        {items.map((e, i) => (
          <div
            key={i}
            className="reveal"
            style={{ transitionDelay: `${i * 0.1}s`, position: 'relative', marginBottom: 48 }}
          >
            <div
              style={{
                position: 'absolute', left: -40, top: 4,
                width: 12, height: 12, borderRadius: '50%',
                background: acc.hex, boxShadow: `0 0 16px rgba(${acc.rgb},0.55)`,
              }}
            />
            <p
              style={{
                fontFamily: 'monospace', fontSize: 12,
                color: acc.hex, letterSpacing: '1px', marginBottom: 8,
              }}
            >
              {e.year}
            </p>
            <h3
              style={{
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 18,
                fontWeight: 600, color: 'var(--text)', marginBottom: 5,
              }}
            >
              {e.degree[lang]}
            </h3>
            <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: 'var(--text-faint)' }}>
              {e.school}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

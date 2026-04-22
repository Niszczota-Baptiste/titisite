import { ACCENTS } from '../../data/constants';
import { experience } from '../../data/experience';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

export function Experience({ t, lang, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  return (
    <Section id="experience">
      <SectionHeader title={t.experience.title} accent={accent} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {experience.map((e, i) => (
          <div
            key={i}
            className="reveal"
            style={{
              transitionDelay: `${i * 0.1}s`,
              background: e.current ? 'var(--exp-current)' : 'var(--exp-default)',
              border: `1px solid ${e.current ? acc.hex + '44' : 'var(--border)'}`,
              borderRadius: 16, padding: '28px 32px',
              position: 'relative', overflow: 'hidden',
              backdropFilter: 'blur(10px)',
            }}
          >
            {e.current && (
              <div
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                  background: `linear-gradient(90deg,${acc.hex},rgba(${acc.rgb},0.2),transparent)`,
                }}
              />
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                flexWrap: 'wrap', gap: 12, marginBottom: 16,
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 20,
                    fontWeight: 700, color: 'var(--text)', marginBottom: 5,
                    letterSpacing: '-0.3px',
                  }}
                >
                  {e.company}
                </h3>
                <p
                  style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 14,
                    color: e.current ? acc.hex : 'var(--text-muted)',
                  }}
                >
                  {e.role[lang]}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p
                  style={{
                    fontFamily: 'monospace', fontSize: 12,
                    color: 'var(--text-faint)', letterSpacing: '0.5px',
                  }}
                >
                  {e.period}
                </p>
                {e.current && (
                  <span
                    style={{
                      background: `rgba(${acc.rgb},0.12)`, color: acc.hex,
                      fontSize: 10.5, fontWeight: 700, padding: '3px 10px',
                      borderRadius: 20, letterSpacing: '0.5px',
                      display: 'inline-block', marginTop: 6,
                    }}
                  >
                    {t.experience.current}
                  </span>
                )}
              </div>
            </div>
            <p
              style={{
                fontFamily: "'Inter',sans-serif", fontSize: 14,
                color: 'var(--text-muted)', lineHeight: 1.75,
                marginBottom: e.outcomes ? 16 : 0,
              }}
            >
              {e.desc[lang]}
            </p>
            {e.outcomes && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {e.outcomes.map((o, j) => (
                  <span
                    key={j}
                    style={{
                      background: `rgba(${acc.rgb},0.08)`,
                      border: `1px solid rgba(${acc.rgb},0.2)`,
                      color: acc.hex, fontSize: 12, fontWeight: 500,
                      padding: '4px 12px', borderRadius: 20,
                      fontFamily: "'Inter',sans-serif",
                    }}
                  >
                    {o[lang]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

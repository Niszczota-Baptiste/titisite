import { useEffect, useState } from 'react';
import { ACCENTS } from '../../data/constants';
import { currently } from '../../data/currently';

export function CurrentlyBuilding({ lang, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const [dots, setDots] = useState('...');

  useEffect(() => {
    const frames = ['.', '..', '...', '....'];
    let i = 0;
    const iv = setInterval(() => {
      i = (i + 1) % frames.length;
      setDots(frames[i]);
    }, 500);
    return () => clearInterval(iv);
  }, []);

  const item = currently[0];
  if (!item) return null;

  return (
    <section id="current" style={{ padding: '0 0 80px' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 80px' }}>
        <div
          className="reveal"
          style={{
            background: 'var(--surface)',
            border: `1px solid ${acc.hex}33`,
            borderRadius: 16, padding: '28px 32px',
            backdropFilter: 'blur(12px)',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg,${acc.hex},rgba(${acc.rgb},0.15),transparent)`,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: acc.hex, boxShadow: `0 0 12px rgba(${acc.rgb},0.7)`,
                animation: 'livePulse 1.5s ease-in-out infinite',
              }}
            />
            <p
              style={{
                fontFamily: "'Inter',sans-serif", fontSize: 11,
                color: acc.hex, letterSpacing: '2px', textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {lang === 'ko' ? '진행 중' : lang === 'en' ? `In progress${dots}` : `En cours${dots}`}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center' }}>
            <div>
              <h3
                style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 22,
                  fontWeight: 700, color: 'var(--text)', marginBottom: 8,
                  letterSpacing: '-0.3px',
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 14,
                  color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16,
                }}
              >
                {item.desc[lang]}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {item.stack.map((s) => (
                  <span
                    key={s}
                    style={{
                      background: 'var(--tag-bg)',
                      border: '1px solid var(--tag-border)',
                      color: 'var(--tag-color)',
                      fontSize: 11, fontWeight: 500,
                      padding: '3px 9px', borderRadius: 20,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 100 }}>
              <div
                style={{
                  width: 72, height: 72, borderRadius: '50%',
                  border: '2px solid var(--border)', position: 'relative',
                  margin: '0 auto 10px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg style={{ position: 'absolute', inset: 0 }} viewBox="0 0 72 72" fill="none">
                  <circle cx="36" cy="36" r="32" stroke="var(--border-dim)" strokeWidth="2" />
                  <circle
                    cx="36" cy="36" r="32"
                    stroke={acc.hex} strokeWidth="2" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 32}`}
                    strokeDashoffset={`${2 * Math.PI * 32 * (1 - item.progress / 100)}`}
                    transform="rotate(-90 36 36)"
                    style={{ filter: `drop-shadow(0 0 4px rgba(${acc.rgb},0.6))` }}
                  />
                </svg>
                <span
                  style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                    fontWeight: 700, color: acc.hex,
                  }}
                >
                  {item.progress}%
                </span>
              </div>
              <p
                style={{
                  fontFamily: 'monospace', fontSize: 10,
                  color: 'var(--text-faint)', letterSpacing: '0.5px',
                }}
              >
                {item.since}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

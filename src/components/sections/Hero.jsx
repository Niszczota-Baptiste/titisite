import { ACCENTS } from '../../data/constants';
import { useMagnetic } from '../../hooks/useMagnetic';
import { CodeCanvas } from '../ambient/CodeCanvas';
import { GlitchText } from '../ui/GlitchText';

export function Hero({ t, lang, accent, mode }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const ff = lang === 'ko'
    ? "'Noto Sans KR','Space Grotesk',sans-serif"
    : "'Space Grotesk',sans-serif";
  const btn1 = useMagnetic(0.28);
  const btn2 = useMagnetic(0.28);
  const scroll = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section
      id="hero"
      style={{
        position: 'relative',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <CodeCanvas accent={accent} />
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom,rgba(5,5,17,0.08) 0%,rgba(5,5,17,0.7) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 70% 60% at 18% 50%,rgba(80,40,160,0.12) 0%,transparent 70%)',
        }}
      />

      <div style={{ position: 'relative', padding: '0 88px', maxWidth: 980 }}>
        <p
          style={{
            fontFamily: "'Inter',sans-serif", fontSize: 13, color: acc.hex,
            letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 22,
            animation: 'fadeUp 0.7s ease both', animationDelay: '0.1s',
          }}
        >
          {t.hero.greeting}
        </p>
        <h1
          style={{
            fontFamily: ff, fontSize: 'clamp(52px,7.5vw,100px)', fontWeight: 700,
            lineHeight: 1.04, letterSpacing: '-2.5px', color: 'var(--text)',
            marginBottom: 18, animation: 'fadeUp 0.7s ease both', animationDelay: '0.25s',
          }}
        >
          Niszczota
          <br />
          <GlitchText
            text="Baptiste"
            accent={accent}
            gradient={`linear-gradient(120deg,var(--text) 30%,${acc.hex})`}
          />
          <span style={{ color: acc.hex, WebkitTextFillColor: acc.hex }}>.</span>
        </h1>
        <p
          style={{
            fontFamily: ff, fontSize: 'clamp(17px,2.2vw,26px)', fontWeight: 300,
            color: 'var(--text-muted)', marginBottom: 14,
            animation: 'fadeUp 0.7s ease both', animationDelay: '0.4s',
          }}
        >
          {t.hero.tagline}
        </p>
        <p
          style={{
            fontFamily: "'Inter',sans-serif", fontSize: 13,
            color: 'var(--text-faint)', letterSpacing: '0.5px', marginBottom: 56,
            animation: 'fadeUp 0.7s ease both', animationDelay: '0.5s',
          }}
        >
          {t.hero.role}
        </p>
        <div
          style={{
            display: 'flex', gap: 14,
            animation: 'fadeUp 0.7s ease both', animationDelay: '0.65s',
          }}
        >
          <button
            ref={btn1}
            onClick={() => scroll('projects')}
            style={{
              background: acc.hex,
              color: mode === 'light' ? '#fff' : '#08051a',
              border: 'none', borderRadius: 10, padding: '13px 30px',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
              cursor: 'pointer', transition: 'box-shadow 0.25s,transform 0.18s',
              letterSpacing: '-0.2px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 8px 28px rgba(${acc.rgb},0.4)`)}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
          >
            {t.hero.cta1}
          </button>
          <button
            ref={btn2}
            onClick={() => scroll('contact')}
            style={{
              background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 10, padding: '13px 30px',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.22s', backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = acc.hex;
              e.currentTarget.style.color = acc.hex;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text)';
            }}
          >
            {t.hero.cta2}
          </button>
        </div>
      </div>
      <div
        style={{
          position: 'absolute', bottom: 36, left: '50%',
          transform: 'translateX(-50%)',
          animation: 'float 2.6s ease-in-out infinite', opacity: 0.4,
        }}
      >
        <svg width="18" height="28" viewBox="0 0 18 28" fill="none">
          <rect x="1" y="1" width="16" height="26" rx="8" stroke="var(--text-faint)" strokeWidth="1.2" />
          <rect x="7.5" y="5" width="3" height="7" rx="1.5" fill="var(--text-faint)">
            <animate attributeName="y" values="5;14;5" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0;1" dur="1.8s" repeatCount="indefinite" />
          </rect>
        </svg>
      </div>
    </section>
  );
}

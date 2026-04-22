import { useEffect, useState } from 'react';
import { ACCENTS } from '../../data/constants';

export function EasterEgg({ visible, onClose, accent }) {
  const [stage, setStage] = useState(0);
  const acc = ACCENTS[accent] || ACCENTS.violet;

  useEffect(() => {
    if (!visible) {
      setStage(0);
      return;
    }
    const t1 = setTimeout(() => setStage(1), 600);
    const t2 = setTimeout(() => setStage(2), 1800);
    const t3 = setTimeout(() => setStage(3), 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [visible]);

  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  if (!visible) return null;

  const jamo = [
    { char: 'ㅎ', label: 'h', desc: 'aspirée' },
    { char: 'ㅏ', label: 'a', desc: 'voyelle' },
    { char: 'ㄴ', label: 'n', desc: 'nasale' },
  ];

  return (
    <div
      onClick={stage >= 3 ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2,1,10,0.98)', backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        animation: 'easterSlide 0.65s cubic-bezier(.22,1,.36,1) both',
        cursor: stage >= 3 ? 'pointer' : 'default',
      }}
    >
      {[200, 340, 500, 700].map((sz) => (
        <div
          key={sz}
          style={{
            position: 'absolute', width: sz, height: sz, borderRadius: '50%',
            border: `1px solid rgba(${acc.rgb},${0.1 - sz / 10000})`,
            pointerEvents: 'none',
            animation: `${sz % 2 === 0 ? 'spinCw' : 'spinCcw'} ${22 + sz / 80}s linear infinite`,
          }}
        />
      ))}

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div
          style={{
            fontSize: 'clamp(80px,16vw,140px)', lineHeight: 1,
            marginBottom: stage >= 2 ? 24 : 0,
            textShadow: `0 0 80px rgba(${acc.rgb},0.7)`,
            color: '#ede8f8',
            fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 700,
            transition: 'all 0.6s ease',
            opacity: stage >= 1 ? 1 : 0,
            transform: stage >= 2 ? 'scale(0.65) translateY(-10px)' : 'scale(1)',
          }}
        >
          한
        </div>

        {stage >= 2 && (
          <div
            style={{
              display: 'flex', gap: 24, justifyContent: 'center',
              marginBottom: 28, opacity: stage >= 2 ? 1 : 0,
              transition: 'opacity 0.5s',
            }}
          >
            {jamo.map((j, i) => (
              <div
                key={i}
                style={{ textAlign: 'center', animation: `fadeUp 0.5s ease ${i * 0.12}s both` }}
              >
                <div
                  style={{
                    fontSize: 32, color: acc.hex,
                    fontFamily: "'Noto Sans KR',sans-serif",
                    fontWeight: 700, marginBottom: 4,
                  }}
                >
                  {j.char}
                </div>
                <div
                  style={{
                    fontFamily: 'monospace', fontSize: 11,
                    color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px',
                  }}
                >
                  {j.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {stage >= 3 && (
          <div style={{ opacity: 1, animation: 'fadeUp 0.7s ease both' }}>
            <div
              style={{
                fontFamily: "'Noto Sans KR',sans-serif",
                fontSize: 'clamp(14px,1.8vw,20px)',
                color: '#a898c8', lineHeight: 2.6,
                marginBottom: 32, fontWeight: 300,
              }}
            >
              코드와 음악은
              <br />
              같은 언어를 말한다
              <br />
              <span style={{ color: acc.hex }}>— 바티스트</span>
            </div>
            <p
              style={{
                fontFamily: "'Inter',sans-serif", fontSize: 11,
                color: 'rgba(255,255,255,0.2)', letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              ESC or click to close
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

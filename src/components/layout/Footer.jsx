import { useState } from 'react';
import { ACCENTS } from '../../data/constants';

export function Footer({ t, accent, onEaster }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const [clicks, setClicks] = useState(0);

  const handle = () => {
    const n = clicks + 1;
    setClicks(n);
    if (n >= 3) {
      onEaster();
      setClicks(0);
    }
  };

  return (
    <footer
      style={{
        padding: '36px 80px',
        borderTop: '1px solid var(--border-dim)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <p
        style={{
          fontFamily: "'Inter',sans-serif",
          fontSize: 12,
          color: 'var(--text-faint)',
          opacity: 0.5,
        }}
      >
        © 2024 Baptiste Niszczota — {t.footer.rights}
      </p>
      <span
        title="클릭하세요 :)"
        onClick={handle}
        style={{
          fontFamily: "'Noto Sans KR',sans-serif",
          fontSize: 15,
          color: 'var(--text-faint)',
          opacity: 0.1,
          cursor: 'pointer',
          transition: 'all 0.3s',
          userSelect: 'none',
          filter: 'blur(0.5px)',
        }}
        onMouseEnter={(e) => {
          e.target.style.color = acc.hex;
          e.target.style.opacity = '1';
          e.target.style.textShadow = `0 0 20px rgba(${acc.rgb},0.6)`;
          e.target.style.filter = 'none';
        }}
        onMouseLeave={(e) => {
          e.target.style.color = 'var(--text-faint)';
          e.target.style.opacity = '0.1';
          e.target.style.textShadow = 'none';
          e.target.style.filter = 'blur(0.5px)';
        }}
      >
        한
      </span>
    </footer>
  );
}

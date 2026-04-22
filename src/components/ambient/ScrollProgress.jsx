import { useEffect, useState } from 'react';
import { ACCENTS } from '../../data/constants';

export function ScrollProgress({ accent }) {
  const [pct, setPct] = useState(0);
  const acc = ACCENTS[accent] || ACCENTS.violet;

  useEffect(() => {
    const fn = () =>
      setPct(window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1));
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 200, pointerEvents: 'none' }}>
      <div
        style={{
          height: '100%',
          width: `${pct * 100}%`,
          background: `linear-gradient(90deg,${acc.dim},${acc.hex})`,
          boxShadow: `0 0 10px rgba(${acc.rgb},0.8),0 0 3px rgba(${acc.rgb},1),0 0 22px rgba(${acc.rgb},0.4)`,
          transition: 'width 0.06s linear',
          borderRadius: '0 1px 1px 0',
        }}
      />
    </div>
  );
}

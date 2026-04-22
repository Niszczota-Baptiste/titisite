import { useEffect, useRef } from 'react';
import { ACCENTS } from '../../data/constants';

export function CodeCanvas({ accent }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const chars = '01アイウエ가나다라{}[]<>/\\|+=ABCDEFGHabcdefgh';
    const fs = 12;
    let cols, drops;
    const acc = ACCENTS[accent] || ACCENTS.violet;

    function resize() {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      cols = Math.floor(canvas.offsetWidth / fs);
      drops = Array.from({ length: cols }, () => Math.random() * -80);
    }
    resize();
    window.addEventListener('resize', resize);

    let raf;
    function draw() {
      if (window.__animPaused) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.fillStyle = 'rgba(5,5,17,0.055)';
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      ctx.font = `${fs}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const lit = Math.random() < 0.009;
        ctx.fillStyle = lit
          ? `rgba(${acc.rgb},0.6)`
          : `rgba(80,60,130,${0.1 + Math.random() * 0.1})`;
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, drops[i] * fs);
        if (drops[i] * fs > canvas.offsetHeight && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [accent]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

import { useEffect, useRef } from 'react';
import { SECTION_MOODS } from '../../data/constants';

export function AmbientCanvas({ scrollRef, activeSectionRef, accent, mode }) {
  const canvasRef = useRef(null);
  const stRef = useRef({ accent, mode });

  useEffect(() => {
    stRef.current.accent = accent;
  }, [accent]);
  useEffect(() => {
    stRef.current.mode = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const orbs = [
      { bx: 0.72, by: 0.18, r: 0.55, R: 100, G: 50, B: 220, spd: 0.00028, ph: 0 },
      { bx: 0.12, by: 0.68, r: 0.46, R: 55,  G: 20, B: 170, spd: 0.00022, ph: 2.1 },
      { bx: 0.50, by: 0.90, r: 0.42, R: 150, G: 65, B: 240, spd: 0.00031, ph: 4.2 },
      { bx: 0.88, by: 0.46, r: 0.34, R: 35,  G: 12, B: 140, spd: 0.00019, ph: 1.5 },
      { bx: 0.30, by: 0.30, r: 0.30, R: 80,  G: 30, B: 180, spd: 0.00025, ph: 3.3 },
    ];

    const lerp = { int: 1.0, dft: 1.0, bgR: 5, bgG: 5, bgB: 17 };

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    let raf;
    function draw(ts) {
      if (window.__animPaused) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const W = canvas.width;
      const H = canvas.height;
      const { accent: ac, mode: md } = stRef.current;
      const isLight = md === 'light';
      const section = activeSectionRef?.current || 'hero';
      const mood = SECTION_MOODS[section] || SECTION_MOODS.default;
      const accBoost = ac === 'violet' ? 1.4 : ac === 'amber' ? 1.1 : 0.9;
      const [tbR, tbG, tbB] = isLight ? mood.bgL : mood.bgD;

      const k = 0.022;
      lerp.int += (mood.int - lerp.int) * k;
      lerp.dft += (mood.dft - lerp.dft) * k;
      lerp.bgR += (tbR - lerp.bgR) * k;
      lerp.bgG += (tbG - lerp.bgG) * k;
      lerp.bgB += (tbB - lerp.bgB) * k;

      ctx.fillStyle = `rgb(${lerp.bgR | 0},${lerp.bgG | 0},${lerp.bgB | 0})`;
      ctx.fillRect(0, 0, W, H);

      const scroll = scrollRef?.current || 0;
      const docH = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      const prog = scroll / docH;

      const pulseMult = mood.pulse ? 1 + 0.06 * Math.sin(ts * 0.008) : 1;

      orbs.forEach((o, i) => {
        const driftScale = lerp.dft;
        const drift = 0.068 * driftScale;
        const scrollY = (i % 2 === 0 ? 1 : -1) * prog * 0.18;
        const x = (o.bx + Math.sin(ts * o.spd + o.ph) * drift) * W;
        const y = (o.by + Math.cos(ts * o.spd * 1.3 + o.ph) * drift + scrollY) * H;
        const r = o.r * Math.min(W, H) * lerp.int * pulseMult;

        const alpha = (isLight ? 0.05 : 0.075) * lerp.int * accBoost;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${o.R},${o.G},${o.B},${alpha})`);
        g.addColorStop(0.42, `rgba(${o.R},${o.G},${o.B},${alpha * 0.35})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [scrollRef, activeSectionRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'block',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}

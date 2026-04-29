import { useEffect, useRef } from 'react';

const KEYFRAMES = `
@keyframes pdpFadeUp { from {opacity:0; transform:translateY(20px)} to {opacity:1; transform:none} }
@keyframes pdpBlink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes pdpSlideIn { from{opacity:0; transform:translateX(-12px)} to{opacity:1; transform:none} }
@keyframes pdpWave1 { from{height:3px} to{height:22px} }
@keyframes pdpWave2 { from{height:10px} to{height:5px} }
@keyframes pdpWave3 { from{height:6px} to{height:20px} }
@keyframes pdpWave4 { from{height:4px} to{height:18px} }
.pdp-reveal { opacity:0; transform:translateY(24px); transition:opacity .75s cubic-bezier(.22,1,.36,1), transform .75s cubic-bezier(.22,1,.36,1); }
.pdp-reveal.visible { opacity:1; transform:none; }
`;

export function PdpKeyframes() {
  return <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />;
}

export function useReveal(deps = []) {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.1 },
    );
    document.querySelectorAll('.pdp-reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, deps);
}

export function AmbientCanvas() {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const orbs = [
      { bx: 0.72, by: 0.18, r: 0.55, R: 100, G: 50, B: 220, spd: 0.00028, ph: 0 },
      { bx: 0.12, by: 0.68, r: 0.46, R: 55, G: 20, B: 170, spd: 0.00022, ph: 2.1 },
      { bx: 0.50, by: 0.90, r: 0.42, R: 150, G: 65, B: 240, spd: 0.00031, ph: 4.2 },
      { bx: 0.88, by: 0.46, r: 0.34, R: 35, G: 12, B: 140, spd: 0.00019, ph: 1.5 },
      { bx: 0.30, by: 0.30, r: 0.30, R: 80, G: 30, B: 180, spd: 0.00025, ph: 3.3 },
    ];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    let raf;
    const draw = (ts) => {
      const W = canvas.width, H = canvas.height;
      const bpm = 1 + 0.055 * Math.sin(ts * 0.0087);
      ctx.fillStyle = '#050511';
      ctx.fillRect(0, 0, W, H);
      orbs.forEach((o) => {
        const x = (o.bx + Math.sin(ts * o.spd + o.ph) * 0.07) * W;
        const y = (o.by + Math.cos(ts * o.spd * 1.3 + o.ph) * 0.07) * H;
        const r = o.r * Math.min(W, H) * bpm;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${o.R},${o.G},${o.B},0.078)`);
        g.addColorStop(0.42, `rgba(${o.R},${o.G},${o.B},0.026)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}
    />
  );
}

export function WaveformDeco({ playing = true, color = '#c9a8e8', bars = 28 }) {
  const durs = ['0.6s', '0.8s', '0.55s', '0.75s', '0.65s', '0.9s', '0.7s', '0.5s'];
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 32 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 2.5,
            borderRadius: 2,
            background: color,
            opacity: playing ? 0.5 : 0.12,
            minHeight: 3,
            animation: playing
              ? `pdpWave${(i % 4) + 1} ${durs[i % 8]} ${i * 0.035}s ease-in-out infinite alternate`
              : 'none',
          }}
        />
      ))}
    </div>
  );
}

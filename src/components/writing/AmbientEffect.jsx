import { useEffect, useRef } from 'react';
import { hexToRgb } from './tokens';

// Catalogue of ambient reading-mode effects. Each preset describes a particle
// field drawn on a single full-screen canvas. Kept deliberately light (capped
// counts, one rAF loop, devicePixelRatio ≤ 2) and respectful: it honours
// prefers-reduced-motion and pauses when the tab is hidden.
export const EFFECTS = [
  { value: 'none',      label: 'Aucun' },
  { value: 'petals',    label: 'Pétales (sakura)' },
  { value: 'leaves',    label: 'Feuilles d’automne' },
  { value: 'snow',      label: 'Neige' },
  { value: 'embers',    label: 'Cendres & braises' },
  { value: 'fireflies', label: 'Lucioles' },
];

const PRESETS = {
  petals: {
    count: 26, rise: false,
    colors: ['#f7c8d8', '#f4a6c0', '#ec8fae', '#f9d6e4'],
    size: [6, 13], speed: [18, 38], sway: [14, 34], spin: true, glow: 0,
    draw(ctx, p) {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  leaves: {
    count: 20, rise: false,
    colors: ['#e8a87c', '#d4763c', '#b8542a', '#c9a24a', '#9c6b3a'],
    size: [7, 14], speed: [22, 46], sway: [18, 40], spin: true, glow: 0,
    draw(ctx, p) {
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.quadraticCurveTo(p.size, 0, 0, p.size);
      ctx.quadraticCurveTo(-p.size, 0, 0, -p.size);
      ctx.fill();
    },
  },
  snow: {
    count: 48, rise: false,
    colors: ['#ffffff', '#e8eefc', '#d8e2f5'],
    size: [1.6, 4], speed: [14, 34], sway: [10, 26], spin: false, glow: 2,
    draw(ctx, p) { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); },
  },
  embers: {
    count: 34, rise: true,
    colors: ['#ff8a3c', '#ff6a2c', '#ffb05a', '#9a8f88', '#7d7470'],
    size: [1.4, 3.6], speed: [16, 40], sway: [8, 22], spin: false, glow: 6, flicker: true,
    draw(ctx, p) { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); },
  },
  fireflies: {
    count: 16, rise: false, wander: true,
    colors: ['#d8e87c', '#aee87c', '#e8e07c'],
    size: [1.6, 3.2], speed: [6, 16], sway: [20, 48], spin: false, glow: 8, flicker: true,
    draw(ctx, p) { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); },
  },
};

const rand = (a, b) => a + Math.random() * (b - a);

export function AmbientEffect({ effect = 'none', accent = '#c9a8e8' }) {
  const ref = useRef(null);

  useEffect(() => {
    const preset = PRESETS[effect];
    if (!preset) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const accRgb = hexToRgb(accent) || '201,168,232';
    let W = 0; let H = 0; let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const colorFor = () => {
      // Snow/fireflies tint slightly toward the work accent for cohesion.
      if (effect === 'fireflies' && Math.random() < 0.4) return `rgb(${accRgb})`;
      return preset.colors[(Math.random() * preset.colors.length) | 0];
    };

    const spawn = (seeded) => {
      const size = rand(preset.size[0], preset.size[1]);
      const speed = rand(preset.speed[0], preset.speed[1]);
      return {
        x: rand(0, W),
        // Seeded particles fill the screen at open; new ones enter from an edge.
        y: seeded ? rand(0, H) : (preset.rise ? H + 12 : -12),
        size,
        speed: preset.rise ? -speed : speed,
        sway: rand(preset.sway[0], preset.sway[1]),
        swayPhase: rand(0, Math.PI * 2),
        swaySpeed: rand(0.4, 1.2),
        rot: rand(0, Math.PI * 2),
        vrot: preset.spin ? rand(-1.4, 1.4) : 0,
        color: colorFor(),
        baseAlpha: rand(0.45, 0.9),
        driftX: preset.wander ? rand(-12, 12) : 0,
        driftPhase: rand(0, Math.PI * 2),
      };
    };

    const N = preset.count;
    const parts = Array.from({ length: N }, () => spawn(true));

    let raf; let last = performance.now(); let running = true;
    const onVis = () => { running = !document.hidden; if (running) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener('visibilitychange', onVis);

    function loop(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = preset.glow >= 6 ? 'lighter' : 'source-over';

      const t = now / 1000;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y += p.speed * dt;
        p.x += Math.sin(t * p.swaySpeed + p.swayPhase) * p.sway * dt
             + (p.driftX ? Math.sin(t * 0.5 + p.driftPhase) * p.driftX * dt : 0);
        p.rot += p.vrot * dt;

        // Recycle off-screen particles back to the entry edge.
        if (preset.rise ? p.y < -16 : p.y > H + 16) Object.assign(p, spawn(false));
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;

        let alpha = p.baseAlpha;
        if (preset.flicker) alpha *= 0.55 + 0.45 * Math.abs(Math.sin(t * 2.5 + p.swayPhase));
        // Fade near the top/bottom edge for a soft entrance/exit.
        const edge = preset.rise ? p.y / H : 1 - p.y / H;
        alpha *= Math.max(0.15, Math.min(1, edge * 2.4));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (preset.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = preset.glow; }
        preset.draw(ctx, p);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [effect, accent]);

  if (!PRESETS[effect]) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        zIndex: 3, pointerEvents: 'none',
        animation: 'writingEffectIn 1.6s ease both',
      }}
    />
  );
}

import { useEffect, useRef } from 'react';
import { hexToRgb } from './tokens';

// Catalogue of ambient reading-mode effects. Each is drawn on a single
// full-screen canvas. Kept light (capped counts, one rAF loop, dpr ≤ 2) and
// respectful: honours prefers-reduced-motion and pauses when the tab is hidden.
export const EFFECTS = [
  { value: 'none',      label: 'Aucun' },
  { value: 'petals',    label: 'Pétales (sakura)' },
  { value: 'leaves',    label: 'Feuilles d’automne' },
  { value: 'snow',      label: 'Neige' },
  { value: 'embers',    label: 'Cendres & braises' },
  { value: 'fireflies', label: 'Lucioles' },
  { value: 'notes',     label: 'Notes de musique' },
  { value: 'wind',      label: 'Vent' },
  { value: 'waves',     label: 'Vagues' },
  { value: 'fireworks', label: 'Feu d’artifice' },
];

export const EFFECT_VALUES = EFFECTS.map((e) => e.value);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// ── Particle-field presets (falling/rising/drifting) ─────────────────────────
const PRESETS = {
  petals: {
    count: 26, axis: 'y',
    colors: ['#f7c8d8', '#f4a6c0', '#ec8fae', '#f9d6e4'],
    size: [6, 13], speed: [18, 38], sway: [14, 34], spin: true, glow: 0,
    draw(ctx, p) { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2); ctx.fill(); },
  },
  leaves: {
    count: 20, axis: 'y',
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
    count: 48, axis: 'y',
    colors: ['#ffffff', '#e8eefc', '#d8e2f5'],
    size: [1.6, 4], speed: [14, 34], sway: [10, 26], spin: false, glow: 2,
    draw(ctx, p) { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); },
  },
  embers: {
    count: 34, axis: 'y', rise: true,
    colors: ['#ff8a3c', '#ff6a2c', '#ffb05a', '#9a8f88', '#7d7470'],
    size: [1.4, 3.6], speed: [16, 40], sway: [8, 22], spin: false, glow: 6, flicker: true,
    draw(ctx, p) { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); },
  },
  fireflies: {
    count: 16, axis: 'y', wander: true,
    colors: ['#d8e87c', '#aee87c', '#e8e07c'],
    size: [1.6, 3.2], speed: [6, 16], sway: [20, 48], spin: false, glow: 8, flicker: true,
    draw(ctx, p) { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); },
  },
  notes: {
    count: 16, axis: 'y', rise: true, accentTint: 0.6,
    colors: ['#c9a8e8', '#b58fe0', '#e8d27c'],
    size: [9, 16], speed: [14, 30], sway: [16, 34], spin: false, glow: 4,
    glyphs: ['♪', '♫', '♩', '♬'],
    draw(ctx, p) {
      ctx.font = `${p.size * 2}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.glyph, 0, 0);
    },
  },
  wind: {
    count: 22, axis: 'x', streak: true,
    colors: ['#c9c2da', '#a99fc0', '#d8d2e4'],
    size: [14, 46], speed: [70, 150], sway: [6, 16], spin: false, glow: 0,
    alpha: [0.12, 0.34],
    draw(ctx, p) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-p.size / 2, 0);
      ctx.lineTo(p.size / 2, 0);
      ctx.stroke();
    },
  },
};

function particleRenderer(preset, accent) {
  const accRgb = hexToRgb(accent) || '201,168,232';
  const accColor = `rgb(${accRgb})`;
  let W = 0; let H = 0;
  let parts = [];

  const colorFor = () => {
    if (preset.accentTint && Math.random() < preset.accentTint) return accColor;
    return pick(preset.colors);
  };

  const spawn = (seeded) => {
    const size = rand(preset.size[0], preset.size[1]);
    const speed = rand(preset.speed[0], preset.speed[1]);
    const horiz = preset.axis === 'x';
    return {
      x: horiz ? (seeded ? rand(0, W) : -20) : rand(0, W),
      y: horiz ? rand(0, H) : (seeded ? rand(0, H) : (preset.rise ? H + 12 : -12)),
      size,
      speed: preset.rise ? -speed : speed,
      sway: rand(preset.sway[0], preset.sway[1]),
      swayPhase: rand(0, Math.PI * 2),
      swaySpeed: rand(0.4, 1.2),
      rot: rand(0, Math.PI * 2),
      vrot: preset.spin ? rand(-1.4, 1.4) : 0,
      color: colorFor(),
      glyph: preset.glyphs ? pick(preset.glyphs) : null,
      baseAlpha: preset.alpha ? rand(preset.alpha[0], preset.alpha[1]) : rand(0.45, 0.9),
      driftX: preset.wander ? rand(-12, 12) : 0,
      driftPhase: rand(0, Math.PI * 2),
    };
  };

  return {
    seed(w, h) { W = w; H = h; parts = Array.from({ length: preset.count }, () => spawn(true)); },
    frame(ctx, dt, t) {
      ctx.globalCompositeOperation = preset.glow >= 6 ? 'lighter' : 'source-over';
      const horiz = preset.axis === 'x';
      for (const p of parts) {
        if (horiz) {
          p.x += p.speed * dt;
          p.y += Math.sin(t * p.swaySpeed + p.swayPhase) * p.sway * dt;
        } else {
          p.y += p.speed * dt;
          p.x += Math.sin(t * p.swaySpeed + p.swayPhase) * p.sway * dt
               + (p.driftX ? Math.sin(t * 0.5 + p.driftPhase) * p.driftX * dt : 0);
        }
        p.rot += p.vrot * dt;

        const gone = horiz ? p.x > W + 24 : (preset.rise ? p.y < -16 : p.y > H + 16);
        if (gone) Object.assign(p, spawn(false));
        if (!horiz) { if (p.x < -24) p.x = W + 24; else if (p.x > W + 24) p.x = -24; }

        let alpha = p.baseAlpha;
        if (preset.flicker) alpha *= 0.55 + 0.45 * Math.abs(Math.sin(t * 2.5 + p.swayPhase));
        const edge = horiz
          ? Math.min(p.x / 80, (W - p.x) / 120)
          : (preset.rise ? p.y / H : 1 - p.y / H) * 2.4;
        alpha *= Math.max(0.12, Math.min(1, edge));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (preset.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = preset.glow; }
        preset.draw(ctx, p);
        ctx.restore();
      }
    },
  };
}

// ── Fireworks ────────────────────────────────────────────────────────────────
function fireworksRenderer(accent) {
  const accRgb = hexToRgb(accent) || '201,168,232';
  const palette = [`rgb(${accRgb})`, '#ff8a5c', '#ffd06a', '#7ec8ff', '#ff7eb0', '#9affc0'];
  let W = 0; let H = 0;
  const rockets = []; const sparks = [];
  let cooldown = 0.6;

  const launch = () => {
    const x = rand(W * 0.2, W * 0.8);
    rockets.push({ x, y: H + 6, vy: -rand(H * 0.42, H * 0.6), targetY: rand(H * 0.16, H * 0.42), color: pick(palette) });
  };
  const explode = (x, y, color) => {
    const n = 26 + ((Math.random() * 16) | 0);
    const base = rand(80, 150);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.1, 0.1);
      const sp = base * rand(0.5, 1);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: Math.random() < 0.25 ? pick(palette) : color });
    }
  };

  return {
    seed(w, h) { W = w; H = h; },
    frame(ctx, dt) {
      ctx.globalCompositeOperation = 'lighter';
      cooldown -= dt;
      if (cooldown <= 0) { launch(); cooldown = rand(0.7, 1.7); }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt; r.vy += H * 0.28 * dt;
        ctx.globalAlpha = 0.9; ctx.fillStyle = r.color;
        ctx.shadowColor = r.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2, 0, Math.PI * 2); ctx.fill();
        if (r.y <= r.targetY || r.vy >= 0) { explode(r.x, r.y, r.color); rockets.splice(i, 1); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vy += H * 0.16 * dt; s.vx *= 0.985; s.vy *= 0.985;
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 0.7;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color;
        ctx.shadowColor = s.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    },
  };
}

// ── Waves (calm sea at the bottom of the page) ───────────────────────────────
function wavesRenderer(accent) {
  const accRgb = hexToRgb(accent) || '201,168,232';
  let W = 0; let H = 0;
  const layers = [
    { base: 0.96, amp: 10, len: 320, speed: 26, rgb: '90,150,210', alpha: 0.10 },
    { base: 0.99, amp: 14, len: 440, speed: 18, rgb: accRgb, alpha: 0.12 },
    { base: 1.02, amp: 18, len: 560, speed: 12, rgb: '70,120,190', alpha: 0.14 },
  ];
  return {
    seed(w, h) { W = w; H = h; },
    frame(ctx, dt, t) {
      ctx.globalCompositeOperation = 'source-over';
      for (const L of layers) {
        const y0 = H * L.base;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) {
          const y = y0 - Math.sin((x / L.len) * Math.PI * 2 + t * (L.speed / L.len) * Math.PI * 2) * L.amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = `rgba(${L.rgb},${L.alpha})`;
        ctx.fill();
      }
    },
  };
}

function makeRenderer(effect, accent) {
  if (effect === 'fireworks') return fireworksRenderer(accent);
  if (effect === 'waves') return wavesRenderer(accent);
  if (PRESETS[effect]) return particleRenderer(PRESETS[effect], accent);
  return null;
}

export function AmbientEffect({ effect = 'none', accent = '#c9a8e8' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (effect === 'none') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const renderer = makeRenderer(effect, accent);
    if (!renderer) return undefined;

    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let W = 0; let H = 0; let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.seed(W, H);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf; let last = performance.now(); let running = true;
    const onVis = () => { running = !document.hidden; if (running) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener('visibilitychange', onVis);

    function loop(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, W, H);
      renderer.frame(ctx, dt, now / 1000, W, H);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [effect, accent]);

  if (effect === 'none') return null;
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

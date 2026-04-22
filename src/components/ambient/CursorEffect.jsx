import { useEffect, useRef } from 'react';
import { ACCENTS, CURSOR_LABELS } from '../../data/constants';

export function CursorEffect({ accent, activeSectionRef }) {
  const rgb = (ACCENTS[accent] || ACCENTS.violet).rgb;
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const labelRef = useRef(null);
  const trailCvs = useRef(null);
  const S = useRef({
    mx: -300, my: -300,
    rx: -300, ry: -300,
    lx: -300, ly: -300,
    trail: [], hov: false, click: false,
  });

  useEffect(() => {
    const s = S.current;
    const cv = trailCvs.current;
    const ctx = cv?.getContext('2d');

    function resize() {
      if (cv) {
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;
      }
    }
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e) => {
      s.mx = e.clientX;
      s.my = e.clientY;
      if (!window.__animPaused) {
        s.trail.unshift({ x: e.clientX, y: e.clientY, t: Date.now() });
        if (s.trail.length > 22) s.trail.length = 22;
      }
    };
    const onOver = (e) => {
      s.hov = !!e.target.closest('a,button,[data-interactive]');
    };
    const onDown = () => {
      s.click = true;
    };
    const onUp = () => {
      s.click = false;
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'none';

    let raf;
    function tick() {
      s.rx += (s.mx - s.rx) * 0.11;
      s.ry += (s.my - s.ry) * 0.11;
      s.lx += (s.mx - s.lx) * 0.07;
      s.ly += (s.my - s.ly) * 0.07;

      const dot = dotRef.current;
      const ring = ringRef.current;
      const label = labelRef.current;

      if (dot) {
        dot.style.transform = `translate(${s.mx - 3}px,${s.my - 3}px) scale(${s.click ? 0.5 : 1})`;
      }
      if (ring) {
        const sz = s.hov ? 42 : s.click ? 18 : 27;
        ring.style.transform = `translate(${s.rx - sz / 2}px,${s.ry - sz / 2}px)`;
        ring.style.width = sz + 'px';
        ring.style.height = sz + 'px';
        ring.style.borderColor = s.hov ? `rgba(${rgb},0.9)` : `rgba(255,255,255,0.32)`;
      }
      if (label) {
        const sec = activeSectionRef?.current || '';
        const lbl = CURSOR_LABELS[sec] || '';
        label.textContent = lbl;
        label.style.transform = `translate(${s.lx + 20}px,${s.ly - 12}px)`;
        label.style.opacity = lbl && !s.hov ? '0.55' : '0';
      }

      if (ctx && cv && !window.__animPaused) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        const now = Date.now();
        for (let i = 1; i < s.trail.length; i++) {
          const age = (now - s.trail[i].t) / 380;
          const op = Math.max(0, (1 - age) * (1 - i / s.trail.length) * 0.55);
          if (op < 0.005) continue;
          const r = Math.max(0.5, 4.5 * (1 - i / s.trail.length));
          ctx.beginPath();
          ctx.arc(s.trail[i].x, s.trail[i].y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},${op})`;
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', resize);
      document.body.style.cursor = '';
    };
  }, [accent, activeSectionRef, rgb]);

  return (
    <>
      <canvas
        ref={trailCvs}
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9990 }}
      />
      <div
        ref={dotRef}
        style={{
          position: 'fixed', top: 0, left: 0, width: 6, height: 6, borderRadius: '50%',
          background: '#fff', pointerEvents: 'none', zIndex: 9992, willChange: 'transform',
          mixBlendMode: 'difference', transition: 'transform 0.04s',
        }}
      />
      <div
        ref={ringRef}
        style={{
          position: 'fixed', top: 0, left: 0, width: 27, height: 27, borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.32)', pointerEvents: 'none', zIndex: 9991,
          willChange: 'transform', transition: 'width 0.16s ease,height 0.16s ease,border-color 0.2s ease',
        }}
      />
      <div
        ref={labelRef}
        style={{
          position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9991,
          willChange: 'transform', fontFamily: "'Space Grotesk',sans-serif", fontSize: 11,
          color: `rgba(${rgb},0.8)`, letterSpacing: '0.5px', transition: 'opacity 0.3s ease',
        }}
      />
    </>
  );
}

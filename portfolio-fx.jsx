// portfolio-fx.jsx v4 — section mood system, lerped atmosphere, context cursor label

const { useEffect, useRef } = React;

// Per-section ambient moods (bg as RGB, intensity, drift speed, pulse)
const SECTION_MOODS = {
  default:    { bgD:[5,5,17],   bgL:[236,229,247], int:1.0,  dft:1.0,  pulse:false },
  hero:       { bgD:[5,5,17],   bgL:[236,229,247], int:1.0,  dft:1.0,  pulse:false },
  projects:   { bgD:[6,4,24],   bgL:[237,232,251], int:1.6,  dft:1.15, pulse:false },
  music:      { bgD:[2,1,8],    bgL:[230,222,244], int:0.95, dft:0.55, pulse:true  },
  about:      { bgD:[4,3,14],   bgL:[238,234,248], int:0.62, dft:0.28, pulse:false },
  education:  { bgD:[5,5,17],   bgL:[236,229,247], int:0.8,  dft:0.7,  pulse:false },
  experience: { bgD:[5,5,18],   bgL:[236,230,248], int:0.9,  dft:0.8,  pulse:false },
  contact:    { bgD:[5,5,17],   bgL:[236,229,247], int:0.88, dft:0.65, pulse:false },
  current:    { bgD:[6,4,18],   bgL:[237,234,248], int:1.2,  dft:0.85, pulse:false },
};

const CURSOR_LABELS = {
  music:'♪', projects:'/>', about:'~', contact:'@', experience:'■', education:'/', current:'★'
};

// ── Ambient Background Canvas ──────────────────────────────────────────────

function AmbientCanvas({ scrollRef, activeSectionRef, accent, mode }) {
  const canvasRef = useRef();
  const stRef = useRef({ accent, mode });
  useEffect(() => { stRef.current.accent = accent; }, [accent]);
  useEffect(() => { stRef.current.mode   = mode;   }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const orbs = [
      { bx:0.72, by:0.18, r:0.55, R:100, G:50,  B:220, spd:0.00028, ph:0    },
      { bx:0.12, by:0.68, r:0.46, R:55,  G:20,  B:170, spd:0.00022, ph:2.1  },
      { bx:0.50, by:0.90, r:0.42, R:150, G:65,  B:240, spd:0.00031, ph:4.2  },
      { bx:0.88, by:0.46, r:0.34, R:35,  G:12,  B:140, spd:0.00019, ph:1.5  },
      { bx:0.30, by:0.30, r:0.30, R:80,  G:30,  B:180, spd:0.00025, ph:3.3  },
    ];

    // Lerp state — smooth transitions between section moods
    const lerp = { int:1.0, dft:1.0, bgR:5, bgG:5, bgB:17 };

    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    let raf;
    function draw(ts) {
      if (window.__animPaused) { raf = requestAnimationFrame(draw); return; }

      const W = canvas.width, H = canvas.height;
      const { accent: ac, mode: md } = stRef.current;
      const isLight   = md === 'light';
      const section   = activeSectionRef?.current || 'hero';
      const mood      = SECTION_MOODS[section] || SECTION_MOODS.default;
      const accBoost  = ac === 'violet' ? 1.4 : ac === 'amber' ? 1.1 : 0.9;
      const [tbR,tbG,tbB] = isLight ? mood.bgL : mood.bgD;

      // Smooth lerp toward target mood
      const k = 0.022;
      lerp.int += (mood.int - lerp.int) * k;
      lerp.dft += (mood.dft - lerp.dft) * k;
      lerp.bgR += (tbR     - lerp.bgR) * k;
      lerp.bgG += (tbG     - lerp.bgG) * k;
      lerp.bgB += (tbB     - lerp.bgB) * k;

      ctx.fillStyle = `rgb(${lerp.bgR|0},${lerp.bgG|0},${lerp.bgB|0})`;
      ctx.fillRect(0, 0, W, H);

      const scroll  = scrollRef?.current || 0;
      const docH    = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      const prog    = scroll / docH;

      // BPM-like pulse for music section
      const pulseMult = mood.pulse
        ? 1 + 0.06 * Math.sin(ts * 0.008)   // ~75 BPM feel
        : 1;

      orbs.forEach((o, i) => {
        const driftScale = lerp.dft;
        const drift      = 0.068 * driftScale;
        const scrollY    = (i % 2 === 0 ? 1 : -1) * prog * 0.18;
        const x = (o.bx + Math.sin(ts * o.spd + o.ph)       * drift) * W;
        const y = (o.by + Math.cos(ts * o.spd * 1.3 + o.ph) * drift + scrollY) * H;
        const r = o.r * Math.min(W, H) * lerp.int * pulseMult;

        const alpha = (isLight ? 0.05 : 0.075) * lerp.int * accBoost;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0,    `rgba(${o.R},${o.G},${o.B},${alpha})`);
        g.addColorStop(0.42, `rgba(${o.R},${o.G},${o.B},${alpha*0.35})`);
        g.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position:'fixed', top:0, left:0, width:'100vw', height:'100vh',
      display:'block', zIndex:0, pointerEvents:'none'
    }}/>
  );
}

// ── Cursor Effect ──────────────────────────────────────────────────────────

function CursorEffect({ accent, activeSectionRef }) {
  const rgb      = (ACCENTS[accent] || ACCENTS.violet).rgb;
  const dotRef   = useRef();
  const ringRef  = useRef();
  const labelRef = useRef();
  const trailCvs = useRef();
  const S = useRef({ mx:-300, my:-300, rx:-300, ry:-300, lx:-300, ly:-300, trail:[], hov:false, click:false });

  useEffect(() => {
    const s  = S.current;
    const cv = trailCvs.current;
    const ctx = cv?.getContext('2d');

    function resize() { if (cv) { cv.width = window.innerWidth; cv.height = window.innerHeight; } }
    resize();
    window.addEventListener('resize', resize);

    const onMove  = e => {
      s.mx = e.clientX; s.my = e.clientY;
      if (!window.__animPaused) {
        s.trail.unshift({ x:e.clientX, y:e.clientY, t:Date.now() });
        if (s.trail.length > 22) s.trail.length = 22;
      }
    };
    const onOver  = e => { s.hov   = !!e.target.closest('a,button,[data-interactive]'); };
    const onDown  = ()  => { s.click = true;  };
    const onUp    = ()  => { s.click = false; };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup',   onUp);
    document.body.style.cursor = 'none';

    let raf;
    function tick() {
      // Spring lerp
      s.rx += (s.mx - s.rx) * 0.11;
      s.ry += (s.my - s.ry) * 0.11;
      s.lx += (s.mx - s.lx) * 0.07;
      s.ly += (s.my - s.ly) * 0.07;

      const dot   = dotRef.current;
      const ring  = ringRef.current;
      const label = labelRef.current;

      if (dot) {
        dot.style.transform = `translate(${s.mx-3}px,${s.my-3}px) scale(${s.click?0.5:1})`;
      }
      if (ring) {
        const sz = s.hov ? 42 : s.click ? 18 : 27;
        ring.style.transform  = `translate(${s.rx-sz/2}px,${s.ry-sz/2}px)`;
        ring.style.width      = sz + 'px';
        ring.style.height     = sz + 'px';
        ring.style.borderColor = s.hov ? `rgba(${rgb},0.9)` : `rgba(255,255,255,0.32)`;
      }
      if (label) {
        const sec = activeSectionRef?.current || '';
        const lbl = CURSOR_LABELS[sec] || '';
        label.textContent     = lbl;
        label.style.transform = `translate(${s.lx+20}px,${s.ly-12}px)`;
        label.style.opacity   = lbl && !s.hov ? '0.55' : '0';
      }

      if (ctx && cv && !window.__animPaused) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        const now = Date.now();
        for (let i = 1; i < s.trail.length; i++) {
          const age = (now - s.trail[i].t) / 380;
          const op  = Math.max(0, (1-age) * (1-i/s.trail.length) * 0.55);
          if (op < 0.005) continue;
          const r = Math.max(0.5, 4.5 * (1-i/s.trail.length));
          ctx.beginPath();
          ctx.arc(s.trail[i].x, s.trail[i].y, r, 0, Math.PI*2);
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
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('resize', resize);
      document.body.style.cursor = '';
    };
  }, [accent]);

  return (
    <>
      <canvas ref={trailCvs} style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',pointerEvents:'none',zIndex:9990}}/>
      <div ref={dotRef} style={{position:'fixed',top:0,left:0,width:6,height:6,borderRadius:'50%',background:'#fff',pointerEvents:'none',zIndex:9992,willChange:'transform',mixBlendMode:'difference',transition:'transform 0.04s'}}/>
      <div ref={ringRef} style={{position:'fixed',top:0,left:0,width:27,height:27,borderRadius:'50%',border:'1.5px solid rgba(255,255,255,0.32)',pointerEvents:'none',zIndex:9991,willChange:'transform',transition:'width 0.16s ease,height 0.16s ease,border-color 0.2s ease'}}/>
      <div ref={labelRef} style={{position:'fixed',top:0,left:0,pointerEvents:'none',zIndex:9991,willChange:'transform',fontFamily:"'Space Grotesk',sans-serif",fontSize:11,color:`rgba(${rgb},0.8)`,letterSpacing:'0.5px',transition:'opacity 0.3s ease'}}/>
    </>
  );
}

Object.assign(window, { AmbientCanvas, CursorEffect });

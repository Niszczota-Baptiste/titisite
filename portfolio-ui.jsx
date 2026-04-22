// portfolio-ui.jsx v4 — glitch hero, section glow, richer cards, CurrentlyBuilding, enhanced Easter egg
const { useState, useEffect, useRef, useCallback } = React;

function useReveal() {
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  });
}

function useMagnetic(str = 0.3) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove  = e => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX-(r.left+r.width/2))*str}px,${(e.clientY-(r.top+r.height/2))*str}px)`; };
    const onLeave = () => { el.style.transform = 'none'; };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, [str]);
  return ref;
}

// ── Scroll Progress ────────────────────────────────────────────────────────

function ScrollProgress({ accent }) {
  const [pct, setPct] = useState(0);
  const acc = ACCENTS[accent] || ACCENTS.violet;
  useEffect(() => {
    const fn = () => setPct(window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1));
    window.addEventListener('scroll', fn, { passive:true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return (
    <div style={{position:'fixed', top:0, left:0, right:0, height:2, zIndex:200, pointerEvents:'none'}}>
      <div style={{height:'100%', width:`${pct*100}%`, background:`linear-gradient(90deg,${acc.dim},${acc.hex})`,
        boxShadow:`0 0 10px rgba(${acc.rgb},0.8),0 0 3px rgba(${acc.rgb},1),0 0 22px rgba(${acc.rgb},0.4)`,
        transition:'width 0.06s linear', borderRadius:'0 1px 1px 0'}}/>
    </div>
  );
}

// ── Pause Button ───────────────────────────────────────────────────────────

function FloatingPauseButton({ accent }) {
  const [paused, setPaused] = useState(false);
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const toggle = () => { const n=!paused; setPaused(n); window.__animPaused=n; };
  return (
    <button data-interactive onClick={toggle} title={paused?'Reprendre':'Suspendre animations'} style={{
      position:'fixed', bottom:28, left:28, zIndex:1000, width:40, height:40, borderRadius:'50%',
      background: paused ? `rgba(${acc.rgb},0.18)` : 'rgba(12,8,28,0.85)',
      border:`1px solid ${paused ? acc.hex : 'rgba(80,50,130,0.28)'}`,
      color: paused ? acc.hex : 'var(--text-faint)', cursor:'pointer',
      backdropFilter:'blur(12px)', display:'flex', alignItems:'center', justifyContent:'center',
      transition:'all 0.25s', boxShadow: paused ? `0 0 14px rgba(${acc.rgb},0.3)` : 'none'
    }}
    onMouseEnter={e=>{e.currentTarget.style.borderColor=acc.hex;e.currentTarget.style.color=acc.hex;}}
    onMouseLeave={e=>{if(!paused){e.currentTarget.style.borderColor='rgba(80,50,130,0.28)';e.currentTarget.style.color='var(--text-faint)';}}}>
      {paused
        ? <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor"><path d="M0 0 L12 7 L0 14 Z"/></svg>
        : <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><rect x="0" y="0" width="3.5" height="13" rx="1"/><rect x="7.5" y="0" width="3.5" height="13" rx="1"/></svg>}
    </button>
  );
}

// ── Glitch Text ────────────────────────────────────────────────────────────

// gradient prop: if provided, main span gets gradient text fill; clones get explicit fills
function GlitchText({ text, accent, style, gradient }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const mainStyle = gradient
    ? { position:'relative', zIndex:2, WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent', backgroundImage:gradient }
    : { position:'relative', zIndex:2 };
  return (
    <span style={{position:'relative', display:'inline-block', ...style}}>
      <span style={mainStyle}>{text}</span>
      {/* Clone 1 — cyan: explicit WebkitTextFillColor overrides any inherited transparent */}
      <span aria-hidden="true" style={{position:'absolute',left:0,top:0,WebkitTextFillColor:'rgba(80,230,255,0.72)',color:'rgba(80,230,255,0.72)',animation:'glitch1 5.5s infinite',zIndex:1,pointerEvents:'none',userSelect:'none',fontFamily:'inherit',fontSize:'inherit',fontWeight:'inherit',letterSpacing:'inherit',lineHeight:'inherit'}}>{text}</span>
      {/* Clone 2 — accent */}
      <span aria-hidden="true" style={{position:'absolute',left:0,top:0,WebkitTextFillColor:acc.hex,color:acc.hex,opacity:0.82,animation:'glitch2 5.5s infinite 0.09s',zIndex:1,pointerEvents:'none',userSelect:'none',fontFamily:'inherit',fontSize:'inherit',fontWeight:'inherit',letterSpacing:'inherit',lineHeight:'inherit'}}>{text}</span>
    </span>
  );
}

// ── Code Rain Canvas ───────────────────────────────────────────────────────

function CodeCanvas({ accent }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const chars = '01アイウエ가나다라{}[]<>/\\|+=ABCDEFGHabcdefgh';
    const fs = 12; let cols, drops;
    const acc = ACCENTS[accent] || ACCENTS.violet;
    function resize() {
      canvas.width = canvas.offsetWidth*devicePixelRatio; canvas.height = canvas.offsetHeight*devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      cols = Math.floor(canvas.offsetWidth/fs);
      drops = Array.from({length:cols}, () => Math.random()*-80);
    }
    resize();
    window.addEventListener('resize', resize);
    let raf;
    function draw() {
      if (window.__animPaused) { raf=requestAnimationFrame(draw); return; }
      ctx.fillStyle='rgba(5,5,17,0.055)'; ctx.fillRect(0,0,canvas.offsetWidth,canvas.offsetHeight);
      ctx.font=`${fs}px monospace`;
      for (let i=0;i<drops.length;i++) {
        const lit=Math.random()<0.009;
        ctx.fillStyle=lit?`rgba(${acc.rgb},0.6)`:`rgba(80,60,130,${0.1+Math.random()*0.1})`;
        ctx.fillText(chars[Math.floor(Math.random()*chars.length)],i*fs,drops[i]*fs);
        if (drops[i]*fs>canvas.offsetHeight&&Math.random()>0.975) drops[i]=0;
        drops[i]++;
      }
      raf=requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [accent]);
  return <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}

// ── Nav ────────────────────────────────────────────────────────────────────

function Nav({ lang, setLang, t, accent, mode, toggleMode }) {
  const [scrolled, setScrolled] = useState(false);
  const acc = ACCENTS[accent] || ACCENTS.violet;
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn, { passive:true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  const links = ['projects','music','about','education','experience','contact'];
  const scroll = id => document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' });

  return (
    <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,
      background:scrolled?'var(--nav-bg)':'transparent',
      backdropFilter:scrolled?'blur(20px) saturate(1.6)':'none',
      borderBottom:`1px solid ${scrolled?'var(--nav-border)':'transparent'}`,
      transition:'all 0.4s ease',padding:'0 48px',height:64,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:17,cursor:'pointer',letterSpacing:'-0.3px',color:'var(--text)',userSelect:'none'}}>
        Baptiste<span style={{color:acc.hex}}>.</span>
      </span>
      <div style={{display:'flex',alignItems:'center',gap:28}}>
        <div style={{display:'flex',gap:24}}>
          {links.map(k=>(
            <button key={k} onClick={()=>scroll(k)} style={{background:'none',border:'none',color:'var(--nav-link)',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:13.5,letterSpacing:'0.2px',padding:0,transition:'color 0.2s'}}
            onMouseEnter={e=>e.target.style.color=acc.hex} onMouseLeave={e=>e.target.style.color='var(--nav-link)'}>
              {t.nav[k]}
            </button>
          ))}
        </div>
        <button data-interactive onClick={toggleMode} style={{background:'none',border:'none',cursor:'pointer',padding:'4px',color:'var(--text-faint)',transition:'color 0.2s,transform 0.3s'}}
        onMouseEnter={e=>{e.currentTarget.style.color=acc.hex;e.currentTarget.style.transform='rotate(20deg)';}}
        onMouseLeave={e=>{e.currentTarget.style.color='var(--text-faint)';e.currentTarget.style.transform='none';}}>
          {mode==='dark'
            ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
        </button>
        <div style={{display:'flex',gap:2,background:'var(--lang-bg)',borderRadius:8,padding:3,border:'1px solid var(--border)'}}>
          {['fr','en','ko'].map(l=>(
            <button key={l} onClick={()=>setLang(l)} style={{background:lang===l?acc.hex:'none',color:lang===l?(mode==='light'?'#fff':'#0a0518'):'var(--text-faint)',border:'none',borderRadius:6,padding:'3px 10px',cursor:'pointer',fontFamily:l==='ko'?"'Noto Sans KR',sans-serif":"'Inter',sans-serif",fontSize:12,fontWeight:lang===l?700:400,transition:'all 0.2s'}}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

function Hero({ t, lang, accent, mode }) {
  const acc  = ACCENTS[accent] || ACCENTS.violet;
  const ff   = lang==='ko'?"'Noto Sans KR','Space Grotesk',sans-serif":"'Space Grotesk',sans-serif";
  const btn1 = useMagnetic(0.28); const btn2 = useMagnetic(0.28);
  const scroll = id => document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' });

  return (
    <section id="hero" style={{position:'relative',height:'100vh',display:'flex',alignItems:'center',overflow:'hidden'}}>
      <CodeCanvas accent={accent}/>
      <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,rgba(5,5,17,0.08) 0%,rgba(5,5,17,0.7) 100%)'}}/>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 70% 60% at 18% 50%,rgba(80,40,160,0.12) 0%,transparent 70%)'}}/>

      <div style={{position:'relative',padding:'0 88px',maxWidth:980}}>
        <p style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:acc.hex,letterSpacing:'2.5px',textTransform:'uppercase',marginBottom:22,animation:'fadeUp 0.7s ease both',animationDelay:'0.1s'}}>{t.hero.greeting}</p>
        <h1 style={{fontFamily:ff,fontSize:'clamp(52px,7.5vw,100px)',fontWeight:700,lineHeight:1.04,letterSpacing:'-2.5px',color:'var(--text)',marginBottom:18,animation:'fadeUp 0.7s ease both',animationDelay:'0.25s'}}>
          Niszczota<br/>
          <GlitchText text="Baptiste" accent={accent} gradient={`linear-gradient(120deg,var(--text) 30%,${acc.hex})`}/>
          <span style={{color:acc.hex,WebkitTextFillColor:acc.hex}}>.</span>
        </h1>
        <p style={{fontFamily:ff,fontSize:'clamp(17px,2.2vw,26px)',fontWeight:300,color:'var(--text-muted)',marginBottom:14,animation:'fadeUp 0.7s ease both',animationDelay:'0.4s'}}>{t.hero.tagline}</p>
        <p style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-faint)',letterSpacing:'0.5px',marginBottom:56,animation:'fadeUp 0.7s ease both',animationDelay:'0.5s'}}>{t.hero.role}</p>
        <div style={{display:'flex',gap:14,animation:'fadeUp 0.7s ease both',animationDelay:'0.65s'}}>
          <button ref={btn1} onClick={()=>scroll('projects')} style={{background:acc.hex,color:mode==='light'?'#fff':'#08051a',border:'none',borderRadius:10,padding:'13px 30px',fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:700,cursor:'pointer',transition:'box-shadow 0.25s,transform 0.18s',letterSpacing:'-0.2px'}}
          onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 8px 28px rgba(${acc.rgb},0.4)`}
          onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>{t.hero.cta1}</button>
          <button ref={btn2} onClick={()=>scroll('contact')} style={{background:'var(--surface)',color:'var(--text)',border:'1px solid var(--border)',borderRadius:10,padding:'13px 30px',fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer',transition:'all 0.22s',backdropFilter:'blur(8px)'}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=acc.hex;e.currentTarget.style.color=acc.hex;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text)';}}>{t.hero.cta2}</button>
        </div>
      </div>
      <div style={{position:'absolute',bottom:36,left:'50%',transform:'translateX(-50%)',animation:'float 2.6s ease-in-out infinite',opacity:0.4}}>
        <svg width="18" height="28" viewBox="0 0 18 28" fill="none"><rect x="1" y="1" width="16" height="26" rx="8" stroke="var(--text-faint)" strokeWidth="1.2"/><rect x="7.5" y="5" width="3" height="7" rx="1.5" fill="var(--text-faint)"><animate attributeName="y" values="5;14;5" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0;1" dur="1.8s" repeatCount="indefinite"/></rect></svg>
      </div>
    </section>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ id, bg, children }) {
  useReveal();
  return (
    <section id={id} style={{background:bg||'transparent',padding:'100px 0'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'0 80px'}}>{children}</div>
    </section>
  );
}

function SectionHeader({ title, subtitle, accent }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  return (
    <div className="reveal" style={{marginBottom:58}}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:8}}>
        <div style={{width:24,height:2,background:`linear-gradient(90deg,${acc.hex},transparent)`,flexShrink:0}}/>
        <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:'clamp(30px,4vw,50px)',fontWeight:700,letterSpacing:'-1.2px',color:'var(--text)'}}>{title}</h2>
      </div>
      {subtitle && <p style={{fontFamily:"'Inter',sans-serif",fontSize:14.5,color:'var(--text-faint)',paddingLeft:40}}>{subtitle}</p>}
    </div>
  );
}

// ── Projects ───────────────────────────────────────────────────────────────

function Projects({ t, lang, accent }) {
  const [filter, setFilter] = useState('all');
  const acc  = ACCENTS[accent] || ACCENTS.violet;
  const keys = ['all','web','mobile','experimental'];
  const vis  = filter==='all' ? projects : projects.filter(p=>p.type===filter);

  return (
    <Section id="projects">
      <SectionHeader title={t.projects.title} subtitle={t.projects.subtitle} accent={accent}/>
      <div className="reveal" style={{display:'flex',gap:8,marginBottom:44,flexWrap:'wrap'}}>
        {keys.map((k,i)=>(
          <button key={k} onClick={()=>setFilter(k)} style={{background:filter===k?acc.hex:'var(--filter-bg)',color:filter===k?'#08051a':'var(--text-faint)',border:`1px solid ${filter===k?acc.hex:'var(--border)'}`,borderRadius:20,padding:'6px 18px',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:filter===k?700:400,transition:'all 0.2s',backdropFilter:'blur(8px)'}}>{t.projects.filters[i]}</button>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:18}}>
        {vis.map((p,i)=>(
          <div key={p.id} className="reveal" style={{transitionDelay:`${i*0.08}s`}}>
            <ProjectCard p={p} t={t} lang={lang} accent={accent}/>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProjectCard({ p, t, lang, accent }) {
  const [hov, setHov]       = useState(false);
  const [expanded, setExp]  = useState(false);
  const acc = ACCENTS[accent] || ACCENTS.violet;

  return (
    <div data-interactive onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{
      background:hov?'var(--surface-hov)':'var(--surface)',
      border:`1px solid ${hov?acc.hex+'55':'var(--border)'}`,
      borderRadius:16,cursor:'pointer',
      transition:'all 0.32s cubic-bezier(.22,1,.36,1)',
      transform:hov?'translateY(-5px)':'none',
      boxShadow:hov?`0 20px 48px rgba(80,40,160,0.18)`:'none',
      backdropFilter:'blur(12px)'
    }}>
      {/* Preview */}
      <div style={{padding:28,paddingBottom:20}}>
        <div style={{width:'100%',height:128,borderRadius:10,marginBottom:20,background:p.color,position:'relative',overflow:'hidden',border:'1px solid var(--border)'}}>
          <div style={{padding:'12px 16px',fontFamily:'monospace',fontSize:10.5,color:'var(--code-muted)',lineHeight:1.9,userSelect:'none'}}>
            <span style={{opacity:0.6}}>// {p.type}</span><br/>{'{'}<br/>
            &nbsp;&nbsp;<span style={{color:acc.hex+'88'}}>title</span>: "{p.title}"<br/>
            &nbsp;&nbsp;<span style={{color:acc.hex+'88'}}>stack</span>: [{p.tags.slice(0,2).join(', ')}]<br/>{'}'}
          </div>
          {hov&&<div style={{position:'absolute',inset:0,background:`linear-gradient(135deg,rgba(${acc.rgb},0.08),transparent)`}}/>}
          {p.wip&&<span style={{position:'absolute',top:10,right:10,background:`rgba(${acc.rgb},0.12)`,color:acc.hex,fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:20}}>{t.projects.wip}</span>}
        </div>
        <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:700,color:'var(--text)',marginBottom:8,letterSpacing:'-0.3px'}}>{p.title}</h3>
        <p style={{fontFamily:"'Inter',sans-serif",fontSize:13.5,color:'var(--text-muted)',lineHeight:1.65,marginBottom:16}}>{p.desc[lang]}</p>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:18}}>
          {p.tags.map(tag=>(
            <span key={tag} style={{background:'var(--tag-bg)',border:'1px solid var(--tag-border)',color:'var(--tag-color)',fontSize:11,fontWeight:500,padding:'3px 9px',borderRadius:20}}>{tag}</span>
          ))}
        </div>

        {/* Expandable impact details */}
        {p.problem && (
          <button onClick={e=>{e.stopPropagation();setExp(x=>!x);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)',fontFamily:"'Inter',sans-serif",fontSize:12,padding:0,display:'flex',alignItems:'center',gap:6,transition:'color 0.2s',marginBottom:expanded?14:0}}
          onMouseEnter={e=>e.currentTarget.style.color=acc.hex} onMouseLeave={e=>e.currentTarget.style.color='var(--text-faint)'}>
            <span style={{transition:'transform 0.2s',display:'inline-block',transform:expanded?'rotate(90deg)':'none'}}>▶</span>
            {expanded ? (lang==='ko'?'접기':'Réduire') : (lang==='ko'?'상세':'Impact & détails')}
          </button>
        )}

        {expanded && p.problem && (
          <div style={{borderTop:'1px solid var(--border-dim)',paddingTop:16,display:'flex',flexDirection:'column',gap:14}}>
            {[['Problème','Problem','문제',p.problem],['Solution','Solution','솔루션',p.solution],['Impact','Impact','성과',p.impact]].map(([fr,en,ko,val])=>(
              <div key={fr}>
                <p style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,color:acc.hex,letterSpacing:'1px',textTransform:'uppercase',marginBottom:4,fontWeight:600}}>
                  {lang==='fr'?fr:lang==='ko'?ko:en}
                </p>
                <p style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-muted)',lineHeight:1.65}}>{val[lang]}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{borderTop:'1px solid var(--border-dim)',padding:'14px 28px',display:'flex',gap:10}}>
        {['demo','code'].map(type=>(
          <button key={type} style={{flex:1,background:'none',border:'1px solid var(--border)',color:'var(--text-muted)',borderRadius:8,padding:'8px',fontSize:12,cursor:'pointer',transition:'all 0.2s',fontFamily:"'Inter',sans-serif"}}
          onMouseEnter={e=>{e.target.style.borderColor=acc.hex;e.target.style.color=acc.hex;}}
          onMouseLeave={e=>{e.target.style.borderColor='var(--border)';e.target.style.color='var(--text-muted)';}}>
            {t.projects[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Music Player ───────────────────────────────────────────────────────────

function VolumeSlider({ value, onChange, accent }) {
  const acc = ACCENTS[accent]||ACCENTS.violet; const trackRef=useRef(); const dragging=useRef(false);
  const getVal = useCallback(e=>{const r=trackRef.current?.getBoundingClientRect();return r?Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)):0;},[]);
  useEffect(()=>{
    const onMove=e=>{if(dragging.current)onChange(getVal(e));};
    const onUp=()=>{dragging.current=false;};
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
    return ()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);};
  },[getVal,onChange]);
  return (
    <div style={{display:'flex',alignItems:'center',gap:9}}>
      <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1 4h3l3-3v10l-3-3H1V4z" fill="var(--text-faint)"/>{value>0.01&&<path d="M9 2a5 5 0 0 1 0 8" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>}{value>0.5&&<path d="M11 0a7 7 0 0 1 0 12" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>}</svg>
      <div ref={trackRef} data-interactive onMouseDown={e=>{dragging.current=true;onChange(getVal(e));}} style={{position:'relative',width:88,height:18,cursor:'pointer',display:'flex',alignItems:'center',userSelect:'none'}}>
        <div style={{width:'100%',height:3,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${value*100}%`,background:acc.hex,borderRadius:2,boxShadow:`0 0 6px rgba(${acc.rgb},0.5)`,transition:'width 0.05s'}}/>
        </div>
        <div style={{position:'absolute',left:`${value*100}%`,transform:'translate(-50%,-50%)',top:'50%',width:11,height:11,borderRadius:'50%',background:acc.hex,boxShadow:`0 0 8px rgba(${acc.rgb},0.55)`,pointerEvents:'none',transition:'left 0.05s'}}/>
      </div>
    </div>
  );
}

function Waveform({ playing, accent }) {
  const acc=ACCENTS[accent]||ACCENTS.violet;
  const dur=['0.6s','0.8s','0.55s','0.75s','0.65s','0.9s','0.7s','0.5s'];
  return (
    <div style={{display:'flex',gap:2.5,alignItems:'center',height:28}}>
      {Array.from({length:20}).map((_,i)=>(
        <div key={i} style={{width:2.5,borderRadius:2,background:acc.hex,opacity:playing?0.65:0.18,height:playing?undefined:'3px',minHeight:3,animation:playing?`wave${(i%4)+1} ${dur[i%8]} ${i*0.04}s ease-in-out infinite alternate`:'none',transition:'opacity 0.4s'}}/>
      ))}
    </div>
  );
}

function Music({ t, lang, accent }) {
  const [playing,  setPlaying]  = useState(null);
  const [progress, setProgress] = useState({});
  const [volume,   setVolume]   = useState(0.72);
  const [shuffle,  setShuffle]  = useState(false);
  const [repeat,   setRepeat]   = useState(false);
  const acc = ACCENTS[accent]||ACCENTS.violet;

  useEffect(() => { window.__musicPlaying = playing !== null; }, [playing]);

  const toggle = i => { setPlaying(p=>p===i?null:i); if(playing!==i) setProgress(pr=>({...pr,[i]:pr[i]||0})); };
  const prev = () => { const idx=(((playing??0)-1)+tracks.length)%tracks.length; setPlaying(idx); setProgress(pr=>({...pr,[idx]:0})); };
  const next = () => { const idx=shuffle?Math.floor(Math.random()*tracks.length):((playing??-1)+1)%tracks.length; setPlaying(idx); setProgress(pr=>({...pr,[idx]:0})); };

  useEffect(()=>{
    if(playing===null) return;
    const iv=setInterval(()=>{
      setProgress(pr=>{
        const cur=pr[playing]||0;
        if(cur>=100){if(repeat)return{...pr,[playing]:0};setPlaying(null);return pr;}
        return {...pr,[playing]:cur+0.38};
      });
    },120);
    return ()=>clearInterval(iv);
  },[playing,repeat]);

  const fmtTime=(pct,total)=>{const[m,s]=total.split(':').map(Number);const tot=m*60+s;const cur=Math.floor(tot*pct/100);return`${Math.floor(cur/60)}:${String(cur%60).padStart(2,'0')}`;};
  const cur=playing!==null?tracks[playing]:null;
  const curProg=playing!==null?(progress[playing]||0):0;
  const isPlaying=playing!==null;

  const iconBtn=(active,onClick,children)=>(
    <button data-interactive onClick={onClick} style={{background:'none',border:'none',cursor:'pointer',color:active?acc.hex:'var(--text-faint)',padding:6,borderRadius:6,transition:'color 0.2s',display:'flex',alignItems:'center',justifyContent:'center'}}
    onMouseEnter={e=>e.currentTarget.style.color=acc.hex} onMouseLeave={e=>e.currentTarget.style.color=active?acc.hex:'var(--text-faint)'}>{children}</button>
  );

  return (
    <Section id="music" bg="var(--section-alt)">
      <SectionHeader title={t.music.title} subtitle={t.music.subtitle} accent={accent}/>
      <div className="reveal" style={{
        background:'var(--player-bg)',
        border:`1px solid ${isPlaying?acc.hex+'33':'var(--border)'}`,
        borderRadius:20, overflow:'hidden', backdropFilter:'blur(20px)',
        boxShadow: isPlaying ? `0 0 50px rgba(${acc.rgb},0.12),0 0 100px rgba(${acc.rgb},0.06)` : 'none',
        transition:'border-color 0.6s ease,box-shadow 0.6s ease'
      }}>
        <div style={{padding:'28px 32px 24px',borderBottom:'1px solid var(--border-dim)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
            <div>
              <p style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,color:'var(--text-faint)',letterSpacing:'1.8px',textTransform:'uppercase',marginBottom:8}}>Now Playing</p>
              <p style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,color: isPlaying?acc.hex:'var(--text)',marginBottom:4,letterSpacing:'-0.3px',transition:'color 0.4s'}}>{cur?cur.title:'—'}</p>
              <p style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-faint)'}}>{cur?cur.genre:t.music.noFile}</p>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:16}}>
              <Waveform playing={isPlaying} accent={accent}/>
              <VolumeSlider value={volume} onChange={setVolume} accent={accent}/>
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{height:3,background:'var(--border)',borderRadius:2,marginBottom:7,cursor:'pointer',position:'relative'}}
              onClick={e=>{if(playing===null)return;const rect=e.currentTarget.getBoundingClientRect();setProgress(pr=>({...pr,[playing]:((e.clientX-rect.left)/rect.width)*100}));}}>
              <div style={{height:'100%',width:`${curProg}%`,background:`linear-gradient(90deg,${acc.dim},${acc.hex})`,borderRadius:2,boxShadow:`0 0 8px rgba(${acc.rgb},0.4)`,transition:'width 0.12s linear',position:'relative'}}>
                <div style={{position:'absolute',right:0,top:'50%',transform:'translate(50%,-50%)',width:9,height:9,borderRadius:'50%',background:acc.hex,boxShadow:`0 0 6px rgba(${acc.rgb},0.8)`}}/>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{fontFamily:'monospace',fontSize:11,color:'var(--text-faint)'}}>{cur?fmtTime(curProg,cur.duration):'0:00'}</span>
              <span style={{fontFamily:'monospace',fontSize:11,color:'var(--text-faint)'}}>{cur?.duration||'—'}</span>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
            {iconBtn(false,prev,<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>)}
            <button data-interactive onClick={()=>toggle(playing??0)} style={{width:44,height:44,borderRadius:'50%',background:acc.hex,border:'none',cursor:'pointer',color:'#08051a',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 0 ${isPlaying?28:18}px rgba(${acc.rgb},${isPlaying?0.55:0.35})`,transition:'transform 0.18s,box-shadow 0.3s'}}
            onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.08)';}} onMouseLeave={e=>{e.currentTarget.style.transform='none';}}>
              {isPlaying?<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><rect x="0" y="0" width="4" height="16" rx="1"/><rect x="10" y="0" width="4" height="16" rx="1"/></svg>:<svg width="13" height="16" viewBox="0 0 13 16" fill="currentColor"><path d="M0 0 L13 8 L0 16 Z"/></svg>}
            </button>
            {iconBtn(false,next,<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>)}
            <div style={{width:1,height:20,background:'var(--border)',margin:'0 6px'}}/>
            {iconBtn(shuffle,()=>setShuffle(s=>!s),<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>)}
            {iconBtn(repeat,()=>setRepeat(r=>!r),<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>)}
          </div>
        </div>
        {tracks.map((tr,i)=>(
          <TrackRow key={i} track={tr} index={i} playing={playing===i} progress={progress[i]||0} onToggle={()=>toggle(i)} accent={accent}/>
        ))}
      </div>
    </Section>
  );
}

function TrackRow({ track, index, playing, progress, onToggle, accent }) {
  const [hov,setHov]=useState(false);
  const acc=ACCENTS[accent]||ACCENTS.violet;
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onToggle} data-interactive style={{display:'flex',alignItems:'center',gap:18,padding:'14px 32px',background:playing?`rgba(${acc.rgb},0.04)`:hov?'var(--track-hov)':'transparent',borderBottom:'1px solid var(--border-dim)',cursor:'pointer',transition:'background 0.2s',position:'relative',overflow:'hidden'}}>
      {playing&&<div style={{position:'absolute',bottom:0,left:0,height:1.5,width:`${progress}%`,background:`linear-gradient(90deg,${acc.hex}44,${acc.hex})`,transition:'width 0.12s linear'}}/>}
      <div style={{width:34,height:34,borderRadius:'50%',background:'var(--surface-solid)',border:`1px solid ${playing?acc.hex:'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:playing?acc.hex:'var(--text-faint)',fontSize:11,transition:'all 0.2s',boxShadow:playing?`0 0 10px rgba(${acc.rgb},0.4)`:'none'}}>
        {playing?'■':'▶'}
      </div>
      <div style={{flex:1}}>
        <p style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14.5,fontWeight:500,color:playing?acc.hex:'var(--text-dim)',transition:'color 0.2s'}}>{track.title}</p>
        <p style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-faint)',marginTop:2}}>{track.genre}</p>
      </div>
      <span style={{fontFamily:'monospace',fontSize:12,color:'var(--text-faint)'}}>{track.duration}</span>
    </div>
  );
}

// ── Currently Building ─────────────────────────────────────────────────────

function CurrentlyBuilding({ t, lang, accent }) {
  const acc = ACCENTS[accent]||ACCENTS.violet;
  const [dots,setDots] = useState('...');
  useEffect(()=>{const f=['.','..','...','....'];let i=0;const iv=setInterval(()=>{i=(i+1)%f.length;setDots(f[i]);},500);return()=>clearInterval(iv);},[]);
  const item = currently[0];
  if (!item) return null;

  return (
    <section id="current" style={{padding:'0 0 80px'}}>
      <div style={{maxWidth:1160,margin:'0 auto',padding:'0 80px'}}>
        <div className="reveal" style={{background:'var(--surface)',border:`1px solid ${acc.hex}33`,borderRadius:16,padding:'28px 32px',backdropFilter:'blur(12px)',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${acc.hex},rgba(${acc.rgb},0.15),transparent)`}}/>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:acc.hex,boxShadow:`0 0 12px rgba(${acc.rgb},0.7)`,animation:'livePulse 1.5s ease-in-out infinite'}}/>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:acc.hex,letterSpacing:'2px',textTransform:'uppercase',fontWeight:600}}>{lang==='ko'?'진행 중':lang==='en'?`In progress${dots}`:`En cours${dots}`}</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:32,alignItems:'center'}}>
            <div>
              <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,color:'var(--text)',marginBottom:8,letterSpacing:'-0.3px'}}>{item.title}</h3>
              <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-muted)',lineHeight:1.7,marginBottom:16}}>{item.desc[lang]}</p>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {item.stack.map(s=>(
                  <span key={s} style={{background:'var(--tag-bg)',border:'1px solid var(--tag-border)',color:'var(--tag-color)',fontSize:11,fontWeight:500,padding:'3px 9px',borderRadius:20}}>{s}</span>
                ))}
              </div>
            </div>
            <div style={{textAlign:'center',minWidth:100}}>
              <div style={{width:72,height:72,borderRadius:'50%',border:`2px solid var(--border)`,position:'relative',margin:'0 auto 10px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg style={{position:'absolute',inset:0}} viewBox="0 0 72 72" fill="none">
                  <circle cx="36" cy="36" r="32" stroke="var(--border-dim)" strokeWidth="2"/>
                  <circle cx="36" cy="36" r="32" stroke={acc.hex} strokeWidth="2" strokeLinecap="round"
                    strokeDasharray={`${2*Math.PI*32}`} strokeDashoffset={`${2*Math.PI*32*(1-item.progress/100)}`}
                    transform="rotate(-90 36 36)" style={{filter:`drop-shadow(0 0 4px rgba(${acc.rgb},0.6))`}}/>
                </svg>
                <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:700,color:acc.hex}}>{item.progress}%</span>
              </div>
              <p style={{fontFamily:'monospace',fontSize:10,color:'var(--text-faint)',letterSpacing:'0.5px'}}>{item.since}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── About ──────────────────────────────────────────────────────────────────

function About({ t, lang, accent }) {
  const acc=ACCENTS[accent]||ACCENTS.violet;
  return (
    <Section id="about">
      <SectionHeader title={t.about.title} accent={accent}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:80,alignItems:'start'}}>
        <div className="reveal">
          <div style={{borderRadius:22,overflow:'hidden',position:'relative',border:'1px solid var(--border)',boxShadow:`0 0 80px rgba(${acc.rgb},0.1)`}}>
            <img src="uploads/photo-1776888150170.jpg" alt="Baptiste Niszczota" style={{width:'100%',display:'block',filter:'saturate(0.82) contrast(1.04)'}}/>
            <div style={{position:'absolute',inset:0,background:`linear-gradient(160deg,rgba(${acc.rgb},0.07) 0%,transparent 55%)`}}/>
          </div>
        </div>
        <div className="reveal" style={{transitionDelay:'0.15s',paddingTop:8}}>
          <p style={{fontFamily:"'Inter',sans-serif",fontSize:15.5,color:'var(--text-muted)',lineHeight:1.9,marginBottom:32,fontWeight:300}}>{t.about.bio}</p>
          <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-faint)',lineHeight:1.8,marginBottom:40,fontStyle:'italic',borderLeft:`2px solid ${acc.hex}`,paddingLeft:16}}>{t.about.mindset}</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:48}}>
            {t.about.traits.map(tr=>(<span key={tr} style={{background:'var(--tag-bg)',border:`1px solid rgba(${acc.rgb},0.28)`,color:acc.hex,fontSize:13,fontWeight:500,padding:'7px 18px',borderRadius:20,fontFamily:"'Inter',sans-serif"}}>{tr}</span>))}
          </div>
          <div style={{borderTop:'1px solid var(--border)',paddingTop:28}}>
            <p style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:12,fontWeight:700,color:acc.hex,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:12}}>{t.about.vision}</p>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:15,color:'var(--text-faint)',lineHeight:1.8,fontStyle:'italic'}}>{t.about.visionText}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Education ──────────────────────────────────────────────────────────────

function Education({ t, lang, accent }) {
  const acc=ACCENTS[accent]||ACCENTS.violet;
  return (
    <Section id="education" bg="var(--section-alt)">
      <SectionHeader title={t.education.title} accent={accent}/>
      <div style={{position:'relative',paddingLeft:44}}>
        <div style={{position:'absolute',left:8,top:0,bottom:0,width:1,background:'linear-gradient(to bottom,var(--border) 80%,transparent)'}}/>
        {education.map((e,i)=>(
          <div key={i} className="reveal" style={{transitionDelay:`${i*0.1}s`,position:'relative',marginBottom:48}}>
            <div style={{position:'absolute',left:-40,top:4,width:12,height:12,borderRadius:'50%',background:acc.hex,boxShadow:`0 0 16px rgba(${acc.rgb},0.55)`}}/>
            <p style={{fontFamily:'monospace',fontSize:12,color:acc.hex,letterSpacing:'1px',marginBottom:8}}>{e.year}</p>
            <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:600,color:'var(--text)',marginBottom:5}}>{e.degree[lang]}</h3>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:13.5,color:'var(--text-faint)'}}>{e.school}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Experience ─────────────────────────────────────────────────────────────

function Experience({ t, lang, accent }) {
  const acc=ACCENTS[accent]||ACCENTS.violet;
  return (
    <Section id="experience">
      <SectionHeader title={t.experience.title} accent={accent}/>
      <div style={{display:'flex',flexDirection:'column',gap:18}}>
        {experience.map((e,i)=>(
          <div key={i} className="reveal" style={{transitionDelay:`${i*0.1}s`,background:e.current?'var(--exp-current)':'var(--exp-default)',border:`1px solid ${e.current?acc.hex+'44':'var(--border)'}`,borderRadius:16,padding:'28px 32px',position:'relative',overflow:'hidden',backdropFilter:'blur(10px)'}}>
            {e.current&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${acc.hex},rgba(${acc.rgb},0.2),transparent)`}}/>}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,marginBottom:16}}>
              <div>
                <h3 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,color:'var(--text)',marginBottom:5,letterSpacing:'-0.3px'}}>{e.company}</h3>
                <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:e.current?acc.hex:'var(--text-muted)'}}>{e.role[lang]}</p>
              </div>
              <div style={{textAlign:'right'}}>
                <p style={{fontFamily:'monospace',fontSize:12,color:'var(--text-faint)',letterSpacing:'0.5px'}}>{e.period}</p>
                {e.current&&<span style={{background:`rgba(${acc.rgb},0.12)`,color:acc.hex,fontSize:10.5,fontWeight:700,padding:'3px 10px',borderRadius:20,letterSpacing:'0.5px',display:'inline-block',marginTop:6}}>{t.experience.current}</span>}
              </div>
            </div>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-muted)',lineHeight:1.75,marginBottom:e.outcomes?16:0}}>{e.desc[lang]}</p>
            {e.outcomes && (
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {e.outcomes.map((o,j)=>(
                  <span key={j} style={{background:`rgba(${acc.rgb},0.08)`,border:`1px solid rgba(${acc.rgb},0.2)`,color:acc.hex,fontSize:12,fontWeight:500,padding:'4px 12px',borderRadius:20,fontFamily:"'Inter',sans-serif"}}>{o[lang]}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Contact ────────────────────────────────────────────────────────────────

function Contact({ t, lang, accent }) {
  const [form,setForm]=useState({name:'',email:'',message:''});
  const [sent,setSent]=useState(false);
  const acc=ACCENTS[accent]||ACCENTS.violet;
  const submitBtn=useMagnetic(0.22);
  const fs={width:'100%',background:'var(--input-bg)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 16px',color:'var(--text)',fontFamily:"'Inter',sans-serif",fontSize:14,outline:'none',resize:'vertical',backdropFilter:'blur(8px)',transition:'border-color 0.2s'};
  const fld=k=>({value:form[k],onChange:e=>setForm(f=>({...f,[k]:e.target.value})),onFocus:e=>(e.target.style.borderColor=acc.hex),onBlur:e=>(e.target.style.borderColor='var(--border)'),style:fs});

  return (
    <Section id="contact" bg="var(--section-alt)">
      <SectionHeader title={t.contact.title} subtitle={t.contact.subtitle} accent={accent}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:80}}>
        <div className="reveal">
          {sent?(
            <div style={{textAlign:'center',padding:'60px 0'}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:`rgba(${acc.rgb},0.12)`,border:`1px solid ${acc.hex}44`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px',fontSize:20,color:acc.hex}}>✓</div>
              <p style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,color:acc.hex}}>Message envoyé !</p>
            </div>
          ):(
            <form onSubmit={e=>{e.preventDefault();setSent(true);}} style={{display:'flex',flexDirection:'column',gap:14}}>
              <input placeholder={t.contact.name} required {...fld('name')}/>
              <input type="email" placeholder={t.contact.email} required {...fld('email')}/>
              <textarea rows={5} placeholder={t.contact.message} required {...fld('message')}/>
              <button ref={submitBtn} type="submit" style={{background:acc.hex,color:'#08051a',border:'none',borderRadius:10,padding:'13px',fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:700,cursor:'pointer',transition:'box-shadow 0.2s,transform 0.18s'}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 8px 28px rgba(${acc.rgb},0.4)`}
              onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>{t.contact.send}</button>
            </form>
          )}
        </div>
        <div className="reveal" style={{transitionDelay:'0.15s',paddingTop:8}}>
          <p style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:'var(--text-faint)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:24}}>{t.contact.social}</p>
          {[{label:'LinkedIn',href:'#',icon:'in'},{label:'GitHub',href:'#',icon:'gh'},{label:'Email',href:'mailto:baptiste@example.com',icon:'@'}].map(s=>(
            <a key={s.label} href={s.href} data-interactive style={{display:'flex',alignItems:'center',gap:16,padding:'16px 0',borderBottom:'1px solid var(--border-dim)',textDecoration:'none',color:'var(--text-muted)',transition:'color 0.2s'}}
            onMouseEnter={e=>e.currentTarget.style.color=acc.hex} onMouseLeave={e=>e.currentTarget.style.color='var(--text-muted)'}>
              <span style={{width:36,height:36,background:'var(--surface-solid)',border:'1px solid var(--border)',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontSize:12,color:'var(--text-faint)',flexShrink:0}}>{s.icon}</span>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:15,fontWeight:500}}>{s.label}</span>
              <span style={{marginLeft:'auto',fontSize:14}}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Easter Egg (enhanced, multi-stage) ────────────────────────────────────

function EasterEgg({ visible, onClose, accent }) {
  const [stage, setStage] = useState(0);
  const acc = ACCENTS[accent]||ACCENTS.violet;

  useEffect(() => {
    if (!visible) { setStage(0); return; }
    const t1 = setTimeout(() => setStage(1), 600);
    const t2 = setTimeout(() => setStage(2), 1800);
    const t3 = setTimeout(() => setStage(3), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [visible]);

  useEffect(() => {
    const fn = e => e.key==='Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  if (!visible) return null;

  const jamo = [
    { char:'ㅎ', label:'h', desc:'aspirée' },
    { char:'ㅏ', label:'a', desc:'voyelle' },
    { char:'ㄴ', label:'n', desc:'nasale' },
  ];

  return (
    <div onClick={stage>=3?onClose:undefined} style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(2,1,10,0.98)',backdropFilter:'blur(24px)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',animation:'easterSlide 0.65s cubic-bezier(.22,1,.36,1) both',cursor:stage>=3?'pointer':'default'}}>
      {/* Rings */}
      {[200,340,500,700].map(sz=>(<div key={sz} style={{position:'absolute',width:sz,height:sz,borderRadius:'50%',border:`1px solid rgba(${acc.rgb},${0.1-sz/10000})`,pointerEvents:'none',animation:`${sz%2===0?'spinCw':'spinCcw'} ${22+sz/80}s linear infinite`}}/>))}

      <div style={{textAlign:'center',position:'relative',zIndex:2}}>
        {/* Stage 0: Empty */}
        {/* Stage 1+: Main character */}
        <div style={{fontSize:'clamp(80px,16vw,140px)',lineHeight:1,marginBottom:stage>=2?24:0,textShadow:`0 0 80px rgba(${acc.rgb},0.7)`,color:'#ede8f8',fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,transition:'all 0.6s ease',opacity:stage>=1?1:0,transform:stage>=2?'scale(0.65) translateY(-10px)':'scale(1)'}}>한</div>

        {/* Stage 2: Jamo breakdown */}
        {stage>=2&&(
          <div style={{display:'flex',gap:24,justifyContent:'center',marginBottom:28,opacity:stage>=2?1:0,transition:'opacity 0.5s'}}>
            {jamo.map((j,i)=>(
              <div key={i} style={{textAlign:'center',animation:`fadeUp 0.5s ease ${i*0.12}s both`}}>
                <div style={{fontSize:32,color:acc.hex,fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,marginBottom:4}}>{j.char}</div>
                <div style={{fontFamily:'monospace',fontSize:11,color:'rgba(255,255,255,0.5)',letterSpacing:'0.5px'}}>{j.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Stage 3: Poem + close hint */}
        {stage>=3&&(
          <div style={{opacity:1,animation:'fadeUp 0.7s ease both'}}>
            <div style={{fontFamily:"'Noto Sans KR',sans-serif",fontSize:'clamp(14px,1.8vw,20px)',color:'#a898c8',lineHeight:2.6,marginBottom:32,fontWeight:300}}>
              코드와 음악은<br/>같은 언어를 말한다<br/><span style={{color:acc.hex}}>— 바티스트</span>
            </div>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:'rgba(255,255,255,0.2)',letterSpacing:'2px',textTransform:'uppercase'}}>ESC or click to close</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────

function Footer({ t, accent, onEaster }) {
  const acc=ACCENTS[accent]||ACCENTS.violet;
  const [clicks,setClicks]=useState(0);
  const handle=()=>{const n=clicks+1;setClicks(n);if(n>=3){onEaster();setClicks(0);}};
  return (
    <footer style={{padding:'36px 80px',borderTop:'1px solid var(--border-dim)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <p style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-faint)',opacity:0.5}}>© 2024 Baptiste Niszczota — {t.footer.rights}</p>
      <span title="클릭하세요 :)" onClick={handle} style={{fontFamily:"'Noto Sans KR',sans-serif",fontSize:15,color:'var(--text-faint)',opacity:0.1,cursor:'pointer',transition:'all 0.3s',userSelect:'none',filter:'blur(0.5px)'}}
      onMouseEnter={e=>{e.target.style.color=acc.hex;e.target.style.opacity='1';e.target.style.textShadow=`0 0 20px rgba(${acc.rgb},0.6)`;e.target.style.filter='none';}}
      onMouseLeave={e=>{e.target.style.color='var(--text-faint)';e.target.style.opacity='0.1';e.target.style.textShadow='none';e.target.style.filter='blur(0.5px)';}}>한</span>
    </footer>
  );
}

// ── Tweaks Panel ───────────────────────────────────────────────────────────

function TweaksPanel({ tweaks, setTweaks, visible }) {
  if (!visible) return null;
  const set=(k,v)=>{const next={...tweaks,[k]:v};setTweaks(next);window.parent.postMessage({type:'__edit_mode_set_keys',edits:next},'*');try{localStorage.setItem('portfolio_tweaks',JSON.stringify(next));}catch(e){}};
  return (
    <div style={{position:'fixed',bottom:28,right:28,zIndex:1000,background:'var(--surface-solid)',border:'1px solid var(--border)',borderRadius:16,padding:22,width:240,boxShadow:'0 24px 64px rgba(0,0,0,0.5)',backdropFilter:'blur(20px)'}}>
      <p style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:22}}>Tweaks</p>
      <div style={{marginBottom:20}}>
        <p style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,color:'var(--text-faint)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>Accent</p>
        <div style={{display:'flex',gap:10}}>
          {Object.entries(ACCENTS).map(([k,a])=>(
            <button key={k} onClick={()=>set('accent',k)} title={k} style={{width:28,height:28,borderRadius:'50%',background:a.hex,cursor:'pointer',border:`2px solid ${tweaks.accent===k?'#fff':'transparent'}`,boxShadow:tweaks.accent===k?`0 0 10px rgba(${a.rgb},0.5)`:'none',transition:'all 0.2s'}}/>
          ))}
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <p style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,color:'var(--text-faint)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:10}}>Police</p>
        {[['geometric','Géométrique'],['humanist','Humaniste']].map(([v,l])=>(
          <button key={v} onClick={()=>set('fontStyle',v)} style={{display:'block',width:'100%',background:tweaks.fontStyle===v?'var(--filter-bg)':'none',border:`1px solid ${tweaks.fontStyle===v?'var(--border)':'var(--border-dim)'}`,color:tweaks.fontStyle===v?'var(--text)':'var(--text-faint)',borderRadius:8,padding:'7px 10px',cursor:'pointer',textAlign:'left',marginBottom:5,fontFamily:"'Inter',sans-serif",fontSize:12,transition:'all 0.2s'}}>{l}</button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Nav, Hero, Projects, Music, About, Education, Experience, Contact, Footer, EasterEgg, TweaksPanel, ScrollProgress, FloatingPauseButton, CurrentlyBuilding, useReveal });

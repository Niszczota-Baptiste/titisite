<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanban — Projet principal</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Inter', sans-serif;
      background: #06040f;
      color: #ddd8f0;
      overflow: hidden;
    }
    @media (max-width: 768px) { body { overflow: auto; } }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(120,80,200,0.3); border-radius: 2px; }
    input, textarea, select { font-family: inherit; }
    input::placeholder, textarea::placeholder { color: #4a3860; }

    /* Drag states */
    .card-dragging { opacity: 0.35; transform: scale(0.97); }
    .col-drag-over .col-body { background: rgba(120,80,200,0.06) !important; border-color: rgba(160,110,220,0.4) !important; }

    @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
    @keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:none} }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes slideUp { from{opacity:0;transform:translateY(60px)} to{opacity:1;transform:none} }
  </style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useRef, useCallback, useEffect, useMemo } = React;

// ── Data ────────────────────────────────────────────────────────────────────

const PRIORITIES = {
  critical: { label:'Critique',  color:'#ff5757', bg:'rgba(255,87,87,0.12)'  },
  high:     { label:'Haute',     color:'#ff9a3c', bg:'rgba(255,154,60,0.12)' },
  medium:   { label:'Moyenne',   color:'#c9a8e8', bg:'rgba(201,168,232,0.1)' },
  low:      { label:'Basse',     color:'#6a6080', bg:'rgba(106,96,128,0.1)'  },
};

const MEMBERS = {
  Baptiste: { initials:'BA', color:'#c9a8e8' },
  Marie:    { initials:'ML', color:'#9ad4ae' },
  Julien:   { initials:'JD', color:'#e8a87c' },
  Sofia:    { initials:'SR', color:'#7eb8f7' },
};

const initCards = [
  { id:'c1', title:'Refonte UI dashboard', desc:'Revoir les composants de navigation et les couleurs du tableau de bord principal.', col:'backlog', priority:'high', tags:['#UI','#FRONTEND'], assignees:['Baptiste','Marie'], subtasks:[{d:'Audit composants',done:true},{d:'Maquettes Figma',done:true},{d:'Intégration React',done:false}], due:'2024-05-10', comments:3, attachments:1 },
  { id:'c2', title:'Intégration API REST', desc:"Connecter les endpoints de l'API v2 aux nouveaux formulaires.", col:'backlog', priority:'medium', tags:['#API','#BACKEND'], assignees:['Julien'], subtasks:[{d:'Auth token',done:false},{d:'GET /clients',done:false},{d:'POST /tasks',done:false}], due:'2024-05-18', comments:1, attachments:0 },
  { id:'c3', title:'Tests E2E Cypress', desc:'Écrire les tests end-to-end pour les flux critiques.', col:'todo', priority:'high', tags:['#TEST','#QA'], assignees:['Sofia','Baptiste'], subtasks:[{d:'Config Cypress',done:true},{d:'Test login flow',done:false},{d:'Test création projet',done:false}], due:'2024-04-28', comments:5, attachments:2 },
  { id:'c4', title:'Optimisation requêtes SQL', desc:'Identifier et corriger les N+1 queries sur les pages liste.', col:'todo', priority:'critical', tags:['#BACKEND','#PERF'], assignees:['Julien'], subtasks:[{d:'Profiling queries',done:false},{d:'Index manquants',done:false}], due:'2024-04-25', comments:2, attachments:0 },
  { id:'c5', title:'Documentation API', desc:'Rédiger la documentation Swagger pour tous les endpoints.', col:'inprogress', priority:'medium', tags:['#DOCS','#API'], assignees:['Marie'], subtasks:[{d:'Endpoints auth',done:true},{d:'Endpoints projets',done:true},{d:'Endpoints tâches',done:false},{d:'Exemples',done:false}], due:'2024-05-02', comments:0, attachments:3 },
  { id:'c6', title:'Migration base de données', desc:'Migrer vers PostgreSQL 16, tester les performances.', col:'inprogress', priority:'critical', tags:['#BACKEND','#DB'], assignees:['Baptiste','Julien'], subtasks:[{d:'Backup prod',done:true},{d:'Script migration',done:true},{d:'Tests staging',done:false},{d:'Go live',done:false}], due:'2024-04-30', comments:8, attachments:1 },
  { id:'c7', title:'Page 404 custom', desc:'Créer une page 404 créative avec redirection automatique.', col:'done', priority:'low', tags:['#UI','#FRONTEND'], assignees:['Marie'], subtasks:[{d:'Design',done:true},{d:'Intégration',done:true}], due:'2024-04-20', comments:2, attachments:0 },
  { id:'c8', title:'Système de notifications', desc:'Notifications push temps réel via WebSockets.', col:'done', priority:'high', tags:['#FEATURE','#REALTIME'], assignees:['Baptiste','Sofia'], subtasks:[{d:'Backend WS',done:true},{d:'Frontend UI',done:true},{d:'Tests charge',done:true}], due:'2024-04-15', comments:12, attachments:4 },
];

const COLS = [
  { id:'backlog',    label:'Backlog',    accent:'#6a6080' },
  { id:'todo',       label:'À faire',    accent:'#7eb8f7' },
  { id:'inprogress', label:'En cours',   accent:'#c9a8e8' },
  { id:'done',       label:'Terminé',    accent:'#9ad4ae' },
];

const ALL_TAGS = ['#UI','#FRONTEND','#API','#BACKEND','#TEST','#QA','#PERF','#DOCS','#DB','#FEATURE','#REALTIME'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ name, size=24 }) {
  const m = MEMBERS[name];
  if (!m) return null;
  return (
    <div title={name} style={{width:size,height:size,borderRadius:'50%',background:`rgba(${hexToRgb(m.color)},0.18)`,border:`1.5px solid ${m.color}55`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.38,fontWeight:700,color:m.color,fontFamily:"'Space Grotesk',sans-serif",flexShrink:0}}>
      {m.initials}
    </div>
  );
}

function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function PriorityDot({ priority }) {
  const p = PRIORITIES[priority];
  if (!p) return null;
  return <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:p.color,boxShadow:`0 0 6px ${p.color}`,flexShrink:0}} title={p.label}/>;
}

function Tag({ label }) {
  const colors = { '#UI':'#7eb8f7','#FRONTEND':'#7eb8f7','#API':'#c9a8e8','#BACKEND':'#e8a87c','#TEST':'#9ad4ae','#QA':'#9ad4ae','#PERF':'#ff9a3c','#DOCS':'#c9a8e8','#DB':'#e8a87c','#FEATURE':'#c9a8e8','#REALTIME':'#ff9a3c','#TETETE':'#c9a8e8' };
  const color = colors[label] || '#8060a8';
  return (
    <span style={{background:`rgba(${hexToRgb(color)},0.1)`,border:`1px solid rgba(${hexToRgb(color)},0.25)`,color,fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:20,letterSpacing:'0.3px',whiteSpace:'nowrap'}}>
      {label}
    </span>
  );
}

function DueDate({ date, done }) {
  if (!date) return null;
  const d = new Date(date); const now = new Date();
  const late = !done && d < now;
  const soon = !done && !late && (d - now) < 3*86400000;
  const color = done ? '#4a3860' : late ? '#ff5757' : soon ? '#ff9a3c' : '#6a6080';
  const fmt = d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
  return (
    <span style={{display:'flex',alignItems:'center',gap:4,color,fontSize:11,fontWeight:late?600:400}}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2"/></svg>
      {fmt}
    </span>
  );
}

function SubtaskBar({ subtasks }) {
  if (!subtasks?.length) return null;
  const done = subtasks.filter(s=>s.done).length;
  const pct = Math.round(done/subtasks.length*100);
  return (
    <div style={{display:'flex',alignItems:'center',gap:7}}>
      <div style={{flex:1,height:3,background:'rgba(80,50,130,0.25)',borderRadius:2,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:pct===100?'#9ad4ae':'#c9a8e8',borderRadius:2,transition:'width 0.3s'}}/>
      </div>
      <span style={{fontSize:10,color:'#6a6080',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{done}/{subtasks.length}</span>
    </div>
  );
}

// ── Card Detail Modal ────────────────────────────────────────────────────────

function CardModal({ card, onClose, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle]     = useState(card.title);
  const [desc, setDesc]       = useState(card.desc);
  const [subtasks, setSubs]   = useState(card.subtasks);
  const [newSub, setNewSub]   = useState('');
  const p = PRIORITIES[card.priority];

  useEffect(() => {
    const fn = e => e.key==='Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const toggleSub = i => {
    const next = subtasks.map((s,j)=>j===i?{...s,done:!s.done}:s);
    setSubs(next); onUpdate({...card,subtasks:next});
  };
  const addSub = () => {
    if (!newSub.trim()) return;
    const next = [...subtasks,{d:newSub.trim(),done:false}];
    setSubs(next); onUpdate({...card,subtasks:next}); setNewSub('');
  };
  const save = () => { onUpdate({...card,title,desc}); setEditing(false); };

  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(3,2,10,0.85)',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{background:'#0c0820',border:'1px solid rgba(120,80,200,0.28)',borderRadius:18,width:'100%',maxWidth:580,maxHeight:'88vh',overflowY:'auto',animation:'slideIn 0.28s ease both',boxShadow:'0 40px 100px rgba(0,0,0,0.6)'}}>
        {/* Header */}
        <div style={{padding:'24px 28px 0',borderBottom:'1px solid rgba(60,40,100,0.2)',paddingBottom:20}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:14}}>
            <div style={{flex:1}}>
              {editing
                ? <input value={title} onChange={e=>setTitle(e.target.value)} style={{width:'100%',background:'rgba(20,12,40,0.8)',border:'1px solid rgba(120,80,200,0.4)',borderRadius:8,padding:'8px 12px',color:'#ede8f8',fontSize:18,fontWeight:700,fontFamily:"'Space Grotesk',sans-serif",outline:'none'}}/>
                : <h2 onClick={()=>setEditing(true)} style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:'#ede8f8',cursor:'text',lineHeight:1.3}}>{title}</h2>}
            </div>
            <button onClick={onClose} style={{background:'none',border:'none',color:'#6a6080',cursor:'pointer',fontSize:20,padding:4,lineHeight:1}}>×</button>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
            <span style={{background:p.bg,color:p.color,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,border:`1px solid ${p.color}33`}}>{p.label}</span>
            {card.tags.map(t=><Tag key={t} label={t}/>)}
            <DueDate date={card.due} done={card.col==='done'}/>
          </div>
        </div>

        <div style={{padding:'20px 28px',display:'flex',flexDirection:'column',gap:24}}>
          {/* Assignees */}
          <div>
            <p style={{fontSize:11,color:'#4a3860',letterSpacing:'1.2px',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Assignés</p>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {card.assignees.map(a=>(
                <div key={a} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(20,12,40,0.6)',border:'1px solid rgba(80,50,130,0.2)',borderRadius:20,padding:'5px 12px 5px 6px'}}>
                  <Avatar name={a} size={22}/>
                  <span style={{fontSize:13,color:'#c8c0d8',fontWeight:500}}>{a}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <p style={{fontSize:11,color:'#4a3860',letterSpacing:'1.2px',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Description</p>
            {editing
              ? <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} style={{width:'100%',background:'rgba(20,12,40,0.8)',border:'1px solid rgba(120,80,200,0.3)',borderRadius:8,padding:'10px 12px',color:'#a898c8',fontSize:14,outline:'none',resize:'vertical',lineHeight:1.7}}/>
              : <p onClick={()=>setEditing(true)} style={{fontSize:14,color:'#7a6888',lineHeight:1.75,cursor:'text'}}>{desc}</p>}
            {editing && (
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button onClick={save} style={{background:'#c9a8e8',color:'#08051a',border:'none',borderRadius:7,padding:'7px 16px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Enregistrer</button>
                <button onClick={()=>setEditing(false)} style={{background:'none',border:'1px solid rgba(80,50,130,0.3)',color:'#6a6080',borderRadius:7,padding:'7px 16px',fontSize:12,cursor:'pointer'}}>Annuler</button>
              </div>
            )}
          </div>

          {/* Subtasks */}
          <div>
            <p style={{fontSize:11,color:'#4a3860',letterSpacing:'1.2px',textTransform:'uppercase',marginBottom:12,fontWeight:600}}>
              Sous-tâches — {subtasks.filter(s=>s.done).length}/{subtasks.length}
            </p>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
              {subtasks.map((s,i)=>(
                <label key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'rgba(14,9,28,0.5)',borderRadius:8,border:'1px solid rgba(60,40,100,0.2)',cursor:'pointer'}}>
                  <div onClick={()=>toggleSub(i)} style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${s.done?'#9ad4ae':'rgba(100,70,160,0.4)'}`,background:s.done?'rgba(154,212,174,0.15)':'none',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer',transition:'all 0.2s'}}>
                    {s.done&&<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#9ad4ae" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{fontSize:13,color:s.done?'#4a3860':'#a898c8',textDecoration:s.done?'line-through':'none',transition:'all 0.2s'}}>{s.d}</span>
                </label>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <input value={newSub} onChange={e=>setNewSub(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addSub()} placeholder="Ajouter une sous-tâche…" style={{flex:1,background:'rgba(14,9,28,0.6)',border:'1px solid rgba(80,50,130,0.2)',borderRadius:8,padding:'8px 12px',color:'#ede8f8',fontSize:13,outline:'none'}}/>
              <button onClick={addSub} style={{background:'rgba(80,50,130,0.2)',border:'1px solid rgba(120,80,200,0.3)',color:'#c9a8e8',borderRadius:8,padding:'8px 14px',fontSize:13,cursor:'pointer'}}>+</button>
            </div>
          </div>

          {/* Meta */}
          <div style={{display:'flex',gap:20,paddingTop:12,borderTop:'1px solid rgba(60,40,100,0.15)'}}>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#6a6080'}}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1a6 6 0 1 0 0 12A6 6 0 0 0 7 1zM7 4v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              {card.comments} commentaires
            </span>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#6a6080'}}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 2h10v9H2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="4" y1="8" x2="7" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              {card.attachments} pièces jointes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ card, onDragStart, onDragEnd, onMove, colId, onClick }) {
  const [hov, setHov] = useState(false);
  const p = PRIORITIES[card.priority];
  const isDone = colId === 'done';

  return (
    <div
      draggable
      onDragStart={e=>onDragStart(e,card)}
      onDragEnd={onDragEnd}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      onClick={()=>onClick(card)}
      style={{
        background: hov ? 'rgba(22,14,42,0.95)' : 'rgba(14,9,28,0.8)',
        border:`1px solid ${hov?'rgba(160,110,220,0.35)':'rgba(80,50,130,0.22)'}`,
        borderLeft: `3px solid ${p.color}`,
        borderRadius:10, padding:'14px 14px 12px',
        cursor:'pointer', userSelect:'none',
        transition:'all 0.22s cubic-bezier(.22,1,.36,1)',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
        backdropFilter:'blur(8px)',
        animation:'fadeIn 0.28s ease both'
      }}
    >
      {/* Top row: priority + title */}
      <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:8}}>
        <PriorityDot priority={card.priority}/>
        <p style={{fontSize:13.5,fontWeight:600,color:isDone?'#6a6080':'#ddd8f0',lineHeight:1.4,flex:1,textDecoration:isDone?'line-through':'none',textDecorationColor:'#4a3860',fontFamily:"'Space Grotesk',sans-serif"}}>{card.title}</p>
      </div>

      {/* Tags */}
      {card.tags.length>0 && (
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:10}}>
          {card.tags.map(t=><Tag key={t} label={t}/>)}
        </div>
      )}

      {/* Subtask bar */}
      {card.subtasks?.length > 0 && (
        <div style={{marginBottom:10}}><SubtaskBar subtasks={card.subtasks}/></div>
      )}

      {/* Bottom row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div style={{display:'flex',gap:4}}>
          {card.assignees.map(a=><Avatar key={a} name={a} size={22}/>)}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {card.comments>0&&<span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#6a6080'}}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2h8v6H7L5 10V8H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>{card.comments}
          </span>}
          {card.attachments>0&&<span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#6a6080'}}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M7.5 1 L10 1 L10 11 L2 11 L2 1 L6 1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 1 L6 5 L8.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>{card.attachments}
          </span>}
          <DueDate date={card.due} done={isDone}/>
        </div>
      </div>
    </div>
  );
}

// ── Add Card Form ────────────────────────────────────────────────────────────

function AddCardForm({ colId, onAdd, onCancel, accent }) {
  const [title, setTitle] = useState('');
  const [priority, setPri] = useState('medium');
  const ref = useRef();
  useEffect(()=>{ref.current?.focus();},[]);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ id:`c${Date.now()}`, title:title.trim(), desc:'', col:colId, priority, tags:[], assignees:[], subtasks:[], due:null, comments:0, attachments:0 });
    setTitle('');
  };

  return (
    <div style={{background:'rgba(14,9,28,0.9)',border:'1px solid rgba(120,80,200,0.35)',borderRadius:10,padding:14,animation:'fadeIn 0.2s ease both'}}>
      <input ref={ref} value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();if(e.key==='Escape')onCancel();}} placeholder="Titre de la tâche…" style={{width:'100%',background:'rgba(20,12,40,0.7)',border:'1px solid rgba(80,50,130,0.3)',borderRadius:7,padding:'8px 10px',color:'#ede8f8',fontSize:13,outline:'none',marginBottom:10}}/>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {Object.entries(PRIORITIES).map(([k,v])=>(
          <button key={k} onClick={()=>setPri(k)} style={{flex:1,background:priority===k?v.bg:'none',border:`1px solid ${priority===k?v.color+'55':'rgba(60,40,100,0.3)'}`,color:priority===k?v.color:'#6a6080',borderRadius:6,padding:'4px 0',fontSize:10,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>
            {v.label.slice(0,3)}
          </button>
        ))}
      </div>
      <div style={{display:'flex',gap:6}}>
        <button onClick={submit} style={{flex:1,background:'#c9a8e8',color:'#08051a',border:'none',borderRadius:7,padding:'7px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Ajouter</button>
        <button onClick={onCancel} style={{background:'none',border:'1px solid rgba(60,40,100,0.3)',color:'#6a6080',borderRadius:7,padding:'7px 12px',fontSize:12,cursor:'pointer'}}>×</button>
      </div>
    </div>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────

function Column({ col, cards, dragOver, onDragOver, onDrop, onDragStart, onDragEnd, onCardClick, onAdd, onCardUpdate }) {
  const [adding, setAdding] = useState(false);
  const total = cards.length;
  const done  = col.id==='done' ? total : cards.filter(c=>c.subtasks?.length&&c.subtasks.every(s=>s.done)).length;

  return (
    <div className={dragOver?'col-drag-over':''} onDragOver={onDragOver} onDrop={onDrop}
      style={{display:'flex',flexDirection:'column',minWidth:280,flex:1,maxWidth:340}}>
      {/* Column header */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'0 4px',marginBottom:12}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:col.accent,boxShadow:`0 0 8px ${col.accent}`,flexShrink:0}}/>
        <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:700,color:'#ddd8f0',letterSpacing:'-0.2px',flex:1}}>{col.label}</span>
        <span style={{background:'rgba(80,50,130,0.2)',border:'1px solid rgba(80,50,130,0.25)',color:'#6a6080',fontSize:11,fontWeight:700,padding:'1px 8px',borderRadius:20,minWidth:22,textAlign:'center'}}>{total}</span>
      </div>

      {/* Progress bar */}
      {total>0 && (
        <div style={{height:2,background:'rgba(60,40,100,0.3)',borderRadius:1,marginBottom:12,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${col.id==='done'?100:done/total*100}%`,background:col.accent,borderRadius:1,transition:'width 0.4s',boxShadow:`0 0 6px ${col.accent}`}}/>
        </div>
      )}

      {/* Cards body */}
      <div className="col-body" style={{flex:1,display:'flex',flexDirection:'column',gap:8,padding:'8px',background:'rgba(8,5,18,0.4)',borderRadius:12,border:'1px solid rgba(60,40,100,0.15)',minHeight:120,transition:'all 0.2s',overflowY:'auto',maxHeight:'calc(100vh - 260px)'}}>
        {cards.map(card=>(
          <KanbanCard key={card.id} card={card} colId={col.id}
            onDragStart={onDragStart} onDragEnd={onDragEnd}
            onMove={()=>{}} onClick={onCardClick}/>
        ))}
        {cards.length===0&&!adding&&(
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:'28px 0',opacity:0.35}}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#6a6080" strokeWidth="1.5" strokeDasharray="3 2"/></svg>
            <span style={{fontSize:12,color:'#4a3860'}}>Aucune tâche</span>
          </div>
        )}
        {adding && <AddCardForm colId={col.id} onAdd={card=>{onAdd(card);setAdding(false);}} onCancel={()=>setAdding(false)}/>}
      </div>

      {/* Add button */}
      {!adding && (
        <button onClick={()=>setAdding(true)} style={{marginTop:8,background:'none',border:'1px dashed rgba(80,50,130,0.25)',color:'#4a3860',borderRadius:8,padding:'8px',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all 0.2s'}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(160,110,220,0.4)';e.currentTarget.style.color='#c9a8e8';}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(80,50,130,0.25)';e.currentTarget.style.color='#4a3860';}}>
          <span style={{fontSize:16,lineHeight:1}}>+</span> Nouvelle tâche
        </button>
      )}
    </div>
  );
}

// ── Sprint Stats ─────────────────────────────────────────────────────────────

function SprintStats({ cards }) {
  const byPri  = Object.keys(PRIORITIES).map(k=>({k,count:cards.filter(c=>c.priority===k).length}));
  const done   = cards.filter(c=>c.col==='done').length;
  const total  = cards.length;
  const late   = cards.filter(c=>c.due&&new Date(c.due)<new Date()&&c.col!=='done').length;

  return (
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      {[
        { label:'Total', value:total, color:'#c9a8e8' },
        { label:'Terminé', value:`${done}/${total}`, color:'#9ad4ae' },
        { label:'En retard', value:late, color: late>0?'#ff5757':'#4a3860' },
        { label:'Critique', value:cards.filter(c=>c.priority==='critical'&&c.col!=='done').length, color:'#ff5757' },
      ].map(s=>(
        <div key={s.label} style={{background:'rgba(14,9,28,0.7)',border:'1px solid rgba(60,40,100,0.2)',borderRadius:10,padding:'8px 16px',display:'flex',flexDirection:'column',gap:2,backdropFilter:'blur(8px)'}}>
          <span style={{fontSize:10,color:'#4a3860',letterSpacing:'0.8px',textTransform:'uppercase',fontWeight:600}}>{s.label}</span>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:s.color}}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function useIsMobile(bp=768){const[m,setM]=useState(()=>window.innerWidth<bp);useEffect(()=>{const f=()=>setM(window.innerWidth<bp);window.addEventListener('resize',f,{passive:true});return()=>window.removeEventListener('resize',f);},[bp]);return m;}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [cards, setCards]       = useState(initCards);
  const [search, setSearch]     = useState('');
  const [tagFilter, setTagF]    = useState([]);
  const [priFilter, setPriF]    = useState([]);
  const [dragCard, setDragCard] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [modal, setModal]       = useState(null);
  const [showFilter, setShowF]  = useState(false);
  const [activeCol, setActiveCol] = useState('backlog');
  const mobile = useIsMobile();

  const allTags = useMemo(()=>[...new Set(cards.flatMap(c=>c.tags))],[cards]);

  const filtered = useMemo(()=>cards.filter(c=>{
    if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.desc.toLowerCase().includes(search.toLowerCase())) return false;
    if (tagFilter.length && !tagFilter.every(t=>c.tags.includes(t))) return false;
    if (priFilter.length && !priFilter.includes(c.priority)) return false;
    return true;
  }),[cards,search,tagFilter,priFilter]);

  const byCol = id => filtered.filter(c=>c.col===id);

  const onDragStart = (e,card) => { setDragCard(card); e.currentTarget.classList.add('card-dragging'); };
  const onDragEnd   = e => { e.currentTarget.classList.remove('card-dragging'); setDragCard(null); setDragOver(null); };
  const onDragOver  = (e,colId) => { e.preventDefault(); setDragOver(colId); };
  const onDrop      = (e,colId) => {
    e.preventDefault();
    if (!dragCard || dragCard.col===colId) { setDragOver(null); return; }
    setCards(cs=>cs.map(c=>c.id===dragCard.id?{...c,col:colId}:c));
    setDragOver(null);
  };

  const addCard    = c => setCards(cs=>[...cs,c]);
  const updateCard = c => { setCards(cs=>cs.map(x=>x.id===c.id?c:x)); if(modal?.id===c.id) setModal(c); };

  const toggleTag = t => setTagF(f=>f.includes(t)?f.filter(x=>x!==t):[...f,t]);
  const togglePri = p => setPriF(f=>f.includes(p)?f.filter(x=>x!==p):[...f,p]);
  const clearAll  = () => { setTagF([]); setPriF([]); setSearch(''); };

  const activeFilters = tagFilter.length + priFilter.length + (search?1:0);

  // ── Mobile layout ──
  if (mobile) {
    const col = COLS.find(c=>c.id===activeCol);
    const colCards = byCol(activeCol);
    return (
      <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:'#06040f'}}>
        <nav style={{height:52,background:'rgba(6,4,15,0.97)',borderBottom:'1px solid rgba(60,40,100,0.25)',display:'flex',alignItems:'center',padding:'0 16px',gap:8,position:'sticky',top:0,zIndex:50,backdropFilter:'blur(12px)'}}>
          <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:15,color:'#ede8f8'}}>Baptiste.</span>
          <span style={{color:'#4a3860',fontSize:13}}>/</span>
          <span style={{fontSize:13,color:'#c8c0d8',fontWeight:500}}>Kanban</span>
          <div style={{flex:1}}/>
          <div style={{width:28,height:28,borderRadius:'50%',background:'rgba(201,168,232,0.15)',border:'1.5px solid rgba(201,168,232,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#c9a8e8',fontFamily:"'Space Grotesk',sans-serif"}}>BA</div>
        </nav>
        <div style={{padding:'10px 16px',background:'rgba(6,4,15,0.9)',borderBottom:'1px solid rgba(60,40,100,0.12)',display:'flex',gap:8,alignItems:'center',position:'sticky',top:52,zIndex:40}}>
          <div style={{position:'relative',flex:1}}>
            <svg style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)'}} width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#4a3860" strokeWidth="1.3"/><line x1="9.5" y1="9.5" x2="12" y2="12" stroke="#4a3860" strokeWidth="1.3" strokeLinecap="round"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…" style={{width:'100%',background:'rgba(14,9,28,0.7)',border:'1px solid rgba(60,40,100,0.25)',borderRadius:8,padding:'8px 10px 8px 28px',color:'#c8c0d8',fontSize:13,outline:'none'}}/>
          </div>
          <button onClick={()=>setCards(cs=>[...cs,{id:`c${Date.now()}`,title:'Nouvelle tâche',desc:'',col:activeCol,priority:'medium',tags:[],assignees:[],subtasks:[],due:null,comments:0,attachments:0}])} style={{background:'#c9a8e8',color:'#08051a',border:'none',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:700,cursor:'pointer',flexShrink:0}}>+ Ajouter</button>
        </div>
        <div style={{padding:'10px 16px',display:'flex',gap:8,overflowX:'auto',background:'rgba(6,4,15,0.8)',borderBottom:'1px solid rgba(60,40,100,0.1)'}}>
          {[{label:'Total',value:cards.length,color:'#c9a8e8'},{label:'Terminé',value:`${cards.filter(c=>c.col==='done').length}/${cards.length}`,color:'#9ad4ae'},{label:'Retard',value:cards.filter(c=>c.due&&new Date(c.due)<new Date()&&c.col!=='done').length,color:'#ff5757'}].map(s=>(
            <div key={s.label} style={{background:'rgba(14,9,28,0.7)',border:'1px solid rgba(60,40,100,0.2)',borderRadius:10,padding:'6px 14px',flexShrink:0}}>
              <p style={{fontSize:9,color:'#4a3860',letterSpacing:'0.8px',textTransform:'uppercase',fontWeight:600,marginBottom:2}}>{s.label}</p>
              <p style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,color:s.color}}>{s.value}</p>
            </div>
          ))}
        </div>
        <div style={{flex:1,padding:'16px 16px 100px',display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:col.accent,boxShadow:`0 0 8px ${col.accent}`}}/>
            <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:700,color:'#ddd8f0'}}>{col.label}</span>
            <span style={{background:'rgba(80,50,130,0.2)',border:'1px solid rgba(80,50,130,0.25)',color:'#6a6080',fontSize:11,fontWeight:700,padding:'1px 8px',borderRadius:20}}>{colCards.length}</span>
          </div>
          {colCards.length===0&&(<div style={{textAlign:'center',padding:'60px 0',opacity:0.35}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{margin:'0 auto 12px',display:'block'}}><rect x="3" y="3" width="18" height="18" rx="3" stroke="#6a6080" strokeWidth="1.5" strokeDasharray="3 2"/></svg><p style={{fontSize:13,color:'#4a3860'}}>Aucune tâche</p></div>)}
          {colCards.map(card=>(<KanbanCard key={card.id} card={card} colId={activeCol} onDragStart={()=>{}} onDragEnd={()=>{}} onMove={()=>{}} onClick={setModal}/>))}
        </div>
        <div style={{position:'fixed',bottom:0,left:0,right:0,height:64,background:'rgba(4,3,12,0.97)',borderTop:'1px solid rgba(60,40,100,0.25)',backdropFilter:'blur(16px)',display:'flex',zIndex:50}}>
          {COLS.map(c=>{
            const cnt=byCol(c.id).length;
            const active=activeCol===c.id;
            return (<button key={c.id} onClick={()=>setActiveCol(c.id)} style={{flex:1,background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,borderTop:`2px solid ${active?c.accent:'transparent'}`,transition:'all 0.2s'}}>
              <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:11,fontWeight:active?700:400,color:active?c.accent:'#4a3860'}}>{c.label}</span>
              {cnt>0&&<span style={{background:active?c.accent:'rgba(80,50,130,0.3)',color:active?'#08051a':'#6a6080',borderRadius:20,fontSize:9,fontWeight:800,padding:'1px 6px'}}>{cnt}</span>}
            </button>);
          })}
        </div>
        {modal&&(
          <div onClick={e=>{if(e.target===e.currentTarget)setModal(null);}} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(3,2,10,0.9)',backdropFilter:'blur(16px)',display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
            <div style={{background:'#0c0820',borderRadius:'20px 20px 0 0',border:'1px solid rgba(120,80,200,0.28)',maxHeight:'85vh',overflowY:'auto',animation:'slideUp 0.3s ease both'}}>
              <div style={{display:'flex',justifyContent:'center',padding:'12px 0 6px'}}><div style={{width:40,height:4,borderRadius:2,background:'rgba(120,80,200,0.3)'}}/></div>
              <div style={{padding:'0 20px 32px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:12}}>
                  <h2 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:17,fontWeight:700,color:'#ede8f8',lineHeight:1.3}}>{modal.title}</h2>
                  <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'#6a6080',cursor:'pointer',fontSize:22,padding:0,lineHeight:1,flexShrink:0}}>×</button>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
                  <span style={{background:PRIORITIES[modal.priority].bg,color:PRIORITIES[modal.priority].color,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>{PRIORITIES[modal.priority].label}</span>
                  {modal.tags.map(t=><Tag key={t} label={t}/>)}
                  <DueDate date={modal.due} done={modal.col==='done'}/>
                </div>
                <p style={{fontSize:11,color:'#4a3860',letterSpacing:'1px',textTransform:'uppercase',fontWeight:600,marginBottom:8}}>Déplacer vers</p>
                <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
                  {COLS.map(c=>(<button key={c.id} onClick={()=>{updateCard({...modal,col:c.id});setModal(null);setActiveCol(c.id);}} style={{background:modal.col===c.id?c.accent:'rgba(20,12,40,0.8)',color:modal.col===c.id?'#08051a':'#6a6080',border:`1px solid ${modal.col===c.id?c.accent:'rgba(60,40,100,0.3)'}`,borderRadius:20,padding:'6px 14px',fontSize:12,fontWeight:modal.col===c.id?700:400,cursor:'pointer'}}>{c.label}</button>))}
                </div>
                {modal.desc&&<p style={{fontSize:14,color:'#7a6888',lineHeight:1.75,marginBottom:16}}>{modal.desc}</p>}
                {modal.subtasks?.length>0&&(
                  <div>
                    <p style={{fontSize:11,color:'#4a3860',letterSpacing:'1px',textTransform:'uppercase',fontWeight:600,marginBottom:8}}>Sous-tâches — {modal.subtasks.filter(s=>s.done).length}/{modal.subtasks.length}</p>
                    <div style={{marginBottom:10}}><SubtaskBar subtasks={modal.subtasks}/></div>
                    {modal.subtasks.map((s,i)=>(<label key={i} onClick={()=>{const next={...modal,subtasks:modal.subtasks.map((x,j)=>j===i?{...x,done:!x.done}:x)};updateCard(next);}} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'rgba(14,9,28,0.5)',borderRadius:8,cursor:'pointer',marginBottom:5}}>
                      <div style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${s.done?'#9ad4ae':'rgba(100,70,160,0.4)'}`,background:s.done?'rgba(154,212,174,0.15)':'none',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {s.done&&<svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#9ad4ae" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span style={{fontSize:13,color:s.done?'#4a3860':'#a898c8',textDecoration:s.done?'line-through':'none'}}>{s.d}</span>
                    </label>))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Desktop layout ──
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>
      {/* Top Nav */}
      <nav style={{height:52,background:'rgba(6,4,15,0.95)',borderBottom:'1px solid rgba(60,40,100,0.25)',display:'flex',alignItems:'center',padding:'0 24px',gap:0,flexShrink:0,backdropFilter:'blur(12px)'}}>
        <span style={{fontFamily:"'Space Grotesk',sans-serif",fontWeight:700,fontSize:16,color:'#ede8f8',marginRight:8}}>Baptiste.</span>
        <span style={{color:'#4a3860',fontSize:14,margin:'0 6px'}}>/</span>
        <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(20,12,40,0.6)',border:'1px solid rgba(80,50,130,0.3)',borderRadius:6,padding:'4px 10px'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#c9a8e8',boxShadow:'0 0 6px #c9a8e8'}}/>
          <span style={{fontSize:13,color:'#c8c0d8',fontWeight:500}}>Projet principal</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4l2 2 2-2" stroke="#6a6080" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:8}}>
          {['Discussion','Admin','Site'].map(l=>(
            <button key={l} style={{background:'none',border:'1px solid rgba(60,40,100,0.2)',color:'#6a6080',borderRadius:6,padding:'4px 12px',fontSize:12,cursor:'pointer',transition:'all 0.2s'}}
            onMouseEnter={e=>{e.currentTarget.style.color='#c9a8e8';e.currentTarget.style.borderColor='rgba(120,80,200,0.4)';}}
            onMouseLeave={e=>{e.currentTarget.style.color='#6a6080';e.currentTarget.style.borderColor='rgba(60,40,100,0.2)';}}>
              {l}
            </button>
          ))}
          <div style={{width:30,height:30,borderRadius:'50%',background:'rgba(201,168,232,0.15)',border:'1.5px solid rgba(201,168,232,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#c9a8e8',fontFamily:"'Space Grotesk',sans-serif"}}>BA</div>
        </div>
      </nav>

      {/* Tabs */}
      <div style={{height:44,background:'rgba(6,4,15,0.9)',borderBottom:'1px solid rgba(60,40,100,0.15)',display:'flex',alignItems:'center',padding:'0 24px',gap:2,flexShrink:0}}>
        {['Vue d\'ensemble','Kanban','Calendrier','Documents','Builds','Réunions'].map((tab,i)=>(
          <button key={tab} style={{background:i===1?'rgba(120,80,200,0.12)':'none',border:'none',borderBottom:i===1?'2px solid #c9a8e8':'2px solid transparent',color:i===1?'#c9a8e8':'#6a6080',padding:'10px 16px',cursor:'pointer',fontSize:13,fontWeight:i===1?600:400,transition:'all 0.2s'}}
          onMouseEnter={e=>{if(i!==1){e.currentTarget.style.color='#a898c8';}}}
          onMouseLeave={e=>{if(i!==1){e.currentTarget.style.color='#6a6080';}}}>
            {tab}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{padding:'14px 24px',background:'rgba(6,4,15,0.8)',borderBottom:'1px solid rgba(60,40,100,0.12)',display:'flex',alignItems:'center',gap:12,flexShrink:0,flexWrap:'wrap'}}>
        <h1 style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,color:'#ede8f8',letterSpacing:'-0.5px',marginRight:4}}>Kanban</h1>

        <SprintStats cards={cards}/>

        <div style={{flex:1}}/>

        {/* Search */}
        <div style={{position:'relative'}}>
          <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}} width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#4a3860" strokeWidth="1.3"/><line x1="9.5" y1="9.5" x2="12" y2="12" stroke="#4a3860" strokeWidth="1.3" strokeLinecap="round"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…" style={{background:'rgba(14,9,28,0.7)',border:'1px solid rgba(60,40,100,0.25)',borderRadius:8,padding:'7px 12px 7px 30px',color:'#c8c0d8',fontSize:13,outline:'none',width:180,transition:'border-color 0.2s'}}
          onFocus={e=>e.target.style.borderColor='rgba(160,110,220,0.5)'}
          onBlur={e=>e.target.style.borderColor='rgba(60,40,100,0.25)'}/>
        </div>

        {/* Filter button */}
        <button onClick={()=>setShowF(f=>!f)} style={{background:showFilter||activeFilters>0?'rgba(120,80,200,0.15)':'rgba(14,9,28,0.6)',border:`1px solid ${showFilter||activeFilters>0?'rgba(160,110,220,0.4)':'rgba(60,40,100,0.25)'}`,color:activeFilters>0?'#c9a8e8':'#7a6888',borderRadius:8,padding:'7px 14px',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6,fontWeight:activeFilters>0?600:400}}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3h10M4 7h6M6 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Filtres {activeFilters>0&&<span style={{background:'#c9a8e8',color:'#08051a',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800}}>{activeFilters}</span>}
        </button>

        {/* New card CTA */}
        <button onClick={()=>setCards(cs=>[...cs,{id:`c${Date.now()}`,title:'Nouvelle tâche',desc:'',col:'backlog',priority:'medium',tags:[],assignees:[],subtasks:[],due:null,comments:0,attachments:0}])} style={{background:'#c9a8e8',color:'#08051a',border:'none',borderRadius:8,padding:'7px 16px',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6,boxShadow:'0 0 16px rgba(201,168,232,0.25)',transition:'box-shadow 0.2s'}}
        onMouseEnter={e=>e.currentTarget.style.boxShadow='0 0 24px rgba(201,168,232,0.45)'}
        onMouseLeave={e=>e.currentTarget.style.boxShadow='0 0 16px rgba(201,168,232,0.25)'}>
          <span style={{fontSize:16,lineHeight:1}}>+</span> Nouvelle carte
        </button>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div style={{padding:'12px 24px',background:'rgba(8,5,18,0.9)',borderBottom:'1px solid rgba(60,40,100,0.15)',display:'flex',gap:24,flexWrap:'wrap',alignItems:'center',animation:'fadeIn 0.2s ease both'}}>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:'#4a3860',fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginRight:4}}>Tags</span>
            {allTags.map(t=>(
              <button key={t} onClick={()=>toggleTag(t)} style={{background:tagFilter.includes(t)?'rgba(120,80,200,0.2)':'none',border:`1px solid ${tagFilter.includes(t)?'rgba(160,110,220,0.5)':'rgba(60,40,100,0.25)'}`,color:tagFilter.includes(t)?'#c9a8e8':'#6a6080',borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{t}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:'#4a3860',fontWeight:600,letterSpacing:'0.8px',textTransform:'uppercase',marginRight:4}}>Priorité</span>
            {Object.entries(PRIORITIES).map(([k,v])=>(
              <button key={k} onClick={()=>togglePri(k)} style={{background:priFilter.includes(k)?v.bg:'none',border:`1px solid ${priFilter.includes(k)?v.color+'66':'rgba(60,40,100,0.25)'}`,color:priFilter.includes(k)?v.color:'#6a6080',borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}>{v.label}</button>
            ))}
          </div>
          {activeFilters>0&&<button onClick={clearAll} style={{background:'none',border:'none',color:'#6a6080',fontSize:12,cursor:'pointer',textDecoration:'underline',marginLeft:'auto'}}>Réinitialiser</button>}
        </div>
      )}

      {/* Board */}
      <div style={{flex:1,overflowX:'auto',overflowY:'hidden',padding:'20px 24px',display:'flex',gap:16}}>
        {COLS.map(col=>(
          <Column key={col.id} col={col}
            cards={byCol(col.id)}
            dragOver={dragOver===col.id}
            onDragOver={e=>onDragOver(e,col.id)}
            onDrop={e=>onDrop(e,col.id)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardClick={setModal}
            onAdd={addCard}
            onCardUpdate={updateCard}/>
        ))}
      </div>

      {/* Card modal */}
      {modal && <CardModal card={modal} onClose={()=>setModal(null)} onUpdate={updateCard}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
</script>
</body>
</html>

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useReveal } from '../../hooks/useReveal';
import { AmbientEffect } from './AmbientEffect';
import { WritingLibrary } from './WritingLibrary';
import { Avatar, hexToRgb } from './tokens';
import { NotFound, ReaderNav, ReaderShell } from './shell';

// A project landing page (/projets/ecriture/:project): the universe's books +
// its own characters and glossary ("atelier"). Scoped — a new project gets its
// own characters and lexicon.
export function ProjectPage() {
  const { project: slug } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  useReveal();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.ecriture.project(slug).then(
      (p) => { if (alive) { setProject(p); setLoading(false); } },
      () => { if (alive) { setProject(null); setLoading(false); } },
    );
    return () => { alive = false; };
  }, [slug]);

  if (loading) {
    return <ReaderShell><div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", color: '#4a3860' }}>loading…</div></ReaderShell>;
  }
  if (!project) {
    return <ReaderShell><NotFound label="Univers introuvable" onBack={() => navigate('/projets/ecriture')} backLabel="← Tous les univers" /></ReaderShell>;
  }

  const acc = project.accentColor || '#c9a8e8';
  const rgb = hexToRgb(acc) || '201,168,232';

  return (
    <ReaderShell>
      <AmbientEffect effect={project.ambientEffect} accent={acc} />
      <ReaderNav crumb={project.title} accent={acc} onBack={() => navigate('/projets/ecriture')} />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(40px,7vh,84px) clamp(16px,5vw,56px) 120px' }}>
        <header style={{ marginBottom: 48 }}>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgba(${rgb},0.75)`, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Univers
          </p>
          <h1 style={{ fontFamily: "'Georgia',serif", fontSize: 'clamp(36px,5.5vw,64px)', fontWeight: 700, color: '#ede8f8', letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 12 }}>
            {project.title}
            {project.titleKr && <span style={{ display: 'block', fontSize: '0.42em', color: `rgba(${rgb},0.75)`, fontFamily: "'Noto Sans KR','Inter',sans-serif", marginTop: 10 }}>{project.titleKr}</span>}
          </h1>
          {project.subtitle && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'rgba(180,170,200,0.75)', lineHeight: 1.7, maxWidth: 620 }}>{project.subtitle}</p>}
          {project.description && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'rgba(160,150,185,0.7)', lineHeight: 1.8, maxWidth: 620, marginTop: 12, fontStyle: 'italic' }}>{project.description}</p>}
        </header>

        <Heading rgb={rgb}>Livres</Heading>
        <WritingLibrary
          works={project.books}
          accentHex={acc}
          emptyHint="Aucun livre publié pour le moment."
          cardTo={(b) => `/projets/ecriture/${slug}/${b.slug}`}
        />

        {!!project.characters.length && (
          <>
            <Heading rgb={rgb} style={{ marginTop: 72 }}>Personnages</Heading>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
              {project.characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/projets/ecriture/${slug}/personnages/${c.slug}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', background: 'rgba(14,9,28,0.72)', border: `1px solid rgba(${rgb},0.18)`, borderRadius: 14, padding: 14, cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${rgb},0.5)`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `rgba(${rgb},0.18)`; e.currentTarget.style.transform = 'none'; }}
                >
                  <Avatar character={c} rgb={rgb} size={48} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ede8f8' }}>{c.name}</span>
                    {c.role && <span style={{ display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.65)' }}>{c.role}</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {!!project.glossary.length && (
          <>
            <Heading rgb={rgb} style={{ marginTop: 72 }}>Lexique</Heading>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
              {project.glossary.map((g) => (
                <div key={g.id} style={{ background: 'rgba(14,9,28,0.6)', border: `1px solid rgba(${rgb},0.16)`, borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontFamily: "'Noto Sans KR','Inter',sans-serif", fontSize: 18, fontWeight: 700, color: `rgb(${rgb})`, marginBottom: 2 }}>{g.termKr}</p>
                  <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(214,206,230,0.85)' }}>{g.romanization}</p>
                  {g.meaning && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(180,170,200,0.7)', marginTop: 4 }}>{g.meaning}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ReaderShell>
  );
}

function Heading({ children, rgb, style }) {
  return (
    <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: `rgba(${rgb},0.85)`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 20, ...style }}>
      <span style={{ color: `rgba(${rgb},0.4)` }}># </span>{children}
    </h2>
  );
}

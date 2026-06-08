import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useReveal } from '../../hooks/useReveal';
import { WritingLibrary } from './WritingLibrary';
import { ReaderNav, ReaderShell } from './shell';

const RGB = '201,168,232';

// Index of writing projects (universes). Each card opens its project landing.
export function EcritureLibrary() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  useReveal();

  useEffect(() => {
    let alive = true;
    api.ecriture.list().then(
      (p) => { if (alive) { setProjects(Array.isArray(p) ? p : []); setLoading(false); } },
      () => { if (alive) { setProjects([]); setLoading(false); } },
    );
    return () => { alive = false; };
  }, []);

  return (
    <ReaderShell>
      <ReaderNav crumb="Projets" accent="#c9a8e8" onBack={() => navigate('/?vue=ecriture#projects')} />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(40px,7vh,84px) clamp(16px,5vw,56px) 120px' }}>
        <header style={{ marginBottom: 48 }}>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgba(${RGB},0.7)`, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Worldbuilding
          </p>
          <h1 style={{ fontFamily: "'Georgia',serif", fontSize: 'clamp(36px,5.5vw,64px)', fontWeight: 700, color: '#ede8f8', letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 14 }}>
            Espace écriture
          </h1>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 15.5, color: 'rgba(180,170,200,0.72)', lineHeight: 1.8, maxWidth: 560 }}>
            Mes univers de jeu de rôle — chacun avec ses livres, ses personnages et son lexique.
          </p>
        </header>
        <WritingLibrary works={projects} loading={loading} emptyHint="Les univers arrivent bientôt." />
      </div>
    </ReaderShell>
  );
}

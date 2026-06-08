import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { WritingLibrary } from './WritingLibrary';
import { Avatar } from './tokens';
import { ReaderNav, ReaderShell } from './shell';

const ACC = '#c9a8e8';
const RGB = '201,168,232';

// The dedicated /projets/ecriture page: the full library + the "Atelier / Monde"
// (character index + Korean glossary). Built to grow — places for maps/locations
// can slot in later without restructuring.
export function EcritureLibrary() {
  const navigate = useNavigate();
  const [works, setWorks] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [glossary, setGlossary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.ecriture.list().catch(() => []),
      api.ecriture.personnages().catch(() => []),
      api.ecriture.lexique().catch(() => []),
    ]).then(([w, c, g]) => {
      if (!alive) return;
      setWorks(Array.isArray(w) ? w : []);
      setCharacters(Array.isArray(c) ? c : []);
      setGlossary(Array.isArray(g) ? g : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <ReaderShell>
      <ReaderNav crumb="Atelier" accent={ACC} onBack={() => navigate('/?vue=ecriture#projects')} />
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(40px,7vh,84px) clamp(16px,5vw,56px) 120px' }}>
        <header style={{ marginBottom: 48 }}>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgba(${RGB},0.7)`, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Nostra · worldbuilding
          </p>
          <h1 style={{ fontFamily: "'Georgia',serif", fontSize: 'clamp(36px,5.5vw,64px)', fontWeight: 700, color: '#ede8f8', letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 14 }}>
            Espace écriture
          </h1>
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 15.5, color: 'rgba(180,170,200,0.72)', lineHeight: 1.8, maxWidth: 560 }}>
            Mes textes de jeu de rôle dans l’univers de Nostra — récits, personnages et lexique d’un monde de foi et de cendre.
          </p>
        </header>

        <Heading>Bibliothèque</Heading>
        <WritingLibrary works={works} loading={loading} emptyHint="Les textes arrivent bientôt." />

        {!!characters.length && (
          <>
            <Heading style={{ marginTop: 72 }}>Personnages</Heading>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/projets/ecriture/personnages/${c.slug}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                    background: 'rgba(14,9,28,0.72)', border: `1px solid rgba(${RGB},0.18)`,
                    borderRadius: 14, padding: 14, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${RGB},0.5)`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `rgba(${RGB},0.18)`; e.currentTarget.style.transform = 'none'; }}
                >
                  <Avatar character={c} rgb={RGB} size={48} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ede8f8' }}>{c.name}</span>
                    {c.role && <span style={{ display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.65)' }}>{c.role}</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {!!glossary.length && (
          <>
            <Heading style={{ marginTop: 72 }}>Lexique</Heading>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
              {glossary.map((g) => (
                <div key={g.id} style={{ background: 'rgba(14,9,28,0.6)', border: `1px solid rgba(${RGB},0.16)`, borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontFamily: "'Noto Sans KR','Inter',sans-serif", fontSize: 18, fontWeight: 700, color: `rgb(${RGB})`, marginBottom: 2 }}>{g.termKr}</p>
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

function Heading({ children, style }) {
  return (
    <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: `rgba(${RGB},0.85)`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 20, ...style }}>
      <span style={{ color: `rgba(${RGB},0.4)` }}># </span>{children}
    </h2>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, trackClick } from '../../api/client';
import { usePageMeta } from '../../hooks/usePageMeta';
import { renderMarkdown } from './markdown';
import { Avatar, hexToRgb } from './tokens';
import { NotFound, ReaderNav, ReaderShell } from './shell';

const ACC = '#c9a8e8';

// Full character sheet at /projets/ecriture/personnages/:slug — the target of
// the [[perso:…]] hover-card "Voir la fiche" links.
export function CharacterPage() {
  const { project, slug } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  usePageMeta(character ? character.name : null, character ? (character.role || '') : null);
  const goWriting = useCallback((to) => { trackClick(to, 'writing_nav'); navigate(to); }, [navigate]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.ecriture.personnage(project, slug).then(
      (c) => { if (alive) { setCharacter(c); setLoading(false); } },
      () => { if (alive) { setCharacter(null); setLoading(false); } },
    );
    return () => { alive = false; };
  }, [project, slug]);

  if (loading) {
    return <ReaderShell><div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", color: '#4a3860' }}>loading…</div></ReaderShell>;
  }
  if (!character) {
    return <ReaderShell><NotFound label="Personnage introuvable" onBack={() => goWriting(`/projets/ecriture/${project}`)} backLabel="← Le projet" /></ReaderShell>;
  }

  const rgb = '201,168,232';
  const ctx = { characters: [], glossary: [], accent: ACC };

  return (
    <ReaderShell>
      <ReaderNav crumb={`${character.project?.title || project} / ${character.name}`} accent={ACC} onBack={() => goWriting(`/projets/ecriture/${project}`)} />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px,7vh,84px) clamp(16px,5vw,40px) 120px' }}>
        <header style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 36, flexWrap: 'wrap' }}>
          <Avatar character={character} rgb={rgb} size={96} />
          <div>
            <h1 style={{ fontFamily: "'Georgia',serif", fontSize: 'clamp(30px,4.4vw,46px)', fontWeight: 700, color: '#ede8f8', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
              {character.name}
              {character.nameKr && <span style={{ marginLeft: 12, fontSize: '0.5em', color: `rgba(${rgb},0.75)`, fontFamily: "'Noto Sans KR','Inter',sans-serif" }}>{character.nameKr}</span>}
            </h1>
            {character.role && <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: `rgba(${rgb},0.8)`, letterSpacing: '1px', marginTop: 8 }}>{character.role}</p>}
          </div>
        </header>

        {character.bio && (
          <div style={{ fontFamily: "'Georgia','Times New Roman',serif", fontSize: 17, color: 'rgba(216,208,232,0.92)', lineHeight: 1.9, marginBottom: 40 }}>
            {renderMarkdown(character.bio, ctx)}
          </div>
        )}

        {Array.isArray(character.relations) && character.relations.length > 0 && (
          <Block title="Relations" rgb={rgb}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {character.relations.map((r, i) => (
                <li key={i} style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'rgba(200,192,216,0.85)' }}>
                  {typeof r === 'string' ? r : `${r.name || ''}${r.relation ? ` — ${r.relation}` : ''}`}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {character.project && (
          <Block title="Univers" rgb={rgb}>
            <button type="button"
              onClick={() => goWriting(`/projets/ecriture/${character.project.slug}`)}
              style={{ background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.3)`, color: `rgb(${rgb})`, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13.5, fontWeight: 600 }}
            >{character.project.title} →</button>
          </Block>
        )}
      </div>
    </ReaderShell>
  );
}

function Block({ title, rgb, children }) {
  return (
    <section style={{ marginBottom: 32, paddingTop: 24, borderTop: `1px solid rgba(${rgb},0.16)` }}>
      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: `rgba(${rgb},0.85)`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  );
}

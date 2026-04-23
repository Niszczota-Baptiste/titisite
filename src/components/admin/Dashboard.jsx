import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ACC, ACC_RGB, Button } from './ui';
import { CurrentlyEditor } from './editors/CurrentlyEditor';
import { EducationEditor } from './editors/EducationEditor';
import { ExperienceEditor } from './editors/ExperienceEditor';
import { ProjectsEditor } from './editors/ProjectsEditor';
import { TracksEditor } from './editors/TracksEditor';
import { UsersEditor } from './editors/UsersEditor';

const TABS = [
  { key: 'projects',   label: 'Projets',      Editor: ProjectsEditor },
  { key: 'tracks',     label: 'Musique',      Editor: TracksEditor },
  { key: 'experience', label: 'Expérience',   Editor: ExperienceEditor },
  { key: 'education',  label: 'Formation',    Editor: EducationEditor },
  { key: 'currently',  label: 'En cours',     Editor: CurrentlyEditor },
  { key: 'users',      label: 'Utilisateurs', Editor: UsersEditor },
];

export function Dashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState('projects');
  const ActiveEditor = TABS.find((t) => t.key === active).Editor;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050511',
      color: '#ede8f8',
      fontFamily: "'Inter',sans-serif",
    }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(5,5,17,0.92)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid rgba(120,80,200,0.14)',
        padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17,
            letterSpacing: '-0.3px',
          }}>
            Baptiste<span style={{ color: ACC }}>.</span> <span style={{
              fontSize: 11, color: `rgba(${ACC_RGB},0.7)`,
              textTransform: 'uppercase', letterSpacing: '1.5px', marginLeft: 8,
            }}>Admin</span>
          </span>
          {user && (
            <span style={{
              fontSize: 12, color: 'rgba(180,170,200,0.55)',
              fontFamily: "'Inter',sans-serif",
            }}>
              {user.name || user.email}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/project" style={navLinkStyle}>Espace projet</Link>
          <Link to="/" style={navLinkStyle}>↗ Voir le site</Link>
          <Button variant="ghost" onClick={logout}>Déconnexion</Button>
        </div>
      </header>

      <div style={{
        display: 'flex', gap: 4, padding: '20px 32px 0',
        borderBottom: '1px solid rgba(60,40,100,0.12)',
        overflowX: 'auto',
      }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '10px 18px',
              color: active === t.key ? ACC : 'rgba(180,170,200,0.6)',
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 13.5, fontWeight: active === t.key ? 700 : 500,
              letterSpacing: '-0.2px',
              borderBottom: `2px solid ${active === t.key ? ACC : 'transparent'}`,
              marginBottom: -1,
              transition: 'all 0.18s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px' }}>
        <ActiveEditor />
      </main>
    </div>
  );
}

const navLinkStyle = {
  color: 'rgba(180,170,200,0.7)', textDecoration: 'none',
  fontSize: 13, padding: '8px 14px',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8,
  transition: 'all 0.18s',
  fontFamily: "'Inter',sans-serif",
};

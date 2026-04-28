import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ACC, ACC_RGB, Button } from './ui';
import { CurrentlyEditor } from './editors/CurrentlyEditor';
import { EducationEditor } from './editors/EducationEditor';
import { ExperienceEditor } from './editors/ExperienceEditor';
import { ProjectsEditor } from './editors/ProjectsEditor';
import { PublicSectionsEditor } from './editors/PublicSectionsEditor';
import { TracksEditor } from './editors/TracksEditor';
import { UsersEditor } from './editors/UsersEditor';
import { WorkspacesEditor } from './editors/WorkspacesEditor';

const TABS = [
  { key: 'public',     label: 'Page publique',          Editor: PublicSectionsEditor },
  { key: 'projects',   label: 'Portfolio · Projets',    Editor: ProjectsEditor },
  { key: 'tracks',     label: 'Musique',                Editor: TracksEditor },
  { key: 'experience', label: 'Expérience',             Editor: ExperienceEditor },
  { key: 'education',  label: 'Formation',              Editor: EducationEditor },
  { key: 'currently',  label: 'En cours',               Editor: CurrentlyEditor },
  { key: 'workspaces', label: 'Projets d\'équipe',      Editor: WorkspacesEditor },
  { key: 'users',      label: 'Utilisateurs',           Editor: UsersEditor },
];

export function Dashboard() {
  const { user, logout } = useAuth();
  const mobile = useIsMobile(720);
  const [active, setActive] = useState('public');
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (!mobile) setMenuOpen(false); }, [mobile]);

  const ActiveEditor = TABS.find((t) => t.key === active).Editor;
  const activeLabel = TABS.find((t) => t.key === active).label;

  const headerLinks = (
    <>
      <Link to="/project" style={navLinkStyle} onClick={() => setMenuOpen(false)}>Espace projet</Link>
      <Link to="/" style={navLinkStyle} onClick={() => setMenuOpen(false)}>↗ Voir le site</Link>
      <Button variant="ghost" onClick={logout}>Déconnexion</Button>
    </>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050511',
      color: '#ede8f8',
      fontFamily: "'Inter',sans-serif",
    }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(5,5,17,0.92)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid rgba(120,80,200,0.14)',
        padding: mobile ? '12px 16px' : '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: mobile ? 10 : 16, flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: mobile ? 10 : 24,
          minWidth: 0, flex: mobile ? 1 : 'initial',
        }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
            fontSize: mobile ? 15 : 17,
            letterSpacing: '-0.3px', flexShrink: 0,
          }}>
            Baptiste<span style={{ color: ACC }}>.</span> <span style={{
              fontSize: mobile ? 9.5 : 11, color: `rgba(${ACC_RGB},0.7)`,
              textTransform: 'uppercase', letterSpacing: '1.5px', marginLeft: mobile ? 4 : 8,
            }}>Admin</span>
          </span>
          {user && !mobile && (
            <span style={{
              fontSize: 12, color: 'rgba(180,170,200,0.55)',
              fontFamily: "'Inter',sans-serif",
            }}>
              {user.name || user.email}
            </span>
          )}
        </div>

        {mobile ? (
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            style={{
              background: 'none', border: '1px solid rgba(80,50,130,0.28)',
              borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
              color: menuOpen ? ACC : 'rgba(232,228,248,0.85)',
              display: 'inline-flex', alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <line x1="1" y1="2"  x2="17" y2="2"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <line x1="1" y1="7"  x2="17" y2="7"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <line x1="1" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>{headerLinks}</div>
        )}
      </header>

      {mobile && menuOpen && (
        <div style={{
          position: 'sticky', top: 54, zIndex: 25,
          background: 'rgba(8,5,18,0.98)',
          borderBottom: '1px solid rgba(60,40,100,0.18)',
          padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 14,
          backdropFilter: 'blur(20px)',
        }}>
          {user && (
            <div style={{
              fontSize: 12, color: 'rgba(180,170,200,0.7)',
              paddingBottom: 8, borderBottom: '1px solid rgba(60,40,100,0.18)',
            }}>
              {user.name || user.email}
            </div>
          )}

          <div>
            <div style={{
              fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase',
              color: 'rgba(180,170,200,0.45)', marginBottom: 8, fontWeight: 700,
            }}>Sections</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setActive(t.key); setMenuOpen(false); }}
                  style={{
                    background: active === t.key ? `rgba(${ACC_RGB},0.12)` : 'rgba(20,14,38,0.5)',
                    border: `1px solid ${active === t.key ? `rgba(${ACC_RGB},0.4)` : 'rgba(60,40,100,0.25)'}`,
                    color: active === t.key ? ACC : 'rgba(232,228,248,0.85)',
                    cursor: 'pointer', borderRadius: 8, padding: '10px 12px',
                    fontFamily: "'Inter',sans-serif", fontSize: 13,
                    fontWeight: active === t.key ? 700 : 500,
                    textAlign: 'left',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            paddingTop: 8, borderTop: '1px solid rgba(60,40,100,0.18)',
          }}>
            {headerLinks}
          </div>
        </div>
      )}

      {mobile ? (
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid rgba(60,40,100,0.12)',
          fontSize: 11, color: 'rgba(180,170,200,0.6)',
          letterSpacing: '0.5px',
          fontFamily: "'Inter',sans-serif",
        }}>
          Section : <strong style={{ color: ACC, fontWeight: 700 }}>{activeLabel}</strong>
        </div>
      ) : (
        <div className="tabs-scroll-fade" style={{
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
      )}

      <main style={{
        maxWidth: 980, margin: '0 auto',
        padding: mobile ? '20px 16px 60px' : '32px',
      }}>
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

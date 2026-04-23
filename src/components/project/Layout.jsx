import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ACC, ACC_RGB, Button } from '../admin/ui';

const TABS = [
  { to: 'overview',   label: 'Vue d\'ensemble' },
  { to: 'kanban',     label: 'Kanban' },
  { to: 'documents',  label: 'Documents' },
  { to: 'builds',     label: 'Builds' },
  { to: 'meetings',   label: 'Réunions' },
  { to: 'discussion', label: 'Discussion' },
];

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  useLocation();

  return (
    <div style={{
      minHeight: '100vh', background: '#050511', color: '#ede8f8',
      fontFamily: "'Inter',sans-serif",
    }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(5,5,17,0.92)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid rgba(120,80,200,0.14)',
        padding: '14px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17,
            letterSpacing: '-0.3px',
          }}>
            Baptiste<span style={{ color: ACC }}>.</span>{' '}
            <span style={{
              fontSize: 11, color: `rgba(${ACC_RGB},0.7)`,
              textTransform: 'uppercase', letterSpacing: '1.5px', marginLeft: 6,
            }}>Projet</span>
          </span>
          {user && (
            <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.55)' }}>
              {user.name || user.email}
              <span style={{
                fontSize: 9, marginLeft: 8, padding: '1px 6px', borderRadius: 3,
                background: user.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
                color: user.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
                letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>
                {user.role}
              </span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAdmin && <Link to="/admin" style={navLinkStyle}>Admin</Link>}
          <Link to="/" style={navLinkStyle}>↗ Site</Link>
          <Button variant="ghost" onClick={logout}>Déconnexion</Button>
        </div>
      </header>

      <nav style={{
        display: 'flex', gap: 4, padding: '20px 32px 0',
        borderBottom: '1px solid rgba(60,40,100,0.12)',
        overflowX: 'auto',
      }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              background: 'transparent', border: 'none',
              padding: '10px 18px', textDecoration: 'none',
              color: isActive ? ACC : 'rgba(180,170,200,0.6)',
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 13.5, fontWeight: isActive ? 700 : 500,
              letterSpacing: '-0.2px',
              borderBottom: `2px solid ${isActive ? ACC : 'transparent'}`,
              marginBottom: -1,
              whiteSpace: 'nowrap',
            })}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 32px 60px' }}>
        <Outlet />
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

import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import { ACC, ACC_RGB, Button } from '../admin/ui';
import { NotificationsButton } from './NotificationsButton';

const BASE_TABS = [
  { to: 'overview',  label: 'Vue d\'ensemble' },
  { to: 'kanban',    label: 'Kanban' },
  { to: 'calendar',  label: 'Calendrier' },
  { to: 'documents', label: 'Documents' },
  { to: 'builds',    label: 'Builds' },
  { to: 'meetings',  label: 'Réunions' },
];

// Pages séparées des projets 100 % Minecraft — chaque outil a son onglet, le
// Résumé (stats + derniers ajouts) sert de page d'accueil.
const MINECRAFT_TABS = [
  { to: 'resume',      label: '📊 Résumé' },
  { to: 'minecraft',   label: '📦 Coffres' },
  { to: 'wanted',      label: '🎯 Wanted' },
  { to: 'carte',       label: '🗺️ Carte' },
  { to: 'villageois',  label: '🧑‍🌾 Villageois' },
  { to: 'builds3d',    label: '🏗️ Builds 3D' },
  { to: 'calculateur', label: '🧮 Calculateur' },
];
export const MINECRAFT_ONLY_TABS = new Set(MINECRAFT_TABS.map((t) => t.to));

function tabsFor(workspace) {
  // Projet 100 % Minecraft : les onglets classiques (Vue d'ensemble → Réunions)
  // disparaissent au profit des pages Minecraft + un lien vers /quetes.
  if (workspace?.minecraftOnly) {
    return [...MINECRAFT_TABS, { href: `/quetes?projet=${workspace.slug}`, label: '📜 Quêtes' }];
  }
  const tabs = [...BASE_TABS];
  if (workspace?.isMinecraft) tabs.push({ to: 'minecraft', label: '⛏️ Minecraft' });
  return tabs;
}

// Route d'atterrissage d'un projet (utilisée aussi par le switcher et Home).
export function projectHome(workspace) {
  return `/project/${workspace.slug}/${workspace.minecraftOnly ? 'resume' : 'overview'}`;
}

/**
 * Wraps a workspace-scoped page: loads the workspace by :slug, provides it via
 * context to child tabs, renders a header with a project switcher + tab bar.
 */
export function ProjectLayout() {
  const { slug } = useParams();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [workspace, setWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activity, setActivity] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setWorkspace(null); setErr(null);
    api.workspaces.get(slug).then(setWorkspace).catch((e) => setErr(e));
  }, [slug]);

  // "Nouveautés" badges: fetch the counts accumulated since the last visit,
  // keep them displayed for this session, then mark the workspace as seen so
  // the next visit only counts newer activity.
  useEffect(() => {
    setActivity(null);
    let alive = true;
    api.ws(slug).activityCount()
      .then((a) => {
        if (!alive) return;
        setActivity(a);
        api.ws(slug).markSeen().catch(() => {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    api.workspaces.list().then(setWorkspaces).catch(() => {});
  }, []);

  if (err) {
    return (
      <Shell user={user} logout={logout} isAdmin={isAdmin}>
        <div style={{ padding: 32, color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>
          {err.status === 403 && 'Tu n\'as pas accès à ce projet.'}
          {err.status === 404 && 'Projet introuvable.'}
          {![403, 404].includes(err.status) && (err.message || 'Erreur')}
          <div style={{ marginTop: 16 }}>
            <Link to="/project" style={{ color: ACC, textDecoration: 'none' }}>← Retour aux projets</Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (!workspace) {
    return (
      <Shell user={user} logout={logout} isAdmin={isAdmin}>
        <div style={{ padding: 32, color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>
          Chargement…
        </div>
      </Shell>
    );
  }

  // Projet 100 % Minecraft : toute URL d'un onglet masqué ramène au Résumé
  // (les liens directs vers /kanban, /documents… deviennent inertes).
  const currentTab = location.pathname.split('/')[3] || '';
  if (workspace.minecraftOnly && currentTab && !MINECRAFT_ONLY_TABS.has(currentTab)) {
    return <Navigate to={`/project/${slug}/resume`} replace />;
  }

  return (
    <Shell
      user={user}
      logout={logout}
      isAdmin={isAdmin}
      breadcrumb={
        <>
          <Link to="/project" style={crumbLink}>Projets</Link>
          <span style={{ ...muted, margin: '0 6px' }}>/</span>
          <ProjectSwitcher current={workspace} all={workspaces} />
        </>
      }
    >
      <TabsBar workspace={workspace} activity={activity} />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '20px clamp(16px, 4vw, 32px) 60px' }}>
        <WorkspaceContext.Provider value={{ workspace }}>
          <Outlet />
        </WorkspaceContext.Provider>
      </main>
    </Shell>
  );
}

// Per-tab "nouveautés" counts (features modified + comments → Kanban,
// new documents → Documents).
function badgeFor(tab, activity) {
  if (!activity) return 0;
  if (tab === 'kanban') return (activity.features || 0) + (activity.comments || 0);
  if (tab === 'documents') return activity.documents || 0;
  return 0;
}

export function ActivityBadge({ count, style }) {
  if (!count) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
      background: ACC, color: '#08051a',
      fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700,
      lineHeight: 1, verticalAlign: 'middle',
      ...style,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function TabsBar({ workspace, activity }) {
  const mobile = useIsMobile(720);
  const tabs = tabsFor(workspace);
  return (
    <nav className="tabs-scroll-fade" style={{
      display: 'flex', gap: 4,
      padding: mobile ? '12px 16px 0' : '16px 32px 0',
      borderBottom: '1px solid rgba(60,40,100,0.12)',
      overflowX: 'auto',
      // Hide scrollbar on mobile, keep it usable
      WebkitOverflowScrolling: 'touch',
    }}>
      {tabs.map((t) => (
        t.href ? (
          // Lien externe au projet (ex. /quetes) rendu comme un onglet, jamais actif.
          <Link
            key={t.href}
            to={t.href}
            style={{
              padding: mobile ? '9px 12px' : '10px 18px',
              textDecoration: 'none',
              color: 'rgba(180,170,200,0.6)',
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: mobile ? 12.5 : 13.5,
              fontWeight: 500,
              letterSpacing: '-0.2px',
              borderBottom: '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </Link>
        ) : (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              padding: mobile ? '9px 12px' : '10px 18px',
              textDecoration: 'none',
              color: isActive ? ACC : 'rgba(180,170,200,0.6)',
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: mobile ? 12.5 : 13.5,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '-0.2px',
              borderBottom: `2px solid ${isActive ? ACC : 'transparent'}`,
              marginBottom: -1,
              whiteSpace: 'nowrap',
            })}
          >
            {t.label}
            <ActivityBadge count={badgeFor(t.to, activity)} style={{ marginLeft: 6 }} />
          </NavLink>
        )
      ))}
    </nav>
  );
}

function Shell({ user, logout, isAdmin, breadcrumb, children }) {
  const mobile = useIsMobile(720);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (!mobile) setMenuOpen(false); }, [mobile]);

  const headerLinks = (
    <>
      <Link to="/project/discussion" style={navLinkStyle} onClick={() => setMenuOpen(false)}>💬 Discussion</Link>
      {user?.canViewStairs && (
        <Link to="/stairs" style={navLinkStyle} onClick={() => setMenuOpen(false)}>🪜 Escaliers</Link>
      )}
      <NotificationsButton compact style={{ flexShrink: 0 }} />
      {isAdmin && <Link to="/admin" style={navLinkStyle} onClick={() => setMenuOpen(false)}>Admin</Link>}
      <Link to="/" style={navLinkStyle} onClick={() => setMenuOpen(false)}>↗ Site</Link>
      <Button variant="ghost" onClick={logout}>Déconnexion</Button>
    </>
  );

  return (
    <div style={{
      minHeight: '100vh', background: '#050511', color: '#ede8f8',
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
          gap: mobile ? 10 : 16,
          minWidth: 0, flex: mobile ? 1 : 'initial',
        }}>
          <Link to="/project" style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
            fontSize: mobile ? 15 : 17,
            letterSpacing: '-0.3px', color: '#ede8f8', textDecoration: 'none',
            flexShrink: 0,
          }}>
            Baptiste<span style={{ color: ACC }}>.</span>
          </Link>
          {breadcrumb && (
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
              {breadcrumb}
            </div>
          )}
          {user && !mobile && (
            <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.55)', marginLeft: 8 }}>
              {user.name || user.email}
              <span style={{
                fontSize: 9, marginLeft: 8, padding: '1px 6px', borderRadius: 3,
                background: user.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
                color: user.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
                letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>{user.role}</span>
            </span>
          )}
        </div>

        {mobile ? (
          <button type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            style={{
              background: 'none', border: '1px solid rgba(80,50,130,0.28)',
              borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
              color: menuOpen ? ACC : 'rgba(232,228,248,0.85)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
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
          display: 'flex', flexDirection: 'column', gap: 8,
          backdropFilter: 'blur(20px)',
        }}>
          {user && (
            <div style={{
              fontSize: 12, color: 'rgba(180,170,200,0.7)',
              paddingBottom: 8, borderBottom: '1px solid rgba(60,40,100,0.18)',
            }}>
              {user.name || user.email}
              <span style={{
                fontSize: 9, marginLeft: 8, padding: '1px 6px', borderRadius: 3,
                background: user.role === 'admin' ? `rgba(${ACC_RGB},0.12)` : 'rgba(60,40,100,0.25)',
                color: user.role === 'admin' ? ACC : 'rgba(180,170,200,0.7)',
                letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>{user.role}</span>
            </div>
          )}
          {headerLinks}
        </div>
      )}

      {children}
    </div>
  );
}

function ProjectSwitcher({ current, all }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (!e.target.closest('[data-project-switcher]')) setOpen(false);
    };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, [open]);

  return (
    <span data-project-switcher style={{ position: 'relative' }}>
      <button type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(20,14,38,0.72)',
          border: '1px solid rgba(80,50,130,0.28)',
          borderRadius: 6, padding: '4px 10px',
          color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: current.color, flexShrink: 0,
        }} />
        <span>{current.icon}</span>
        <span>{current.name}</span>
        <span style={{ color: 'rgba(180,170,200,0.5)', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          minWidth: 220, maxHeight: 320, overflow: 'auto',
          background: '#0b0620',
          border: '1px solid rgba(80,50,130,0.3)',
          borderRadius: 10, padding: 4, zIndex: 20,
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}>
          {all.filter((w) => w.status === 'active').map((w) => (
            <Link
              key={w.id}
              to={projectHome(w)}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6,
                textDecoration: 'none',
                color: w.id === current.id ? ACC : '#ede8f8',
                background: w.id === current.id ? `rgba(${ACC_RGB},0.08)` : 'transparent',
                fontFamily: "'Inter',sans-serif", fontSize: 13,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: w.color, flexShrink: 0 }} />
              <span>{w.icon}</span>
              <span>{w.name}</span>
            </Link>
          ))}
        </div>
      )}
    </span>
  );
}

const navLinkStyle = {
  color: 'rgba(180,170,200,0.7)', textDecoration: 'none',
  fontSize: 13, padding: '8px 14px',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8,
  fontFamily: "'Inter',sans-serif",
};

const crumbLink = {
  color: 'rgba(180,170,200,0.7)', textDecoration: 'none',
  fontSize: 13, fontFamily: "'Inter',sans-serif",
};

const muted = { color: 'rgba(180,170,200,0.4)', fontFamily: "'Inter',sans-serif" };

export { Shell as HomeShell };

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { EnvCtx, ownerKey } from './env';
import { loadConfig } from './platform/config.js';
import { AppSettings } from './screens/AppSettings';
import { Home } from './screens/Home';
import { ServerSetup } from './screens/ServerSetup';
import { SignIn } from './screens/SignIn';

const AuthorApp = lazy(() => import('../components/author/AuthorApp'));

const THEME_KEY = 'au-theme'; // même clé que l'atelier : un seul réglage

function Splash({ children = 'Ouverture de l\'atelier…' }) {
  return <div className="am-splash" role="status">{children}</div>;
}

export function MobileRoot() {
  const [config, setConfig] = useState(null);
  const [bootError, setBootError] = useState(null);
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; } });
  const setTheme = useCallback((t) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConfig().then(setConfig, setBootError); }, []);

  if (bootError) {
    return (
      <div className="au-root am-root" data-theme={theme}>
        <Splash>L&apos;application n&apos;a pas pu démarrer ({String(bootError.message || bootError)}).</Splash>
      </div>
    );
  }
  if (!config) return <div className="au-root am-root" data-theme={theme}><Splash /></div>;

  // Relié = une adresse est enregistrée ET la coquille est bien servie sous
  // cette origine (les appels /api sont relatifs).
  const linked = !!config.serverUrl && config.serverUrl === window.location.origin;

  return (
    <div className="au-root am-root" data-theme={theme}>
      {linked
        ? <AuthProvider><Linked config={config} theme={theme} setTheme={setTheme} /></AuthProvider>
        : <Shell env={{ config, theme, setTheme, linked: false, session: { status: 'local', user: null, owner: null } }} />}
    </div>
  );
}

function Linked({ config, theme, setTheme }) {
  const { user, loading, login, logout } = useAuth();
  const session = useMemo(() => {
    let status = 'ready';
    if (loading && !user) status = 'loading';
    else if (!user) status = 'signedOut';
    else if (!user.canAuthor && !user.authorShared) status = 'denied';
    return { status, user: user || null, owner: ownerKey(config, user), login, logout };
  }, [user, loading, login, logout, config]);
  return <Shell env={{ config, theme, setTheme, linked: true, session }} />;
}

function Shell({ env }) {
  const { status } = env.session;
  const atelier = () => {
    if (status === 'local') return <Navigate to="/serveur" replace />;
    if (status === 'loading') return <Splash />;
    if (status === 'signedOut') return <SignIn />;
    if (status === 'denied') return <Navigate to="/reglages" replace />;
    return <Suspense fallback={<Splash />}><AuthorApp /></Suspense>;
  };
  return (
    <EnvCtx.Provider value={env}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/serveur" element={<ServerSetup />} />
        <Route path="/connexion" element={status === 'ready' ? <Navigate to="/" replace /> : status === 'local' ? <Navigate to="/serveur" replace /> : <SignIn />} />
        <Route path="/reglages" element={<AppSettings />} />
        <Route path="/auteur/*" element={atelier()} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </EnvCtx.Provider>
  );
}

import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { setRecorderFactory, setTakeFallback } from '../components/author/audio/recorderPort.js';
import { PortalContext } from '../components/author/ui';
import { useToast } from '../ui/ToastProvider';
import { EnvCtx, ownerKey } from './env';
import { startInboxSync, stopInboxSync } from './inbox/engine.js';
import { newItem, takeItem } from './inbox/model.js';
import { isNative } from './platform/bridge.js';
import { loadConfig } from './platform/config.js';
import { launchAction, onAction, onShare, pendingShare } from './platform/intake.js';
import { createNativeRecorder, onRecorderState, recoverTakes } from './platform/recorder.js';
import { vault } from './platform/vault.js';
import { AppSettings } from './screens/AppSettings';
import { Capture } from './screens/Capture';
import { Home } from './screens/Home';
import { Inbox } from './screens/Inbox';
import { Record, takeAsFile } from './screens/Record';
import { ServerSetup } from './screens/ServerSetup';
import { ShareIntake } from './screens/ShareIntake';
import { SignIn } from './screens/SignIn';
import { lastProjectId } from './useProjects';

// Dans l'application, l'atelier enregistre en natif (service au premier plan,
// fichier écrit sur l'appareil) ; ailleurs, avec le micro du navigateur.
if (isNative()) setRecorderFactory(() => createNativeRecorder());

const AuthorApp = lazy(() => import('../components/author/AuthorApp'));

const THEME_KEY = 'au-theme'; // même clé que l'atelier : un seul réglage

function Splash({ children = 'Ouverture de l\'atelier…' }) {
  return <div className="am-splash" role="status">{children}</div>;
}

export function MobileRoot() {
  const [config, setConfig] = useState(null);
  const [bootError, setBootError] = useState(null);
  // Les dialogues de l'atelier se portent dans la racine thématisée (.au-root) :
  // les écrans de l'accueil mobile en ont besoin aussi (enregistreur, classement).
  const [portal, setPortal] = useState(null);
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
      <PortalContext.Provider value={portal}>
        {linked
          ? <AuthProvider><Linked config={config} theme={theme} setTheme={setTheme} /></AuthProvider>
          : <Shell env={{ config, theme, setTheme, linked: false, session: { status: 'local', user: null, owner: null } }} />}
      </PortalContext.Provider>
      <div ref={setPortal} />
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

// Ce qui arrive de l'extérieur : prises restées inachevées, partage d'une autre
// application, raccourci (« Capturer », « Enregistrer », « Reprendre »).
function useArrivals(env) {
  const navigate = useNavigate();
  const toast = useToast();
  const { owner, status } = env.session;

  // Prises dues et pas encore rangées : arrêtées depuis la notification, laissées
  // à l'écran quand l'application a été fermée, ou coupées net (application
  // tuée, batterie vide) puis réparées. Elles entrent dans la boîte de
  // réception ; une prise réparée y est signalée comme telle.
  const collectTakes = useCallback(async () => {
    const takes = await recoverTakes();
    if (!takes.length) return;
    for (const t of takes) await vault.put(newItem({ files: [t.nativeFile], origin: 'enregistrement', owner }));
    const repaired = takes.filter((t) => t.integrity === 'recovered').length;
    toast.info(repaired
      ? `${repaired} prise(s) interrompue(s) récupérée(s) — à vérifier dans la boîte de réception.`
      : `${takes.length} prise(s) rangée(s) dans la boîte de réception.`);
  }, [owner]); // eslint-disable-line

  useEffect(() => {
    collectTakes();
    // Fin d'une prise sans écran d'enregistrement pour la recevoir, ou retour
    // dans l'application : on regarde s'il reste quelque chose à ranger.
    const offState = onRecorderState((s) => { if (s.status === 'idle') collectTakes(); });
    const onVisible = () => { if (document.visibilityState === 'visible') collectTakes(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { offState(); document.removeEventListener('visibilitychange', onVisible); };
  }, [collectTakes]);

  // Une prise faite dans un projet mais impossible à envoyer (hors connexion) :
  // gardée sur l'appareil, déjà adressée au bon élément, envoyée au retour du réseau.
  useEffect(() => {
    const serverUrl = env.config.serverUrl;
    setTakeFallback({
      label: 'Garder sur cet appareil, envoyer plus tard',
      run: async ({ take, label, context }) => {
        const item = takeItem({ file: await takeAsFile(take, label), take, context, owner, serverUrl: env.linked ? serverUrl : null });
        await vault.put(item);
        toast.success(item.target ? 'Prise gardée sur cet appareil — elle partira au retour du réseau' : 'Prise gardée dans la boîte de réception');
      },
    });
    return () => setTakeFallback(null);
  }, [owner, env.linked, env.config.serverUrl]); // eslint-disable-line

  useEffect(() => {
    let alive = true;
    const go = (action) => {
      if (action === 'capture') navigate('/capturer');
      else if (action === 'record') navigate('/enregistrer');
      else if (action === 'resume') navigate(lastProjectId() ? `/auteur/${lastProjectId()}` : '/auteur');
    };
    pendingShare().then((share) => {
      if (!alive) return;
      if (share) navigate('/partage');
      else launchAction().then((action) => { if (alive && action) go(action); });
    });
    const offShare = onShare(() => navigate('/partage'));
    const offAction = onAction(go);
    return () => { alive = false; offShare(); offAction(); };
  }, []); // eslint-disable-line

  // Envoi des captures classées : seulement connecté, et seulement vers ce site.
  useEffect(() => {
    if (status === 'ready' && owner) startInboxSync({ owner, serverUrl: env.config.serverUrl });
    else stopInboxSync();
  }, [status, owner, env.config.serverUrl]);
}

function Shell({ env }) {
  useArrivals(env);
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
        <Route path="/connexion" element={status === 'ready' ? <Navigate to="/" replace />
          : status === 'local' ? <Navigate to="/serveur" replace />
          : status === 'denied' ? <Navigate to="/reglages" replace /> : <SignIn />} />
        <Route path="/reglages" element={<AppSettings />} />
        <Route path="/capturer" element={<Capture />} />
        <Route path="/enregistrer" element={<Record />} />
        <Route path="/boite" element={<Inbox />} />
        <Route path="/partage" element={<ShareIntake />} />
        <Route path="/auteur/*" element={atelier()} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </EnvCtx.Provider>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../ui/ConfirmProvider';
import { syncNow } from '../../components/author/offline/engine.js';
import { useNet, usePending, useSyncState } from '../../components/author/offline/hooks.js';
import { Btn, formatDateTime } from '../../components/author/ui';
import { useEnv } from '../env';
import { forgetProjects } from '../useProjects';
import { SignIn } from './SignIn';

// Réglages de l'application : apparence, compte, site relié, état de la
// synchronisation et de la lecture hors connexion — dits tels qu'ils sont.

function useServiceWorkerState() {
  const [state, setState] = useState('checking');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) { setState('unsupported'); return undefined; }
    const read = () => setState(navigator.serviceWorker.controller ? 'active' : 'waiting');
    read();
    navigator.serviceWorker.addEventListener('controllerchange', read);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', read);
  }, []);
  return state;
}

const SW_TEXT = {
  checking: 'Vérification…',
  active: 'Prête : les projets déjà ouverts en ligne se relisent sans réseau.',
  waiting: 'Pas encore prête : ouvre un projet une fois en ligne.',
  unsupported: 'Indisponible sur cet appareil : la lecture d\'un projet demande le réseau. L\'écriture en cours, les captures et les prises restent gardées sur l\'appareil.',
};

export function AppSettings() {
  const { config, theme, setTheme, session, linked } = useEnv();
  const confirm = useConfirm();
  const net = useNet();
  const sync = useSyncState();
  const pending = usePending(session.user?.id ?? null);
  const sw = useServiceWorkerState();

  const signOut = async () => {
    const ok = await confirm({
      title: 'Se déconnecter ?',
      message: pending.total
        ? `${pending.total} élément(s) attendent encore l'envoi. Ils restent gardés sur cet appareil, rattachés à ce compte, et repartiront à ta prochaine connexion. Les copies de lecture, elles, sont effacées.`
        : 'Les copies de lecture gardées sur l\'appareil sont effacées. Tes captures locales restent.',
      confirmLabel: 'Se déconnecter',
    });
    if (!ok) return;
    forgetProjects(session.owner);
    await session.logout();
  };

  return (
    <div className="am-screen am-narrow">
      <header className="am-head"><Link to="/" className="au-btn is-ghost is-small" aria-label="Retour à l'accueil">←</Link><h1>Réglages</h1></header>

      <section className="au-card am-section">
        <div className="au-card-title">Apparence</div>
        <div className="au-seg" role="group" aria-label="Thème">
          <button type="button" className={theme !== 'light' ? 'is-on' : undefined} onClick={() => setTheme('dark')}>Sombre</button>
          <button type="button" className={theme === 'light' ? 'is-on' : undefined} onClick={() => setTheme('light')}>Clair</button>
        </div>
        <p className="au-faint am-note">La taille du texte, l&apos;interligne et la police se règlent dans l&apos;éditeur (bouton « Aa »).</p>
      </section>

      <section className="au-card am-section">
        <div className="au-card-title">Site relié</div>
        {linked ? <p className="am-kv"><span className="au-faint">Adresse</span><strong>{config.serverUrl}</strong></p>
          : <p className="au-muted">Aucun site relié : atelier local.</p>}
        {config.native && <Link to="/serveur" className="au-btn is-small">{linked ? 'Changer de site' : 'Relier mon site'}</Link>}
      </section>

      {linked && (
        <section className="au-card am-section">
          <div className="au-card-title">Compte</div>
          {session.status === 'ready' || session.status === 'denied' ? (
            <>
              <p className="am-kv"><span className="au-faint">Connecté</span><strong>{session.user.email}</strong></p>
              {session.status === 'denied' && <p className="au-error">Ce compte n&apos;a pas accès à l&apos;atelier d&apos;auteur. Rien n&apos;est envoyé avec ce compte ; ce qui attend reste sur l&apos;appareil.</p>}
              <Btn size="small" onClick={signOut}>Se déconnecter</Btn>
            </>
          ) : session.status === 'loading' ? <p className="au-muted">Vérification…</p> : <SignIn embedded />}
        </section>
      )}

      {session.status === 'ready' && (
        <section className="au-card am-section">
          <div className="au-card-title">Synchronisation</div>
          <p className="am-kv"><span className="au-faint">Réseau</span><strong>{net.online ? 'Site joignable' : 'Hors connexion'}</strong></p>
          <p className="am-kv"><span className="au-faint">En attente d&apos;envoi</span><strong>{pending.total}</strong></p>
          {pending.conflicts > 0 && <p className="am-kv"><span className="au-faint">Conflits à résoudre</span><strong>{pending.conflicts}</strong></p>}
          {pending.failed > 0 && <p className="am-kv"><span className="au-faint">Échecs à traiter</span><strong>{pending.failed}</strong></p>}
          {sync.lastAt && <p className="au-faint am-note">Dernière tentative : {formatDateTime(Math.floor(sync.lastAt / 1000))}</p>}
          <Btn size="small" onClick={() => syncNow()} disabled={!pending.total || sync.running}>{sync.running ? 'Synchronisation…' : 'Synchroniser maintenant'}</Btn>
          <p className="au-faint am-note">Le détail (conflits, échecs, copie hors connexion d&apos;un projet) se trouve dans chaque projet, pastille en haut de l&apos;écran.</p>
        </section>
      )}

      {linked && (
        <section className="au-card am-section">
          <div className="au-card-title">Lecture hors connexion</div>
          <p className="au-muted" style={{ margin: 0 }}>{SW_TEXT[sw]}</p>
        </section>
      )}

      <p className="au-faint am-note" style={{ textAlign: 'center' }}>
        Mon Atelier{config.appVersion ? ` ${config.appVersion}` : ''}{config.native ? '' : ' — aperçu navigateur'}
      </p>
    </div>
  );
}

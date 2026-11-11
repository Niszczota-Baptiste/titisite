import { Link, useNavigate } from 'react-router-dom';
import { useAuthState, useNet, usePending, useSyncState } from '../../components/author/offline/hooks.js';
import { relativeTime } from '../../components/author/ui';
import { useEnv } from '../env';
import { useInbox, useInboxSync } from '../inbox/hooks.js';
import { SessionCard } from '../SessionCard';
import { pickRecent, useProjects } from '../useProjects';

// Accueil de l'application : la création d'abord. Capturer et enregistrer ne
// demandent ni réseau, ni compte, ni projet ; écrire, reprendre et explorer
// ouvrent l'atelier du site relié.

function statusLine({ session, net, auth, pending: site, sync, inbox, inboxSync }) {
  // Ce qui attend l'envoi : le travail de l'atelier (brouillons, créations) ET
  // les captures classées de la boîte de réception.
  const pending = { ...site, failed: site.failed + inbox.failed, total: site.total + inbox.queued };
  if (session.status === 'local') return { tone: 'local', text: 'Atelier local — tout reste sur cet appareil.' };
  if (session.status === 'signedOut') return { tone: 'warn', text: 'Non connecté — tes captures restent sur cet appareil.' };
  if (session.status === 'denied') return { tone: 'bad', text: 'Ce compte n\'a pas accès à l\'atelier.' };
  if (session.status === 'loading') return { tone: 'local', text: 'Ouverture…' };
  if (auth.state === 'expired' && net.online) return { tone: 'bad', text: pending.total ? `Session expirée — ${pending.total} en attente d'envoi, sauvegardé sur cet appareil` : 'Session expirée — reconnecte-toi' };
  if (pending.conflicts) return { tone: 'bad', text: `Conflit à résoudre (${pending.conflicts})` };
  if (pending.failed) return { tone: 'bad', text: `Échec nécessitant une action (${pending.failed})` };
  if (!net.online) return { tone: 'warn', text: pending.total ? `Hors connexion — ${pending.total} en attente d'envoi, sauvegardé sur cet appareil` : 'Hors connexion — sauvegardé sur cet appareil' };
  if (sync.running || inboxSync.running) return { tone: 'sync', text: 'Synchronisation…' };
  if (pending.total) return { tone: 'sync', text: `${pending.total} en attente d'envoi` };
  return { tone: 'ok', text: 'Synchronisé' };
}

export function Home() {
  const env = useEnv();
  const { session, config } = env;
  const navigate = useNavigate();
  const net = useNet();
  const auth = useAuthState();
  const sync = useSyncState();
  const pending = usePending(session.user?.id ?? null);
  const projects = useProjects(session);
  const recent = pickRecent(projects.list);
  const inbox = useInbox(session.owner);
  const inboxSync = useInboxSync();
  const status = statusLine({ session, net, auth, pending, sync, inbox: inbox.summary, inboxSync });

  const openAtelier = (suffix = '') => {
    if (session.status === 'local') { navigate('/serveur'); return; }
    if (session.status !== 'ready') { navigate('/connexion'); return; }
    navigate(recent ? `/auteur/${recent.id}${suffix}` : '/auteur?choisir');
  };

  return (
    <div className="am-screen am-home">
      <header className="am-home-head">
        <div>
          <h1>Mon Atelier</h1>
          <p className={`am-status is-${status.tone}`} role="status" aria-live="polite"><span className="am-status-dot" aria-hidden />{status.text}</p>
        </div>
        <Link to="/reglages" className="au-btn is-ghost is-icon" aria-label="Réglages de l'application">⚙</Link>
      </header>

      <nav className="am-actions" aria-label="Créer">
        <Link to="/capturer" className="am-action is-main">
          <span className="am-action-ico" aria-hidden>💡</span>
          <span><strong>Capturer une idée</strong><small>Texte, image, lien ou son — à classer plus tard</small></span>
        </Link>
        <button type="button" className="am-action" onClick={() => openAtelier('/ecrire')}>
          <span className="am-action-ico" aria-hidden>✍️</span>
          <span><strong>Écrire</strong><small>{recent ? recent.title : 'Ouvrir un projet'}</small></span>
        </button>
        <Link to="/enregistrer" className="am-action">
          <span className="am-action-ico" aria-hidden>🎙️</span>
          <span><strong>Enregistrer un son</strong><small>Une mélodie, un rythme, une voix</small></span>
        </Link>
        <button type="button" className="am-action" onClick={() => openAtelier('')} disabled={session.status === 'ready' && projects.list !== null && !recent && !session.user?.canAuthor}>
          <span className="am-action-ico" aria-hidden>↩️</span>
          <span><strong>Reprendre un projet</strong><small>{recent ? `${recent.title}${recent.updatedAt ? ` · ${relativeTime(recent.updatedAt)}` : ''}` : session.status === 'ready' ? 'Choisir ou créer' : 'Atelier du site'}</small></span>
        </button>
        <button type="button" className="am-action" onClick={() => openAtelier('/explorer')}>
          <span className="am-action-ico" aria-hidden>🧭</span>
          <span><strong>Explorer mes idées</strong><small>Une piste, un rapprochement, une question</small></span>
        </button>
      </nav>

      {inbox.summary.total > 0 && (
        <Link to="/boite" className="au-card is-link am-section am-inbox-link">
          <strong>📥 Boîte de réception</strong>
          <span className="au-muted">
            {[inbox.summary.local && `${inbox.summary.local} à classer`, inbox.summary.queued && `${inbox.summary.queued} en attente d'envoi`,
              inbox.summary.failed && `${inbox.summary.failed} refusée(s)`].filter(Boolean).join(' · ')}
          </span>
        </Link>
      )}

      <SessionCard />

      {session.status === 'local' && (
        <section className="au-card am-section">
          <div className="au-card-title">Relier mon site</div>
          <p className="au-muted">Pour retrouver ici les projets de ton atelier web. En attendant, tu peux déjà capturer et enregistrer : rien ne sera perdu.</p>
          <Link to="/serveur" className="au-btn is-primary">Indiquer l&apos;adresse du site</Link>
        </section>
      )}
      {session.status === 'signedOut' && (
        <section className="au-card am-section">
          <div className="au-card-title">Se connecter</div>
          <p className="au-muted">Connecte-toi à {config.serverUrl} pour ouvrir tes projets et envoyer ce qui attend.</p>
          <Link to="/connexion" className="au-btn is-primary">Se connecter</Link>
        </section>
      )}

      {session.status === 'ready' && projects.list?.length > 0 && (
        <section className="am-section" aria-label="Projets récents">
          <h2 className="am-h2">Projets</h2>
          <div className="am-list">
            {projects.list.slice(0, 6).map((p) => (
              <Link key={p.id} to={`/auteur/${p.id}`} className="au-card is-link am-project">
                <strong>{p.title}</strong>
                <span className="au-faint">
                  {p.access === 'owner' ? (p.updatedAt ? `modifié ${relativeTime(p.updatedAt)}` : 'ton projet') : `partagé${p.ownerName ? ` par ${p.ownerName}` : ''}`}
                </span>
              </Link>
            ))}
          </div>
          {!projects.fresh && <p className="au-faint am-note">Liste gardée sur l&apos;appareil — le site est injoignable pour l&apos;instant.</p>}
          <Link to="/auteur?choisir" className="au-btn is-ghost is-small">Tous les projets</Link>
        </section>
      )}
    </div>
  );
}

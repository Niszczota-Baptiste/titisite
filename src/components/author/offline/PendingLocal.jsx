import { Link } from 'react-router-dom';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { relativeTime } from '../ui';
import { useLocalEntities, usePending } from './hooks.js';

// Ce qui a été créé hors connexion et n'existe encore que sur cet appareil :
// absent des listes du serveur, on le montre ici jusqu'à la synchronisation.

export function PendingLocal({ kinds, ideas = false }) {
  const { pid, uid } = useAuthor();
  const locals = useLocalEntities(pid, kinds);
  const pending = usePending(uid);
  const queued = ideas ? pending.ideas.filter((o) => o.pid === pid) : [];
  if (!locals.length && !queued.length) return null;
  return (
    <div className="au-card au-offline-pending">
      <div className="au-card-title">
        📴 Créé hors connexion
        <span className="au-faint" style={{ fontWeight: 400, fontSize: 12 }}>envoyé tout seul au retour du réseau</span>
      </div>
      {locals.map((r) => (
        <Link key={r.id} className="au-row" to={`/auteur/${pid}/${r.kind === 'chapter' ? 'ecrire' : 'e'}/${r.id}`}>
          <span className="au-avatar" aria-hidden>{kindMeta(r.kind).icon}</span>
          <span className="au-row-main">
            <span className="au-row-title" style={{ display: 'block' }}>{r.fields.title || 'Sans titre'}</span>
            <span className="au-row-meta" style={{ display: 'block' }}>{kindMeta(r.kind).label} · {relativeTime(Math.floor(r.updatedAt / 1000))}</span>
          </span>
        </Link>
      ))}
      {queued.map((op) => (
        <div key={op.id} className="au-row" style={{ cursor: 'default' }}>
          <span className="au-avatar" aria-hidden>💡</span>
          <span className="au-row-main">
            <span className="au-row-title" style={{ display: 'block' }}>{String(op.payload?.text || '').split('\n')[0].slice(0, 120)}</span>
            <span className="au-row-meta" style={{ display: 'block' }}>Idée capturée · {relativeTime(Math.floor(op.createdAt / 1000))}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { Btn, Dialog, ProgressBar, cx, formatDateTime, relativeTime } from '../ui';
import { syncNow } from './engine.js';
import { useNet, usePending, useSyncState } from './hooks.js';
import { offlineStore } from './store.js';

// Indicateur de la barre du haut : hors connexion, travail en attente, conflit
// ou échec. Un clic ouvre le détail (OfflinePanel).

export function SyncBadge() {
  const { uid, guest } = useAuthor();
  const net = useNet();
  const sync = useSyncState();
  const pending = usePending(uid);
  const [open, setOpen] = useState(false);
  const problems = pending.conflicts + pending.failed;
  if (guest) {
    return net.online ? null : <span className="au-pill au-net-pill is-off" title="Tu lis la dernière copie gardée sur cet appareil.">📴 Hors connexion</span>;
  }
  let label = null;
  let tone = '';
  if (!net.online) { label = pending.total ? `📴 Hors connexion · ${pending.total} en attente` : '📴 Hors connexion'; tone = 'is-off'; }
  else if (sync.running) { label = '⟳ Synchronisation…'; tone = 'is-sync'; }
  else if (problems) { label = `⚠ ${problems} à vérifier`; tone = 'is-bad'; }
  else if (pending.total) { label = `⟳ ${pending.total} à synchroniser`; tone = 'is-sync'; }
  return (
    <>
      {label ? (
        <button type="button" className={cx('au-pill au-net-pill', tone)} onClick={() => setOpen(true)}>
          <span className="au-desktop-only">{label}</span>
          <span className="au-mobile-only" aria-label={label}>{!net.online ? '📴' : problems ? '⚠' : '⟳'}{pending.total ? ` ${pending.total}` : ''}</span>
        </button>
      ) : (
        <button type="button" className="au-btn is-ghost is-small is-icon au-desktop-only" onClick={() => setOpen(true)} title="Hors connexion : état et réglages" aria-label="Hors connexion">📶</button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="📴 Travail hors connexion" width={620}>
        <OfflinePanel onNavigate={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function draftLabel(d) {
  return d.rec.title || `${kindMeta(d.rec.kind).label || 'Élément'} #${d.id}`;
}

export function OfflinePanel({ onNavigate }) {
  const { pid, uid, pack, refreshPack } = useAuthor();
  const toast = useToast();
  const net = useNet();
  const sync = useSyncState();
  const pending = usePending(uid);
  const info = pack.info || (() => { try { return JSON.parse(localStorage.getItem(`au-pack:${pid}`) || 'null'); } catch { return null; } })();
  const swOk = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success('Texte copié'); } catch { toast.error('Copie impossible'); }
  };
  const textOf = (fields) => Object.entries(fields || {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => `## ${k}\n${v}`).join('\n\n');

  return (
    <div className="au-offline">
      <p className="au-muted" style={{ marginTop: 0, fontSize: 13 }}>
        {net.online
          ? 'En ligne. Ce que tu écris hors connexion est gardé sur cet appareil puis envoyé tout seul dès que le réseau revient.'
          : 'Hors connexion : tu peux lire le livre, écrire dans tes chapitres et fiches, créer des éléments et capturer des idées. Tout est gardé sur cet appareil et sera envoyé dès que le réseau revient.'}
      </p>

      <div className="au-card-title">💾 Livre disponible hors connexion</div>
      {!swOk ? (
        <p className="au-faint" style={{ fontSize: 12.5 }}>Pas encore prêt sur cet appareil : recharge la page une fois en ligne (navigateur récent requis).</p>
      ) : (
        <>
          <p style={{ fontSize: 13, margin: '0 0 8px' }}>
            {info?.at ? <>Copie à jour {relativeTime(Math.floor(info.at / 1000))} — {info.count} éléments.</> : 'Aucune copie pour l\'instant.'}
          </p>
          {pack.running && (
            <div style={{ marginBottom: 8 }}>
              <ProgressBar value={pack.total ? pack.done / pack.total : 0} />
              <span className="au-faint" style={{ fontSize: 11.5 }}>{pack.done} / {pack.total}</span>
            </div>
          )}
          <Btn size="small" onClick={() => refreshPack({ force: true })} disabled={!net.online || pack.running}>
            {pack.running ? 'Mise à jour…' : 'Mettre à jour maintenant'}
          </Btn>
        </>
      )}
      <p className="au-faint" style={{ fontSize: 12 }}>
        Sans réseau : lecture de tout le livre, écriture, nouvelles fiches et idées. Relations, plan, tableaux blancs,
        images, tâches et commentaires attendent le retour du réseau.
      </p>

      <div className="au-card-title" style={{ marginTop: 14 }}>
        ⟳ En attente {pending.total ? `(${pending.total})` : ''}
        <span className="au-actions">
          <Btn size="small" variant="primary" onClick={() => syncNow()} disabled={!pending.total || sync.running}>{sync.running ? 'Synchronisation…' : 'Synchroniser'}</Btn>
        </span>
      </div>
      {sync.lastAt && <p className="au-faint" style={{ fontSize: 11.5, margin: '0 0 6px' }}>Dernière tentative : {formatDateTime(Math.floor(sync.lastAt / 1000))}</p>}
      {pending.total === 0 && <p className="au-faint" style={{ fontSize: 12.5 }}>Rien en attente : tout est sur le serveur.</p>}

      {pending.drafts.map((d) => (
        <div key={d.key} className={cx('au-offline-row', d.rec.conflict && 'is-conflict', d.rec.failed && 'is-failed')}>
          <span aria-hidden>{kindMeta(d.rec.kind).icon || '✎'}</span>
          <span className="au-offline-main">
            <Link to={`/auteur/${d.pid}/${d.rec.kind === 'chapter' ? 'ecrire' : 'e'}/${d.id}`} onClick={onNavigate}>{draftLabel(d)}</Link>
            <span className="au-faint">
              {d.rec.conflict ? 'Modifié ailleurs aussi — ouvre-le pour choisir' : d.rec.failed ? `Refusé par le serveur (${d.rec.error})` : `modifié ${relativeTime(Math.floor((d.rec.ts || 0) / 1000))}`}
            </span>
          </span>
          {d.rec.failed && (
            <>
              <Btn size="small" variant="ghost" onClick={() => copy(textOf(d.rec.fields))}>Copier</Btn>
              <Btn size="small" variant="ghost" onClick={() => offlineStore.writeDraft(d.pid, d.id, { ...d.rec, failed: false, error: undefined })}>Réessayer</Btn>
              <Btn size="small" variant="ghost" onClick={() => offlineStore.removeDraft(d.pid, d.id)}>Abandonner</Btn>
            </>
          )}
        </div>
      ))}
      {pending.creations.map(({ op, local }) => (
        <div key={op.id} className={cx('au-offline-row', op.failed && 'is-failed')}>
          <span aria-hidden>{kindMeta(local?.kind).icon || '＋'}</span>
          <span className="au-offline-main">
            {local
              ? <Link to={`/auteur/${op.pid}/${local.kind === 'chapter' ? 'ecrire' : 'e'}/${local.id}`} onClick={onNavigate}>{local.fields.title || 'Sans titre'}</Link>
              : <span>Création</span>}
            <span className="au-faint">{op.failed ? `Refusée par le serveur (${op.error})` : 'Nouvel élément, créé hors connexion'}</span>
          </span>
          {op.failed && (
            <>
              <Btn size="small" variant="ghost" onClick={() => copy(textOf(local?.fields))}>Copier</Btn>
              <Btn size="small" variant="ghost" onClick={() => offlineStore.updateOp(op.id, { failed: false, error: undefined })}>Réessayer</Btn>
            </>
          )}
        </div>
      ))}
      {pending.ideas.map((op) => (
        <div key={op.id} className={cx('au-offline-row', op.failed && 'is-failed')}>
          <span aria-hidden>💡</span>
          <span className="au-offline-main">
            <span>{String(op.payload?.text || '').split('\n')[0].slice(0, 120)}</span>
            <span className="au-faint">{op.failed ? `Refusée par le serveur (${op.error})` : 'Idée capturée hors connexion'}</span>
          </span>
          {op.failed && (
            <>
              <Btn size="small" variant="ghost" onClick={() => copy(op.payload?.text || '')}>Copier</Btn>
              <Btn size="small" variant="ghost" onClick={() => offlineStore.removeOp(op.id)}>Abandonner</Btn>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

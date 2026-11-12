import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { Btn, Dialog, ProgressBar, cx, formatDateTime, relativeTime } from '../ui';
import { syncNow } from './engine.js';
import { formatBytes } from '../audio/time.js';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { audioOfflineReady, cacheAudio, cachedAudioStats, meteredBlock, subscribeAudioCache } from './audioCache.js';
import { useAuthState, useNet, usePending, useSyncState } from './hooks.js';
import { audioWifiOnly, setAudioWifiOnly } from './net.js';
import { offlineStore } from './store.js';

// Indicateur de la barre du haut : hors connexion, travail en attente, conflit
// ou échec. Un clic ouvre le détail (OfflinePanel).

export function SyncBadge() {
  const { uid, guest } = useAuthor();
  const net = useNet();
  const auth = useAuthState();
  const sync = useSyncState();
  const pending = usePending(uid);
  const [open, setOpen] = useState(false);
  const problems = pending.conflicts + pending.failed;
  if (guest) {
    return net.online ? null : <span className="au-pill au-net-pill is-off" title="Tu lis la dernière copie gardée sur cet appareil.">📴 Hors connexion</span>;
  }
  let label = null;
  let tone = '';
  if (!net.online) { label = pending.total ? `📴 Hors connexion · ${pending.total} en attente d'envoi` : '📴 Hors connexion'; tone = 'is-off'; }
  else if (auth.state === 'expired') { label = pending.total ? `🔑 Session expirée · ${pending.total} en attente d'envoi` : '🔑 Session expirée'; tone = 'is-bad'; }
  else if (auth.state === 'forbidden') { label = '🚫 Accès refusé'; tone = 'is-bad'; }
  else if (sync.running) { label = '⟳ Synchronisation…'; tone = 'is-sync'; }
  else if (pending.conflicts) { label = `⚠ Conflit à résoudre${pending.conflicts > 1 ? ` (${pending.conflicts})` : ''}`; tone = 'is-bad'; }
  else if (problems) { label = `⚠ ${problems} échec${problems > 1 ? 's' : ''} — action requise`; tone = 'is-bad'; }
  else if (pending.total) { label = `⟳ ${pending.total} en attente d'envoi`; tone = 'is-sync'; }
  return (
    <>
      {label ? (
        <button type="button" className={cx('au-pill au-net-pill', tone)} onClick={() => setOpen(true)}>
          <span className="au-desktop-only">{label}</span>
          <span className="au-mobile-only" aria-label={label}>{!net.online ? '📴' : auth.state === 'expired' ? '🔑' : auth.state === 'forbidden' ? '🚫' : problems ? '⚠' : '⟳'}{pending.total ? ` ${pending.total}` : ''}</span>
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
  const { pid, uid, pack, refreshPack, P } = useAuthor();
  const toast = useToast();
  const net = useNet();
  const sync = useSyncState();
  const pending = usePending(uid);
  const info = pack.info || (() => { try { return JSON.parse(localStorage.getItem(`au-pack:${pid}`) || 'null'); } catch { return null; } })();
  const swOk = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  const confirm = useConfirm();
  const [wifiOnly, setWifiOnly] = useState(audioWifiOnly);

  // Sons : ce qui est réellement sur l'appareil (fichiers entiers gardés sur demande).
  const [audio, setAudio] = useState({ takes: [], total: 0, totalBytes: 0, kept: 0, keptBytes: 0, busy: null });
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const takes = await P.audio.list();
        const st = await cachedAudioStats(takes);
        if (alive) setAudio((a) => ({ ...a, takes, total: takes.length, totalBytes: takes.reduce((n, t) => n + (t.size || 0), 0), kept: st.count, keptBytes: st.bytes }));
      } catch { /* liste indisponible : on garde l'affichage précédent */ }
    };
    refresh();
    const off = subscribeAudioCache(refresh);
    return () => { alive = false; off(); };
  }, [P]);
  const keepAllAudio = async () => {
    if (!audioOfflineReady()) return;
    const st = await cachedAudioStats(audio.takes);
    const todo = audio.takes.filter((t) => !st.urls.has(t.url));
    const bytes = todo.reduce((n, t) => n + (t.size || 0), 0);
    const metered = await meteredBlock();
    const ok = await confirm({
      title: `Garder ${todo.length} prise(s) sur cet appareil ?`,
      message: `${formatBytes(bytes)} à télécharger.${metered ? ' Tu es sur le réseau mobile, et le réglage « sons en Wi-Fi seulement » est actif.' : ''} Les copies restent privées et sont effacées à la déconnexion.`,
      confirmLabel: metered ? 'Télécharger quand même' : 'Télécharger',
    });
    if (!ok) return;
    let done = 0; let failed = 0;
    setAudio((a) => ({ ...a, busy: { done, total: todo.length } }));
    for (const t of todo) {
      try { await cacheAudio(t); } catch { failed += 1; }
      done += 1;
      setAudio((a) => ({ ...a, busy: { done, total: todo.length } }));
    }
    setAudio((a) => ({ ...a, busy: null }));
    if (failed) toast.error(`${failed} prise(s) n'ont pas pu être téléchargées — elles ne sont pas marquées comme disponibles.`);
    else toast.success('Prises disponibles hors connexion sur cet appareil');
  };

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

      <div className="au-card-title">💾 Disponible hors connexion sur cet appareil</div>
      {!swOk ? (
        <p className="au-faint" style={{ fontSize: 12.5 }}>Pas encore prêt sur cet appareil : recharge la page une fois en ligne (navigateur récent requis).</p>
      ) : (
        <>
          <ul className="au-avail">
            <li>
              <span aria-hidden>📝</span>
              <span>
                <strong>Texte</strong> — chapitres, fiches, idées, paroles, repères des prises.{' '}
                {info?.at ? <>{info.count} éléments, copie à jour {relativeTime(Math.floor(info.at / 1000))}.</> : 'Aucune copie pour l\'instant.'}
              </span>
            </li>
            <li>
              <span aria-hidden>🖼</span>
              <span>
                <strong>Images</strong> — {info?.thumbs !== undefined ? `${info.thumbs} miniature(s) et carte(s) de lieux` : 'miniatures et cartes de lieux'}.
                {info?.thumbsSkipped ? ` ${info.thumbsSkipped} autre(s) n'ont pas été prises (limite atteinte).` : ''} Les images en grand demandent le réseau.
              </span>
            </li>
            <li>
              <span aria-hidden>🎵</span>
              <span>
                <strong>Sons</strong> — {audio.total === 0 ? 'aucune prise dans ce projet.'
                  : <>{audio.kept} prise(s) sur {audio.total} gardée(s) ici ({formatBytes(audio.keptBytes)} sur {formatBytes(audio.totalBytes)}). Les autres s&apos;écoutent avec le réseau.</>}
              </span>
            </li>
          </ul>
          {pack.running && (
            <div style={{ marginBottom: 8 }}>
              <ProgressBar value={pack.total ? pack.done / pack.total : 0} />
              <span className="au-faint" style={{ fontSize: 11.5 }}>{pack.done} / {pack.total}</span>
            </div>
          )}
          {audio.busy && (
            <div style={{ marginBottom: 8 }}>
              <ProgressBar value={audio.busy.total ? audio.busy.done / audio.busy.total : 0} />
              <span className="au-faint" style={{ fontSize: 11.5 }}>Sons : {audio.busy.done} / {audio.busy.total}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn size="small" onClick={() => refreshPack({ force: true })} disabled={!net.online || pack.running}>
              {pack.running ? 'Mise à jour…' : 'Mettre à jour le texte et les miniatures'}
            </Btn>
            {audio.total > audio.kept && (
              <Btn size="small" onClick={keepAllAudio} disabled={!net.online || !!audio.busy}>
                Garder toutes les prises ({formatBytes(audio.totalBytes - audio.keptBytes)})
              </Btn>
            )}
          </div>
          <label className="au-check-row" style={{ marginTop: 8 }}>
            <input type="checkbox" className="au-check" checked={wifiOnly} onChange={(e) => { setAudioWifiOnly(e.target.checked); setWifiOnly(e.target.checked); }} />
            Sons en Wi-Fi seulement (envoi et téléchargement)
          </label>
        </>
      )}
      <div className="au-avail-matrix">
        <p><strong>Sans réseau, tu peux :</strong> lire tout le projet · écrire dans les chapitres et les fiches · créer des éléments · capturer des idées · écouter les prises gardées ici.</p>
        <p><strong>Attendent le réseau :</strong> relations, plan, tableaux blancs, tâches, commentaires · images en grand · envoi d&apos;une prise, repères et boucles · publication · recherche dans le texte (seuls les titres se cherchent hors connexion).</p>
      </div>

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

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { AudioPlayer } from '../../components/author/audio/AudioPlayer';
import { formatBytes, formatMs } from '../../components/author/audio/time.js';
import { useNet } from '../../components/author/offline/hooks.js';
import { Btn, Dialog, cx, humanError, relativeTime } from '../../components/author/ui';
import { useEnv } from '../env';
import { audioOverWifiOnly, runInbox } from '../inbox/engine.js';
import { useInbox, useInboxSync, useVaultFile } from '../inbox/hooks.js';
import { KIND_ICON, audioFiles, composeText, imageFiles, itemKind, itemTitle } from '../inbox/model.js';
import { vault } from '../platform/vault.js';
import { useProjects } from '../useProjects';

// Boîte de réception : les captures gardées sur cet appareil. Elles y restent
// tant qu'on ne les classe pas ; les classer les envoie dans l'atelier PRIVÉ
// d'un projet (jamais publiées). L'état de chacune est dit tel qu'il est :
// à classer, en attente d'envoi, envoi en cours, refusée.

const PAUSE_TEXT = {
  session: 'Session expirée : reconnecte-toi pour envoyer ce qui attend.',
  access: 'Ce compte n\'a pas accès à l\'atelier : rien n\'est envoyé, tout reste ici.',
  rate: 'Le site est très sollicité : nouvel essai dans un instant.',
  server: 'Le site répond par une erreur : nouvel essai automatique.',
};

function ImageThumb({ file }) {
  const url = useVaultFile(file);
  return url ? <img className="am-inbox-img" src={url} alt={file.name || 'Image de la capture'} /> : null;
}

function AudioPreview({ file }) {
  const url = useVaultFile(file);
  if (!url) return null;
  return (
    <div className="am-inbox-audio">
      <AudioPlayer src={url} durationMs={file.durationMs} markers={file.markers || []} label={file.label || 'prise'} compact />
      <span className="au-faint">
        {formatMs(file.durationMs)} · {formatBytes(file.size)}
        {file.integrity === 'recovered' && <span className="au-pill" style={{ '--pill': 'var(--au-warn)', marginLeft: 6 }} title="Enregistrement interrompu : ce qui a été capté a été récupéré, la fin peut manquer.">récupérée</span>}
      </span>
    </div>
  );
}

function FileDialog({ item, projects, onClose, onChoose }) {
  const [pid, setPid] = useState(projects[0]?.id ?? null);
  const [sounds, setSounds] = useState([]);
  const [entityId, setEntityId] = useState('');
  const isAudio = itemKind(item) === 'audio';
  useEffect(() => {
    setEntityId('');
    setSounds([]);
    if (!isAudio || !pid) return;
    api.author.p(pid).entities.list({ kind: 'sound', sort: 'updated', limit: 200 }).then((r) => setSounds(r.items)).catch(() => setSounds([]));
  }, [pid, isAudio]);
  const project = projects.find((p) => p.id === pid);
  return (
    <Dialog open onClose={onClose} title="Classer dans un projet" width={480} initialFocus={false}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" disabled={!project} onClick={() => onChoose({ pid, title: project.title, entityId: entityId ? Number(entityId) : null })}>Classer</Btn></>}>
      <p className="au-muted" style={{ marginTop: 0 }}>
        {isAudio ? 'Le son devient une idée musicale du projet (ou une nouvelle version d\'une idée existante).' : 'La capture devient une idée dans la boîte à idées du projet.'} Elle reste privée.
      </p>
      <div className="au-publish-takes" role="radiogroup" aria-label="Projet">
        {projects.map((p) => (
          <label key={p.id} className={cx('au-publish-take', pid === p.id && 'is-sel')}>
            <input type="radio" name="file-project" checked={pid === p.id} onChange={() => setPid(p.id)} />
            <span><strong>{p.title}</strong></span>
          </label>
        ))}
      </div>
      {isAudio && sounds.length > 0 && (
        <label className="au-field" style={{ display: 'block' }}>
          <span className="au-field-label" style={{ display: 'block' }}>Ranger comme</span>
          <select className="au-select" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Nouvelle idée musicale</option>
            {sounds.map((s) => <option key={s.id} value={s.id}>Nouvelle version de « {s.title} »</option>)}
          </select>
        </label>
      )}
    </Dialog>
  );
}

export function Inbox() {
  const { session, config } = useEnv();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const net = useNet();
  const [params, setParams] = useSearchParams();
  const { loading, items, hidden, summary } = useInbox(session.owner);
  const sync = useInboxSync();
  const projects = useProjects(session);
  const owned = (projects.list || []).filter((p) => p.access === 'owner');
  const [filing, setFiling] = useState(null);

  // Arrivée depuis « Classer… » de l'écran de capture.
  useEffect(() => {
    const id = params.get('classer');
    if (!id || loading) return;
    const it = items.find((x) => x.id === id);
    if (it) setFiling(it);
    setParams({}, { replace: true });
  }, [params, loading]); // eslint-disable-line

  const startFiling = (item) => {
    if (session.status === 'local') { toast.info('Relie d\'abord ton site : la capture reste ici en attendant.'); navigate('/serveur'); return; }
    if (session.status !== 'ready') { toast.info('Connecte-toi pour classer : la capture reste ici en attendant.'); navigate('/connexion'); return; }
    if (!owned.length) { toast.info(projects.list === null ? 'Liste des projets indisponible pour l\'instant (hors connexion).' : 'Crée d\'abord un projet dans l\'atelier.'); return; }
    setFiling(item);
  };

  const choose = async (target) => {
    const item = filing;
    setFiling(null);
    await vault.put({ ...item, target: { serverUrl: config.serverUrl, ...target }, state: 'queued', error: null, owner: item.owner || session.owner });
    runInbox();
  };

  const remove = async (item) => {
    const ok = await confirm({
      title: 'Supprimer cette capture ?',
      message: item.state === 'queued' && item.progress?.entityId
        ? 'Une partie est déjà arrivée sur le site et y restera ; ce qui n\'est pas encore parti sera perdu.'
        : 'Elle n\'existe que sur cet appareil : elle sera perdue.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (ok) await vault.remove(item.id);
  };

  const copy = async (item) => {
    try { await navigator.clipboard.writeText(composeText(item)); toast.success('Texte copié'); } catch { toast.error('Copie impossible'); }
  };

  const stateLine = (item) => {
    if (item.state === 'failed') return { tone: 'bad', text: `Refusée par le site : ${humanError(item.error)}` };
    if (item.state === 'queued') {
      if (sync.sending === item.id) return { tone: 'sync', text: `Envoi vers « ${item.target?.title} »… ${Math.round(sync.progress * 100)} %` };
      if (!net.online || sync.offline) return { tone: 'warn', text: `En attente d'envoi vers « ${item.target?.title} » — hors connexion` };
      if (audioFiles(item).length && audioOverWifiOnly() && sync.waitingWifi) return { tone: 'warn', text: `En attente du Wi-Fi pour l'envoi vers « ${item.target?.title} »` };
      return { tone: 'sync', text: `En attente d'envoi vers « ${item.target?.title} »` };
    }
    return { tone: 'local', text: 'Sauvegardée sur cet appareil — à classer' };
  };

  return (
    <div className="am-screen">
      <header className="am-head">
        <Link to="/" className="au-btn is-ghost is-small" aria-label="Retour à l'accueil">←</Link>
        <h1>Boîte de réception</h1>
        <Link to="/capturer" className="au-btn is-primary is-small" style={{ marginLeft: 'auto' }}>＋ Capturer</Link>
      </header>
      {sync.paused && <div className="au-error" role="alert">{PAUSE_TEXT[sync.paused]}{sync.paused === 'session' && <Link className="au-btn is-small" to="/reglages" style={{ marginLeft: 'auto' }}>Se reconnecter</Link>}</div>}
      {summary.queued > 0 && session.status === 'ready' && (
        <p className="am-note au-muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {summary.queued} en attente d&apos;envoi.
          <Btn size="small" onClick={() => runInbox()} disabled={sync.running}>{sync.running ? 'Envoi…' : 'Envoyer maintenant'}</Btn>
        </p>
      )}
      {summary.queued > 0 && sync.waitingWifi > 0 && (
        <p className="am-note au-muted">{sync.waitingWifi} son(s) attendent le Wi-Fi. <Link to="/reglages">Changer ce réglage</Link></p>
      )}
      {!loading && items.length === 0 && (
        <div className="au-card am-section" style={{ textAlign: 'center' }}>
          <p className="au-muted">Rien à classer. Une idée, un son, une image : capture-les ici, tu décideras plus tard où ils vont.</p>
          <Link to="/capturer" className="au-btn is-primary">Capturer une idée</Link>
        </div>
      )}
      <div className="am-inbox">
        {items.map((item) => {
          const st = stateLine(item);
          const busy = sync.sending === item.id;
          return (
            <article key={item.id} className={cx('au-card am-inbox-item', `is-${item.state}`)}>
              <header>
                <span aria-hidden>{KIND_ICON[itemKind(item)]}</span>
                <strong>{itemTitle(item)}</strong>
              </header>
              {item.text && item.text.trim() !== itemTitle(item) && <p className="am-inbox-text">{item.text.length > 400 ? `${item.text.slice(0, 400)}…` : item.text}</p>}
              {item.url && <p className="am-link">🔗 <span>{item.url}</span></p>}
              {imageFiles(item).length > 0 && <div className="am-inbox-imgs">{imageFiles(item).map((f) => <ImageThumb key={f.id} file={f} />)}</div>}
              {audioFiles(item).map((f) => <AudioPreview key={f.id} file={f} />)}
              <p className="au-faint am-inbox-origin">{item.origin} · {relativeTime(Math.floor(item.createdAt / 1000))}</p>
              <p className={`am-status is-${st.tone}`} role="status"><span className="am-status-dot" aria-hidden />{st.text}</p>
              <div className="am-inbox-actions">
                {item.state === 'local' && <Btn size="small" variant="primary" onClick={() => startFiling(item)}>Classer…</Btn>}
                {item.state === 'failed' && <Btn size="small" variant="primary" onClick={async () => { await vault.put({ ...item, state: 'queued', error: null }); runInbox(); }}>Réessayer</Btn>}
                {item.state === 'failed' && <Btn size="small" onClick={() => startFiling(item)}>Autre projet…</Btn>}
                {item.state === 'queued' && !busy && !item.progress?.entityId && <Btn size="small" onClick={() => vault.put({ ...item, state: 'local', target: null })}>Retirer de la file</Btn>}
                {item.state !== 'queued' && <Link className="au-btn is-small" to={`/capturer?id=${item.id}`}>Modifier</Link>}
                {item.text && <Btn size="small" variant="ghost" onClick={() => copy(item)}>Copier</Btn>}
                {!busy && <Btn size="small" variant="ghost" onClick={() => remove(item)}>Supprimer</Btn>}
              </div>
            </article>
          );
        })}
      </div>
      {hidden > 0 && <p className="au-faint am-note">{hidden} capture(s) d&apos;un autre compte sont gardées sur cet appareil ; elles ne sont visibles et envoyées qu&apos;avec ce compte.</p>}
      {filing && <FileDialog item={filing} projects={owned} onClose={() => setFiling(null)} onChoose={choose} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBytes } from '../../components/author/audio/time.js';
import { Btn } from '../../components/author/ui';
import { useEnv } from '../env';
import { findUrl, newItem } from '../inbox/model.js';
import { clearShare, pendingShare } from '../platform/intake.js';
import { fileSrc } from '../platform/bridge.js';
import { vault } from '../platform/vault.js';

// Partage reçu d'une autre application : un APERÇU d'abord. Rien n'entre dans
// la boîte de réception tant que ce n'est pas accepté ; refuser efface les
// fichiers reçus. Une fois importé, c'est une capture comme une autre : privée,
// à classer plus tard.

export function ShareIntake() {
  const { session } = useEnv();
  const navigate = useNavigate();
  const [share, setShare] = useState(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => { pendingShare().then(setShare); }, []);

  if (share === undefined) return <div className="am-splash">…</div>;
  if (!share) {
    return (
      <div className="am-screen am-narrow">
        <header className="am-head"><h1>Partage</h1></header>
        <p className="au-muted">Aucun partage en attente.</p>
        <Btn onClick={() => navigate('/', { replace: true })}>Retour à l&apos;accueil</Btn>
      </div>
    );
  }

  const text = [share.subject, share.text].filter(Boolean).join('\n').trim();
  const url = findUrl(text);
  const files = share.files || [];
  const from = share.sourceApp ? `partage : ${share.sourceApp}` : 'partage';

  const accept = async () => {
    setBusy(true);
    await vault.put(newItem({ text, url, files, origin: from.slice(0, 120), owner: session.owner }));
    await clearShare(true);
    navigate('/boite', { replace: true });
  };
  const refuse = async () => {
    setBusy(true);
    await clearShare(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="am-screen am-narrow">
      <header className="am-head"><h1>Importer ce partage ?</h1></header>
      <p className="au-muted am-lead">{share.sourceApp ? `Reçu de ${share.sourceApp}.` : 'Reçu d\'une autre application.'} Il sera gardé sur cet appareil, dans la boîte de réception.</p>
      <div className="au-card">
        {text && <p className="am-inbox-text">{text.length > 1200 ? `${text.slice(0, 1200)}…` : text}</p>}
        {url && <p className="am-link">🔗 <span>{url}</span></p>}
        {files.filter((f) => f.role === 'image').map((f) => <img key={f.id} className="am-inbox-img" src={fileSrc(f.path)} alt={f.name || 'Image partagée'} />)}
        {files.filter((f) => f.role === 'audio').map((f) => (
          <div key={f.id} className="am-inbox-audio">
            <audio controls preload="metadata" src={fileSrc(f.path)} aria-label={f.name || 'Son partagé'} />
            <span className="au-faint">{f.name} · {formatBytes(f.size)}</span>
          </div>
        ))}
        {share.rejected > 0 && <p className="au-faint">{share.rejected} fichier(s) d&apos;un autre type n&apos;ont pas été pris (seuls texte, liens, images et sons sont acceptés).</p>}
        {!text && !files.length && <p className="au-muted">Ce partage ne contient rien d&apos;utilisable.</p>}
      </div>
      <div className="am-capture-bar">
        <Btn variant="ghost" onClick={refuse} disabled={busy}>Ne pas importer</Btn>
        <span style={{ flex: 1 }} />
        <Btn variant="primary" onClick={accept} disabled={busy || (!text && !files.length)}>Importer dans la boîte</Btn>
      </div>
    </div>
  );
}

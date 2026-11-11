import { useEffect, useState } from 'react';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { Btn, Dialog, ErrorLine, cx, humanError } from '../ui';
import { AudioPlayer } from './AudioPlayer';
import { formatMs } from './time.js';

// Publier une prise : un geste à part, en trois temps — choisir la version,
// l'écouter telle qu'elle sera publiée, confirmer la destination. Tant que la
// dernière case n'est pas cochée, rien ne sort de l'atelier privé. Enregistrer,
// ranger ou synchroniser une prise ne la publie jamais.

export function PublishDialog({ open, onClose, takes, initialId, defaultTitle = '', onPublished }) {
  const { P } = useAuthor();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [takeId, setTakeId] = useState(initialId);
  const [title, setTitle] = useState(defaultTitle);
  const [genre, setGenre] = useState('');
  const [preview, setPreview] = useState(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const take = takes.find((t) => t.id === takeId) || null;

  useEffect(() => { if (open) { setStep(1); setTakeId(initialId); setTitle(defaultTitle); setGenre(''); setAgree(false); setError(null); setPreview(null); } }, [open, initialId, defaultTitle]);

  const toPreview = async () => {
    setError(null);
    try { setPreview(await P.audio.publication(takeId, { title, genre })); setStep(2); }
    catch (err) { setError(err); }
  };

  const publish = async () => {
    if (!agree || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await P.audio.publish(takeId, { destination: 'portfolio', title: title.trim(), genre: genre.trim(), confirm: true });
      toast.success('Prise publiée sur le site');
      onPublished?.(out);
      onClose();
    } catch (err) { setError(err.body?.error ? new Error(err.body.error) : err); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title="📣 Publier une prise" width={560} initialFocus={false}
      footer={(
        <>
          <span className="au-faint" style={{ marginRight: 'auto', fontSize: 12 }}>Étape {step} sur 3</span>
          {step > 1 && <Btn variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}>Retour</Btn>}
          {step === 1 && <Btn variant="primary" onClick={toPreview} disabled={!take || !title.trim()}>Prévisualiser</Btn>}
          {step === 2 && <Btn variant="primary" onClick={() => setStep(3)} disabled={!!preview?.alreadyPublished}>Choisir la destination</Btn>}
          {step === 3 && <Btn variant="primary" onClick={publish} disabled={!agree || busy}>{busy ? 'Publication…' : 'Publier'}</Btn>}
        </>
      )}>
      <ErrorLine error={error && { message: humanError(error) }} onClose={() => setError(null)} />
      {step === 1 && (
        <>
          <p className="au-muted" style={{ marginTop: 0 }}>Quelle version veux-tu rendre publique ? Les autres restent privées.</p>
          <div className="au-publish-takes" role="radiogroup" aria-label="Version à publier">
            {takes.map((t) => (
              <label key={t.id} className={cx('au-publish-take', takeId === t.id && 'is-sel')}>
                <input type="radio" name="publish-take" checked={takeId === t.id} onChange={() => setTakeId(t.id)} />
                <span><strong>{t.label || `Prise ${t.id}`}</strong><span className="au-faint"> · {formatMs(t.durationMs)}{t.publishedAt ? ' · déjà publiée' : ''}</span></span>
              </label>
            ))}
          </div>
          <label className="au-field" style={{ display: 'block' }}>
            <span className="au-field-label" style={{ display: 'block' }}>Titre public</span>
            <input className="au-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="au-field" style={{ display: 'block' }}>
            <span className="au-field-label" style={{ display: 'block' }}>Genre (facultatif)</span>
            <input className="au-input" value={genre} onChange={(e) => setGenre(e.target.value)} maxLength={80} />
          </label>
        </>
      )}
      {step === 2 && preview && take && (
        <>
          <p className="au-muted" style={{ marginTop: 0 }}>Voici exactement ce qui serait publié. Écoute la prise en entier si tu as un doute.</p>
          <div className="au-card" style={{ marginBottom: 12 }}>
            <strong>{preview.wouldPublish.title}</strong>
            <div className="au-faint" style={{ fontSize: 12.5 }}>{[preview.wouldPublish.genre, preview.wouldPublish.duration].filter(Boolean).join(' · ')}</div>
            <AudioPlayer src={take.url} durationMs={take.durationMs} label="aperçu avant publication" compact />
          </div>
          {preview.alreadyPublished && <p className="au-error" role="alert">Cette prise est déjà publiée (« {preview.alreadyPublished.title} »). Pour la retirer ou la modifier : Administration → Musique.</p>}
          <p className="au-faint" style={{ fontSize: 12.5 }}>Les paroles, les repères, les notes et les autres versions ne sont pas publiés.</p>
        </>
      )}
      {step === 3 && preview && (
        <>
          <div className="au-card" style={{ marginBottom: 12 }}>
            <div className="au-card-title">Destination : le site public</div>
            <p className="au-muted" style={{ margin: 0 }}>{preview.wouldPublish.visibility}</p>
          </div>
          <p className="au-muted" style={{ fontSize: 13 }}>Une copie de la prise est déposée dans la musique du site. L&apos;original reste dans l&apos;atelier privé ; retirer la piste publique se fait dans Administration → Musique.</p>
          <label className="au-check-row">
            <input type="checkbox" className="au-check" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            Je publie « {title.trim()} » sur le site public.
          </label>
        </>
      )}
    </Dialog>
  );
}

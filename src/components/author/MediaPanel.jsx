import { useRef, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { Btn, Dialog, humanError } from './ui';

// Références visuelles d'un élément (portraits, ambiances, plans…). Les images
// sont réencodées en WebP par le serveur et servies derrière la garde de
// l'atelier — jamais publiques.

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export function useUpload() {
  const { P } = useAuthor();
  const toast = useToast();
  const [progress, setProgress] = useState(null);
  const upload = async (files, { entityId, purpose = 'gallery' } = {}) => {
    const out = [];
    const list = [...files];
    for (let i = 0; i < list.length; i += 1) {
      const fd = new FormData();
      fd.append('image', list[i]);
      if (entityId) fd.append('entityId', String(entityId));
      fd.append('purpose', purpose);
      try {
        out.push(await P.media.upload(fd, { onProgress: (p) => setProgress((i + p) / list.length) }));
      } catch (err) {
        toast.error(`${list[i].name} : ${humanError(err.body?.error || err)}`);
      }
    }
    setProgress(null);
    return out;
  };
  return { upload, progress };
}

export function MediaPanel({ entity, onChanged }) {
  const { P } = useAuthor();
  const confirm = useConfirm();
  const toast = useToast();
  const input = useRef(null);
  const { upload, progress } = useUpload();
  const [view, setView] = useState(null);

  const onFiles = async (files) => {
    if (!files?.length) return;
    const done = await upload(files, { entityId: entity.id, purpose: entity.media.length === 0 && !entity.cover ? 'cover' : 'gallery' });
    if (done.length) onChanged?.();
  };

  const setCover = async (m) => { await P.media.update(m.id, { cover: true }); onChanged?.(); };
  const caption = async (m, text) => { await P.media.update(m.id, { caption: text }); onChanged?.(); };
  const remove = async (m) => {
    if (!(await confirm({ title: 'Supprimer l\'image ?', message: 'Le fichier est effacé définitivement.', confirmLabel: 'Supprimer', danger: true }))) return;
    try { await P.media.remove(m.id); setView(null); onChanged?.(); } catch (err) { toast.error(humanError(err)); }
  };

  return (
    <div>
      <div className="au-card-title">
        🖼️ Références visuelles <span className="au-faint" style={{ fontWeight: 500 }}>{entity.media.length}</span>
        <span className="au-actions">
          <Btn size="small" onClick={() => input.current?.click()} disabled={progress !== null}>
            {progress !== null ? `Envoi ${Math.round(progress * 100)} %` : '＋ Images'}
          </Btn>
        </span>
      </div>
      <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      {entity.media.length === 0 ? (
        <div className="au-dropzone" role="button" tabIndex={0} onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter') input.current?.click(); }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
          Glisse des images ici ou touche pour en ajouter<br /><span className="au-faint" style={{ fontSize: 11.5 }}>JPEG, PNG, WebP · 15 Mo max</span>
        </div>
      ) : (
        <div className="au-gallery" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}>
          {entity.media.map((m) => (
            <button key={m.id} type="button" className="au-thumb" onClick={() => setView(m)} title={m.caption || m.originalName}>
              <img src={m.thumbUrl} alt={m.caption || ''} loading="lazy" />
              {entity.cover?.id === m.id && <span className="au-thumb-badge">Couverture</span>}
            </button>
          ))}
        </div>
      )}
      <Dialog open={!!view} onClose={() => setView(null)} title={view?.caption || 'Image'} width={1100}
        footer={view && (
          <>
            <Btn variant="danger" onClick={() => remove(view)} style={{ marginRight: 'auto' }}>Supprimer</Btn>
            {entity.cover?.id !== view.id && <Btn onClick={() => { setCover(view); setView(null); }}>Utiliser comme couverture</Btn>}
            <Btn variant="primary" onClick={() => setView(null)}>Fermer</Btn>
          </>
        )}>
        {view && (
          <>
            <img src={view.url} alt={view.caption || ''} style={{ width: '100%', maxHeight: '64vh', objectFit: 'contain', borderRadius: 10, background: 'var(--au-bg-2)' }} />
            <input className="au-input" style={{ marginTop: 10 }} defaultValue={view.caption} placeholder="Légende…" maxLength={300}
              onBlur={(e) => { if (e.target.value !== view.caption) caption(view, e.target.value); }} />
          </>
        )}
      </Dialog>
    </div>
  );
}

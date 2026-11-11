import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../ui/ToastProvider';
import { RecorderDialog } from '../../components/author/audio/RecorderDialog';
import { Btn } from '../../components/author/ui';
import { useEnv } from '../env';
import { findUrl, imageFiles, audioFiles, isEmpty, newItem } from '../inbox/model.js';
import { useVaultFile } from '../inbox/hooks.js';
import { vault } from '../platform/vault.js';
import { takeAsFile } from './Record';

// Capturer une idée : on écrit, c'est gardé. Ni titre, ni catégorie, ni projet,
// ni réseau, ni compte. Chaque frappe est enregistrée sur l'appareil (pas de
// bouton « Enregistrer » à oublier) ; une capture vide ne laisse aucune trace.
// On peut y joindre une image ou un son ; un lien collé est reconnu.

function Thumb({ file, onRemove }) {
  const url = useVaultFile(file);
  return (
    <span className="am-thumb">
      {url ? <img src={url} alt={file.name || 'Image jointe'} /> : <span className="au-faint">…</span>}
      <button type="button" onClick={onRemove} aria-label={`Retirer ${file.name || 'l\'image'}`}>✕</button>
    </span>
  );
}

export function Capture() {
  const { session } = useEnv();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const [item, setItem] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [recording, setRecording] = useState(false);
  const itemRef = useRef(null);
  const stored = useRef(false);
  const timer = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const found = editId ? (await vault.list()).find((it) => it.id === editId) : null;
      if (!alive) return;
      const start = found || newItem({ owner: session.owner });
      stored.current = !!found;
      itemRef.current = start;
      setItem(start);
    })();
    return () => { alive = false; };
  }, [editId, session.owner]);

  const persist = useCallback(async () => {
    clearTimeout(timer.current);
    const cur = itemRef.current;
    if (!cur) return;
    try {
      if (isEmpty(cur)) {
        if (stored.current) { await vault.remove(cur.id); stored.current = false; }
        return;
      }
      await vault.put(cur);
      stored.current = true;
      setSavedAt(Date.now());
    } catch {
      toast.error('Impossible de garder cette capture sur l\'appareil (stockage plein ?). Copie ton texte par sécurité.');
    }
  }, [toast]);

  const change = useCallback((patch, { now = false } = {}) => {
    const next = { ...itemRef.current, ...patch };
    if (patch.text !== undefined) next.url = findUrl(patch.text) || (itemRef.current.url && !findUrl(itemRef.current.text) ? itemRef.current.url : null);
    itemRef.current = next;
    setItem(next);
    clearTimeout(timer.current);
    if (now) persist(); else timer.current = setTimeout(persist, 350);
  }, [persist]);

  // Fermeture, mise en arrière-plan, retour : ce qui est tapé est écrit tout de suite.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') persist(); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', persist);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', persist); persist(); };
  }, [persist]);

  const addImage = async (picked) => {
    try {
      const ref = picked
        ? await vault.addBlob(picked, { role: 'image', name: picked.name })
        : await vault.pick('image');
      if (ref) change({ files: [...itemRef.current.files, { ...ref, role: 'image' }] }, { now: true });
    } catch { toast.error('Cette image n\'a pas pu être jointe.'); }
  };

  const addTake = async ({ take, label }) => {
    const file = await takeAsFile(take, label);
    change({ files: [...itemRef.current.files, file], origin: itemRef.current.origin === 'saisie' && !itemRef.current.text ? 'enregistrement' : itemRef.current.origin }, { now: true });
  };

  const removeFile = (id) => change({ files: itemRef.current.files.filter((f) => f.id !== id) }, { now: true });

  if (!item) return <div className="am-splash">…</div>;
  const empty = isEmpty(item);

  return (
    <div className="am-screen am-capture">
      <header className="am-head">
        <Link to="/" className="au-btn is-ghost is-small" aria-label="Retour à l'accueil">←</Link>
        <h1>Capturer</h1>
        <span className="am-saved" role="status" aria-live="polite">{empty ? '' : savedAt ? '✓ gardé sur cet appareil' : '…'}</span>
      </header>
      <textarea className="au-textarea am-capture-text" autoFocus lang="fr" spellCheck value={item.text}
        onChange={(e) => change({ text: e.target.value })}
        placeholder={'Une idée, une phrase, une image, un lien…\nÉcris : c\'est gardé.'} aria-label="Texte de la capture" />
      {item.url && <p className="am-link">🔗 <span>{item.url}</span></p>}
      {imageFiles(item).length > 0 && (
        <div className="am-thumbs">{imageFiles(item).map((f) => <Thumb key={f.id} file={f} onRemove={() => removeFile(f.id)} />)}</div>
      )}
      {audioFiles(item).map((f) => (
        <p key={f.id} className="am-link">🎙️ <span>{f.label || f.name}</span>
          <button type="button" className="au-btn is-ghost is-small" onClick={() => removeFile(f.id)} aria-label="Retirer ce son">✕</button></p>
      ))}
      <div className="am-capture-bar">
        <Btn onClick={() => (vault.canPick() ? addImage() : fileInput.current?.click())}>🖼️ Image</Btn>
        <Btn onClick={() => setRecording(true)}>🎙️ Son</Btn>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) addImage(e.target.files[0]); e.target.value = ''; }} />
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" disabled={empty} onClick={async () => { await persist(); navigate(`/boite?classer=${item.id}`); }}>Classer…</Btn>
        <Btn variant="primary" onClick={async () => { await persist(); navigate(empty ? '/' : '/boite'); }}>Terminé</Btn>
      </div>
      <p className="au-faint am-note">Privé par défaut : la capture reste sur cet appareil tant que tu ne la classes pas dans un projet.</p>
      <RecorderDialog open={recording} onClose={() => setRecording(false)} onTake={addTake} title="🎙️ Joindre un son" />
    </div>
  );
}

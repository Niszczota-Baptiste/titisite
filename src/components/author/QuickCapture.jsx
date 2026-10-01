import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { Btn, Dialog, Kbd, MOD, TagInput, humanError } from './ui';

// Capture éclair : écrire une idée en quelques secondes, sans la classer.
// Première ligne = titre, le reste = contenu ; l'idée atterrit dans l'inbox du
// brainstorming. Le texte en cours survit à une fermeture accidentelle.

const DRAFT_KEY = 'au-capture-draft';

export function QuickCapture({ open, onClose }) {
  const { pid, P, bump, tags, reloadTags } = useAuthor();
  const toast = useToast();
  const [text, setText] = useState(() => { try { return localStorage.getItem(DRAFT_KEY) || ''; } catch { return ''; } });
  const [tagNames, setTagNames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const update = (v) => {
    setText(v);
    try { if (v) localStorage.setItem(DRAFT_KEY, v); else localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const submit = async (keepOpen = false) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await P.notes.quick(text, tagNames);
      update('');
      setTagNames([]);
      bump();
      if (tagNames.length) reloadTags();
      toast.success('Idée capturée dans l\'inbox');
      if (!keepOpen) onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="💡 Capturer une idée" width={560}
      footer={(
        <>
          <Link to={`/auteur/${pid}/idees?vue=inbox`} onClick={onClose} className="au-btn is-ghost" style={{ marginRight: 'auto' }}>Voir l&apos;inbox</Link>
          <Btn variant="ghost" onClick={() => submit(true)} disabled={!text.trim() || busy}>Enregistrer et continuer</Btn>
          <Btn variant="primary" onClick={() => submit(false)} disabled={!text.trim() || busy}>Enregistrer <span className="au-desktop-only"><Kbd>{MOD} ↵</Kbd></span></Btn>
        </>
      )}>
      {error && <div className="au-error">{humanError(error)}</div>}
      <textarea className="au-textarea" rows={6} value={text} data-autofocus autoFocus
        placeholder={'Une idée, une scène, une réplique…\n(la première ligne devient le titre)'}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(e.shiftKey); } }}
        style={{ fontSize: 15, minHeight: 140 }} />
      <div style={{ marginTop: 10 }}>
        <TagInput value={tagNames} onChange={setTagNames} allTags={tags} placeholder="Tags (facultatif)…" />
      </div>
    </Dialog>
  );
}

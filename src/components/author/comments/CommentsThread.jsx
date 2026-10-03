import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { Btn, ErrorLine, cx, entityPath, humanError, relativeTime } from '../ui';

// Commentaires de l'atelier : un fil par élément (fiche, chapitre…) ou le fil
// général du livre. Le texte est rendu comme TEXTE (React l'échappe) : aucune
// mise en forme, donc rien à assainir.
//
// Propriétaire : répond, marque « traité », supprime n'importe quel message.
// Invité omniscient : écrit, corrige et supprime les siens. Le serveur vérifie
// chacun de ces droits ; l'interface ne fait que masquer les boutons.

export function CommentItem({ c, onChanged, showTarget }) {
  const { pid, P, guest, bump } = useAuthor();
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const edited = c.updatedAt > c.createdAt + 1;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onChanged?.(); bump(); } catch (err) { toast.error(humanError(err)); } finally { setBusy(false); }
  };
  const save = () => run(async () => { await P.comments.update(c.id, { body: text }); setEditing(false); });
  const remove = async () => {
    if (!(await confirm({ title: 'Supprimer ce commentaire ?', message: 'Il disparaît pour tout le monde.', confirmLabel: 'Supprimer', danger: true }))) return;
    run(() => P.comments.remove(c.id));
  };
  const resolve = () => run(() => P.comments.update(c.id, { resolved: !c.resolvedAt }));

  return (
    <article className={cx('au-comment', c.byOwner && 'is-owner', c.resolvedAt && 'is-resolved')}>
      {showTarget && (
        c.entity
          ? (c.entity.deleted
            ? <div className="au-comment-target au-faint">{kindMeta(c.entity.kind).icon} {c.entity.title} (à la corbeille)</div>
            : <Link className="au-comment-target" to={entityPath(pid, c.entity)}>{kindMeta(c.entity.kind).icon} {c.entity.number ? `${c.entity.number}. ` : ''}{c.entity.title}</Link>)
          : <div className="au-comment-target">📕 Fil général du livre</div>
      )}
      <header className="au-comment-head">
        <strong>{c.authorName}</strong>
        {c.byOwner && <span className="au-comment-badge">auteur</span>}
        <span className="au-faint" title={new Date(c.createdAt * 1000).toLocaleString('fr-FR')}>{relativeTime(c.createdAt)}{edited ? ' · modifié' : ''}</span>
        {c.resolvedAt && <span className="au-comment-done" title="Marqué comme traité par l'auteur">✓ traité</span>}
      </header>
      {c.quote && <blockquote className="au-comment-quote">{c.quote}</blockquote>}
      {editing ? (
        <div className="au-comment-edit">
          <textarea className="au-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} aria-label="Modifier le commentaire"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }} />
          <div className="au-comment-actions">
            <Btn size="small" variant="ghost" onClick={() => { setEditing(false); setText(c.body); }}>Annuler</Btn>
            <Btn size="small" variant="primary" onClick={save} disabled={busy || !text.trim()}>Enregistrer</Btn>
          </div>
        </div>
      ) : <p className="au-comment-body">{c.body}</p>}
      {!editing && (
        <div className="au-comment-actions">
          {!guest && !c.byOwner && <Btn size="small" variant="ghost" onClick={resolve} disabled={busy}>{c.resolvedAt ? '↺ Rouvrir' : '✓ Traité'}</Btn>}
          {c.mine && <Btn size="small" variant="ghost" onClick={() => setEditing(true)}>✎ Modifier</Btn>}
          {(c.mine || !guest) && <Btn size="small" variant="ghost" onClick={remove} disabled={busy} aria-label="Supprimer le commentaire">🗑</Btn>}
        </div>
      )}
    </article>
  );
}

export function CommentComposer({ entityId = null, quote = '', onClearQuote, onSent, placeholder, autoFocus }) {
  const { P, bump } = useAuthor();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const c = await P.comments.create({ entityId, body: text.trim(), quote: quote || undefined });
      setText('');
      onClearQuote?.();
      onSent?.(c);
      bump();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <div className="au-comment-compose">
      <ErrorLine error={error} onClose={() => setError(null)} />
      {quote && (
        <div className="au-comment-quote is-draft">
          <span>« {quote.length > 220 ? `${quote.slice(0, 220)}…` : quote} »</span>
          <button type="button" aria-label="Retirer la citation" onClick={onClearQuote}>×</button>
        </div>
      )}
      <textarea className="au-textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000}
        placeholder={placeholder || 'Une remarque, une question, ce que tu en comprends…'} aria-label="Nouveau commentaire" autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
      <div className="au-comment-actions">
        <span className="au-faint" style={{ fontSize: 11, marginRight: 'auto' }}>Ctrl/⌘ + Entrée pour envoyer</span>
        <Btn size="small" variant="primary" onClick={send} disabled={busy || !text.trim()}>Envoyer</Btn>
      </div>
    </div>
  );
}

// Fil complet d'un élément (`entityId`) ou du livre (`entityId` absent).
export function CommentsThread({ entityId = null, title = '💬 Commentaires', quote, onClearQuote, emptyText }) {
  const { P, version, guest } = useAuthor();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    const params = entityId ? { entity: entityId } : { general: 1 };
    return P.comments.list(params).then(setItems).catch(setError);
  }, [P, entityId]);
  useEffect(() => { load(); }, [load, version]);

  // « Ouvert » = à traiter par l'auteur : ni traité, ni écrit par lui.
  const open = items && !guest ? items.filter((c) => !c.resolvedAt && !c.byOwner).length : 0;
  return (
    <section className="au-comments" aria-label="Commentaires">
      {title && (
        <div className="au-card-title">
          {title}
          {items?.length > 0 && <span className="au-faint" style={{ fontWeight: 400, fontSize: 12 }}>{items.length}{open ? ` · ${open} à traiter` : ''}</span>}
        </div>
      )}
      <ErrorLine error={error} onClose={() => setError(null)} />
      {items?.length === 0 && <p className="au-faint" style={{ fontSize: 12.5, margin: '0 0 8px' }}>{emptyText || 'Aucun commentaire pour l\'instant.'}</p>}
      {items?.map((c) => <CommentItem key={c.id} c={c} onChanged={load} />)}
      <CommentComposer entityId={entityId} quote={quote} onClearQuote={onClearQuote} onSent={load} />
    </section>
  );
}

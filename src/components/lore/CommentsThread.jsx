import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ACC, CRIMSON, INK, MUTED, formatDate } from './theme';

// Fil de discussion d'une entrée ou d'une hypothèse — la table globale
// `comments` (targetType lore_entry / lore_hypothesis), à plat comme partout
// ailleurs sur le site. Chacun peut supprimer les siens, l'admin tout.

export function CommentsThread({ targetType, targetId, user }) {
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.comments(targetType, targetId)
      .then((c) => { if (alive) setComments(c); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [targetType, targetId]);

  const post = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const c = await api.addComment(targetType, targetId, text.trim());
      setComments((cs) => [...(cs || []), c]);
      setText('');
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try {
      await api.deleteComment(id);
      setComments((cs) => cs.filter((c) => c.id !== id));
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: INK, marginBottom: 8 }}>
        💬 Discussion {comments?.length ? `(${comments.length})` : ''}
      </div>
      {err && <p style={{ color: CRIMSON, fontSize: 12.5 }}>{err}</p>}
      {comments === null && <p style={{ color: MUTED, fontSize: 13 }}>Chargement…</p>}
      {comments?.length === 0 && <p style={{ color: MUTED, fontSize: 13 }}>Aucun message. Une piste, un doute ? Écris-le ici.</p>}
      {comments?.map((c) => (
        <div key={c.id} style={{ padding: '8px 10px', marginBottom: 6, background: 'rgba(9,16,14,0.55)', border: '1px solid rgba(60,130,90,0.18)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 700, color: ACC }}>{c.authorName || 'Compte supprimé'}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: MUTED }}>{formatDate(c.createdAt)}</span>
            {(user.role === 'admin' || c.authorId === user.id) && (
              <button type="button" onClick={() => remove(c.id)} title="Supprimer"
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}>✕</button>
            )}
          </div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: 'rgba(214,206,230,0.92)', whiteSpace: 'pre-wrap', marginTop: 3 }}>{c.body}</div>
        </div>
      ))}
      <form onSubmit={post} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)} placeholder="Ajouter un message…"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13.5,
            background: 'rgba(9,16,14,0.7)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
          }}
        />
        <button type="submit" disabled={busy || !text.trim()} style={{
          padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
          fontSize: 13, fontWeight: 700, background: ACC, color: '#08130b', border: 'none',
          opacity: busy || !text.trim() ? 0.5 : 1,
        }}>Envoyer</button>
      </form>
    </div>
  );
}

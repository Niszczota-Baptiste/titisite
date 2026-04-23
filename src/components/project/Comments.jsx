import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Textarea,
  Empty, muted, relativeDate,
} from './shared';

export function Comments({ targetType, targetId = 0, compact = false }) {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const data = await api.comments(targetType, targetId);
      setItems(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [targetType, targetId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setErr(null);
    try {
      await api.addComment(targetType, targetId, body);
      setBody('');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    try {
      await api.deleteComment(id);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div>
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 12 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucun commentaire pour le moment.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12, marginBottom: 16 }}>
          {items.map((c) => {
            const mine = c.authorId === user?.id;
            const canDelete = mine || isAdmin;
            return (
              <div key={c.id} style={{
                background: mine ? `rgba(${ACC_RGB},0.06)` : 'rgba(4,3,14,0.45)',
                border: `1px solid ${mine ? `rgba(${ACC_RGB},0.2)` : 'rgba(60,40,100,0.18)'}`,
                borderRadius: 10, padding: '10px 14px',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                    color: mine ? ACC : '#ede8f8',
                  }}>
                    {c.authorName || c.authorEmail || 'Anonyme'}
                    {c.authorRole === 'admin' && (
                      <span style={{
                        fontSize: 9, marginLeft: 6, padding: '1px 5px', borderRadius: 3,
                        background: `rgba(${ACC_RGB},0.12)`, color: ACC, letterSpacing: '0.5px',
                      }}>ADMIN</span>
                    )}
                  </span>
                  <span style={{ ...muted, fontSize: 11 }}>
                    {relativeDate(c.createdAt)}
                    {canDelete && (
                      <button
                        onClick={() => del(c.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'rgba(180,170,200,0.4)', marginLeft: 10, fontSize: 12,
                        }}
                        title="Supprimer"
                      >×</button>
                    )}
                  </span>
                </div>
                <p style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.55,
                  color: '#ede8f8', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {c.body}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Écrire un commentaire…"
          rows={compact ? 2 : 3}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" disabled={sending || !body.trim()}>
            {sending ? '…' : 'Publier'}
          </Button>
        </div>
      </form>
    </div>
  );
}

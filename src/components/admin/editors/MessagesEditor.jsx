import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { Empty, ErrorBanner, formatDate } from '../../project/shared';
import { ACC, ACC_RGB, Button } from '../ui';

// Boîte de réception du formulaire de contact public : liste, marquer lu,
// supprimer. Pas de création ici — les messages arrivent via POST /api/contact.
export function MessagesEditor() {
  const confirm = useConfirm();
  const [messages, setMessages] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api.contact.list().then(setMessages).catch(() => setErr('Chargement impossible.'));
  useEffect(() => { load(); }, []);

  const toggleRead = async (m) => {
    try {
      await api.contact.markRead(m.id, !m.read);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, read: m.read ? 0 : 1 } : x)));
    } catch { setErr('Action impossible.'); }
  };

  const remove = async (m) => {
    const ok = await confirm({
      title: 'Supprimer ce message',
      message: `Le message de ${m.name || m.email} sera supprimé définitivement.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.contact.remove(m.id);
      setMessages((list) => list.filter((x) => x.id !== m.id));
    } catch { setErr('Suppression impossible.'); }
  };

  const unread = messages?.filter((m) => !m.read).length || 0;

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>
          Messages
        </h2>
        {unread > 0 && (
          <span style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700,
            color: ACC, background: `rgba(${ACC_RGB},0.12)`,
            border: `1px solid rgba(${ACC_RGB},0.35)`,
            borderRadius: 999, padding: '2px 10px',
          }}>
            {unread} non lu{unread > 1 ? 's' : ''}
          </span>
        )}
      </header>

      <ErrorBanner error={err} onDismiss={() => setErr('')} />

      {messages === null ? (
        <Empty>Chargement…</Empty>
      ) : messages.length === 0 ? (
        <Empty>Aucun message pour le moment.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m) => (
            <article
              key={m.id}
              style={{
                background: m.read ? 'rgba(14,9,28,0.5)' : 'rgba(14,9,28,0.85)',
                border: `1px solid ${m.read ? 'rgba(80,50,130,0.18)' : `rgba(${ACC_RGB},0.4)`}`,
                borderRadius: 12, padding: '14px 16px',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8,
              }}>
                {!m.read && (
                  <span aria-label="Non lu" style={{
                    width: 8, height: 8, borderRadius: '50%', background: ACC, flexShrink: 0,
                  }} />
                )}
                <strong style={{
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
                  color: '#ede8f8',
                }}>
                  {m.name || '(anonyme)'}
                </strong>
                <a
                  href={`mailto:${m.email}`}
                  style={{ fontFamily: 'monospace', fontSize: 12, color: ACC, textDecoration: 'none' }}
                >
                  {m.email}
                </a>
                <span style={{
                  marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11,
                  color: 'rgba(180,170,200,0.5)',
                }}>
                  {formatDate(m.created_at)}
                </span>
              </div>
              <p style={{
                fontFamily: "'Inter',sans-serif", fontSize: 13.5, lineHeight: 1.7,
                color: 'rgba(220,212,238,0.9)', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', marginBottom: 12,
              }}>
                {m.message}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => toggleRead(m)}>
                  {m.read ? 'Marquer non lu' : 'Marquer lu'}
                </Button>
                <Button variant="danger" onClick={() => remove(m)}>Supprimer</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

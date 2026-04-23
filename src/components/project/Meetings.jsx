import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { AttachmentList } from './Attachments';
import { MeetingModal } from './MeetingModal';
import {
  ACC_RGB, Button, ErrorBanner, Section,
  Empty, card, formatDate, muted,
} from './shared';

export function MeetingsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await api.get('/meetings')); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const now = Math.floor(Date.now() / 1000);
  const { upcoming, past } = useMemo(() => {
    const up = items.filter((m) => m.startsAt >= now).sort((a, b) => a.startsAt - b.startsAt);
    const pa = items.filter((m) => m.startsAt < now).sort((a, b) => b.startsAt - a.startsAt);
    return { upcoming: up, past: pa };
  }, [items, now]);

  return (
    <Section
      title="Réunions"
      actions={<Button onClick={() => setEditing({})}>+ Nouvelle réunion</Button>}
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucune réunion planifiée.</Empty>
      ) : (
        <>
          <SubSection title="À venir" count={upcoming.length}>
            {upcoming.length === 0
              ? <Empty>Rien de planifié.</Empty>
              : upcoming.map((m) => <MeetingRow key={m.id} m={m} onEdit={() => setEditing(m)} highlighted />)}
          </SubSection>
          {past.length > 0 && (
            <SubSection title="Passées" count={past.length}>
              {past.map((m) => <MeetingRow key={m.id} m={m} onEdit={() => setEditing(m)} />)}
            </SubSection>
          )}
        </>
      )}

      <MeetingModal
        open={!!editing}
        meeting={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </Section>
  );
}

function SubSection({ title, count, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{
        fontFamily: "'Inter',sans-serif", fontSize: 11,
        color: 'rgba(180,170,200,0.6)',
        letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700,
        marginBottom: 10,
      }}>
        {title} <span style={{ color: 'rgba(180,170,200,0.35)', marginLeft: 6 }}>{count}</span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function MeetingRow({ m, onEdit, highlighted }) {
  const d = new Date(m.startsAt * 1000);
  const day = d.toLocaleDateString('fr-FR', { day: '2-digit' });
  const month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      onClick={onEdit}
      style={{
        ...card,
        display: 'flex', alignItems: 'stretch', gap: 14,
        borderColor: highlighted ? `rgba(${ACC_RGB},0.3)` : 'rgba(80,50,130,0.24)',
        opacity: highlighted ? 1 : 0.78,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 60, flexShrink: 0, textAlign: 'center',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: '1px solid rgba(60,40,100,0.18)',
        paddingRight: 14,
      }}>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: highlighted ? '#c9a8e8' : '#ede8f8', lineHeight: 1,
        }}>{day}</div>
        <div style={{
          fontFamily: 'monospace', fontSize: 10,
          color: 'rgba(180,170,200,0.55)', textTransform: 'uppercase',
          letterSpacing: '1px', marginTop: 2,
        }}>{month}</div>
        <div style={{ ...muted, fontSize: 10.5, marginTop: 4 }}>{time}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 600,
          color: '#ede8f8', marginBottom: 4,
        }}>{m.title}</div>
        <div style={{ ...muted, fontSize: 11 }}>
          {formatDate(m.startsAt)}
          {m.endsAt && ` → ${formatDate(m.endsAt)}`}
          {m.createdByName && ` · créée par ${m.createdByName}`}
          {(m.documents?.length || 0) > 0 && ` · 📎 ${m.documents.length}`}
        </div>
        {m.description && (
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12.5,
            color: 'rgba(200,192,216,0.8)', marginTop: 6, whiteSpace: 'pre-wrap',
          }}>{m.description}</p>
        )}
        {(m.documents?.length || 0) > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <AttachmentList documents={m.documents} />
          </div>
        )}
      </div>
    </div>
  );
}

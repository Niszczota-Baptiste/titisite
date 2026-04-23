import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Field, Input, Modal, Section, Textarea,
  Empty, card, formatDate, muted, toLocalDatetimeInput,
} from './shared';

export function MeetingsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setItems(await api.get('/meetings')); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette réunion ?')) return;
    try { await api.del(`/meetings/${id}`); await load(); }
    catch (e) { setErr(e.message); }
  };

  const now = Math.floor(Date.now() / 1000);
  const { upcoming, past } = useMemo(() => {
    const up = items.filter((m) => m.startsAt >= now).sort((a, b) => a.startsAt - b.startsAt);
    const pa = items.filter((m) => m.startsAt < now).sort((a, b) => b.startsAt - a.startsAt);
    return { upcoming: up, past: pa };
  }, [items, now]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (m) => { setEditing(m); setModalOpen(true); };

  return (
    <Section
      title="Réunions"
      actions={<Button onClick={openNew}>+ Nouvelle réunion</Button>}
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
              : upcoming.map((m) => <MeetingRow key={m.id} m={m} onEdit={() => openEdit(m)} onDelete={() => remove(m.id)} highlighted />)}
          </SubSection>
          {past.length > 0 && (
            <SubSection title="Passées" count={past.length}>
              {past.map((m) => <MeetingRow key={m.id} m={m} onEdit={() => openEdit(m)} onDelete={() => remove(m.id)} />)}
            </SubSection>
          )}
        </>
      )}

      <MeetingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        meeting={editing}
        onSaved={() => { setModalOpen(false); load(); }}
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

function MeetingRow({ m, onEdit, onDelete, highlighted }) {
  const d = new Date(m.startsAt * 1000);
  const day = d.toLocaleDateString('fr-FR', { day: '2-digit' });
  const month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      ...card,
      display: 'flex', alignItems: 'stretch', gap: 14,
      borderColor: highlighted ? `rgba(${ACC_RGB},0.3)` : 'rgba(80,50,130,0.24)',
      opacity: highlighted ? 1 : 0.75,
    }}>
      <div style={{
        width: 60, flexShrink: 0, textAlign: 'center',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: '1px solid rgba(60,40,100,0.18)',
        paddingRight: 14,
      }}>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: highlighted ? ACC : '#ede8f8', lineHeight: 1,
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
        </div>
        {m.description && (
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12.5,
            color: 'rgba(200,192,216,0.8)', marginTop: 6, whiteSpace: 'pre-wrap',
          }}>{m.description}</p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>
        <Button variant="ghost" onClick={onEdit}>Éditer</Button>
        <Button variant="danger" onClick={onDelete}>Suppr.</Button>
      </div>
    </div>
  );
}

function MeetingModal({ open, onClose, meeting, onSaved }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!meeting;

  useEffect(() => {
    if (!open) return;
    if (meeting) {
      setTitle(meeting.title || '');
      setStartsAt(toLocalDatetimeInput(meeting.startsAt));
      setEndsAt(toLocalDatetimeInput(meeting.endsAt));
      setDescription(meeting.description || '');
    } else {
      setTitle(''); setStartsAt(''); setEndsAt(''); setDescription('');
    }
    setErr(null);
  }, [open, meeting]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) { setErr('Titre et date requis'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = { title, description, startsAt, endsAt: endsAt || null };
      if (isEdit) await api.put(`/meetings/${meeting.id}`, payload);
      else await api.post('/meetings', payload);
      onSaved();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier la réunion' : 'Nouvelle réunion'}>
      <form onSubmit={submit}>
        <ErrorBanner error={err} onDismiss={() => setErr(null)} />
        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Début">
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </Field>
          <Field label="Fin (optionnelle)">
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Description / ordre du jour">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
        </div>
      </form>
    </Modal>
  );
}

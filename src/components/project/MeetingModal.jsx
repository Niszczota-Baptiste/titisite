import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AttachmentsEditor } from './Attachments';
import {
  Button, ErrorBanner, Field, Input, Modal, Textarea,
  toLocalDatetimeInput,
} from './shared';

export function MeetingModal({ open, meeting, onClose, onSaved, defaultStart }) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [documentIds, setDocumentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!(meeting && meeting.id);

  useEffect(() => {
    if (!open) return;
    if (meeting && meeting.id) {
      setTitle(meeting.title || '');
      setStartsAt(toLocalDatetimeInput(meeting.startsAt));
      setEndsAt(toLocalDatetimeInput(meeting.endsAt));
      setDescription(meeting.description || '');
      setDocumentIds((meeting.documents || []).map((d) => d.id));
    } else {
      setTitle('');
      setStartsAt(defaultStart || '');
      setEndsAt('');
      setDescription('');
      setDocumentIds([]);
    }
    setErr(null);
  }, [open, meeting, defaultStart]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) { setErr('Titre et date requis'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = { title, description, startsAt, endsAt: endsAt || null, documentIds };
      if (isEdit) await api.put(`/meetings/${meeting.id}`, payload);
      else await api.post('/meetings', payload);
      onSaved?.();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!isEdit) return;
    if (!window.confirm('Supprimer cette réunion ?')) return;
    try {
      await api.del(`/meetings/${meeting.id}`);
      onSaved?.();
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier la réunion' : 'Nouvelle réunion'} width={680}>
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
        <Field label="Fichiers liés">
          <AttachmentsEditor value={documentIds} onChange={setDocumentIds} />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <div>
            {isEdit && (
              <Button type="button" variant="danger" onClick={remove} disabled={saving}>
                Supprimer
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

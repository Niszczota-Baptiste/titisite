import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { AttachmentsEditor } from './Attachments';
import {
  Button, ErrorBanner, Field, Input, Modal, Textarea,
  toLocalDatetimeInput,
} from './shared';

export function MeetingModal({ open, meeting, workspaceSlug, onClose, onSaved, defaultStart }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [documentIds, setDocumentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!(meeting && meeting.id);
  const ws = workspaceSlug ? api.ws(workspaceSlug) : null;

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
    if (!ws) { setErr('Projet introuvable'); return; }
    if (!title.trim() || !startsAt) { setErr('Titre et date requis'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = { title, description, startsAt, endsAt: endsAt || null, documentIds };
      if (isEdit) await ws.meetings.update(meeting.id, payload);
      else await ws.meetings.create(payload);
      toast.success(isEdit ? 'Réunion mise à jour' : 'Réunion créée');
      onSaved?.();
    } catch (ex) {
      setErr(ex.message);
      toast.error(`Échec : ${ex.message}`);
    }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!isEdit || !ws) return;
    const ok = await confirm({
      title: 'Supprimer cette réunion',
      message: 'La réunion et ses pièces jointes seront supprimées définitivement.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await ws.meetings.remove(meeting.id);
      toast.success('Réunion supprimée');
      onSaved?.();
    } catch (ex) {
      setErr(ex.message);
      toast.error(`Échec : ${ex.message}`);
    }
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
          <AttachmentsEditor
            value={documentIds}
            onChange={setDocumentIds}
            workspaceSlug={workspaceSlug}
          />
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

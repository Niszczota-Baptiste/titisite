import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AttachmentsEditor } from './Attachments';
import { Comments } from './Comments';
import {
  Button, ErrorBanner, Field, Input, Modal, Textarea,
  relativeDate, toLocalDatetimeInput,
} from './shared';
import { TagsInput } from './TagsInput';

const STATUSES   = [['backlog', 'Backlog'], ['todo', 'À faire'], ['doing', 'En cours'], ['done', 'Terminé']];
const PRIORITIES = [['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute']];

export function FeatureModal({ open, feature, users = [], workspaceSlug, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('backlog');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState([]);
  const [documentIds, setDocumentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!(feature && feature.id);
  const ws = workspaceSlug ? api.ws(workspaceSlug) : null;

  useEffect(() => {
    if (!open) return;
    if (feature && feature.id) {
      setTitle(feature.title || '');
      setDescription(feature.description || '');
      setStatus(feature.status || 'backlog');
      setPriority(feature.priority || 'medium');
      setAssigneeId(feature.assigneeId ? String(feature.assigneeId) : '');
      setDueDate(feature.dueDate ? toLocalDatetimeInput(feature.dueDate) : '');
      setTags(feature.tags || []);
      setDocumentIds((feature.documents || []).map((d) => d.id));
    } else {
      setTitle(''); setDescription('');
      setStatus(feature?.status || 'backlog');
      setPriority('medium'); setAssigneeId('');
      setDueDate(feature?.dueDate ? toLocalDatetimeInput(feature.dueDate) : '');
      setTags([]); setDocumentIds([]);
    }
    setErr(null);
  }, [open, feature]);

  const submit = async (e) => {
    e.preventDefault();
    if (!ws) { setErr('Projet introuvable'); return; }
    if (!title.trim()) { setErr('Titre requis'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = {
        title, description, status, priority,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        dueDate: dueDate || null,
        tags,
        documentIds,
      };
      if (isEdit) await ws.features.update(feature.id, payload);
      else await ws.features.create(payload);
      onSaved?.();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!isEdit || !ws) return;
    if (!window.confirm('Supprimer cette carte ?')) return;
    try { await ws.features.remove(feature.id); onSaved?.(); }
    catch (ex) { setErr(ex.message); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? (feature.title || 'Carte') : 'Nouvelle carte'}
      width={760}
    >
      <form onSubmit={submit}>
        <ErrorBanner error={err} onDismiss={() => setErr(null)} />

        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="Statut">
            <Select value={status} onChange={setStatus} options={STATUSES} />
          </Field>
          <Field label="Priorité">
            <Select value={priority} onChange={setPriority} options={PRIORITIES} />
          </Field>
          <Field label="Assigné">
            <Select
              value={assigneeId}
              onChange={setAssigneeId}
              options={[['', '— non assigné —'], ...users.map((u) => [String(u.id), u.name || u.email])]}
            />
          </Field>
        </div>

        <Field label="Échéance (optionnelle)">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            {dueDate && (
              <Button type="button" variant="ghost" onClick={() => setDueDate('')}>
                Retirer
              </Button>
            )}
          </div>
        </Field>

        <Field label="Tags">
          <TagsInput value={tags} onChange={setTags} />
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

      {isEdit && (
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(60,40,100,0.18)' }}>
          <div style={{
            fontSize: 11, color: 'rgba(180,170,200,0.55)',
            letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10,
            fontFamily: "'Inter',sans-serif",
          }}>
            Commentaires · créée {relativeDate(feature.createdAt)}
            {feature.createdByName && ` par ${feature.createdByName}`}
          </div>
          <Comments targetType="feature" targetId={feature.id} />
        </div>
      )}
    </Modal>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', background: 'rgba(14,8,32,0.72)',
        border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
        padding: '10px 12px', color: '#ede8f8',
        fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
      }}
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

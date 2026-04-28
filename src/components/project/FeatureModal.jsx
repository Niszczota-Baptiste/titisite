import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
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
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('backlog');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState([]);
  const [documentIds, setDocumentIds] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [newSub, setNewSub] = useState('');
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
      setSubtasks(feature.subtasks || []);
      setDocumentIds((feature.documents || []).map((d) => d.id));
    } else {
      setTitle(''); setDescription('');
      setStatus(feature?.status || 'backlog');
      setPriority('medium'); setAssigneeId('');
      setDueDate(feature?.dueDate ? toLocalDatetimeInput(feature.dueDate) : '');
      setTags([]); setSubtasks([]); setDocumentIds([]);
    }
    setNewSub('');
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
        subtasks,
        documentIds,
      };
      if (isEdit) await ws.features.update(feature.id, payload);
      else await ws.features.create(payload);
      toast.success(isEdit ? 'Carte mise à jour' : 'Carte créée');
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
      title: `Supprimer « ${feature.title || 'cette carte'} »`,
      message: 'La carte, ses sous-tâches et ses commentaires seront supprimés définitivement.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await ws.features.remove(feature.id);
      toast.success('Carte supprimée');
      onSaved?.();
    } catch (ex) {
      setErr(ex.message);
      toast.error(`Échec : ${ex.message}`);
    }
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

        <Field label={`Sous-tâches${subtasks.length ? ` — ${subtasks.filter((s) => s.done).length}/${subtasks.length}` : ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: subtasks.length ? 8 : 0 }}>
            {subtasks.map((s, i) => (
              <label key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 11px',
                background: 'rgba(14,9,28,0.5)',
                border: '1px solid rgba(60,40,100,0.2)',
                borderRadius: 8,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={!!s.done}
                  onChange={() => setSubtasks((prev) => prev.map((t, j) => j === i ? { ...t, done: !t.done } : t))}
                  style={{
                    width: 16, height: 16, flexShrink: 0,
                    accentColor: '#9ad4ae', cursor: 'pointer', margin: 0,
                  }}
                />
                <span style={{
                  flex: 1, fontSize: 13, color: s.done ? '#6a6080' : '#c8c0d8',
                  textDecoration: s.done ? 'line-through' : 'none',
                }}>{s.d}</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setSubtasks((prev) => prev.filter((_, j) => j !== i)); }}
                  aria-label={`Supprimer la sous-tâche : ${s.d}`}
                  style={{ background: 'none', border: 'none', color: '#4a3860', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}
                >×</button>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = newSub.trim();
                  if (v) { setSubtasks((prev) => [...prev, { d: v, done: false }]); setNewSub(''); }
                }
              }}
              placeholder="Ajouter une sous-tâche…"
              style={{
                flex: 1, background: 'rgba(14,8,32,0.72)',
                border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
                padding: '8px 12px', color: '#ede8f8', fontSize: 13, outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => {
                const v = newSub.trim();
                if (v) { setSubtasks((prev) => [...prev, { d: v, done: false }]); setNewSub(''); }
              }}
              style={{
                background: 'rgba(80,50,130,0.2)', border: '1px solid rgba(120,80,200,0.3)',
                color: '#c9a8e8', borderRadius: 8, padding: '8px 14px', fontSize: 16, cursor: 'pointer',
              }}
            >+</button>
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
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

      {isEdit && (
        <div style={{
          marginTop: 28, paddingTop: 18,
          borderTop: '1px dashed rgba(255,138,155,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{
            fontSize: 12, color: 'rgba(255,138,155,0.7)',
            fontFamily: "'Inter',sans-serif", lineHeight: 1.5,
          }}>
            <strong style={{ display: 'block', fontSize: 11, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 2 }}>
              Zone dangereuse
            </strong>
            La suppression est définitive. Une confirmation sera demandée.
          </div>
          <Button type="button" variant="danger" onClick={remove} disabled={saving}>
            Supprimer la carte
          </Button>
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

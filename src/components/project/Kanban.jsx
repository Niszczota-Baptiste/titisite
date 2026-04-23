import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Field, Input, Modal, Section, Textarea,
  Empty, card, formatDate, muted, relativeDate,
} from './shared';
import { Comments } from './Comments';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo',    label: 'À faire' },
  { key: 'doing',   label: 'En cours' },
  { key: 'done',    label: 'Terminé' },
];

const PRIORITY_COLORS = {
  low:    { hex: '#9ad4ae', rgb: '154,212,174' },
  medium: { hex: ACC,       rgb: ACC_RGB },
  high:   { hex: '#ff8a9b', rgb: '255,138,155' },
};

export function KanbanTab() {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // feature or 'new'
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const [f, u] = await Promise.all([api.get('/features'), api.get('/users')]);
      setItems(f);
      setUsers(u);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const move = async (feature, newStatus) => {
    try {
      await api.put(`/features/${feature.id}`, { status: newStatus });
      await load();
    } catch (e) { setErr(e.message); }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette carte ?')) return;
    try { await api.del(`/features/${id}`); await load(); }
    catch (e) { setErr(e.message); }
  };

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.key] = items.filter((i) => i.status === c.key);
    return acc;
  }, {});

  return (
    <Section
      title="Kanban"
      actions={<Button onClick={() => setEditing('new')}>+ Nouvelle carte</Button>}
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14,
          minHeight: 400,
        }}>
          {COLUMNS.map((col) => (
            <div key={col.key} style={{
              background: 'rgba(4,3,14,0.35)',
              borderRadius: 12, padding: 12,
              border: '1px solid rgba(60,40,100,0.16)',
              display: 'flex', flexDirection: 'column', gap: 10,
              minWidth: 0,
            }}>
              <header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 4px',
              }}>
                <span style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 11,
                  color: 'rgba(200,192,216,0.75)',
                  letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700,
                }}>
                  {col.label}
                </span>
                <span style={{ ...muted, fontSize: 11, fontFamily: 'monospace' }}>
                  {grouped[col.key].length}
                </span>
              </header>

              {grouped[col.key].length === 0 ? (
                <div style={{ ...muted, fontSize: 11, textAlign: 'center', padding: '12px 4px' }}>
                  —
                </div>
              ) : (
                grouped[col.key].map((f) => (
                  <KanbanCard
                    key={f.id}
                    feature={f}
                    onOpen={() => setEditing(f)}
                    onMove={(to) => move(f, to)}
                    onDelete={() => remove(f.id)}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <FeatureModal
        open={!!editing}
        feature={editing === 'new' ? null : editing}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </Section>
  );
}

function KanbanCard({ feature, onOpen, onMove, onDelete }) {
  const pr = PRIORITY_COLORS[feature.priority] || PRIORITY_COLORS.medium;
  const idx = COLUMNS.findIndex((c) => c.key === feature.status);
  const prevCol = COLUMNS[idx - 1];
  const nextCol = COLUMNS[idx + 1];

  return (
    <article style={{
      ...card, padding: 12, cursor: 'pointer', position: 'relative',
      borderLeft: `3px solid ${pr.hex}`,
    }} onClick={onOpen}>
      <h4 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600,
        color: '#ede8f8', marginBottom: 6, letterSpacing: '-0.2px',
      }}>
        {feature.title}
      </h4>
      {feature.description && (
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: 'rgba(200,192,216,0.7)', lineHeight: 1.5,
          marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {feature.description}
        </p>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        ...muted, fontSize: 10.5,
      }}>
        <span style={{
          padding: '1px 6px', borderRadius: 3,
          background: `rgba(${pr.rgb},0.14)`, color: pr.hex, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>{feature.priority}</span>
        {feature.assigneeName && (
          <span style={{ color: 'rgba(200,192,216,0.7)' }}>@{feature.assigneeName}</span>
        )}
        {feature.commentsCount > 0 && <span>💬 {feature.commentsCount}</span>}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', gap: 4, marginTop: 10, paddingTop: 8,
          borderTop: '1px dashed rgba(60,40,100,0.2)',
        }}
      >
        {prevCol && (
          <button
            onClick={() => onMove(prevCol.key)}
            style={moveBtnStyle}
            title={`→ ${prevCol.label}`}
          >← {prevCol.label}</button>
        )}
        {nextCol && (
          <button
            onClick={() => onMove(nextCol.key)}
            style={{ ...moveBtnStyle, marginLeft: 'auto' }}
            title={`→ ${nextCol.label}`}
          >{nextCol.label} →</button>
        )}
        <button
          onClick={onDelete}
          style={{
            ...moveBtnStyle, color: 'rgba(255,138,155,0.7)',
            borderColor: 'rgba(255,138,155,0.25)',
          }}
          title="Supprimer"
        >×</button>
      </div>
    </article>
  );
}

const moveBtnStyle = {
  background: 'none', border: '1px solid rgba(80,50,130,0.28)',
  borderRadius: 6, padding: '3px 8px',
  color: 'rgba(180,170,200,0.7)', cursor: 'pointer',
  fontFamily: "'Inter',sans-serif", fontSize: 10.5,
  transition: 'all 0.15s',
};

function FeatureModal({ open, feature, users, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('backlog');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const isEdit = !!feature;

  useEffect(() => {
    if (!open) return;
    if (feature) {
      setTitle(feature.title || '');
      setDescription(feature.description || '');
      setStatus(feature.status || 'backlog');
      setPriority(feature.priority || 'medium');
      setAssigneeId(feature.assigneeId ? String(feature.assigneeId) : '');
    } else {
      setTitle(''); setDescription(''); setStatus('backlog');
      setPriority('medium'); setAssigneeId('');
    }
    setErr(null);
  }, [open, feature]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Titre requis'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = {
        title, description, status, priority,
        assigneeId: assigneeId ? Number(assigneeId) : null,
      };
      if (isEdit) await api.put(`/features/${feature.id}`, payload);
      else await api.post('/features', payload);
      onSaved();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? feature?.title || 'Carte' : 'Nouvelle carte'}
      width={720}
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
            <Select value={status} onChange={setStatus} options={COLUMNS.map((c) => [c.key, c.label])} />
          </Field>
          <Field label="Priorité">
            <Select value={priority} onChange={setPriority} options={[['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute']]} />
          </Field>
          <Field label="Assigné">
            <Select
              value={assigneeId}
              onChange={setAssigneeId}
              options={[['', '— non assigné —'], ...users.map((u) => [String(u.id), u.name || u.email])]}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
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

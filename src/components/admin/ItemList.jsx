import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ACC, ACC_RGB, Button, box } from './ui';

export function ItemList({
  collection,
  renderPreview,
  renderForm,
  emptyDraft,
  title,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.list(collection);
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [collection]);

  const startCreate = () => {
    setEditing('new');
    setDraft(typeof emptyDraft === 'function' ? emptyDraft() : { ...emptyDraft });
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setDraft({ ...item });
  };

  const cancel = () => {
    setEditing(null);
    setDraft(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') {
        await api.create(collection, draft);
      } else {
        await api.update(collection, editing, draft);
      }
      await load();
      cancel();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer définitivement ?')) return;
    try {
      await api.remove(collection, id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const move = async (id, dir) => {
    const idx = items.findIndex((i) => i.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= items.length) return;
    const order = items.map((i) => i.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    try {
      await api.reorder(collection, order);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>
          {title}
        </h2>
        <Button onClick={startCreate} disabled={editing !== null}>+ Ajouter</Button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
          fontFamily: "'Inter',sans-serif", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editing === 'new' && (
            <div style={{ ...box, borderColor: `rgba(${ACC_RGB},0.4)` }}>
              {renderForm(draft, setDraft)}
              <FormActions onSave={save} onCancel={cancel} saving={saving} />
            </div>
          )}

          {items.map((item) => (
            <div key={item.id}>
              {editing === item.id ? (
                <div style={{ ...box, borderColor: `rgba(${ACC_RGB},0.4)` }}>
                  {renderForm(draft, setDraft)}
                  <FormActions onSave={save} onCancel={cancel} saving={saving} />
                </div>
              ) : (
                <div style={{
                  ...box,
                  display: 'flex', gap: 12, alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>{renderPreview(item)}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <IconBtn onClick={() => move(item.id, -1)} title="Monter">↑</IconBtn>
                    <IconBtn onClick={() => move(item.id, +1)} title="Descendre">↓</IconBtn>
                    <Button variant="ghost" onClick={() => startEdit(item)}>Éditer</Button>
                    <Button variant="danger" onClick={() => remove(item.id)}>Supprimer</Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {items.length === 0 && editing === null && (
            <p style={{
              color: 'rgba(180,170,200,0.5)',
              fontFamily: "'Inter',sans-serif", fontSize: 13,
              padding: '20px 0', textAlign: 'center',
            }}>
              Aucun élément. Cliquez sur « Ajouter » pour en créer un.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'transparent',
        border: '1px solid rgba(80,50,130,0.28)',
        color: 'rgba(232,228,248,0.75)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, transition: 'all 0.18s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACC; e.currentTarget.style.color = ACC; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(80,50,130,0.28)'; e.currentTarget.style.color = 'rgba(232,228,248,0.75)'; }}
    >
      {children}
    </button>
  );
}

function FormActions({ onSave, onCancel, saving }) {
  return (
    <div style={{
      marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end',
      borderTop: '1px solid rgba(60,40,100,0.12)', paddingTop: 14,
    }}>
      <Button variant="ghost" onClick={onCancel} disabled={saving}>Annuler</Button>
      <Button onClick={onSave} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
    </div>
  );
}

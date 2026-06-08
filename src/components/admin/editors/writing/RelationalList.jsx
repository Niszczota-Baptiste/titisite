import { useEffect, useState } from 'react';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { useToast } from '../../../../ui/ToastProvider';
import { ACC, ACC_RGB, Button, box } from '../../ui';

// CRUD scaffold for the writing relational resources (characters, glossary).
// Same UX as the public-collection ItemList, but driven by an explicit set of
// api methods instead of the generic /collection endpoints.
export function RelationalList({ title, addLabel = '+ Ajouter', api: m, emptyDraft, renderForm, renderPreview }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await m.list()); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const startCreate = () => { setEditing('new'); setDraft(typeof emptyDraft === 'function' ? emptyDraft() : { ...emptyDraft }); };
  const startEdit = (it) => { setEditing(it.id); setDraft({ ...it }); };
  const cancel = () => { setEditing(null); setDraft(null); };

  const save = async () => {
    setSaving(true);
    try {
      if (editing === 'new') await m.create(draft); else await m.update(editing, draft);
      toast.success(editing === 'new' ? 'Créé' : 'Enregistré');
      await load(); cancel();
    } catch (e) { toast.error(`Échec : ${e.message}`); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    const ok = await confirm({ title: 'Supprimer', message: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try { await m.remove(id); toast.success('Supprimé'); await load(); } catch (e) { toast.error(e.message); }
  };

  const move = async (id, dir) => {
    const idx = items.findIndex((i) => i.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= items.length) return;
    const order = items.map((i) => i.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    try { setItems(await m.reorder(order)); } catch (e) { toast.error(e.message); }
  };

  // Only build the form when a draft exists — renderForm dereferences draft
  // fields, so calling it with null (no active edit) would crash.
  const form = draft ? (
    <div style={{ ...box, borderColor: `rgba(${ACC_RGB},0.4)` }}>
      {renderForm(draft, setDraft)}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid rgba(60,40,100,0.12)', paddingTop: 14 }}>
        <Button variant="ghost" onClick={cancel} disabled={saving}>Annuler</Button>
        <Button onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#ede8f8' }}>{title}</h2>
        <Button onClick={startCreate} disabled={editing !== null}>{addLabel}</Button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editing === 'new' && form}
          {items.map((it) => (
            <div key={it.id}>
              {editing === it.id ? form : (
                <div style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>{renderPreview(it)}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <IconBtn onClick={() => move(it.id, -1)}>↑</IconBtn>
                    <IconBtn onClick={() => move(it.id, +1)}>↓</IconBtn>
                    <Button variant="ghost" onClick={() => startEdit(it)}>Éditer</Button>
                    <Button variant="danger" onClick={() => remove(it.id)}>Supprimer</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && editing === null && (
            <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Aucun élément.</p>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, ...rest }) {
  return (
    <button {...rest} style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: 'rgba(232,228,248,0.75)', cursor: 'pointer', fontSize: 14 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACC; e.currentTarget.style.color = ACC; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(80,50,130,0.28)'; e.currentTarget.style.color = 'rgba(232,228,248,0.75)'; }}
    >{children}</button>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { useToast } from '../../../../ui/ToastProvider';
import { ACC, ACC_RGB, Button, box } from '../../ui';
import { MetaFields, emptyMeta, metaOf } from './MetaFields';
import { blockLabel, blockStyle } from './widgets';

const STATUS_LABEL = { brouillon: 'Brouillon', wip: 'WIP', termine: 'Terminé' };

// Top level of the writing back-office: the list of projects (universes) and
// their metadata. "Gérer le contenu" opens a project's books/characters/lexicon.
export function ProjectsEditor({ onOpen }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // null | 'new' | id
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setProjects(await api.writing.projects.list()); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const startCreate = () => { setEditing('new'); setDraft(emptyMeta()); };
  const startEdit = (p) => { setEditing(p.id); setDraft(metaOf(p)); };
  const cancel = () => { setEditing(null); setDraft(null); };

  const save = async () => {
    if (!draft.title.trim()) { toast.error('Le titre est requis'); return; }
    setSaving(true);
    try {
      if (editing === 'new') await api.writing.projects.create(draft);
      else await api.writing.projects.update(editing, draft);
      toast.success(editing === 'new' ? 'Projet créé' : 'Modifications enregistrées');
      await load(); cancel();
    } catch (e) { toast.error(`Échec : ${e.message}`); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    const ok = await confirm({ title: 'Supprimer le projet', message: 'Tous ses livres, personnages et lexique seront supprimés. Définitif.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try { await api.writing.projects.remove(id); toast.success('Projet supprimé'); await load(); } catch (e) { toast.error(e.message); }
  };

  const move = async (id, dir) => {
    const idx = projects.findIndex((p) => p.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= projects.length) return;
    const order = projects.map((p) => p.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    try { setProjects(await api.writing.projects.reorder(order)); } catch (e) { toast.error(e.message); }
  };

  const form = (
    <div style={{ ...box, borderColor: `rgba(${ACC_RGB},0.4)` }}>
      <div style={blockStyle}>
        <span style={blockLabel}>Projet / univers</span>
        <MetaFields meta={draft} setMeta={setDraft} publishLabel="Publié (visible sur la page d’accueil)" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid rgba(60,40,100,0.12)', paddingTop: 14 }}>
        <Button variant="ghost" onClick={cancel} disabled={saving}>Annuler</Button>
        <Button onClick={save} disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#ede8f8' }}>Projets d’écriture</h2>
        <Button onClick={startCreate} disabled={editing !== null}>+ Ajouter un projet</Button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {editing === 'new' && form}
          {projects.map((p) => (
            <div key={p.id}>
              {editing === p.id ? form : (
                <div style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: p.accentColor, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                      <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: '#ede8f8' }}>{p.title || '—'}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: `rgba(${ACC_RGB},0.8)`, background: `rgba(${ACC_RGB},0.1)`, padding: '2px 6px', borderRadius: 4 }}>{STATUS_LABEL[p.status]}</span>
                      {p.isPublished
                        ? <span style={{ fontSize: 10, color: '#9ad4ae', border: '1px solid rgba(154,212,174,0.3)', padding: '2px 6px', borderRadius: 4 }}>publié</span>
                        : <span style={{ fontSize: 10, color: 'rgba(180,170,200,0.6)', border: '1px solid rgba(120,100,160,0.3)', padding: '2px 6px', borderRadius: 4 }}>masqué</span>}
                      <span style={{ fontSize: 11, color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>{p.bookCount} livre{p.bookCount > 1 ? 's' : ''}</span>
                    </div>
                    {p.subtitle && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>{p.subtitle}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <IconBtn onClick={() => move(p.id, -1)}>↑</IconBtn>
                    <IconBtn onClick={() => move(p.id, +1)}>↓</IconBtn>
                    <Button onClick={() => onOpen(p.id, p.title)}>Gérer le contenu →</Button>
                    <Button variant="ghost" onClick={() => startEdit(p)}>Éditer</Button>
                    <Button variant="danger" onClick={() => remove(p.id)}>Supprimer</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {projects.length === 0 && editing === null && (
            <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Aucun projet. Crée ton premier univers.</p>
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

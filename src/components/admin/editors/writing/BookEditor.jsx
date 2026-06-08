import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../../api/client';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { useToast } from '../../../../ui/ToastProvider';
import { renderMarkdown } from '../../../writing/markdown';
import { ACC, Button, Field, Input } from '../../ui';
import { MetaFields, emptyMeta, metaOf } from './MetaFields';
import { MediaManager } from './MediaManager';
import { DirtyBadge, MarkdownField, SelectField, addBtn, blockLabel, blockStyle, removeBtn } from './widgets';

// Suggested entry types (free text — these are one-click shortcuts).
export const ENTRY_TYPES = ['Livre', 'Chapitre', 'Récit', 'Lettre', 'Lore', 'Monde', 'Région', 'Cité', 'Ville', 'Lieu', 'Carte', 'Personnage', 'Faction', 'Objet'];

const entryMeta = (w) => ({ ...metaOf(w), type: w.type || 'Livre', content: w.content || '' });
const newEntryMeta = () => ({ ...emptyMeta(), type: 'Livre', content: '' });

// Editor for one entry (a typed node of the project tree). Meta + a type + an
// optional direct lore `content` + drag-reorder chapters (token toolbar + live
// preview) + media. Characters/glossary are project-scoped and resolved by slug.
export function BookEditor({ workId, projectId, parentId = null, characters, glossary, tracks, onClose, onSaved, onOpenChild }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = workId === 'new';

  const [meta, setMeta] = useState(newEntryMeta());
  const [savedMeta, setSavedMeta] = useState(newEntryMeta());
  const [chapters, setChapters] = useState([]);
  const [children, setChildren] = useState([]);
  const [workMedia, setWorkMedia] = useState([]);
  const [id, setId] = useState(isNew ? null : workId);
  const [loading, setLoading] = useState(!isNew);
  const [savingMeta, setSavingMeta] = useState(false);

  const load = async (theId) => {
    const w = await api.writing.works.get(theId);
    const m = entryMeta(w);
    setMeta(m); setSavedMeta(m);
    setChapters(w.chapters || []);
    setChildren(w.children || []);
    setWorkMedia(w.media || []);
    setId(w.id);
  };

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    load(workId).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [workId]); // eslint-disable-line

  const metaDirty = JSON.stringify(meta) !== JSON.stringify(savedMeta);

  const saveMeta = async () => {
    if (!meta.title.trim()) { toast.error('Le titre est requis'); return; }
    setSavingMeta(true);
    try {
      if (!id) {
        const created = await api.writing.works.createIn(projectId, { ...meta, parentId });
        setSavedMeta(meta);
        await load(created.id);
        toast.success('Élément créé');
      } else {
        await api.writing.works.update(id, meta);
        setSavedMeta(meta);
        toast.success('Modifications enregistrées');
      }
      onSaved?.();
    } catch (e) {
      toast.error(`Échec : ${e.message}`);
    } finally {
      setSavingMeta(false);
    }
  };

  const addChapter = async () => {
    try {
      const ch = await api.writing.chapters.create(id, { number: `Chapitre ${chapters.length + 1}`, title: '' });
      setChapters((c) => [...c, { ...ch, media: [] }]);
    } catch (e) { toast.error(e.message); }
  };
  const reloadWork = () => load(id);

  if (loading) return <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(80,50,130,0.32)', color: 'rgba(232,228,248,0.75)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>← Retour</button>
        <DirtyBadge dirty={metaDirty} />
      </div>

      <div style={blockStyle}>
        <span style={blockLabel}>Élément {parentId && !id ? '(sous-élément)' : ''}</span>
        <TypeField value={meta.type} onChange={(v) => setMeta({ ...meta, type: v })} />
        <MetaFields meta={meta} setMeta={setMeta} publishLabel="Publié (visible dans le projet)" />
        <Field label="Lore / texte direct (Markdown) — affiché en haut de la page de lecture">
          <MarkdownField value={meta.content} onChange={(v) => setMeta({ ...meta, content: v })} characters={characters} glossary={glossary} rows={6} placeholder="Description, lore… (laisse vide si l'élément ne contient que des chapitres ou des sous-éléments)" />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={saveMeta} disabled={savingMeta || !metaDirty}>{savingMeta ? '…' : (id ? 'Enregistrer l\'élément' : 'Créer l\'élément')}</Button>
        </div>
      </div>

      {!id && (
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.55)', fontStyle: 'italic', padding: '8px 0' }}>
          Crée l'élément pour pouvoir ajouter des chapitres, des sous-éléments et des médias.
        </p>
      )}

      {id && (
        <>
          {/* Sub-elements (tree children) */}
          <div style={{ ...blockStyle, paddingBottom: 12 }}>
            <span style={blockLabel}>Sous-éléments (ville, lettre, lore…)</span>
            {children.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {children.map((c) => (
                  <button key={c.id} onClick={() => onOpenChild?.(c.id)} style={childRow}>
                    <span style={typeChip}>{c.type}</span>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: '#ede8f8' }}>{c.title || '—'}</span>
                    {!c.isPublished && <span style={{ fontSize: 10, color: 'rgba(180,170,200,0.6)' }}>masqué</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(180,170,200,0.5)' }}>{c.childCount ? `${c.childCount} sous-élément(s)` : ''} {c.chapterCount ? `· ${c.chapterCount} chap.` : ''}</span>
                    <span style={{ color: ACC }}>Ouvrir →</span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(180,170,200,0.5)', marginBottom: 8 }}>Aucun sous-élément.</p>
            )}
            <button style={addBtn} onClick={() => onOpenChild?.('new', id)}>+ Ajouter un sous-élément</button>
          </div>

          <div style={{ ...blockStyle, paddingBottom: 6 }}>
            <span style={blockLabel}>Chapitres (glisser pour réordonner)</span>
            <ChapterList
              chapters={chapters} setChapters={setChapters} workId={id}
              characters={characters} glossary={glossary} tracks={tracks}
              accent={meta.accentColor} onStructureChange={reloadWork}
            />
            <button style={addBtn} onClick={addChapter}>+ Ajouter un chapitre</button>
          </div>

          <div style={blockStyle}>
            <MediaManager owner={{ workId: id }} media={workMedia} onChanged={reloadWork} label="Médias de l'élément (galerie, cartes)" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="danger" onClick={async () => {
              const ok = await confirm({ title: 'Supprimer l\'élément', message: 'Ses chapitres, sous-éléments et médias seront supprimés. Définitif.', confirmLabel: 'Supprimer', danger: true });
              if (!ok) return;
              try { await api.writing.works.remove(id); toast.success('Élément supprimé'); onSaved?.(); onClose(); }
              catch (e) { toast.error(e.message); }
            }}>Supprimer l'élément</Button>
          </div>
        </>
      )}
    </div>
  );
}

const childRow = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
  background: 'rgba(8,5,18,0.5)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8,
  padding: '8px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif",
};
const typeChip = {
  fontSize: 10, color: ACC, background: 'rgba(201,168,232,0.12)', border: '1px solid rgba(201,168,232,0.3)',
  borderRadius: 4, padding: '1px 7px', letterSpacing: '0.5px', flexShrink: 0, fontFamily: "'JetBrains Mono',monospace",
};

// Free-text type with one-click suggestions (Ville, Cité, Lettre…).
function TypeField({ value, onChange }) {
  return (
    <Field label="Type (Ville, Cité, Monde, Région, Lettre, Livre, Lore…)">
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Livre" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {ENTRY_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => onChange(t)}
            style={{
              background: value === t ? 'rgba(201,168,232,0.18)' : 'transparent',
              border: `1px solid ${value === t ? ACC : 'rgba(80,50,130,0.4)'}`,
              color: value === t ? ACC : 'rgba(180,170,200,0.7)', borderRadius: 20,
              padding: '3px 10px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 11.5,
            }}>{t}</button>
        ))}
      </div>
    </Field>
  );
}

function ChapterList({ chapters, setChapters, workId, characters, glossary, tracks, accent, onStructureChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const dragFrom = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const trackOptions = useMemo(
    () => tracks.filter((t) => t.ost && t.filename).map((t) => ({ value: String(t.id), label: `${t.title}${t.genre ? ` · ${t.genre}` : ''}` })),
    [tracks],
  );

  const onDrop = async (to) => {
    const from = dragFrom.current;
    dragFrom.current = null; setDragOver(null);
    if (from == null || from === to) return;
    const next = [...chapters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setChapters(next);
    try { await api.writing.chapters.reorder(workId, next.map((c) => c.id)); }
    catch (e) { toast.error(e.message); onStructureChange(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {chapters.map((ch, i) => (
        <ChapterRow
          key={ch.id} index={i} chapter={ch} characters={characters} glossary={glossary}
          trackOptions={trackOptions} accent={accent} dragOver={dragOver === i}
          onDragStart={() => { dragFrom.current = i; }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
          onDrop={() => onDrop(i)}
          onChanged={onStructureChange}
          onLocal={(patch) => setChapters((cs) => cs.map((c) => (c.id === ch.id ? { ...c, ...patch } : c)))}
          onDelete={async () => {
            const ok = await confirm({ title: 'Supprimer le chapitre', message: 'Définitif.', confirmLabel: 'Supprimer', danger: true });
            if (!ok) return;
            try { await api.writing.chapters.remove(ch.id); setChapters((cs) => cs.filter((c) => c.id !== ch.id)); }
            catch (e) { toast.error(e.message); }
          }}
        />
      ))}
      {chapters.length === 0 && (
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(180,170,200,0.5)', padding: '4px 0' }}>Aucun chapitre.</p>
      )}
    </div>
  );
}

function ChapterRow({ index, chapter, characters, glossary, trackOptions, accent, dragOver, onDragStart, onDragOver, onDrop, onChanged, onLocal, onDelete }) {
  const toast = useToast();
  const [draft, setDraft] = useState(chapter);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  useEffect(() => { setDraft(chapter); }, [chapter.id]); // eslint-disable-line

  const dirty = ['number', 'title', 'titleKr', 'content', 'audioTrackId'].some((k) => (draft[k] ?? '') !== (chapter[k] ?? ''));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await api.writing.chapters.update(chapter.id, {
        number: draft.number, title: draft.title, titleKr: draft.titleKr,
        content: draft.content, audioTrackId: draft.audioTrackId || null,
      });
      onLocal({ number: draft.number, title: draft.title, titleKr: draft.titleKr, content: draft.content, audioTrackId: draft.audioTrackId || null });
      toast.success('Chapitre enregistré');
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const preview = useMemo(() => renderMarkdown(draft.content, { characters, glossary, accent }), [draft.content, characters, glossary, accent]);

  return (
    <div onDragOver={onDragOver} onDrop={onDrop} style={{ border: `1px solid ${dragOver ? ACC : 'rgba(80,50,130,0.28)'}`, borderRadius: 10, background: 'rgba(8,5,18,0.5)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span draggable onDragStart={onDragStart} title="Glisser" style={{ cursor: 'grab', color: 'rgba(180,170,200,0.5)', fontSize: 16, padding: '0 4px', userSelect: 'none' }}>⠿</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: ACC, width: 22, textAlign: 'right' }}>{String(index + 1).padStart(2, '0')}</span>
        <Input value={draft.number} onChange={(e) => set({ number: e.target.value })} placeholder="Chapitre I" style={{ width: 120, marginBottom: 0 }} />
        <Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Titre du chapitre" style={{ flex: 1, marginBottom: 0 }} />
        <Input value={draft.titleKr} onChange={(e) => set({ titleKr: e.target.value })} placeholder="제목" style={{ width: 100, marginBottom: 0 }} />
        <button style={removeBtn} onClick={onDelete} title="Supprimer">×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, alignItems: 'end' }}>
        <SelectField label="Piste (OST)" value={draft.audioTrackId ? String(draft.audioTrackId) : ''} onChange={(v) => set({ audioTrackId: v ? Number(v) : null })} options={trackOptions} allowEmpty="— aucune —" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(232,228,248,0.8)' }}>
          <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} style={{ accentColor: ACC }} />
          Aperçu live
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr', gap: 14 }}>
        <MarkdownField value={draft.content} onChange={(v) => set({ content: v })} characters={characters} glossary={glossary} rows={14} placeholder="Le texte du chapitre… (Markdown + tokens)" />
        {showPreview && (
          <div style={{ background: 'rgba(5,5,17,0.6)', border: '1px solid rgba(80,50,130,0.2)', borderRadius: 8, padding: '16px 18px', overflow: 'auto', maxHeight: 420 }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: 'rgba(180,170,200,0.4)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>Aperçu lecture</p>
            <div style={{ fontFamily: "'Georgia','Times New Roman',serif", fontSize: 15, color: 'rgba(216,208,232,0.92)', lineHeight: 1.8 }}>{preview}</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(60,40,100,0.18)' }}>
        <MediaManager owner={{ chapterId: chapter.id }} media={chapter.media || []} onChanged={onChanged} label="Médias du chapitre" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <DirtyBadge dirty={dirty} />
        <Button onClick={save} disabled={saving || !dirty}>{saving ? '…' : 'Enregistrer le chapitre'}</Button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../../api/client';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { useToast } from '../../../../ui/ToastProvider';
import { renderMarkdown } from '../../../writing/markdown';
import { ACC, Button, Input } from '../../ui';
import { MetaFields, emptyMeta, metaOf } from './MetaFields';
import { MediaManager } from './MediaManager';
import { DirtyBadge, MarkdownField, SelectField, addBtn, blockLabel, blockStyle, removeBtn } from './widgets';

// Editor for one book (a work within a project). Meta + drag-reorder chapters
// (token toolbar + live preview, fed by the project's characters/glossary) +
// per-book and per-chapter media. No character linking — characters belong to
// the project and are resolved by slug.
export function BookEditor({ workId, projectId, characters, glossary, tracks, onClose, onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = workId === 'new';

  const [meta, setMeta] = useState(emptyMeta());
  const [savedMeta, setSavedMeta] = useState(emptyMeta());
  const [chapters, setChapters] = useState([]);
  const [workMedia, setWorkMedia] = useState([]);
  const [id, setId] = useState(isNew ? null : workId);
  const [loading, setLoading] = useState(!isNew);
  const [savingMeta, setSavingMeta] = useState(false);

  const load = async (theId) => {
    const w = await api.writing.works.get(theId);
    const m = metaOf(w);
    setMeta(m); setSavedMeta(m);
    setChapters(w.chapters || []);
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
        const created = await api.writing.works.createIn(projectId, meta);
        setSavedMeta(meta);
        await load(created.id);
        toast.success('Livre créé');
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
        <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(80,50,130,0.32)', color: 'rgba(232,228,248,0.75)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>← Tous les livres</button>
        <DirtyBadge dirty={metaDirty} />
      </div>

      <div style={blockStyle}>
        <span style={blockLabel}>Livre</span>
        <MetaFields meta={meta} setMeta={setMeta} publishLabel="Publié (visible dans le projet)" />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={saveMeta} disabled={savingMeta || !metaDirty}>{savingMeta ? '…' : (id ? 'Enregistrer le livre' : 'Créer le livre')}</Button>
        </div>
      </div>

      {!id && (
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(180,170,200,0.55)', fontStyle: 'italic', padding: '8px 0' }}>
          Crée le livre pour pouvoir ajouter des chapitres et des médias.
        </p>
      )}

      {id && (
        <>
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
            <MediaManager owner={{ workId: id }} media={workMedia} onChanged={reloadWork} label="Médias du livre (galerie, cartes)" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="danger" onClick={async () => {
              const ok = await confirm({ title: 'Supprimer le livre', message: 'Tous ses chapitres et médias seront supprimés. Définitif.', confirmLabel: 'Supprimer', danger: true });
              if (!ok) return;
              try { await api.writing.works.remove(id); toast.success('Livre supprimé'); onSaved?.(); onClose(); }
              catch (e) { toast.error(e.message); }
            }}>Supprimer le livre</Button>
          </div>
        </>
      )}
    </div>
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

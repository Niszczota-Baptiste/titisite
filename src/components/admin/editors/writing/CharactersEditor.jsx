import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { ACC, Field, Input } from '../../ui';
import { ImageUploadField } from '../../ImageUploadField';
import { RelationalList } from './RelationalList';
import { MarkdownField, addBtn, blockLabel, blockStyle, removeBtn } from './widgets';

const EMPTY = () => ({ name: '', nameKr: '', role: '', bio: '', avatarImage: '', relations: [] });

export function CharactersEditor({ projectId }) {
  // Project glossary loaded once so the bio editor's {{kr:…}} toolbar is populated.
  const [glossary, setGlossary] = useState([]);
  useEffect(() => { api.writing.glossaryFor(projectId).list().then(setGlossary).catch(() => {}); }, [projectId]);

  return (
    <RelationalList
      title="Personnages"
      addLabel="+ Ajouter un personnage"
      api={api.writing.charactersFor(projectId)}
      emptyDraft={EMPTY}
      renderPreview={(c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {c.avatarImage
            ? <img src={c.avatarImage} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
            : <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,168,232,0.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: ACC, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{(c.name || '?').charAt(0).toUpperCase()}</span>}
          <div>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ede8f8' }}>{c.name || '—'}</span>
            {c.nameKr && <span style={{ marginLeft: 8, fontSize: 12, color: 'rgba(201,168,232,0.75)' }}>{c.nameKr}</span>}
            {c.role && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>{c.role}</p>}
          </div>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Nom"><Input value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} /></Field>
            <Field label="Nom coréen"><Input value={d.nameKr} onChange={(e) => set({ ...d, nameKr: e.target.value })} /></Field>
          </div>
          <Field label="Rôle"><Input value={d.role} onChange={(e) => set({ ...d, role: e.target.value })} placeholder="Gardien du lac" /></Field>
          <div style={{ maxWidth: 200 }}>
            <ImageUploadField label="Portrait" value={d.avatarImage} onChange={(url) => set({ ...d, avatarImage: url })} aspect="1/1" />
          </div>
          <Field label="Biographie (Markdown)">
            <MarkdownField value={d.bio} onChange={(v) => set({ ...d, bio: v })} glossary={glossary} rows={8} placeholder="Histoire, tempérament…" />
          </Field>

          <div style={blockStyle}>
            <span style={blockLabel}>Relations</span>
            {(d.relations || []).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <Input
                  value={typeof r === 'string' ? r : `${r.name || ''}`}
                  onChange={(e) => { const next = [...d.relations]; next[i] = e.target.value; set({ ...d, relations: next }); }}
                  placeholder="Frère de Nielas, ennemi juré…"
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button type="button" style={removeBtn} onClick={() => set({ ...d, relations: d.relations.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button type="button" style={addBtn} onClick={() => set({ ...d, relations: [...(d.relations || []), ''] })}>+ Ajouter une relation</button>
          </div>
        </>
      )}
    />
  );
}

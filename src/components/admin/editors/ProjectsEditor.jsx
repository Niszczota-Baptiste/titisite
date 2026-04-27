import { ACC_RGB, CheckboxField, Field, Input, LocalizedField, TagsField, Textarea } from '../ui';
import { ItemList } from '../ItemList';

const EMPTY = () => ({
  title: '',
  type: 'web',
  tags: [],
  color: '#0a0d1e',
  wip: false,
  demoUrl: '',
  codeUrl: '',
  desc: { fr: '', en: '', ko: '' },
  problem: { fr: '', en: '', ko: '' },
  solution: { fr: '', en: '', ko: '' },
  impact: { fr: '', en: '', ko: '' },
});

export function ProjectsEditor() {
  return (
    <ItemList
      title="Projets"
      collection="projects"
      emptyDraft={EMPTY}
      renderPreview={(p) => (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
              color: '#ede8f8',
            }}>{p.title || '—'}</span>
            <span style={{
              fontFamily: 'monospace', fontSize: 10,
              color: `rgba(${ACC_RGB},0.8)`, letterSpacing: '0.5px',
              background: `rgba(${ACC_RGB},0.1)`, padding: '2px 6px', borderRadius: 4,
            }}>{p.type}</span>
            {p.wip && (
              <span style={{
                fontSize: 10, color: '#e8a87c', letterSpacing: '0.5px',
                border: '1px solid rgba(232,168,124,0.3)',
                padding: '2px 6px', borderRadius: 4,
              }}>WIP</span>
            )}
          </div>
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12.5,
            color: 'rgba(180,170,200,0.7)', lineHeight: 1.5,
          }}>
            {(p.desc?.fr || '').slice(0, 140)}{(p.desc?.fr || '').length > 140 ? '…' : ''}
          </p>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 120px', gap: 10 }}>
            <Field label="Titre">
              <Input value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
            </Field>
            <Field label="Type">
              <select
                value={d.type}
                onChange={(e) => set({ ...d, type: e.target.value })}
                style={{
                  width: '100%', background: 'rgba(14,8,32,0.72)',
                  border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
                  padding: '10px 12px', color: '#ede8f8',
                  fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
                }}
              >
                <option value="web">web</option>
                <option value="mobile">mobile</option>
                <option value="experimental">experimental</option>
              </select>
            </Field>
            <Field label="Couleur">
              <Input
                type="color"
                value={d.color}
                onChange={(e) => set({ ...d, color: e.target.value })}
                style={{ padding: 4, height: 38 }}
              />
            </Field>
          </div>
          <TagsField label="Tags" value={d.tags} onChange={(v) => set({ ...d, tags: v })} />
          <CheckboxField label="Work in progress" value={d.wip} onChange={(v) => set({ ...d, wip: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="URL Démo (lien externe, laissez vide pour page interne)">
              <Input
                value={d.demoUrl || ''}
                onChange={(e) => set({ ...d, demoUrl: e.target.value })}
                placeholder="https://monprojet.com"
              />
            </Field>
            <Field label="URL Code (lien Git)">
              <Input
                value={d.codeUrl || ''}
                onChange={(e) => set({ ...d, codeUrl: e.target.value })}
                placeholder="https://github.com/…"
              />
            </Field>
          </div>
          <LocalizedField label="Description" value={d.desc} onChange={(v) => set({ ...d, desc: v })} multiline />
          <LocalizedField label="Problème" value={d.problem} onChange={(v) => set({ ...d, problem: v })} multiline />
          <LocalizedField label="Solution" value={d.solution} onChange={(v) => set({ ...d, solution: v })} multiline />
          <LocalizedField label="Impact" value={d.impact} onChange={(v) => set({ ...d, impact: v })} multiline />
        </>
      )}
    />
  );
}

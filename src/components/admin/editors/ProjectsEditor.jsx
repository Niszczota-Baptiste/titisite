import { ACC_RGB, CheckboxField, Field, Input, LocalizedField, TagsField } from '../ui';
import { ItemList } from '../ItemList';

const selectStyle = {
  width: '100%', background: 'rgba(14,8,32,0.72)',
  border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '10px 12px', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};

const EMPTY = () => ({
  title: '',
  type: 'web',
  tags: [],
  color: '#0a0d1e',
  wip: false,
  demoMode: '',
  demoUrl: '',
  pageImageUrl: '',
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
            {p.demoMode === 'internal' && (
              <span style={{
                fontSize: 10, color: '#a8d8e8', letterSpacing: '0.5px',
                border: '1px solid rgba(168,216,232,0.3)',
                padding: '2px 6px', borderRadius: 4,
              }}>page interne</span>
            )}
            {p.demoMode === 'external' && (
              <span style={{
                fontSize: 10, color: '#a8e8b8', letterSpacing: '0.5px',
                border: '1px solid rgba(168,232,184,0.3)',
                padding: '2px 6px', borderRadius: 4,
              }}>démo externe</span>
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
                style={selectStyle}
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

          {/* Demo button configuration */}
          <div style={{
            background: 'rgba(80,50,130,0.08)', border: '1px solid rgba(80,50,130,0.2)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 14,
          }}>
            <p style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
              color: 'rgba(201,168,232,0.8)', letterSpacing: '0.5px', textTransform: 'uppercase',
              marginBottom: 12,
            }}>Bouton Démo</p>

            <Field label="Destination du bouton Démo">
              <select
                value={d.demoMode || ''}
                onChange={(e) => set({ ...d, demoMode: e.target.value })}
                style={selectStyle}
              >
                <option value="">Fenêtre d'aperçu (modal)</option>
                <option value="internal">Page interne du projet</option>
                <option value="external">URL externe (site live, démo…)</option>
              </select>
            </Field>

            {d.demoMode === 'external' && (
              <Field label="URL de la démo externe">
                <Input
                  value={d.demoUrl || ''}
                  onChange={(e) => set({ ...d, demoUrl: e.target.value })}
                  placeholder="https://monprojet.com"
                />
              </Field>
            )}

            {d.demoMode === 'internal' && (
              <Field label="Image / capture d'écran du projet (URL, optionnel)">
                <Input
                  value={d.pageImageUrl || ''}
                  onChange={(e) => set({ ...d, pageImageUrl: e.target.value })}
                  placeholder="https://exemple.com/screenshot.png"
                />
              </Field>
            )}
          </div>

          <Field label="URL Code (lien Git)">
            <Input
              value={d.codeUrl || ''}
              onChange={(e) => set({ ...d, codeUrl: e.target.value })}
              placeholder="https://github.com/…"
            />
          </Field>

          <LocalizedField label="Description" value={d.desc} onChange={(v) => set({ ...d, desc: v })} multiline />
          <LocalizedField label="Problème" value={d.problem} onChange={(v) => set({ ...d, problem: v })} multiline />
          <LocalizedField label="Solution" value={d.solution} onChange={(v) => set({ ...d, solution: v })} multiline />
          <LocalizedField label="Impact" value={d.impact} onChange={(v) => set({ ...d, impact: v })} multiline />
        </>
      )}
    />
  );
}

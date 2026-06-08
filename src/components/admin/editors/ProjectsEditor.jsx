import { ACC, ACC_RGB, CheckboxField, Field, Input, LocalizedField, TagsField } from '../ui';
import { ImageUploadField } from '../ImageUploadField';
import { ItemList } from '../ItemList';

const selectStyle = {
  width: '100%', background: 'rgba(14,8,32,0.72)',
  border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '10px 12px', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};

const removeBtn = {
  background: 'none', border: '1px solid rgba(255,100,120,0.25)', borderRadius: 6,
  color: 'rgba(255,120,140,0.7)', cursor: 'pointer', padding: '0 8px',
  fontFamily: "'Inter',sans-serif", fontSize: 16, lineHeight: '36px', flexShrink: 0,
};

const addBtn = {
  background: 'rgba(80,50,130,0.12)', border: '1px dashed rgba(80,50,130,0.35)',
  borderRadius: 8, color: `rgba(${ACC_RGB},0.8)`,
  cursor: 'pointer', padding: '7px 14px', width: '100%',
  fontFamily: "'Inter',sans-serif", fontSize: 12, marginTop: 6,
};

const blockStyle = {
  background: 'rgba(80,50,130,0.07)', border: '1px solid rgba(80,50,130,0.18)',
  borderRadius: 10, padding: '14px 16px', marginBottom: 14,
};

const blockLabel = {
  fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700,
  color: `rgba(${ACC_RGB},0.75)`, letterSpacing: '1px', textTransform: 'uppercase',
  marginBottom: 12, display: 'block',
};

const EMPTY = () => ({
  title: '',
  type: 'web',
  tags: [],
  color: '#0a0d1e',
  wip: false,
  tagline: '',
  status: '',
  year: '',
  highlights: [],
  screenshots: [],
  links: [],
  metrics: [],
  tech: [],
  demoMode: '',
  demoUrl: '',
  pageImageUrl: '',
  codeUrl: '',
  desc: { fr: '', en: '', ko: '' },
  problem: { fr: '', en: '', ko: '' },
  solution: { fr: '', en: '', ko: '' },
  impact: { fr: '', en: '', ko: '' },
});

const METRIC_DEFAULT_COLORS = ['#9ad4ae', '#c9a8e8', '#7eb8f7', '#e8a87c'];
const TECH_DEFAULT_COLORS = ['#c9a8e8', '#7eb8f7', '#9ad4ae', '#e8a87c', '#ff9a70', '#61dafb'];

export function ProjectsEditor() {
  return (
    <ItemList
      title="Projets"
      collection="projects"
      emptyDraft={EMPTY}
      renderPreview={(p) => (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
              color: '#ede8f8',
            }}>{p.title || '—'}</span>
            <span style={{
              fontFamily: 'monospace', fontSize: 10,
              color: `rgba(${ACC_RGB},0.8)`, letterSpacing: '0.5px',
              background: `rgba(${ACC_RGB},0.1)`, padding: '2px 6px', borderRadius: 4,
            }}>{p.type}</span>
            {p.status && (
              <span style={{
                fontSize: 10, color: 'rgba(180,220,180,0.8)', letterSpacing: '0.5px',
                border: '1px solid rgba(180,220,180,0.25)',
                padding: '2px 6px', borderRadius: 4,
              }}>{p.status}</span>
            )}
            {p.wip && (
              <span style={{
                fontSize: 10, color: '#e8a87c',
                border: '1px solid rgba(232,168,124,0.3)',
                padding: '2px 6px', borderRadius: 4,
              }}>WIP</span>
            )}
            {p.demoMode === 'internal' && (
              <span style={{
                fontSize: 10, color: '#a8d8e8',
                border: '1px solid rgba(168,216,232,0.3)',
                padding: '2px 6px', borderRadius: 4,
              }}>page interne</span>
            )}
            {p.demoMode === 'external' && (
              <span style={{
                fontSize: 10, color: '#a8e8b8',
                border: '1px solid rgba(168,232,184,0.3)',
                padding: '2px 6px', borderRadius: 4,
              }}>démo externe</span>
            )}
          </div>
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12,
            color: 'rgba(180,170,200,0.6)', lineHeight: 1.5, marginBottom: 2,
          }}>
            {p.tagline || (p.desc?.fr || '').slice(0, 100) + ((p.desc?.fr || '').length > 100 ? '…' : '')}
          </p>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          {/* Base */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 120px', gap: 10 }}>
            <Field label="Titre">
              <Input value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
            </Field>
            <Field label="Type">
              <select value={d.type} onChange={(e) => set({ ...d, type: e.target.value })} style={selectStyle}>
                <option value="web">web</option>
                <option value="mobile">mobile</option>
                <option value="experimental">experimental</option>
              </select>
            </Field>
            <Field label="Couleur">
              <Input type="color" value={d.color} onChange={(e) => set({ ...d, color: e.target.value })} style={{ padding: 4, height: 38 }} />
            </Field>
          </div>

          <Field label="Tagline (courte phrase affichée sous le titre)">
            <Input
              value={d.tagline || ''}
              onChange={(e) => set({ ...d, tagline: e.target.value })}
              placeholder="App mobile d'apprentissage — React Native + Firebase"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Statut">
              <select value={d.status || ''} onChange={(e) => set({ ...d, status: e.target.value })} style={selectStyle}>
                <option value="">— non affiché —</option>
                <option value="En ligne">En ligne</option>
                <option value="Beta">Beta</option>
                <option value="WIP">WIP</option>
                <option value="Archivé">Archivé</option>
              </select>
            </Field>
            <Field label="Année">
              <Input
                value={d.year || ''}
                onChange={(e) => set({ ...d, year: e.target.value })}
                placeholder="2025"
              />
            </Field>
          </div>

          <TagsField label="Tags (stack technique)" value={d.tags} onChange={(v) => set({ ...d, tags: v })} />
          <CheckboxField label="Work in progress" value={d.wip} onChange={(v) => set({ ...d, wip: v })} />

          {/* Highlights */}
          <div style={blockStyle}>
            <span style={blockLabel}>Points forts</span>
            {(d.highlights || []).map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 11, color: ACC,
                  width: 24, textAlign: 'right', flexShrink: 0,
                }}>{String(i + 1).padStart(2, '0')}</span>
                <Input
                  value={h}
                  onChange={(e) => {
                    const next = [...(d.highlights || [])];
                    next[i] = e.target.value;
                    set({ ...d, highlights: next });
                  }}
                  placeholder="Dictionnaire offline 10k entrées"
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  style={removeBtn}
                  onClick={() => set({ ...d, highlights: (d.highlights || []).filter((_, j) => j !== i) })}
                >×</button>
              </div>
            ))}
            <button
              style={addBtn}
              onClick={() => set({ ...d, highlights: [...(d.highlights || []), ''] })}
            >+ Ajouter un point fort</button>
          </div>

          {/* Screenshots */}
          <div style={blockStyle}>
            <span style={blockLabel}>Screenshots (max 3)</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <ImageUploadField
                  key={i}
                  label={`Écran ${String(i + 1).padStart(2, '0')}`}
                  value={(d.screenshots || [])[i] || ''}
                  aspect="9/16"
                  onChange={(url) => {
                    const next = [...(d.screenshots || []), '', '', ''].slice(0, 3);
                    next[i] = url;
                    set({ ...d, screenshots: next.filter((_, j) => j <= Math.max(i, next.findLastIndex(Boolean))) });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Links (stores, download, etc.) */}
          <div style={blockStyle}>
            <span style={blockLabel}>Liens (stores, téléchargements…)</span>
            {(d.links || []).map((lk, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <Input
                  value={lk.label || ''}
                  onChange={(e) => {
                    const next = [...(d.links || [])];
                    next[i] = { ...next[i], label: e.target.value };
                    set({ ...d, links: next });
                  }}
                  placeholder="iOS"
                  style={{ width: 90, flexShrink: 0, marginBottom: 0 }}
                />
                <Input
                  value={lk.url || ''}
                  onChange={(e) => {
                    const next = [...(d.links || [])];
                    next[i] = { ...next[i], url: e.target.value };
                    set({ ...d, links: next });
                  }}
                  placeholder="https://apps.apple.com/…"
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  style={removeBtn}
                  onClick={() => set({ ...d, links: (d.links || []).filter((_, j) => j !== i) })}
                >×</button>
              </div>
            ))}
            <button
              style={addBtn}
              onClick={() => set({ ...d, links: [...(d.links || []), { label: '', url: '' }] })}
            >+ Ajouter un lien</button>
          </div>

          {/* Demo button config */}
          <div style={blockStyle}>
            <span style={blockLabel}>Bouton Démo</span>
            <Field label="Destination">
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
            {(d.demoMode === 'internal' || d.demoMode === '') && (
              <ImageUploadField
                label="Image hero / aperçu (optionnel)"
                value={d.pageImageUrl || ''}
                aspect="16/9"
                onChange={(url) => set({ ...d, pageImageUrl: url })}
              />
            )}
          </div>

          <Field label="URL Code (lien Git)">
            <Input
              value={d.codeUrl || ''}
              onChange={(e) => set({ ...d, codeUrl: e.target.value })}
              placeholder="https://github.com/…"
            />
          </Field>

          {/* Métriques (cartes chiffres clés sur la page projet) */}
          <div style={blockStyle}>
            <span style={blockLabel}>Métriques (cartes chiffres clés)</span>
            {(d.metrics || []).map((m, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr 1fr 56px 32px',
                gap: 8, marginBottom: 8, alignItems: 'center',
              }}>
                <Input
                  value={m.value || ''}
                  onChange={(e) => {
                    const next = [...(d.metrics || [])];
                    next[i] = { ...next[i], value: e.target.value };
                    set({ ...d, metrics: next });
                  }}
                  placeholder="40%"
                  style={{ marginBottom: 0 }}
                />
                <Input
                  value={m.label || ''}
                  onChange={(e) => {
                    const next = [...(d.metrics || [])];
                    next[i] = { ...next[i], label: e.target.value };
                    set({ ...d, metrics: next });
                  }}
                  placeholder="Temps opérationnel"
                  style={{ marginBottom: 0 }}
                />
                <Input
                  value={m.sub || ''}
                  onChange={(e) => {
                    const next = [...(d.metrics || [])];
                    next[i] = { ...next[i], sub: e.target.value };
                    set({ ...d, metrics: next });
                  }}
                  placeholder="réduit"
                  style={{ marginBottom: 0 }}
                />
                <Input
                  type="color"
                  value={m.color || METRIC_DEFAULT_COLORS[i % METRIC_DEFAULT_COLORS.length]}
                  onChange={(e) => {
                    const next = [...(d.metrics || [])];
                    next[i] = { ...next[i], color: e.target.value };
                    set({ ...d, metrics: next });
                  }}
                  style={{ marginBottom: 0, padding: 4, height: 36 }}
                />
                <button
                  type="button"
                  style={removeBtn}
                  onClick={() => set({ ...d, metrics: (d.metrics || []).filter((_, j) => j !== i) })}
                >×</button>
              </div>
            ))}
            <button
              type="button"
              style={addBtn}
              onClick={() => {
                const next = [...(d.metrics || [])];
                next.push({
                  value: '', label: '', sub: '',
                  color: METRIC_DEFAULT_COLORS[next.length % METRIC_DEFAULT_COLORS.length],
                });
                set({ ...d, metrics: next });
              }}
            >+ Ajouter une métrique</button>
          </div>

          {/* Stack technique colorée (badges sur la page projet) */}
          <div style={blockStyle}>
            <span style={blockLabel}>Stack technique (badges colorés)</span>
            {(d.tech || []).map((t, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 56px 32px',
                gap: 8, marginBottom: 8, alignItems: 'center',
              }}>
                <Input
                  value={t.name || ''}
                  onChange={(e) => {
                    const next = [...(d.tech || [])];
                    next[i] = { ...next[i], name: e.target.value };
                    set({ ...d, tech: next });
                  }}
                  placeholder="React"
                  style={{ marginBottom: 0 }}
                />
                <Input
                  type="color"
                  value={t.color || TECH_DEFAULT_COLORS[i % TECH_DEFAULT_COLORS.length]}
                  onChange={(e) => {
                    const next = [...(d.tech || [])];
                    next[i] = { ...next[i], color: e.target.value };
                    set({ ...d, tech: next });
                  }}
                  style={{ marginBottom: 0, padding: 4, height: 36 }}
                />
                <button
                  type="button"
                  style={removeBtn}
                  onClick={() => set({ ...d, tech: (d.tech || []).filter((_, j) => j !== i) })}
                >×</button>
              </div>
            ))}
            <button
              type="button"
              style={addBtn}
              onClick={() => {
                const next = [...(d.tech || [])];
                next.push({
                  name: '',
                  color: TECH_DEFAULT_COLORS[next.length % TECH_DEFAULT_COLORS.length],
                });
                set({ ...d, tech: next });
              }}
            >+ Ajouter une techno</button>
            <p style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11,
              color: 'rgba(180,170,200,0.45)', marginTop: 8, lineHeight: 1.5,
            }}>
              Si vide, les Tags ci-dessus sont utilisés comme stack par défaut (avec couleurs auto).
            </p>
          </div>

          {/* Content */}
          <LocalizedField label="Description" value={d.desc} onChange={(v) => set({ ...d, desc: v })} multiline />
          <LocalizedField label="Problème" value={d.problem} onChange={(v) => set({ ...d, problem: v })} multiline />
          <LocalizedField label="Solution" value={d.solution} onChange={(v) => set({ ...d, solution: v })} multiline />
          <LocalizedField label="Impact" value={d.impact} onChange={(v) => set({ ...d, impact: v })} multiline />
        </>
      )}
    />
  );
}

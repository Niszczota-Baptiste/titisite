import { useRef, useState } from 'react';
import { uploadFile, api } from '../../../api/client';
import { ACC, ACC_RGB, CheckboxField, Field, Input, LocalizedField, TagsField } from '../ui';
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

// ── Image upload widget ──────────────────────────────────────────────────────
function ImageUploadField({ value, onChange, label, aspect = '16/9' }) {
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState(null);
  const inputRef = useRef();

  const handleFile = async (file) => {
    setErr(null);
    setProgress(0);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const result = await uploadFile('/images', fd, {
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      onChange(result.url);
    } catch (e) {
      setErr(e.message || 'Erreur lors de l\'upload');
    } finally {
      setProgress(null);
    }
  };

  const handleRemove = async () => {
    if (value?.startsWith('/api/images/')) {
      const filename = value.split('/').pop();
      try { await api.del(`/images/${filename}`); } catch { /* ignore if already gone */ }
    }
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <label style={{
          display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 11.5,
          color: 'rgba(180,170,200,0.7)', marginBottom: 6, letterSpacing: '0.2px',
        }}>{label}</label>
      )}

      {value ? (
        <div style={{
          position: 'relative', borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(80,50,130,0.3)',
          aspectRatio: aspect, background: 'rgba(14,8,32,0.6)',
        }}>
          <img
            src={value} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            padding: 8,
          }}>
            <button
              onClick={handleRemove}
              style={{
                background: 'rgba(10,4,24,0.85)', border: '1px solid rgba(255,100,120,0.35)',
                borderRadius: 6, color: 'rgba(255,120,140,0.9)',
                cursor: 'pointer', padding: '3px 9px', fontSize: 12,
                fontFamily: "'Inter',sans-serif",
              }}
            >Supprimer</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: '1px dashed rgba(80,50,130,0.35)', borderRadius: 8,
            background: 'rgba(14,8,32,0.4)', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '24px 16px', transition: 'border-color 0.2s',
            aspectRatio: aspect,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACC)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(80,50,130,0.35)')}
        >
          {progress !== null ? (
            <>
              <div style={{
                width: '60%', height: 4, background: 'rgba(80,50,130,0.3)',
                borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', background: ACC,
                  width: `${progress}%`, transition: 'width 0.1s',
                  borderRadius: 2,
                }} />
              </div>
              <span style={{
                fontFamily: "'Inter',sans-serif", fontSize: 12,
                color: `rgba(${ACC_RGB},0.8)`,
              }}>{progress}%</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 20, color: `rgba(${ACC_RGB},0.5)` }}>↑</span>
              <span style={{
                fontFamily: "'Inter',sans-serif", fontSize: 12,
                color: 'rgba(180,170,200,0.55)',
              }}>Cliquer pour uploader (JPG, PNG, WebP — max 10 Mo)</span>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
      {err && (
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#ff8a9b',
          marginTop: 5,
        }}>{err}</p>
      )}
    </div>
  );
}

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

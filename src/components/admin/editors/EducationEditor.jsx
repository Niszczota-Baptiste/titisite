import { Field, Input, LocalizedField } from '../ui';
import { ItemList } from '../ItemList';

const EMPTY = () => ({
  year: '',
  degree: { fr: '', en: '', ko: '' },
  school: '',
});

export function EducationEditor() {
  return (
    <ItemList
      title="Formation"
      collection="education"
      emptyDraft={EMPTY}
      renderPreview={(e) => (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 2 }}>
            <span style={{
              fontFamily: 'monospace', fontSize: 11, color: '#c9a8e8', letterSpacing: '0.5px',
            }}>{e.year}</span>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 600,
              color: '#ede8f8',
            }}>{e.degree?.fr || '—'}</span>
          </div>
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12,
            color: 'rgba(180,170,200,0.6)',
          }}>{e.school}</p>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <Field label="Année">
              <Input value={d.year} onChange={(e) => set({ ...d, year: e.target.value })} />
            </Field>
            <Field label="École">
              <Input value={d.school} onChange={(e) => set({ ...d, school: e.target.value })} />
            </Field>
          </div>
          <LocalizedField label="Diplôme" value={d.degree} onChange={(v) => set({ ...d, degree: v })} />
        </>
      )}
    />
  );
}

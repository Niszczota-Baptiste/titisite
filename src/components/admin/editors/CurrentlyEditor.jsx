import { Field, Input, LocalizedField, TagsField } from '../ui';
import { ItemList } from '../ItemList';

const EMPTY = () => ({
  title: '',
  desc: { fr: '', en: '', ko: '' },
  stack: [],
  progress: 0,
  since: '',
});

export function CurrentlyEditor() {
  return (
    <ItemList
      title="En cours"
      collection="currently"
      emptyDraft={EMPTY}
      renderPreview={(c) => (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
              color: '#ede8f8',
            }}>{c.title || '—'}</span>
            <span style={{
              fontFamily: 'monospace', fontSize: 11,
              color: '#c9a8e8',
            }}>{c.progress}%</span>
            <span style={{
              fontFamily: 'monospace', fontSize: 11,
              color: 'rgba(180,170,200,0.5)', marginLeft: 'auto',
            }}>{c.since}</span>
          </div>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 10 }}>
            <Field label="Titre">
              <Input value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
            </Field>
            <Field label="Progression (%)">
              <Input
                type="number"
                min="0"
                max="100"
                value={d.progress}
                onChange={(e) => set({ ...d, progress: Number(e.target.value) })}
              />
            </Field>
            <Field label="Depuis">
              <Input
                value={d.since}
                onChange={(e) => set({ ...d, since: e.target.value })}
                placeholder="Mars 2024"
              />
            </Field>
          </div>
          <LocalizedField label="Description" value={d.desc} onChange={(v) => set({ ...d, desc: v })} multiline />
          <TagsField label="Stack" value={d.stack} onChange={(v) => set({ ...d, stack: v })} />
        </>
      )}
    />
  );
}

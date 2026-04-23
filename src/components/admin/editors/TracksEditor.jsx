import { Field, Input } from '../ui';
import { ItemList } from '../ItemList';

const EMPTY = { title: '', genre: '', duration: '0:00' };

export function TracksEditor() {
  return (
    <ItemList
      title="Musique"
      collection="tracks"
      emptyDraft={EMPTY}
      renderPreview={(tr) => (
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 600,
            color: '#ede8f8',
          }}>{tr.title || '—'}</span>
          <span style={{
            fontFamily: "'Inter',sans-serif", fontSize: 12,
            color: 'rgba(180,170,200,0.6)',
          }}>{tr.genre}</span>
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'monospace', fontSize: 12,
            color: 'rgba(180,170,200,0.6)',
          }}>{tr.duration}</span>
        </div>
      )}
      renderForm={(d, set) => (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px', gap: 10 }}>
          <Field label="Titre">
            <Input value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
          </Field>
          <Field label="Genre">
            <Input value={d.genre} onChange={(e) => set({ ...d, genre: e.target.value })} />
          </Field>
          <Field label="Durée">
            <Input
              value={d.duration}
              onChange={(e) => set({ ...d, duration: e.target.value })}
              placeholder="3:42"
            />
          </Field>
        </div>
      )}
    />
  );
}

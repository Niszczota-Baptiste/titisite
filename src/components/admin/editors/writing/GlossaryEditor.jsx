import { api } from '../../../../api/client';
import { Field, Input } from '../../ui';
import { RelationalList } from './RelationalList';

const EMPTY = () => ({ termKr: '', romanization: '', meaning: '' });

export function GlossaryEditor({ projectId }) {
  return (
    <RelationalList
      title="Lexique coréen"
      addLabel="+ Ajouter un terme"
      api={api.writing.glossaryFor(projectId)}
      emptyDraft={EMPTY}
      renderPreview={(g) => (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Noto Sans KR','Inter',sans-serif", fontSize: 17, fontWeight: 700, color: '#c9a8e8' }}>{g.termKr || '—'}</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(214,206,230,0.85)' }}>{g.romanization}</span>
          {g.meaning && <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(180,170,200,0.65)' }}>— {g.meaning}</span>}
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Terme (coréen)"><Input value={d.termKr} onChange={(e) => set({ ...d, termKr: e.target.value })} placeholder="호수 신념" /></Field>
            <Field label="Romanisation"><Input value={d.romanization} onChange={(e) => set({ ...d, romanization: e.target.value })} placeholder="Hosu Sinnyeom" /></Field>
          </div>
          <Field label="Sens"><Input value={d.meaning} onChange={(e) => set({ ...d, meaning: e.target.value })} placeholder="le lac de la foi" /></Field>
        </>
      )}
    />
  );
}

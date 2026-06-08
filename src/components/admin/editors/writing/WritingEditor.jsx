import { useState } from 'react';
import { ACC, ACC_RGB } from '../../ui';
import { CharactersEditor } from './CharactersEditor';
import { GlossaryEditor } from './GlossaryEditor';
import { WorksEditor } from './WorksEditor';

const SUB = [
  { key: 'works', label: 'Œuvres', Editor: WorksEditor },
  { key: 'characters', label: 'Personnages', Editor: CharactersEditor },
  { key: 'glossary', label: 'Lexique', Editor: GlossaryEditor },
];

// Back-office for the writing space, grouped under one dashboard tab with a
// sub-navigation (works / characters / glossary).
export function WritingEditor() {
  const [sub, setSub] = useState('works');
  const Active = SUB.find((s) => s.key === sub).Editor;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {SUB.map((s) => {
          const on = sub === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSub(s.key)}
              style={{
                background: on ? `rgba(${ACC_RGB},0.14)` : 'transparent',
                border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
                color: on ? ACC : 'rgba(180,170,200,0.7)',
                borderRadius: 20, padding: '6px 16px', cursor: 'pointer',
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: on ? 700 : 500,
                transition: 'all 0.18s',
              }}
            >{s.label}</button>
          );
        })}
      </div>
      <Active />
    </div>
  );
}

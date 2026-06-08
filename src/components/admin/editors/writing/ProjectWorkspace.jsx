import { useState } from 'react';
import { ACC, ACC_RGB } from '../../ui';
import { BooksEditor } from './BooksEditor';
import { CharactersEditor } from './CharactersEditor';
import { GlossaryEditor } from './GlossaryEditor';

const SUB = [
  { key: 'books', label: 'Livres', Editor: BooksEditor },
  { key: 'characters', label: 'Personnages', Editor: CharactersEditor },
  { key: 'glossary', label: 'Lexique', Editor: GlossaryEditor, needsGlossary: true },
];

// Content workspace for one project: its books, characters and glossary — all
// scoped to the project. The Lexique tab only shows when the project enabled it.
export function ProjectWorkspace({ projectId, projectTitle, hasGlossary, onBack }) {
  const tabs = SUB.filter((s) => !s.needsGlossary || hasGlossary);
  const [sub, setSub] = useState('books');
  const active = tabs.find((s) => s.key === sub) || tabs[0];
  const Active = active.Editor;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(80,50,130,0.32)', color: 'rgba(232,228,248,0.75)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13 }}>← Tous les projets</button>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#ede8f8' }}>
          {projectTitle}
        </h2>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map((s) => {
          const on = active.key === s.key;
          return (
            <button key={s.key} onClick={() => setSub(s.key)} style={{
              background: on ? `rgba(${ACC_RGB},0.14)` : 'transparent',
              border: `1px solid ${on ? ACC : 'rgba(80,50,130,0.3)'}`,
              color: on ? ACC : 'rgba(180,170,200,0.7)',
              borderRadius: 20, padding: '6px 16px', cursor: 'pointer',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: on ? 700 : 500, transition: 'all 0.18s',
            }}>{s.label}</button>
          );
        })}
      </div>

      <Active key={`${projectId}-${active.key}`} projectId={projectId} />
    </div>
  );
}

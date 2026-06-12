import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { useToast } from '../../../../ui/ToastProvider';
import { ACC, ACC_RGB, Button, box } from '../../ui';
import { BookEditor } from './BookEditor';

const STATUS_LABEL = { brouillon: 'Brouillon', wip: 'WIP', termine: 'Terminé' };

// Entries (the typed tree) of one project. Self-contained: fetches the project
// detail (flat entry list + characters + glossary for the token toolbar) plus
// tracks for the OST picker. The top-level list shows root entries; opening one
// reveals its sub-elements (navigated through a back-stack).
export function BooksEditor({ projectId }) {
  const toast = useToast();
  const [books, setBooks] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [glossary, setGlossary] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Navigation stack of { workId, parentId }. Empty = the root list.
  const [stack, setStack] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([api.writing.projects.get(projectId), api.list('tracks')]);
      setBooks(p.books); setCharacters(p.characters); setGlossary(p.glossary); setTracks(t);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, [projectId]); // eslint-disable-line

  const roots = books.filter((w) => w.parentId == null);

  const move = async (id, dir) => {
    const idx = roots.findIndex((w) => w.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= roots.length) return;
    const order = roots.map((w) => w.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    try { await api.writing.works.reorderIn(projectId, order); await loadAll(); } catch (e) { toast.error(e.message); }
  };

  const current = stack[stack.length - 1];
  if (current) {
    return (
      <BookEditor
        key={`${current.workId}-${stack.length}`}
        workId={current.workId}
        projectId={projectId}
        parentId={current.parentId}
        characters={characters}
        glossary={glossary}
        tracks={tracks}
        onClose={() => { setStack((s) => s.slice(0, -1)); loadAll(); }}
        onOpenChild={(wid, pid) => setStack((s) => [...s, { workId: wid, parentId: pid ?? current.workId }])}
        onSaved={loadAll}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: '#ede8f8' }}>Contenu du projet</h3>
        <Button onClick={() => setStack([{ workId: 'new', parentId: null }])}>+ Ajouter un élément</Button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : roots.length === 0 ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          Aucun élément. Crée un livre, une ville, une lettre… via « Ajouter ».
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {roots.map((w) => (
            <div key={w.id} style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: w.accentColor, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                  <span style={{ fontSize: 10, color: ACC, background: `rgba(${ACC_RGB},0.12)`, border: `1px solid rgba(${ACC_RGB},0.3)`, padding: '1px 7px', borderRadius: 4, fontFamily: "'JetBrains Mono',monospace" }}>{w.type}</span>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ede8f8' }}>{w.title || '—'}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: `rgba(${ACC_RGB},0.8)`, background: `rgba(${ACC_RGB},0.1)`, padding: '2px 6px', borderRadius: 4 }}>{STATUS_LABEL[w.status]}</span>
                  {w.isPublished
                    ? <span style={{ fontSize: 10, color: '#9ad4ae', border: '1px solid rgba(154,212,174,0.3)', padding: '2px 6px', borderRadius: 4 }}>publié</span>
                    : <span style={{ fontSize: 10, color: 'rgba(180,170,200,0.6)', border: '1px solid rgba(120,100,160,0.3)', padding: '2px 6px', borderRadius: 4 }}>masqué</span>}
                  <span style={{ fontSize: 11, color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>
                    {w.childCount ? `${w.childCount} sous-élément(s)` : ''}{w.childCount && w.chapterCount ? ' · ' : ''}{w.chapterCount ? `${w.chapterCount} chap.` : ''}
                  </span>
                </div>
                {w.subtitle && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>{w.subtitle}</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <IconBtn onClick={() => move(w.id, -1)}>↑</IconBtn>
                <IconBtn onClick={() => move(w.id, +1)}>↓</IconBtn>
                <Button variant="ghost" onClick={() => setStack([{ workId: w.id, parentId: null }])}>Ouvrir</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, ...rest }) {
  return (
    <button type="button" {...rest} style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: 'rgba(232,228,248,0.75)', cursor: 'pointer', fontSize: 14 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACC; e.currentTarget.style.color = ACC; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(80,50,130,0.28)'; e.currentTarget.style.color = 'rgba(232,228,248,0.75)'; }}
    >{children}</button>
  );
}

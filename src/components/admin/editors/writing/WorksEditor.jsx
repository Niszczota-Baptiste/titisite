import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { useToast } from '../../../../ui/ToastProvider';
import { ACC, ACC_RGB, Button, box } from '../../ui';
import { WorkEditor } from './WorkEditor';

const STATUS_LABEL = { brouillon: 'Brouillon', wip: 'WIP', termine: 'Terminé' };

export function WorksEditor() {
  const toast = useToast();
  const [works, setWorks] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [glossary, setGlossary] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // workId | 'new' | null

  const loadAll = async () => {
    setLoading(true);
    try {
      const [w, c, g, t] = await Promise.all([
        api.writing.works.list(),
        api.writing.characters.list(),
        api.writing.glossary.list(),
        api.list('tracks'),
      ]);
      setWorks(w); setCharacters(c); setGlossary(g); setTracks(t);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  const move = async (id, dir) => {
    const idx = works.findIndex((w) => w.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= works.length) return;
    const order = works.map((w) => w.id);
    [order[idx], order[j]] = [order[j], order[idx]];
    try { setWorks(await api.writing.works.reorder(order)); } catch (e) { toast.error(e.message); }
  };

  if (editing !== null) {
    return (
      <WorkEditor
        workId={editing}
        characters={characters}
        glossary={glossary}
        tracks={tracks}
        onClose={() => setEditing(null)}
        onSaved={loadAll}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: '#ede8f8' }}>Œuvres</h2>
        <Button onClick={() => setEditing('new')}>+ Ajouter une œuvre</Button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : works.length === 0 ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          Aucune œuvre. Clique sur « Ajouter » pour commencer.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {works.map((w, i) => (
            <div key={w.id} style={{ ...box, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: w.accentColor, flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#ede8f8' }}>{w.title || '—'}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: `rgba(${ACC_RGB},0.8)`, background: `rgba(${ACC_RGB},0.1)`, padding: '2px 6px', borderRadius: 4 }}>{STATUS_LABEL[w.status]}</span>
                  {w.isPublished
                    ? <span style={{ fontSize: 10, color: '#9ad4ae', border: '1px solid rgba(154,212,174,0.3)', padding: '2px 6px', borderRadius: 4 }}>publié</span>
                    : <span style={{ fontSize: 10, color: 'rgba(180,170,200,0.6)', border: '1px solid rgba(120,100,160,0.3)', padding: '2px 6px', borderRadius: 4 }}>masqué</span>}
                  <span style={{ fontSize: 11, color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>{w.chapterCount} chap.</span>
                </div>
                {w.subtitle && <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>{w.subtitle}</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <IconBtn onClick={() => move(w.id, -1)}>↑</IconBtn>
                <IconBtn onClick={() => move(w.id, +1)}>↓</IconBtn>
                <Button variant="ghost" onClick={() => setEditing(w.id)}>Éditer</Button>
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
    <button {...rest} style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: '1px solid rgba(80,50,130,0.28)', color: 'rgba(232,228,248,0.75)', cursor: 'pointer', fontSize: 14 }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACC; e.currentTarget.style.color = ACC; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(80,50,130,0.28)'; e.currentTarget.style.color = 'rgba(232,228,248,0.75)'; }}
    >{children}</button>
  );
}

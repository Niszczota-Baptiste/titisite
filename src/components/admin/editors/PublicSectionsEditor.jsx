import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { ACC, ACC_RGB, Button } from '../ui';

const LABELS = {
  projects:   { name: 'Projets',     description: 'Cartes des projets du portfolio' },
  music:      { name: 'Musique',     description: 'Lecteur des tracks' },
  about:      { name: 'À propos',    description: 'Bio + photo + vision' },
  education:  { name: 'Formation',   description: 'Timeline scolarité' },
  experience: { name: 'Expérience',  description: 'Postes et missions' },
  current:    { name: 'En cours',    description: 'Projet actuel mis en avant' },
  contact:    { name: 'Contact',     description: 'Formulaire + réseaux sociaux' },
};

export function PublicSectionsEditor() {
  const [sections, setSections] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [err, setErr] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  useEffect(() => {
    api.publicSections()
      .then((r) => setSections(r.sections))
      .catch((e) => setErr(e.message));
  }, []);

  const persist = async (next) => {
    setSaving(true); setErr(null);
    try {
      const r = await api.setPublicSections(next);
      setSections(r.sections);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id) => {
    const next = sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s));
    setSections(next);
    persist(next);
  };

  const move = (id, dir) => {
    const idx = sections.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sections.length) return;
    const next = sections.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setSections(next);
    persist(next);
  };

  // Drag & drop
  const onDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
  };
  const onDragOver = (e, idx) => {
    if (dragIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIdx !== idx) setOverIdx(idx);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };
  const onDrop = (e, idx) => {
    e.preventDefault();
    const from = dragIdx;
    setDragIdx(null);
    setOverIdx(null);
    if (from === null || from === idx) return;
    const next = sections.slice();
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setSections(next);
    persist(next);
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px',
        }}>
          Page publique
        </h2>
        <span style={{
          fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: saving ? ACC : (savedAt && Date.now() - savedAt < 4000 ? '#9ad4ae' : 'rgba(180,170,200,0.5)'),
        }}>
          {saving ? 'Enregistrement…' : (savedAt && Date.now() - savedAt < 4000 ? '✓ Enregistré' : '')}
        </span>
      </div>
      <p style={{
        fontFamily: "'Inter',sans-serif", fontSize: 13,
        color: 'rgba(180,170,200,0.65)', marginBottom: 18, lineHeight: 1.6,
      }}>
        Glisse-déposer pour réordonner les sections du site.
        La section <b style={{ color: '#ede8f8' }}>Hero</b> reste toujours en haut. Décoche pour cacher une section.
      </p>

      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ff8a9b',
          fontFamily: "'Inter',sans-serif", fontSize: 13,
        }}>{err}</div>
      )}

      {sections === null ? (
        <p style={{ color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.map((s, idx) => {
            const meta = LABELS[s.id] || { name: s.id, description: '' };
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                style={{
                  background: 'rgba(14,9,28,0.72)',
                  border: `1px solid ${isOver ? ACC : 'rgba(80,50,130,0.24)'}`,
                  borderRadius: 12, padding: '12px 14px',
                  display: 'flex', gap: 12, alignItems: 'center',
                  cursor: 'grab',
                  opacity: isDragging ? 0.4 : (s.visible ? 1 : 0.55),
                  transform: isOver ? 'translateY(2px)' : 'none',
                  boxShadow: isOver ? `0 -2px 0 ${ACC}` : 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
                  userSelect: 'none',
                }}
              >
                {/* Drag handle */}
                <span style={{
                  flexShrink: 0,
                  color: 'rgba(180,170,200,0.4)',
                  fontFamily: 'monospace', fontSize: 16,
                  width: 16, textAlign: 'center', lineHeight: 1,
                }} title="Glisse pour réordonner">⋮⋮</span>

                {/* Order index */}
                <span style={{
                  flexShrink: 0,
                  fontFamily: 'monospace', fontSize: 11,
                  color: 'rgba(180,170,200,0.45)',
                  minWidth: 18, textAlign: 'center',
                }}>{idx + 1}</span>

                {/* Label + description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 600,
                    color: s.visible ? '#ede8f8' : 'rgba(180,170,200,0.6)',
                    textDecoration: s.visible ? 'none' : 'line-through',
                  }}>
                    {meta.name}
                  </div>
                  <div style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 11.5,
                    color: 'rgba(180,170,200,0.5)', marginTop: 2,
                  }}>
                    {meta.description}
                    {!s.visible && (
                      <span style={{ color: '#e8a87c', marginLeft: 8 }}>· cachée</span>
                    )}
                  </div>
                </div>

                {/* Visibility toggle */}
                <label
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  draggable={false}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', userSelect: 'none', flexShrink: 0,
                    fontFamily: "'Inter',sans-serif", fontSize: 12,
                    color: s.visible ? ACC : 'rgba(180,170,200,0.5)',
                  }}
                >
                  <span style={{
                    width: 36, height: 20, borderRadius: 10,
                    background: s.visible ? `rgba(${ACC_RGB},0.5)` : 'rgba(60,40,100,0.4)',
                    border: `1px solid ${s.visible ? ACC : 'rgba(80,50,130,0.4)'}`,
                    position: 'relative', transition: 'all 0.18s',
                  }}>
                    <span style={{
                      position: 'absolute',
                      top: 1, left: s.visible ? 17 : 1,
                      width: 16, height: 16, borderRadius: '50%',
                      background: s.visible ? ACC : 'rgba(180,170,200,0.7)',
                      transition: 'left 0.18s, background 0.18s',
                    }} />
                  </span>
                  <input
                    type="checkbox"
                    checked={s.visible}
                    onChange={() => toggle(s.id)}
                    style={{ display: 'none' }}
                  />
                  {s.visible ? 'Visible' : 'Cachée'}
                </label>

                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  draggable={false}
                  style={{ display: 'flex', gap: 4 }}
                >
                  <ArrowBtn onClick={() => move(s.id, -1)} disabled={idx === 0} title="Monter">↑</ArrowBtn>
                  <ArrowBtn onClick={() => move(s.id, +1)} disabled={idx === sections.length - 1} title="Descendre">↓</ArrowBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArrowBtn({ children, disabled, ...rest }) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: 'transparent',
        border: '1px solid rgba(80,50,130,0.28)',
        color: 'rgba(232,228,248,0.75)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { FeatureModal } from './FeatureModal';
import {
  ACC, ACC_RGB, Button, ErrorBanner, Section, Tag, dueStatus, DUE_STYLES,
  Empty, card, formatDate, muted,
} from './shared';

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo',    label: 'À faire' },
  { key: 'doing',   label: 'En cours' },
  { key: 'done',    label: 'Terminé' },
];

const PRIORITY_COLORS = {
  low:    '#9ad4ae',
  medium: ACC,
  high:   '#ff8a9b',
};

export function KanbanTab() {
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const [f, u] = await Promise.all([api.get('/features'), api.get('/users')]);
      setItems(f); setUsers(u);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const allTags = useMemo(() => {
    const set = new Set();
    for (const it of items) for (const t of (it.tags || [])) set.add(t);
    return [...set].sort();
  }, [items]);

  const filtered = tagFilter ? items.filter((i) => (i.tags || []).includes(tagFilter)) : items;
  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.key] = filtered.filter((i) => i.status === c.key);
    return acc;
  }, {});

  const move = async (feature, newStatus) => {
    try { await api.put(`/features/${feature.id}`, { status: newStatus }); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <Section
      title="Kanban"
      actions={<Button onClick={() => setEditing({})}>+ Nouvelle carte</Button>}
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {allTags.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
          alignItems: 'center',
        }}>
          <span style={{ ...muted, fontSize: 11, marginRight: 4 }}>Filtrer :</span>
          <TagFilterBtn active={!tagFilter} onClick={() => setTagFilter(null)}>Tous</TagFilterBtn>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                opacity: tagFilter && tagFilter !== t ? 0.45 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <Tag name={t} />
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucune carte. Crée la première tâche du projet.</Empty>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14,
          minHeight: 400,
        }}>
          {COLUMNS.map((col) => (
            <div key={col.key} style={{
              background: 'rgba(4,3,14,0.35)',
              borderRadius: 12, padding: 12,
              border: '1px solid rgba(60,40,100,0.16)',
              display: 'flex', flexDirection: 'column', gap: 10,
              minWidth: 0,
            }}>
              <header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '2px 4px',
              }}>
                <span style={{
                  fontFamily: "'Inter',sans-serif", fontSize: 11,
                  color: 'rgba(200,192,216,0.75)',
                  letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700,
                }}>
                  {col.label}
                </span>
                <span style={{ ...muted, fontSize: 11, fontFamily: 'monospace' }}>
                  {grouped[col.key].length}
                </span>
              </header>

              {grouped[col.key].length === 0 ? (
                <div style={{ ...muted, fontSize: 11, textAlign: 'center', padding: '12px 4px' }}>—</div>
              ) : (
                grouped[col.key].map((f) => (
                  <KanbanCard
                    key={f.id}
                    feature={f}
                    onOpen={() => setEditing(f)}
                    onMove={(to) => move(f, to)}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      <FeatureModal
        open={!!editing}
        feature={editing}
        users={users}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </Section>
  );
}

function TagFilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `rgba(${ACC_RGB},0.14)` : 'rgba(20,14,38,0.6)',
        border: `1px solid ${active ? ACC : 'rgba(80,50,130,0.28)'}`,
        color: active ? ACC : 'rgba(180,170,200,0.6)',
        borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
        fontFamily: "'Inter',sans-serif", fontSize: 10.5,
        fontWeight: active ? 700 : 500, letterSpacing: '0.2px',
      }}
    >
      {children}
    </button>
  );
}

function KanbanCard({ feature, onOpen, onMove }) {
  const borderColor = PRIORITY_COLORS[feature.priority] || ACC;
  const idx = COLUMNS.findIndex((c) => c.key === feature.status);
  const prevCol = COLUMNS[idx - 1];
  const nextCol = COLUMNS[idx + 1];
  const due = dueStatus(feature.dueDate, feature.status);

  return (
    <article style={{
      ...card, padding: 12, cursor: 'pointer', position: 'relative',
      borderLeft: `3px solid ${borderColor}`,
    }} onClick={onOpen}>
      <h4 style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600,
        color: '#ede8f8', marginBottom: 6, letterSpacing: '-0.2px',
      }}>
        {feature.title}
      </h4>

      {feature.description && (
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: 'rgba(200,192,216,0.7)', lineHeight: 1.5,
          marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {feature.description}
        </p>
      )}

      {(feature.tags || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {feature.tags.map((t) => <Tag key={t} name={t} />)}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        ...muted, fontSize: 10.5,
      }}>
        <span style={{
          padding: '1px 6px', borderRadius: 3,
          background: `${borderColor}22`, color: borderColor, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.5px', border: `1px solid ${borderColor}40`,
        }}>{feature.priority}</span>

        {due && (
          <span
            title={feature.dueDate ? formatDate(feature.dueDate) : ''}
            style={{
              padding: '1px 6px', borderRadius: 3,
              background: DUE_STYLES[due].bg,
              border: `1px solid ${DUE_STYLES[due].color}33`,
              color: DUE_STYLES[due].color, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            {due === 'overdue' ? '⚠' : '📅'} {DUE_STYLES[due].label}
          </span>
        )}

        {feature.assigneeName && (
          <span style={{ color: 'rgba(200,192,216,0.7)' }}>@{feature.assigneeName}</span>
        )}
        {feature.commentsCount > 0 && <span>💬 {feature.commentsCount}</span>}
        {(feature.documents || []).length > 0 && <span>📎 {feature.documents.length}</span>}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', gap: 4, marginTop: 10, paddingTop: 8,
          borderTop: '1px dashed rgba(60,40,100,0.2)',
        }}
      >
        {prevCol && (
          <button onClick={() => onMove(prevCol.key)} style={moveBtnStyle} title={`→ ${prevCol.label}`}>
            ← {prevCol.label}
          </button>
        )}
        {nextCol && (
          <button
            onClick={() => onMove(nextCol.key)}
            style={{ ...moveBtnStyle, marginLeft: 'auto' }}
            title={`→ ${nextCol.label}`}
          >
            {nextCol.label} →
          </button>
        )}
      </div>
    </article>
  );
}

const moveBtnStyle = {
  background: 'none', border: '1px solid rgba(80,50,130,0.28)',
  borderRadius: 6, padding: '3px 8px',
  color: 'rgba(180,170,200,0.7)', cursor: 'pointer',
  fontFamily: "'Inter',sans-serif", fontSize: 10.5,
  transition: 'all 0.15s',
};

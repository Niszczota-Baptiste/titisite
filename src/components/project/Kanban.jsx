import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useWorkspace } from '../../hooks/useWorkspace';
import { FeatureModal } from './FeatureModal';
import { FilterSidebar } from './FilterSidebar';
import {
  ACC, Button, ErrorBanner, Section, Tag, dueStatus, DUE_STYLES,
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

const DEFAULT_FILTERS = {
  tagMode: 'include',
  tags: [],
  assignees: [],
  overdue: false,
};

export function KanbanTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [err, setErr] = useState(null);

  const load = async () => {
    try {
      const [f, u] = await Promise.all([ws.features.list(), api.users()]);
      setItems(f); setUsers(u);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  // Precompute counts for the sidebar — from the full list (not filtered)
  const counts = useMemo(() => {
    const tags = new Map();
    const assignees = new Map();
    let overdue = 0;
    const now = Date.now() / 1000;
    for (const f of items) {
      for (const t of (f.tags || [])) tags.set(t, (tags.get(t) || 0) + 1);
      const key = f.assigneeId ?? null;
      if (key !== null || (f.assigneeId === null)) {
        assignees.set(key, (assignees.get(key) || 0) + 1);
      }
      if (f.dueDate && f.dueDate < now && f.status !== 'done') overdue++;
    }
    return { tags, assignees, overdue };
  }, [items]);

  const filtered = useMemo(() => items.filter((f) => matches(f, filters)), [items, filters]);

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.key] = filtered.filter((i) => i.status === c.key);
    return acc;
  }, {});

  const move = async (feature, newStatus) => {
    try { await ws.features.update(feature.id, { status: newStatus }); await load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <Section
      title="Kanban"
      actions={<Button onClick={() => setEditing({})}>+ Nouvelle carte</Button>}
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <FilterSidebar
            filters={filters}
            setFilters={setFilters}
            users={users}
            counts={counts}
            onTagsMutated={load}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            {items.length === 0 ? (
              <Empty>Aucune carte. Crée la première tâche du projet.</Empty>
            ) : filtered.length === 0 ? (
              <Empty>Aucune carte ne correspond aux filtres actifs.</Empty>
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
                      }}>{col.label}</span>
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
          </div>
        </div>
      )}

      <FeatureModal
        open={!!editing}
        feature={editing}
        users={users}
        workspaceSlug={workspace.slug}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    </Section>
  );
}

function matches(f, filters) {
  // Tags — include: at least one matches; exclude: none match
  if (filters.tags.length > 0) {
    const hasAny = filters.tags.some((t) => (f.tags || []).includes(t));
    if (filters.tagMode === 'include' && !hasAny) return false;
    if (filters.tagMode === 'exclude' && hasAny) return false;
  }
  // Assignees — OR within the category
  if (filters.assignees.length > 0) {
    const key = f.assigneeId ?? null;
    const match = filters.assignees.some((x) => (x ?? null) === key);
    if (!match) return false;
  }
  // Overdue
  if (filters.overdue) {
    if (!f.dueDate) return false;
    if (f.dueDate >= Date.now() / 1000) return false;
    if (f.status === 'done') return false;
  }
  return true;
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
      }}>{feature.title}</h4>

      {feature.description && (
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: 'rgba(200,192,216,0.7)', lineHeight: 1.5, marginBottom: 8,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{feature.description}</p>
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

      <div onClick={(e) => e.stopPropagation()} style={{
        display: 'flex', gap: 4, marginTop: 10, paddingTop: 8,
        borderTop: '1px dashed rgba(60,40,100,0.2)',
      }}>
        {prevCol && (
          <button onClick={() => onMove(prevCol.key)} style={moveBtnStyle} title={`→ ${prevCol.label}`}>
            ← {prevCol.label}
          </button>
        )}
        {nextCol && (
          <button onClick={() => onMove(nextCol.key)} style={{ ...moveBtnStyle, marginLeft: 'auto' }} title={`→ ${nextCol.label}`}>
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

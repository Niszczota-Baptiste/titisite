import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useWorkspace } from '../../hooks/useWorkspace';
import { FeatureModal } from './FeatureModal';
import {
  ACC, ACC_RGB, ErrorBanner, Tag, dueStatus, DUE_STYLES, formatDate, muted,
} from './shared';

// ── Constants ────────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'backlog', label: 'Backlog',  accent: '#6a6080' },
  { key: 'todo',    label: 'À faire',  accent: '#7eb8f7' },
  { key: 'doing',   label: 'En cours', accent: ACC },
  { key: 'done',    label: 'Terminé',  accent: '#9ad4ae' },
];

const PRIORITIES = {
  high:   { label: 'Haute',   color: '#ff8a9b', bg: 'rgba(255,138,155,0.12)' },
  medium: { label: 'Moyenne', color: ACC,        bg: `rgba(${ACC_RGB},0.10)` },
  low:    { label: 'Basse',   color: '#6a6080',  bg: 'rgba(106,96,128,0.10)' },
};

const DEFAULT_FILTERS = { tagMode: 'include', tags: [], assignees: [], priorities: [], overdue: false };

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [ACC, '#9ad4ae', '#e8a87c', '#7eb8f7', '#e88cb8', '#e8d27c'];
function avatarColor(id) { return AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length]; }

function Avatar({ user, size = 24 }) {
  if (!user) return null;
  const color = avatarColor(user.id);
  return (
    <div title={user.name} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `rgba(${color === ACC ? ACC_RGB : '154,212,174'},0.15)`,
      border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color,
      fontFamily: "'Space Grotesk',sans-serif",
    }}>
      {initials(user.name)}
    </div>
  );
}

function PriorityDot({ priority }) {
  const p = PRIORITIES[priority];
  if (!p) return null;
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', background: p.color,
      boxShadow: `0 0 5px ${p.color}`, flexShrink: 0, display: 'inline-block',
    }} title={p.label} />
  );
}

function DueChip({ dueDate, status }) {
  const s = dueStatus(dueDate, status);
  if (!s || s === 'done') return null;
  const style = DUE_STYLES[s];
  const fmt = new Date(dueDate * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 3,
      color: style.color, fontSize: 10.5, fontWeight: s === 'overdue' ? 600 : 400,
    }}>
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
        <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {fmt}
    </span>
  );
}

// ── Sprint Stats ─────────────────────────────────────────────────────────────

function SprintStats({ items }) {
  const now = Date.now() / 1000;
  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const late = items.filter((i) => i.dueDate && i.dueDate < now && i.status !== 'done').length;
  const high = items.filter((i) => i.priority === 'high' && i.status !== 'done').length;

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[
        { label: 'Total',    value: total,           color: ACC },
        { label: 'Terminé',  value: `${done}/${total}`, color: '#9ad4ae' },
        { label: 'En retard',value: late,            color: late > 0 ? '#ff8a9b' : '#4a3860' },
        { label: 'Urgentes', value: high,            color: high > 0 ? '#ff8a9b' : '#4a3860' },
      ].map((s) => (
        <div key={s.label} style={{
          background: 'rgba(14,9,28,0.7)', border: '1px solid rgba(60,40,100,0.2)',
          borderRadius: 10, padding: '6px 14px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          <span style={{ fontSize: 9.5, color: '#4a3860', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 600 }}>
            {s.label}
          </span>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: s.color }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Quick Add Form ────────────────────────────────────────────────────────────

function QuickAdd({ colKey, onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [priority, setPri] = useState('medium');
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), priority, status: colKey });
  };

  return (
    <div style={{
      background: 'rgba(14,9,28,0.9)', border: '1px solid rgba(120,80,200,0.35)',
      borderRadius: 10, padding: 12, animation: 'kFadeIn 0.2s ease both',
    }}>
      <style>{`@keyframes kFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      <input
        ref={ref} value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Titre de la tâche…"
        style={{
          width: '100%', background: 'rgba(20,12,40,0.7)',
          border: '1px solid rgba(80,50,130,0.3)', borderRadius: 7,
          padding: '7px 10px', color: '#ede8f8', fontSize: 13, outline: 'none', marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {Object.entries(PRIORITIES).map(([k, v]) => (
          <button key={k} onClick={() => setPri(k)} style={{
            flex: 1, background: priority === k ? v.bg : 'none',
            border: `1px solid ${priority === k ? v.color + '55' : 'rgba(60,40,100,0.3)'}`,
            color: priority === k ? v.color : '#6a6080',
            borderRadius: 6, padding: '4px 0', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s',
          }}>{v.label.slice(0, 3)}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} style={{
          flex: 1, background: ACC, color: '#08051a', border: 'none',
          borderRadius: 7, padding: '7px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>Ajouter</button>
        <button onClick={onCancel} style={{
          background: 'none', border: '1px solid rgba(60,40,100,0.3)',
          color: '#6a6080', borderRadius: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer',
        }}>×</button>
      </div>
    </div>
  );
}

// ── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ feature, users, onOpen, onDragStart, onDragEnd }) {
  const [hov, setHov] = useState(false);
  const p = PRIORITIES[feature.priority];
  const borderColor = p?.color || ACC;
  const isDone = feature.status === 'done';
  const assignee = users.find((u) => u.id === feature.assigneeId);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, feature)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onOpen(feature)}
      style={{
        background: hov ? 'rgba(22,14,42,0.95)' : 'rgba(14,9,28,0.80)',
        border: `1px solid ${hov ? 'rgba(160,110,220,0.35)' : 'rgba(80,50,130,0.22)'}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10, padding: '13px 13px 11px',
        cursor: 'pointer', userSelect: 'none',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
        transition: 'all 0.2s cubic-bezier(.22,1,.36,1)',
        animation: 'kFadeIn 0.25s ease both',
      }}
    >
      {/* Priority dot + title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 7 }}>
        <PriorityDot priority={feature.priority} />
        <p style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13.5, fontWeight: 600,
          color: isDone ? '#6a6080' : '#ddd8f0', lineHeight: 1.4, flex: 1,
          textDecoration: isDone ? 'line-through' : 'none', textDecorationColor: '#4a3860',
        }}>{feature.title}</p>
      </div>

      {/* Tags */}
      {(feature.tags || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 9 }}>
          {feature.tags.map((t) => <Tag key={t} name={t} />)}
        </div>
      )}

      {/* Subtask progress bar */}
      {(feature.subtasks || []).length > 0 && (() => {
        const total = feature.subtasks.length;
        const done = feature.subtasks.filter((s) => s.done).length;
        const pct = Math.round((done / total) * 100);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(80,50,130,0.25)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: pct === 100 ? '#9ad4ae' : ACC,
                borderRadius: 2, transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ fontSize: 10, color: '#6a6080', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {done}/{total}
            </span>
          </div>
        );
      })()}

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {assignee && <Avatar user={assignee} size={22} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {feature.commentsCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#6a6080' }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 2h8v6H7L5 10V8H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              {feature.commentsCount}
            </span>
          )}
          {(feature.documents || []).length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#6a6080' }}>
              <svg width="9" height="10" viewBox="0 0 10 12" fill="none">
                <path d="M1 1h6l2 2v8H1V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              {feature.documents.length}
            </span>
          )}
          <DueChip dueDate={feature.dueDate} status={feature.status} />
        </div>
      </div>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({ col, cards, users, dragOver, onDragOver, onDrop, onDragLeave, onDragStart, onDragEnd, onOpen, onQuickAdd }) {
  const [adding, setAdding] = useState(false);
  const done = col.key === 'done' ? cards.length : cards.filter((c) => c.status === 'done').length;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minWidth: 240, flex: 1, maxWidth: 320 }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(col.key); }}
      onDrop={(e) => { e.preventDefault(); onDrop(col.key); }}
      onDragLeave={onDragLeave}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 4px', marginBottom: 10 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: col.accent,
          boxShadow: `0 0 7px ${col.accent}`, flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
          color: '#ddd8f0', flex: 1, letterSpacing: '-0.2px',
        }}>{col.label}</span>
        <span style={{
          background: 'rgba(80,50,130,0.2)', border: '1px solid rgba(80,50,130,0.25)',
          color: '#6a6080', fontSize: 11, fontWeight: 700,
          padding: '1px 8px', borderRadius: 20,
        }}>{cards.length}</span>
      </div>

      {/* Progress bar */}
      {cards.length > 0 && (
        <div style={{
          height: 2, background: 'rgba(60,40,100,0.3)', borderRadius: 1,
          marginBottom: 10, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: col.accent,
            width: `${col.key === 'done' ? 100 : cards.length > 0 ? done / cards.length * 100 : 0}%`,
            borderRadius: 1, transition: 'width 0.4s', boxShadow: `0 0 5px ${col.accent}`,
          }} />
        </div>
      )}

      {/* Body */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', gap: 8,
        padding: 8, borderRadius: 12, minHeight: 100,
        background: dragOver ? 'rgba(120,80,200,0.06)' : 'rgba(8,5,18,0.4)',
        border: `1px solid ${dragOver ? 'rgba(160,110,220,0.4)' : 'rgba(60,40,100,0.15)'}`,
        transition: 'all 0.2s',
        overflowY: 'auto', maxHeight: 'calc(100vh - 310px)',
      }}>
        {cards.map((f) => (
          <KanbanCard
            key={f.id} feature={f} users={users}
            onOpen={onOpen}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}

        {cards.length === 0 && !adding && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '24px 0', opacity: 0.3,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="#6a6080" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span style={{ fontSize: 11, color: '#4a3860' }}>Aucune tâche</span>
          </div>
        )}

        {adding && (
          <QuickAdd
            colKey={col.key}
            onAdd={(data) => { onQuickAdd(data); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      {/* Add button */}
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          style={{
            marginTop: 8, background: 'none',
            border: '1px dashed rgba(80,50,130,0.25)',
            color: '#4a3860', borderRadius: 8, padding: '7px',
            fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(160,110,220,0.4)'; e.currentTarget.style.color = ACC; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(80,50,130,0.25)'; e.currentTarget.style.color = '#4a3860'; }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Nouvelle tâche
        </button>
      )}
    </div>
  );
}

// ── Filter Panel ─────────────────────────────────────────────────────────────

function FilterPanel({ filters, setFilters, allTags, users }) {
  const toggle = (key, val) => setFilters((f) => ({
    ...f,
    [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val],
  }));

  return (
    <div style={{
      padding: '10px 0 12px', borderBottom: '1px solid rgba(60,40,100,0.15)',
      display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start',
      animation: 'kFadeIn 0.2s ease both',
    }}>
      {/* Tags */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, color: '#4a3860', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', marginRight: 2 }}>Tags</span>
          <button
            onClick={() => setFilters((f) => ({ ...f, tagMode: f.tagMode === 'include' ? 'exclude' : 'include' }))}
            style={{
              background: 'none', border: '1px solid rgba(60,40,100,0.3)', borderRadius: 4,
              padding: '2px 7px', fontSize: 10, color: '#6a6080', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {filters.tagMode === 'include' ? 'inclure' : 'exclure'}
          </button>
          {allTags.map((t) => (
            <button key={t} onClick={() => toggle('tags', t)} style={{
              background: filters.tags.includes(t) ? 'rgba(120,80,200,0.2)' : 'none',
              border: `1px solid ${filters.tags.includes(t) ? 'rgba(160,110,220,0.5)' : 'rgba(60,40,100,0.25)'}`,
              color: filters.tags.includes(t) ? ACC : '#6a6080',
              borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}>#{t}</button>
          ))}
        </div>
      )}

      {/* Priority */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, color: '#4a3860', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', marginRight: 2 }}>Priorité</span>
        {Object.entries(PRIORITIES).map(([k, v]) => (
          <button key={k} onClick={() => toggle('priorities', k)} style={{
            background: filters.priorities.includes(k) ? v.bg : 'none',
            border: `1px solid ${filters.priorities.includes(k) ? v.color + '66' : 'rgba(60,40,100,0.25)'}`,
            color: filters.priorities.includes(k) ? v.color : '#6a6080',
            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}>{v.label}</button>
        ))}
      </div>

      {/* Overdue */}
      <button onClick={() => setFilters((f) => ({ ...f, overdue: !f.overdue }))} style={{
        background: filters.overdue ? 'rgba(255,138,155,0.1)' : 'none',
        border: `1px solid ${filters.overdue ? 'rgba(255,138,155,0.4)' : 'rgba(60,40,100,0.25)'}`,
        color: filters.overdue ? '#ff8a9b' : '#6a6080',
        borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
      }}>En retard</button>

      {/* Reset */}
      {(filters.tags.length + filters.priorities.length + filters.assignees.length + (filters.overdue ? 1 : 0)) > 0 && (
        <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{
          background: 'none', border: 'none', color: '#6a6080',
          fontSize: 12, cursor: 'pointer', textDecoration: 'underline', marginLeft: 'auto',
        }}>Réinitialiser</button>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

function matches(f, filters) {
  if (filters.tags.length > 0) {
    const hasAny = filters.tags.some((t) => (f.tags || []).includes(t));
    if (filters.tagMode === 'include' && !hasAny) return false;
    if (filters.tagMode === 'exclude' && hasAny) return false;
  }
  if (filters.priorities.length > 0 && !filters.priorities.includes(f.priority)) return false;
  if (filters.assignees.length > 0) {
    const key = f.assigneeId ?? null;
    if (!filters.assignees.some((x) => (x ?? null) === key)) return false;
  }
  if (filters.overdue) {
    if (!f.dueDate || f.dueDate >= Date.now() / 1000 || f.status === 'done') return false;
  }
  return true;
}

export function KanbanTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const mobile = useIsMobile(720);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [err, setErr] = useState(null);
  const [dragCard, setDragCard] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [activeCol, setActiveCol] = useState('doing');

  const load = async () => {
    try {
      const [f, u] = await Promise.all([ws.features.list(), api.users()]);
      setItems(f); setUsers(u);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags || []))], [items]);

  const filtered = useMemo(() => items.filter((i) => {
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    return matches(i, filters);
  }), [items, filters, search]);

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.key] = filtered.filter((i) => i.status === c.key);
    return acc;
  }, {});

  const activeFilters = filters.tags.length + filters.priorities.length + filters.assignees.length + (filters.overdue ? 1 : 0) + (search ? 1 : 0);

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e, feature) => {
    setDragCard(feature);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragEnd = useCallback(() => {
    setDragCard(null);
    setDragOver(null);
  }, []);

  const onDrop = useCallback(async (colKey) => {
    if (!dragCard || dragCard.status === colKey) { setDragOver(null); return; }
    const optimistic = items.map((i) => i.id === dragCard.id ? { ...i, status: colKey } : i);
    setItems(optimistic);
    setDragCard(null);
    setDragOver(null);
    try {
      await ws.features.update(dragCard.id, { status: colKey });
    } catch (e) {
      setErr(e.message);
      await load();
    }
  }, [dragCard, items, ws]);

  // ── Quick Add ────────────────────────────────────────────────────────────────
  const onQuickAdd = useCallback(async (data) => {
    try {
      await ws.features.create(data);
      await load();
    } catch (e) { setErr(e.message); }
  }, [ws]);

  return (
    <div>
      <style>{`
        @keyframes kFadeIn { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none} }
        .kb-card-drag { opacity: 0.35; transform: scale(0.97); }
      `}</style>

      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: mobile ? 8 : 10,
        flexWrap: 'wrap', marginBottom: 0, paddingBottom: 14,
        borderBottom: showFilters ? 'none' : '1px solid rgba(60,40,100,0.12)',
      }}>
        {!mobile && (
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700,
            color: '#ede8f8', letterSpacing: '-0.4px', marginRight: 4,
          }}>Kanban</h2>
        )}

        <SprintStats items={items} />

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: mobile ? '1 1 100%' : 'initial', order: mobile ? 1 : 0 }}>
          <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }}
            width="12" height="12" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="#4a3860" strokeWidth="1.3" />
            <line x1="9.5" y1="9.5" x2="12" y2="12" stroke="#4a3860" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              background: 'rgba(14,9,28,0.7)', border: '1px solid rgba(60,40,100,0.25)',
              borderRadius: 8, padding: '7px 11px 7px 28px', color: '#c8c0d8',
              fontSize: 13, outline: 'none',
              width: mobile ? '100%' : 170,
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(160,110,220,0.5)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(60,40,100,0.25)')}
          />
        </div>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{
            background: showFilters || activeFilters > 0 ? 'rgba(120,80,200,0.15)' : 'rgba(14,9,28,0.6)',
            border: `1px solid ${showFilters || activeFilters > 0 ? 'rgba(160,110,220,0.4)' : 'rgba(60,40,100,0.25)'}`,
            color: activeFilters > 0 ? ACC : '#7a6888',
            borderRadius: 8, padding: '6px 13px', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, fontWeight: activeFilters > 0 ? 600 : 400,
            transition: 'all 0.2s',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 3h10M4 7h6M6 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {mobile ? '' : 'Filtres'}
          {activeFilters > 0 && (
            <span style={{
              background: ACC, color: '#08051a', borderRadius: '50%',
              width: 15, height: 15, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 9.5, fontWeight: 800,
            }}>{activeFilters}</span>
          )}
        </button>

        {/* New card */}
        <button
          onClick={() => setEditing({ status: mobile ? activeCol : 'backlog' })}
          style={{
            background: ACC, color: '#08051a', border: 'none', borderRadius: 8,
            padding: '6px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: `0 0 16px rgba(${ACC_RGB},0.25)`, transition: 'box-shadow 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 0 24px rgba(${ACC_RGB},0.45)`)}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 0 16px rgba(${ACC_RGB},0.25)`)}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> {mobile ? '' : 'Nouvelle carte'}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filters={filters} setFilters={setFilters}
          allTags={allTags} users={users}
        />
      )}

      {loading ? (
        <p style={{ ...muted, fontSize: 13, paddingTop: 20 }}>Chargement…</p>
      ) : mobile ? (
        <>
          <div style={{ paddingTop: 14, paddingBottom: 72 }}>
            {(() => {
              const col = COLUMNS.find((c) => c.key === activeCol) || COLUMNS[0];
              return (
                <KanbanColumn
                  key={col.key}
                  col={col}
                  cards={grouped[col.key]}
                  users={users}
                  dragOver={false}
                  onDragOver={() => {}}
                  onDrop={() => {}}
                  onDragLeave={() => {}}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onOpen={setEditing}
                  onQuickAdd={onQuickAdd}
                />
              );
            })()}
          </div>
          <MobileColumnTabs
            columns={COLUMNS}
            activeCol={activeCol}
            onChange={setActiveCol}
            counts={COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: grouped[c.key].length }), {})}
          />
        </>
      ) : (
        <div style={{
          display: 'flex', gap: 14, paddingTop: 18,
          overflowX: 'auto',
        }}>
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              col={col}
              cards={grouped[col.key]}
              users={users}
              dragOver={dragOver === col.key}
              onDragOver={setDragOver}
              onDrop={onDrop}
              onDragLeave={() => setDragOver(null)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onOpen={setEditing}
              onQuickAdd={onQuickAdd}
            />
          ))}
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
    </div>
  );
}

// ── Mobile column switcher (fixed bottom bar) ──────────────────────────────

function MobileColumnTabs({ columns, activeCol, onChange, counts }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: 'rgba(4,3,12,0.97)',
      borderTop: '1px solid rgba(60,40,100,0.25)',
      backdropFilter: 'blur(16px)',
      display: 'flex', height: 60,
      paddingBottom: 'env(safe-area-inset-bottom, 0)',
    }}>
      {columns.map((c) => {
        const active = activeCol === c.key;
        const cnt = counts[c.key] || 0;
        return (
          <button
            key={c.key}
            onClick={() => onChange(c.key)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: 0,
              borderTop: `2px solid ${active ? c.accent : 'transparent'}`,
              transition: 'all 0.15s',
            }}
          >
            <span style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 11,
              fontWeight: active ? 700 : 500,
              color: active ? c.accent : '#6a6080',
            }}>
              {c.label}
            </span>
            {cnt > 0 && (
              <span style={{
                background: active ? c.accent : 'rgba(80,50,130,0.3)',
                color: active ? '#08051a' : '#6a6080',
                borderRadius: 20, fontSize: 9, fontWeight: 800,
                padding: '1px 6px',
              }}>{cnt}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

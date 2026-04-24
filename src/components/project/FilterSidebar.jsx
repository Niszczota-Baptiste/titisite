import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useWorkspace } from '../../hooks/useWorkspace';
import { ACC, ACC_RGB, card, muted, tagColor } from './shared';

/**
 * Left panel on the Kanban: Include/Exclude tag chips, assignee chips,
 * overdue toggle, active-filter counter + reset, plus global tag management
 * (rename / delete across all features of the project).
 *
 * Props:
 *   filters, setFilters      controlled filter state
 *   users                    workspace users (for assignee chips)
 *   counts                   { tags: Map<name, count>, assignees: Map<id|null, count>, overdue: n }
 *   onTagsMutated            callback fired after a rename/delete so parent reloads features
 */
export function FilterSidebar({ filters, setFilters, users, counts, onTagsMutated }) {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const [editing, setEditing] = useState(null); // tag name being renamed
  const [renameDraft, setRenameDraft] = useState('');
  const [err, setErr] = useState(null);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [assigneesOpen, setAssigneesOpen] = useState(true);
  const [manageMode, setManageMode] = useState(false);

  const tagsByName = [...(counts?.tags || new Map()).entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

  const assigneesByUser = [...(counts?.assignees || new Map()).entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  const activeCount =
    filters.tags.length +
    filters.assignees.length +
    (filters.overdue ? 1 : 0);

  const toggleTag = (name) => {
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name],
    }));
  };

  const toggleAssignee = (id) => {
    setFilters((f) => ({
      ...f,
      assignees: f.assignees.some((x) => sameId(x, id))
        ? f.assignees.filter((x) => !sameId(x, id))
        : [...f.assignees, id],
    }));
  };

  const reset = () => setFilters({ tagMode: 'include', tags: [], assignees: [], overdue: false });

  const startRename = (name) => {
    setEditing(name);
    setRenameDraft(name);
    setErr(null);
  };

  const commitRename = async () => {
    const from = editing;
    const to = renameDraft.trim();
    setEditing(null);
    if (!from || !to || to === from) return;
    try {
      await ws.tags.rename(from, to);
      // Keep the filter selection in sync with the new name
      setFilters((f) => ({
        ...f,
        tags: f.tags.map((t) => (t === from ? to : t)),
      }));
      onTagsMutated?.();
    } catch (e) { setErr(humanize(e)); }
  };

  const remove = async (name) => {
    if (!window.confirm(`Supprimer le tag « ${name} » de toutes les cartes de ce projet ?`)) return;
    try {
      await ws.tags.remove(name);
      setFilters((f) => ({ ...f, tags: f.tags.filter((t) => t !== name) }));
      onTagsMutated?.();
    } catch (e) { setErr(humanize(e)); }
  };

  return (
    <aside style={{
      width: 260, flexShrink: 0,
      position: 'sticky', top: 90, alignSelf: 'flex-start',
      maxHeight: 'calc(100vh - 110px)', overflowY: 'auto',
      paddingRight: 8,
    }}>
      <PanelHeader
        title="Filtres"
        count={activeCount}
        action={activeCount > 0 ? { label: 'Réinitialiser', onClick: reset } : null}
      />

      {err && (
        <div style={{
          background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
          borderRadius: 8, padding: '8px 10px', marginBottom: 10, color: '#ff8a9b',
          fontFamily: "'Inter',sans-serif", fontSize: 12,
        }}>
          {err}
        </div>
      )}

      {/* En retard */}
      <Toggle
        checked={filters.overdue}
        onChange={(v) => setFilters((f) => ({ ...f, overdue: v }))}
        count={counts?.overdue || 0}
        emphasis
      >
        ⚠ En retard
      </Toggle>

      {/* Tags */}
      <Collapsible
        title="Tags"
        count={tagsByName.length}
        open={tagsOpen}
        onToggle={() => setTagsOpen((o) => !o)}
        action={tagsByName.length > 0 ? {
          label: manageMode ? 'Terminer' : 'Gérer',
          onClick: () => setManageMode((m) => !m),
        } : null}
      >
        {tagsByName.length > 0 && (
          <div style={{
            display: 'flex', gap: 4, marginBottom: 8,
            background: 'rgba(20,14,38,0.6)',
            borderRadius: 6, padding: 3,
            border: '1px solid rgba(80,50,130,0.24)',
          }}>
            {[
              ['include', 'Include'],
              ['exclude', 'Exclude'],
            ].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilters((f) => ({ ...f, tagMode: v }))}
                style={{
                  flex: 1,
                  background: filters.tagMode === v ? ACC : 'none',
                  color: filters.tagMode === v ? '#08051a' : 'rgba(180,170,200,0.65)',
                  border: 'none', borderRadius: 4,
                  padding: '4px 8px', cursor: 'pointer',
                  fontFamily: "'Inter',sans-serif",
                  fontSize: 11, fontWeight: filters.tagMode === v ? 700 : 500,
                  letterSpacing: '0.3px',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {tagsByName.length === 0 ? (
          <p style={{ ...muted, fontSize: 11.5, padding: '4px 0' }}>
            Aucun tag pour le moment. Ajoutes-en en éditant une carte.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tagsByName.map((tag) => (
              <TagRow
                key={tag.name}
                tag={tag}
                selected={filters.tags.includes(tag.name)}
                onClick={() => !manageMode && toggleTag(tag.name)}
                manageMode={manageMode}
                editing={editing === tag.name}
                renameDraft={renameDraft}
                setRenameDraft={setRenameDraft}
                onStartRename={() => startRename(tag.name)}
                onCommitRename={commitRename}
                onCancelRename={() => setEditing(null)}
                onDelete={() => remove(tag.name)}
              />
            ))}
          </div>
        )}
      </Collapsible>

      {/* Assignees */}
      <Collapsible
        title="Assignés"
        count={assigneesByUser.length}
        open={assigneesOpen}
        onToggle={() => setAssigneesOpen((o) => !o)}
      >
        {assigneesByUser.length === 0 ? (
          <p style={{ ...muted, fontSize: 11.5, padding: '4px 0' }}>
            Aucune carte avec assigné.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {assigneesByUser.map(({ id, count }) => {
              const user = id == null ? null : users.find((u) => u.id === id);
              const label = user ? (user.name || user.email) : '— non assigné —';
              const selected = filters.assignees.some((x) => sameId(x, id));
              return (
                <AssigneeRow
                  key={id ?? 'none'}
                  label={label}
                  count={count}
                  selected={selected}
                  onClick={() => toggleAssignee(id)}
                />
              );
            })}
          </div>
        )}
      </Collapsible>
    </aside>
  );
}

function sameId(a, b) {
  if (a == null && b == null) return true;
  return a === b;
}

function PanelHeader({ title, count, action }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 12,
    }}>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
        color: '#ede8f8', letterSpacing: '-0.2px',
      }}>
        {title} {count > 0 && (
          <span style={{
            marginLeft: 4, fontSize: 10,
            background: `rgba(${ACC_RGB},0.18)`, color: ACC,
            padding: '1px 6px', borderRadius: 20,
          }}>
            {count}
          </span>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: ACC, fontSize: 11, fontFamily: "'Inter',sans-serif",
            padding: 0,
          }}
        >
          {action.label}
        </button>
      )}
    </header>
  );
}

function Collapsible({ title, count, open, onToggle, action, children }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'rgba(180,170,200,0.75)',
            fontFamily: "'Inter',sans-serif", fontSize: 10.5,
            letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700,
          }}
        >
          <span style={{
            display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'none',
            fontSize: 9,
          }}>▶</span>
          {title}
          {count !== undefined && count > 0 && (
            <span style={{ color: 'rgba(180,170,200,0.45)', marginLeft: 4 }}>{count}</span>
          )}
        </button>
        {open && action && (
          <button
            onClick={action.onClick}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: ACC, fontSize: 10.5, fontFamily: "'Inter',sans-serif",
              padding: 0, letterSpacing: '0.3px',
            }}
          >
            {action.label}
          </button>
        )}
      </header>
      {open && <div>{children}</div>}
    </section>
  );
}

function Toggle({ checked, onChange, count, emphasis, children }) {
  const color = emphasis ? '#ff8a9b' : ACC;
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        ...card,
        width: '100%', padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', marginBottom: 14,
        background: checked ? `${color}22` : 'rgba(14,9,28,0.72)',
        borderColor: checked ? `${color}88` : 'rgba(80,50,130,0.24)',
        color: checked ? color : 'rgba(232,228,248,0.85)',
        fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 12, height: 12, borderRadius: 3,
          border: `1.5px solid ${checked ? color : 'rgba(180,170,200,0.4)'}`,
          background: checked ? color : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#08051a', fontSize: 9, fontWeight: 900,
        }}>{checked ? '✓' : ''}</span>
        {children}
      </span>
      {count > 0 && (
        <span style={{
          fontFamily: 'monospace', fontSize: 11,
          color: checked ? color : 'rgba(180,170,200,0.55)',
        }}>{count}</span>
      )}
    </button>
  );
}

function TagRow({
  tag, selected, onClick,
  manageMode, editing, renameDraft, setRenameDraft,
  onStartRename, onCommitRename, onCancelRename, onDelete,
}) {
  const c = tagColor(tag.name);
  const [hover, setHover] = useState(false);

  if (editing) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: 6, borderRadius: 6,
        background: `rgba(${c.rgb},0.08)`,
        border: `1px solid ${c.hex}66`,
      }}>
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={onCommitRename}
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent',
            border: 'none', outline: 'none',
            color: c.hex, fontFamily: "'Inter',sans-serif",
            fontSize: 12, fontWeight: 600, letterSpacing: '0.3px',
          }}
        />
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'stretch',
        borderRadius: 6,
        background: selected ? c.hex : `rgba(${c.rgb},0.14)`,
        color: selected ? '#08051a' : c.hex,
        border: `1px solid ${c.hex}${selected ? 'ff' : '44'}`,
        cursor: manageMode ? 'default' : 'pointer',
        overflow: 'hidden',
        transition: 'all 0.12s',
        fontFamily: "'Inter',sans-serif",
        fontWeight: 600, fontSize: 12,
        boxShadow: selected ? `0 0 8px ${c.hex}66` : 'none',
      }}
    >
      <span style={{
        flex: 1, padding: '5px 10px',
        display: 'flex', alignItems: 'center', gap: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        userSelect: 'none',
      }}>
        {tag.name}
      </span>
      {manageMode ? (
        <span
          style={{
            display: 'flex', alignItems: 'center', gap: 2,
            paddingRight: 4, opacity: hover ? 1 : 0.75,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onStartRename}
            title="Renommer"
            style={mgmtBtn(selected ? '#08051a' : c.hex)}
          >✎</button>
          <button
            type="button"
            onClick={onDelete}
            title="Supprimer"
            style={mgmtBtn(selected ? '#08051a' : c.hex)}
          >×</button>
        </span>
      ) : (
        <span style={{
          display: 'flex', alignItems: 'center',
          padding: '0 9px',
          background: selected ? 'rgba(0,0,0,0.18)' : `${c.hex}22`,
          fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
          minWidth: 32, justifyContent: 'center',
        }}>
          {tag.count}
        </span>
      )}
    </div>
  );
}

const mgmtBtn = (color) => ({
  background: 'transparent', border: 'none', cursor: 'pointer',
  color, opacity: 0.75,
  padding: 0, width: 22, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, lineHeight: 1,
});

function AssigneeRow({ label, count, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderRadius: 6,
        background: selected ? `rgba(${ACC_RGB},0.18)` : 'rgba(20,14,38,0.5)',
        border: `1px solid ${selected ? ACC : 'rgba(80,50,130,0.24)'}`,
        color: selected ? ACC : 'rgba(232,228,248,0.85)',
        cursor: 'pointer',
        fontFamily: "'Inter',sans-serif", fontSize: 12,
      }}
    >
      <span style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: 160, textAlign: 'left',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'monospace', fontSize: 11,
        color: selected ? ACC : 'rgba(180,170,200,0.55)',
        fontWeight: 700,
      }}>
        {count}
      </span>
    </button>
  );
}

const MESSAGES = {
  missing_to: 'Nouveau nom requis.',
};
function humanize(err) {
  const key = err?.body?.error || err?.message;
  return MESSAGES[key] || err?.message || 'Erreur inconnue.';
}

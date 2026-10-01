import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { NOTE_STATUSES, PRIORITIES, noteStatus } from '../kinds';
import { useShellPage } from '../Shell';
import { Btn, Empty, ErrorLine, PromptDialog, TagChip, Tabs, cx, entityPath, humanError, normalizeQuery, relativeTime, useMenu } from '../ui';
import { moveInList, useDnd } from '../useDnd';

// Brainstorming : une inbox pour vider sa tête en quelques secondes, puis un
// Kanban par statut (Idée brute → À développer → À intégrer → Validée /
// Abandonnée) où l'on range les idées en les faisant glisser.

const INBOX = 'inbox';

export function Ideas() {
  const { pid, P, version, bump, tags, setCaptureOpen } = useAuthor();
  const [params, setParams] = useSearchParams();
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [quick, setQuick] = useState('');
  const [addingTo, setAddingTo] = useState(null);
  const [openMenu, menu] = useMenu();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const view = params.get('vue') || 'kanban';
  useShellPage({ crumbs: [{ label: 'Brainstorming' }], title: 'Brainstorming', full: false });

  const load = useCallback(() => P.entities.list({ kind: 'note', sort: 'position', limit: 1000 })
    .then((r) => setNotes(r.items)).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  const categories = useMemo(() => [...new Set((notes || []).map((n) => n.category).filter(Boolean))].sort(), [notes]);
  const visible = useMemo(() => {
    const nq = normalizeQuery(q);
    return (notes || []).filter((n) => (!nq || normalizeQuery(`${n.title} ${n.summary}`).includes(nq))
      && (!category || n.category === category)
      && (!tag || n.tags.some((t) => String(t.id) === tag)));
  }, [notes, q, category, tag]);

  const columns = useMemo(() => {
    const cols = { [INBOX]: [] };
    for (const s of NOTE_STATUSES) cols[s.key] = [];
    for (const n of visible) (n.inbox ? cols[INBOX] : cols[n.status] || cols.brute).push(n);
    for (const k of Object.keys(cols)) cols[k].sort((a, b) => a.position - b.position || b.id - a.id);
    return cols;
  }, [visible]);

  // Déplacer = envoyer l'ordre complet de la colonne cible (statut + rang).
  const moveTo = async (id, to, index) => {
    const status = to === INBOX ? 'brute' : to;
    const inbox = to === INBOX;
    const ids = moveInList(columns[to].map((n) => n.id), id, index);
    setNotes((list) => list.map((n) => {
      if (n.id === id) return { ...n, status, inbox, position: ids.indexOf(id) - 0.5 };
      const i = ids.indexOf(n.id);
      return i >= 0 ? { ...n, position: i } : n;
    }));
    try { await P.notes.order(status, ids, inbox); bump(); } catch (err) { toast.error(humanError(err)); load(); }
  };

  const dnd = useDnd({ onDrop: ({ id, to, index }) => moveTo(id, to, index) });

  const addQuick = async (e) => {
    e.preventDefault();
    if (!quick.trim()) return;
    try { await P.notes.quick(quick.trim()); setQuick(''); bump(); } catch (err) { setError(err); }
  };

  const addIn = async (status, title) => {
    setAddingTo(null);
    try { await P.entities.create({ kind: 'note', title, status, inbox: false }); bump(); } catch (err) { setError(err); }
  };

  const actions = (n) => [
    { label: 'Ouvrir', icon: '↗', onClick: () => navigate(entityPath(pid, n)) },
    ...[{ key: INBOX, label: '📥 Inbox' }, ...NOTE_STATUSES].filter((s) => (s.key === INBOX ? !n.inbox : n.inbox || n.status !== s.key))
      .map((s) => ({ label: `Déplacer vers « ${s.label.replace('📥 ', '')} »`, icon: '→', onClick: () => moveTo(n.id, s.key, 0) })),
    { sep: true },
    { label: 'Mettre à la corbeille', icon: '🗑', danger: true, onClick: async () => {
      if (!(await confirm({ title: 'Mettre l\'idée à la corbeille ?', message: n.title, confirmLabel: 'Mettre à la corbeille', danger: true }))) return;
      await P.entities.remove(n.id); bump();
    } },
  ];

  const setView = (v) => { const p = new URLSearchParams(params); p.set('vue', v); setParams(p, { replace: true }); };

  return (
    <div className="au-page is-wide">
      <div className="au-page-head">
        <div>
          <h1>💡 Brainstorming</h1>
          <div className="au-sub">{notes ? `${notes.length} idée${notes.length > 1 ? 's' : ''} · ${columns[INBOX].length} dans l'inbox` : 'Chargement…'}</div>
        </div>
        <div className="au-actions">
          <Tabs value={view} onChange={setView} options={[['kanban', '▥ Kanban'], ['inbox', `📥 Inbox${columns[INBOX].length ? ` (${columns[INBOX].length})` : ''}`], ['liste', '☰ Liste']]} />
          <Btn variant="primary" className="au-desktop-only" onClick={() => setCaptureOpen(true)}>＋ Idée</Btn>
        </div>
      </div>

      <form className="au-quick" onSubmit={addQuick}>
        <span aria-hidden>⚡</span>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Note éclair : tape et Entrée — elle file dans l'inbox" aria-label="Note éclair" />
        <Btn type="submit" size="small" disabled={!quick.trim()}>Ajouter</Btn>
      </form>

      <div className="au-toolbar">
        <input className="au-input au-grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les idées…" aria-label="Filtrer" />
        {categories.length > 0 && (
          <select className="au-select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie">
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {tags.length > 0 && (
          <select className="au-select" style={{ width: 'auto' }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
            <option value="">Tous les tags</option>
            {tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}
          </select>
        )}
      </div>

      <ErrorLine error={error} onClose={() => setError(null)} />
      {notes && notes.length === 0 && (
        <Empty icon="💡" title="Aucune idée pour l'instant" action={<Btn variant="primary" onClick={() => setCaptureOpen(true)}>Capturer une idée</Btn>}>
          Touche <strong>I</strong> n&apos;importe où pour en noter une en quelques secondes.
        </Empty>
      )}

      {notes && notes.length > 0 && view === 'kanban' && (
        <div className="au-kanban">
          {[{ key: INBOX, label: '📥 Inbox', color: 'var(--au-acc)' }, ...NOTE_STATUSES].map((s) => (
            <section key={s.key} className={cx('au-kcol', s.key === INBOX && 'is-inbox')} style={{ '--col': s.color }} aria-label={s.label}>
              <header className="au-kcol-head">
                <span className="au-dot" style={{ '--dot': s.color }} />
                <span>{s.label}</span>
                <span className="au-faint">{columns[s.key].length}</span>
                {s.key !== INBOX && <button type="button" className="au-btn is-ghost is-small is-icon" style={{ marginLeft: 'auto' }} onClick={() => setAddingTo(s.key)} aria-label={`Ajouter dans ${s.label}`}>＋</button>}
              </header>
              <div className="au-kcol-body" ref={dnd.container(s.key)}>
                {columns[s.key].map((n, i) => (
                  <div key={n.id}>
                    {dnd.marker(s.key, i)}
                    <NoteCard pid={pid} n={n} dnd={dnd} col={s.key} onMenu={(e) => openMenu(e, actions(n))} />
                  </div>
                ))}
                {dnd.marker(s.key, columns[s.key].length)}
                {columns[s.key].length === 0 && <div className="au-kcol-empty">{s.key === INBOX ? 'Inbox vide 🎉' : 'Glisse une idée ici'}</div>}
              </div>
            </section>
          ))}
        </div>
      )}

      {notes && view === 'inbox' && (
        columns[INBOX].length === 0
          ? <Empty icon="🎉" title="Inbox vide">Tout est classé.</Empty>
          : (
            <div className="au-inbox">
              {columns[INBOX].map((n) => (
                <div key={n.id} className="au-card au-inbox-item">
                  <Link to={entityPath(pid, n)} className="au-row-title" style={{ display: 'block', fontSize: 15 }}>{n.title}</Link>
                  {n.summary && n.summary !== n.title && <p className="au-muted" style={{ fontSize: 13, margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}>{n.summary}</p>}
                  <div className="au-inbox-actions">
                    <span className="au-faint" style={{ fontSize: 11.5 }}>{relativeTime(n.createdAt)}</span>
                    {NOTE_STATUSES.slice(0, 4).map((s) => (
                      <button key={s.key} type="button" className="au-chip" style={{ '--chip': s.color }} onClick={() => moveTo(n.id, s.key, 0)}>→ {s.label}</button>
                    ))}
                    <button type="button" className="au-btn is-ghost is-small is-icon" onClick={(e) => openMenu(e, actions(n))} aria-label="Actions">⋯</button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {notes && notes.length > 0 && view === 'liste' && (
        <div className="au-list">
          {[...visible].sort((a, b) => b.updatedAt - a.updatedAt).map((n) => {
            const st = noteStatus(n.status);
            const pr = PRIORITIES.find((p) => p.key === n.priority);
            return (
              <Link key={n.id} to={entityPath(pid, n)} className="au-row">
                <span className="au-dot" style={{ '--dot': n.inbox ? 'var(--au-acc)' : st.color }} />
                <span className="au-row-main">
                  <span className="au-row-title" style={{ display: 'block' }}>{n.title}</span>
                  <span className="au-row-meta" style={{ display: 'block' }}>{n.inbox ? 'Inbox' : st.label}{n.category ? ` · ${n.category}` : ''}{n.summary ? ` — ${n.summary}` : ''}</span>
                </span>
                <span className="au-row-end">
                  {pr?.short && <span className="au-prio" style={{ color: pr.color }}>{pr.short}</span>}
                  <span className="au-faint au-desktop-only" style={{ fontSize: 11.5 }}>{relativeTime(n.updatedAt)}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {menu}
      <PromptDialog open={!!addingTo} title={`Nouvelle idée — ${addingTo ? noteStatus(addingTo).label : ''}`} label="Titre"
        confirmLabel="Ajouter" onClose={() => setAddingTo(null)} onSubmit={(title) => addIn(addingTo, title)} />
    </div>
  );
}

function NoteCard({ pid, n, dnd, col, onMenu }) {
  const navigate = useNavigate();
  const pr = PRIORITIES.find((p) => p.key === n.priority);
  return (
    <article {...dnd.item(n.id, col)} className={cx('au-kcard', dnd.isSource(n.id) && 'is-drag-source')}
      tabIndex={0} role="link" aria-label={n.title}
      onClick={() => navigate(entityPath(pid, n))}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(entityPath(pid, n)); }}
      onContextMenu={onMenu}>
      <div className="au-kcard-top">
        <span className="au-kcard-title">{n.title}</span>
        {pr?.short && <span className="au-prio" style={{ color: pr.color }} title={`Priorité ${pr.label.toLowerCase()}`}>{pr.short}</span>}
        <button type="button" className="au-btn is-ghost is-small is-icon au-kcard-more" onClick={(e) => { e.stopPropagation(); onMenu(e); }} aria-label="Actions">⋯</button>
      </div>
      {n.summary && n.summary !== n.title && <p className="au-kcard-text">{n.summary}</p>}
      {(n.category || n.tags.length > 0 || n.linkCount > 0 || n.noteDate) && (
        <div className="au-kcard-foot">
          {n.category && <span className="au-chip">{n.category}</span>}
          {n.tags.slice(0, 3).map((t) => <TagChip key={t.id} tag={t} />)}
          {n.linkCount > 0 && <span className="au-faint" style={{ fontSize: 11 }}>🔗 {n.linkCount}</span>}
          {n.noteDate && <span className="au-faint" style={{ fontSize: 11, marginLeft: 'auto' }}>{new Date(`${n.noteDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}
        </div>
      )}
    </article>
  );
}

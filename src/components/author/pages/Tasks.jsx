import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { PRIORITIES, kindMeta } from '../kinds';
import { useShellPage } from '../Shell';
import {
  Btn, Dialog, Empty, EntityPicker, ErrorLine, Field, KindAvatar, Tabs, cx, entityPath, humanError, relativeTime,
} from '../ui';
import { moveInList, useDnd } from '../useDnd';

// Tâches d'écriture (« développer Marek », « vérifier la chronologie de
// l'acte 2 »…), éventuellement rattachées à un élément. Ordre libre par
// glisser-déposer.

export function Tasks() {
  const { pid, P, version, bump, search } = useAuthor();
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('open');
  const [title, setTitle] = useState('');
  const [linkTo, setLinkTo] = useState(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null);
  const toast = useToast();
  useShellPage({ crumbs: [{ label: 'Tâches' }], title: 'Tâches' });

  const load = useCallback(() => P.tasks.list().then(setTasks).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  const open = useMemo(() => (tasks || []).filter((t) => !t.done), [tasks]);
  const done = useMemo(() => (tasks || []).filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)), [tasks]);
  const shown = tab === 'open' ? open : done;

  const dnd = useDnd({
    disabled: tab !== 'open',
    onDrop: async ({ id, index }) => {
      const ids = moveInList(open.map((t) => t.id), id, index);
      setTasks((list) => [...ids.map((tid) => list.find((t) => t.id === tid)), ...list.filter((t) => t.done)]);
      try { await P.tasks.order(ids); } catch (err) { toast.error(humanError(err)); load(); }
    },
  });

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await P.tasks.create({ title: title.trim(), entityId: linkTo?.id ?? null });
      setTitle(''); setLinkTo(null); bump(); load();
    } catch (err) { setError(err); }
  };

  const toggle = async (t) => {
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: !t.done, doneAt: Date.now() / 1000 } : x)));
    try { await P.tasks.update(t.id, { done: !t.done }); bump(); } catch (err) { toast.error(humanError(err)); load(); }
  };

  return (
    <div className="au-page is-narrow">
      <div className="au-page-head">
        <div><h1>✅ Tâches</h1><div className="au-sub">{open.length} en cours · {done.length} terminée{done.length > 1 ? 's' : ''}</div></div>
        <div className="au-actions"><Tabs value={tab} onChange={setTab} options={[['open', 'En cours'], ['done', 'Terminées']]} /></div>
      </div>

      <form className="au-card" onSubmit={add} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="au-input" style={{ flex: 1, minWidth: 200 }} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Développer un personnage, corriger un chapitre, vérifier une incohérence…" maxLength={300} aria-label="Nouvelle tâche" />
          <Btn type="submit" variant="primary" disabled={!title.trim()}>Ajouter</Btn>
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          {linkTo ? (
            <>
              <span className="au-faint">Lié à</span><KindAvatar entity={linkTo} /><strong>{linkTo.title}</strong>
              <Btn size="small" variant="ghost" onClick={() => setLinkTo(null)}>Retirer</Btn>
            </>
          ) : <Btn size="small" variant="ghost" onClick={() => setPicking(true)}>🔗 Lier à un élément</Btn>}
        </div>
      </form>

      <ErrorLine error={error} onClose={() => setError(null)} />
      {tasks && shown.length === 0 && (
        <Empty icon={tab === 'open' ? '🌤️' : '📭'} title={tab === 'open' ? 'Rien à faire' : 'Aucune tâche terminée'}>
          {tab === 'open' ? 'Ajoute ce qu\'il reste à approfondir.' : ''}
        </Empty>
      )}
      <div ref={dnd.container('tasks')}>
        {shown.map((t, i) => {
          const pr = PRIORITIES.find((p) => p.key === t.priority);
          const overdue = t.dueDate && !t.done && t.dueDate < new Date().toISOString().slice(0, 10);
          return (
            <div key={t.id}>
              {dnd.marker('tasks', i)}
              <div {...dnd.item(t.id, 'tasks', { handle: true })} className={cx('au-task', t.done && 'is-done', dnd.isSource(t.id) && 'is-drag-source')}>
                {tab === 'open' && <span className="au-drag-handle" data-dnd-handle aria-label="Déplacer">⠿</span>}
                <input type="checkbox" className="au-check" checked={t.done} onChange={() => toggle(t)} aria-label={`Terminer : ${t.title}`} />
                <button type="button" className="au-task-main" onClick={() => setEditing(t)}>
                  <span className="au-task-title">{t.title}</span>
                  <span className="au-row-meta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {t.entity && <span>{kindMeta(t.entity.kind).icon} {t.entity.title}</span>}
                    {t.dueDate && <span style={{ color: overdue ? 'var(--au-danger)' : undefined }}>📅 {new Date(`${t.dueDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}
                    {t.done && t.doneAt && <span>terminée {relativeTime(t.doneAt)}</span>}
                    {t.notes && <span>📝</span>}
                  </span>
                </button>
                {pr?.short && <span className="au-prio" style={{ color: pr.color }}>{pr.short}</span>}
                {t.entity && <Link to={entityPath(pid, t.entity)} className="au-btn is-ghost is-small is-icon" aria-label="Ouvrir l'élément">↗</Link>}
              </div>
            </div>
          );
        })}
        {dnd.marker('tasks', shown.length)}
      </div>

      <Dialog open={picking} onClose={() => setPicking(false)} title="Lier la tâche à…">
        <EntityPicker search={search} onPick={(e) => { setLinkTo(e); setPicking(false); }} />
      </Dialog>
      <TaskDialog task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); bump(); }} />
    </div>
  );
}

function TaskDialog({ task, onClose, onSaved }) {
  const { P, search } = useAuthor();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setForm(task ? { title: task.title, notes: task.notes, dueDate: task.dueDate || '', priority: task.priority, entity: task.entity } : null);
    setError(null);
  }, [task]);
  if (!task || !form) return null;
  const save = async () => {
    try {
      await P.tasks.update(task.id, { title: form.title, notes: form.notes, dueDate: form.dueDate || null, priority: form.priority, entityId: form.entity?.id ?? null });
      onSaved();
    } catch (err) { setError(err); }
  };
  const remove = async () => { await P.tasks.remove(task.id); onSaved(); };
  return (
    <Dialog open onClose={onClose} title="Tâche" width={520}
      footer={<><Btn variant="danger" onClick={remove} style={{ marginRight: 'auto' }}>Supprimer</Btn><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={save}>Enregistrer</Btn></>}>
      <ErrorLine error={error} />
      <Field label="Tâche"><input className="au-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-autofocus /></Field>
      <div className="au-grid2">
        <Field label="Échéance"><input className="au-input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        <Field label="Priorité">
          <select className="au-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea className="au-textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <Field label="Élément lié">
        {form.entity
          ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><KindAvatar entity={form.entity} /><strong>{form.entity.title}</strong><Btn size="small" variant="ghost" onClick={() => setForm({ ...form, entity: null })}>Retirer</Btn></div>
          : <EntityPicker search={search} autoFocus={false} onPick={(e) => setForm((f) => ({ ...f, entity: e }))} />}
      </Field>
    </Dialog>
  );
}

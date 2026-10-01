import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { chapterStatus } from '../kinds';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import {
  Btn, ColorDots, Dialog, EntityPicker, ErrorLine, Field, KindAvatar, PromptDialog, cx, humanError, useMenu,
} from '../ui';
import { useDnd } from '../useDnd';
import { itemKey, usePlan } from '../usePlan';
import { CreateEntityDialog } from './EntityList';

// Plan du livre : une colonne par acte, des cartes de chapitres et de moments
// forts (« événement majeur ») qu'on déplace librement pour réorganiser
// l'histoire. « Hors actes » accueille ce qui n'est pas encore placé.

export function Plan() {
  const { pid, P, bump } = useAuthor();
  const { cols, error, setError, move, moveAct, load } = usePlan();
  const [openMenu, menu] = useMenu();
  const [newAct, setNewAct] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [creating, setCreating] = useState(null);
  const [beat, setBeat] = useState(null); // { actId } ou beat existant
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const dnd = useDnd({ onDrop: ({ id, to, index }) => move(id, to, index) });
  useShellPage({ crumbs: [{ label: 'Plan du livre' }], title: 'Plan du livre' });

  const addAct = async (title) => {
    setNewAct(false);
    try { await P.acts.create({ title }); load(); } catch (err) { setError(err); }
  };
  const renameAct = async (title) => {
    const act = renaming;
    setRenaming(null);
    try { await P.acts.update(act.id, { title }); load(); } catch (err) { setError(err); }
  };

  const actMenu = (col, i, n) => [
    { label: 'Renommer', icon: '✎', onClick: () => setRenaming(col.act) },
    i > 0 && { label: 'Déplacer vers la gauche', icon: '←', onClick: () => moveAct(col.actId, -1) },
    i < n - 1 && { label: 'Déplacer vers la droite', icon: '→', onClick: () => moveAct(col.actId, 1) },
    { sep: true },
    { label: 'Supprimer l\'acte', icon: '🗑', danger: true, onClick: async () => {
      if (!(await confirm({ title: `Supprimer « ${col.act.title} » ?`, message: 'Ses chapitres et moments forts ne sont pas supprimés : ils passent « Hors actes ».', confirmLabel: 'Supprimer l\'acte', danger: true }))) return;
      await P.acts.remove(col.actId); load(); bump();
    } },
  ];

  const itemMenu = (it) => (it.type === 'chapter' ? [
    { label: 'Écrire', icon: '✍️', onClick: () => navigate(`/auteur/${pid}/ecrire/${it.id}`) },
    { label: 'Ouvrir la fiche', icon: '↗', onClick: () => navigate(`/auteur/${pid}/e/${it.id}`) },
  ] : [
    { label: 'Modifier', icon: '✎', onClick: () => setBeat(it) },
    it.eventId && { label: 'Ouvrir l\'événement', icon: '⚡', onClick: () => navigate(`/auteur/${pid}/e/${it.eventId}`) },
    { label: 'Supprimer', icon: '🗑', danger: true, onClick: async () => {
      if (!(await confirm({ title: 'Supprimer ce moment fort ?', message: it.title, confirmLabel: 'Supprimer', danger: true }))) return;
      try { await P.beats.remove(it.id); load(); } catch (err) { toast.error(humanError(err)); }
    } },
  ]);

  const actCols = cols ? cols.filter((c) => c.actId !== null) : [];

  return (
    <div className="au-page is-wide au-plan-page">
      <div className="au-page-head">
        <div>
          <h1>🗂️ Plan du livre</h1>
          <div className="au-sub">Fais glisser les cartes pour réorganiser l&apos;histoire. <Link to={`/auteur/${pid}/chapitres`} style={{ color: 'var(--au-acc)' }}>Liste des chapitres →</Link></div>
        </div>
        <div className="au-actions">
          <Btn onClick={() => setBeat({ actId: actCols[0]?.actId ?? null })}>⚡ Moment fort</Btn>
          <Btn variant="primary" onClick={() => setNewAct(true)}>＋ Acte</Btn>
        </div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />

      {cols && (
        <div className="au-plan">
          {cols.map((col) => {
            const i = actCols.findIndex((c) => c.key === col.key);
            const words = col.items.reduce((a, it) => a + (it.wordCount || 0), 0);
            if (!col.act && col.items.length === 0 && actCols.length > 0) {
              return (
                <section key={col.key} className="au-pcol is-unassigned">
                  <header className="au-pcol-head"><span>Hors actes</span></header>
                  <div className="au-pcol-body" ref={dnd.container(col.key)}>
                    {dnd.marker(col.key, 0)}
                    <div className="au-kcol-empty">Glisse ici ce qui n&apos;a pas encore sa place</div>
                  </div>
                </section>
              );
            }
            return (
              <section key={col.key} className={cx('au-pcol', !col.act && 'is-unassigned')} style={{ '--col': col.act?.color || 'var(--au-faint)' }}>
                <header className="au-pcol-head">
                  <span className="au-dot" style={{ '--dot': col.act?.color || 'var(--au-faint)' }} />
                  <span className="au-pcol-title">{col.act ? col.act.title : (actCols.length ? 'Hors actes' : 'Chapitres')}</span>
                  <span className="au-faint" style={{ fontSize: 11.5 }}>{formatCount(words)} mots</span>
                  {col.act && <button type="button" className="au-btn is-ghost is-small is-icon" onClick={(e) => openMenu(e, actMenu(col, i, actCols.length))} aria-label="Actions de l'acte">⋯</button>}
                </header>
                <div className="au-pcol-body" ref={dnd.container(col.key)}>
                  {col.items.map((it, j) => (
                    <div key={itemKey(it)}>
                      {dnd.marker(col.key, j)}
                      <PlanCard pid={pid} it={it} dnd={dnd} colKey={col.key} onMenu={(e) => openMenu(e, itemMenu(it))} />
                    </div>
                  ))}
                  {dnd.marker(col.key, col.items.length)}
                </div>
                <footer className="au-pcol-foot">
                  <button type="button" className="au-btn is-ghost is-small" onClick={() => setCreating({ actId: col.actId })}>＋ Chapitre</button>
                  <button type="button" className="au-btn is-ghost is-small" onClick={() => setBeat({ actId: col.actId })}>⚡ Moment fort</button>
                </footer>
              </section>
            );
          })}
          <button type="button" className="au-pcol is-add" onClick={() => setNewAct(true)}>＋ Nouvel acte</button>
        </div>
      )}
      {menu}
      <PromptDialog open={newAct} title="Nouvel acte" label="Titre" placeholder={`Acte ${actCols.length + 1}`} initial={`Acte ${actCols.length + 1}`} confirmLabel="Créer" onClose={() => setNewAct(false)} onSubmit={addAct} />
      <PromptDialog open={!!renaming} title="Renommer l'acte" label="Titre" initial={renaming?.title || ''} onClose={() => setRenaming(null)} onSubmit={renameAct} />
      <CreateEntityDialog open={!!creating} kind="chapter" onClose={() => setCreating(null)}
        defaults={creating?.actId ? { actId: creating.actId } : {}} onCreated={() => load()} />
      <BeatDialog beat={beat} acts={actCols.map((c) => c.act)} onClose={() => setBeat(null)} onSaved={() => { setBeat(null); load(); }} />
    </div>
  );
}

function PlanCard({ pid, it, dnd, colKey, onMenu }) {
  const navigate = useNavigate();
  const key = itemKey(it);
  if (it.type === 'beat') {
    return (
      <article {...dnd.item(key, colKey)} className={cx('au-pcard is-beat', dnd.isSource(key) && 'is-drag-source')}
        style={{ '--beat': it.color }} onContextMenu={onMenu} onDoubleClick={onMenu}>
        <div className="au-pcard-top">
          <span className="au-pcard-kicker">⚡ Moment fort</span>
          <button type="button" className="au-btn is-ghost is-small is-icon" onClick={(e) => { e.stopPropagation(); onMenu(e); }} aria-label="Actions">⋯</button>
        </div>
        <div className="au-pcard-title">{it.title}</div>
        {it.summary && <p className="au-pcard-text">{it.summary}</p>}
        {it.eventTitle && <div className="au-faint" style={{ fontSize: 11.5, marginTop: 4 }}>⏳ {it.eventTitle}</div>}
      </article>
    );
  }
  const st = chapterStatus(it.status);
  return (
    <article {...dnd.item(key, colKey)} className={cx('au-pcard', dnd.isSource(key) && 'is-drag-source')} onContextMenu={onMenu}
      onClick={() => navigate(`/auteur/${pid}/e/${it.id}`)} tabIndex={0} role="link" aria-label={`Chapitre ${it.number} — ${it.title}`}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/auteur/${pid}/e/${it.id}`); }}>
      <div className="au-pcard-top">
        <span className="au-pcard-kicker">Chapitre {it.number}</span>
        <span className="au-pill" style={{ '--pill': st.color }}>{st.label}</span>
        <button type="button" className="au-btn is-ghost is-small is-icon" onClick={(e) => { e.stopPropagation(); onMenu(e); }} aria-label="Actions">⋯</button>
      </div>
      <div className="au-pcard-title">{it.title}</div>
      {it.summary && <p className="au-pcard-text">{it.summary}</p>}
      <div className="au-faint" style={{ fontSize: 11.5, marginTop: 6 }}>{formatCount(it.wordCount)} mots{it.targetWords ? ` / ${formatCount(it.targetWords)}` : ''}</div>
    </article>
  );
}

function BeatDialog({ beat, acts, onClose, onSaved }) {
  const { P, search } = useAuthor();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!beat) { setForm(null); return; }
    setForm({
      title: beat.title || '', summary: beat.summary || '', color: beat.color || '#e8c86a',
      actId: beat.actId ?? null, event: beat.eventId ? { id: beat.eventId, title: beat.eventTitle, kind: 'event' } : null,
    });
    setError(null);
  }, [beat]);
  const open = !!beat;
  if (!open || !form) return null;
  const save = async () => {
    if (!form.title.trim()) return;
    const body = { title: form.title.trim(), summary: form.summary, color: form.color, eventId: form.event?.id ?? null, actId: form.actId };
    try {
      if (beat.id) await P.beats.update(beat.id, body); else await P.beats.create(body);
      onSaved();
    } catch (err) { setError(err); }
  };
  return (
    <Dialog open onClose={onClose} title={beat.id ? 'Moment fort' : 'Nouveau moment fort'} width={540}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={save} disabled={!form.title.trim()}>Enregistrer</Btn></>}>
      <ErrorLine error={error} />
      <Field label="Titre"><input className="au-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-autofocus placeholder="L'incendie du port" /></Field>
      <Field label="Ce qui se passe"><textarea className="au-textarea" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
      <Field label="Acte">
        <select className="au-select" value={form.actId ?? ''} onChange={(e) => setForm({ ...form, actId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Hors actes</option>
          {acts.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </Field>
      <Field label="Couleur"><ColorDots value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      <Field label="Événement de la chronologie (facultatif)">
        {form.event ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KindAvatar entity={form.event} /><span className="au-row-title">{form.event.title}</span>
            <Btn size="small" variant="ghost" onClick={() => setForm({ ...form, event: null })}>Retirer</Btn>
          </div>
        ) : <EntityPicker search={search} kinds={['event']} autoFocus={false} onPick={(ev) => setForm((f) => ({ ...f, event: ev }))} placeholder="Lier un événement…" />}
      </Field>
    </Dialog>
  );
}

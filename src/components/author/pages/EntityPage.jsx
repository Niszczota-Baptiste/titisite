import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { CommentsThread } from '../comments/CommentsThread';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { FieldInput } from '../fields';
import { KINDS, KIND_ORDER, chapterStatus, kindMeta } from '../kinds';
import { MediaPanel } from '../MediaPanel';
import { PlaceMap } from '../PlaceMap';
import { RelationsPanel } from '../RelationsPanel';
import { ChapterPublish } from '../sharing';
import { BackupBanner, ConflictDialog, RevisionsDialog } from '../saving';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import {
  Btn, Dialog, Empty, ErrorLine, Field, KindAvatar, ProgressBar, Section, TagInput, cx, entityPath, humanError,
  relativeTime, useMenu,
} from '../ui';
import { useEntityDoc } from '../useEntityDoc';

// Fiche d'un élément, quel que soit son type : les sections viennent du
// registre kinds.js, le reste (relations, tags, alias, médias, tâches,
// tableaux, historique) est commun. Tout s'enregistre seul.

export function EntityPage() {
  const { id } = useParams();
  const entityId = Number(id);
  const { pid, P, tags, bump, categories, timelines } = useAuthor();
  const doc = useEntityDoc(entityId);
  const { doc: e, status, error } = doc;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [openMenu, menu] = useMenu();
  const [history, setHistory] = useState(false);
  const [convert, setConvert] = useState(false);
  const meta = kindMeta(e?.kind);
  const listRoute = e?.kind === 'note' ? 'idees' : e?.kind === 'event' ? 'chronologie' : meta.route;

  useShellPage({
    crumbs: e ? [{ label: meta.plural, to: `/auteur/${pid}/${listRoute}` }, { label: e.title || 'Sans titre' }] : [{ label: '…' }],
    title: e?.title,
  });

  if (!e) {
    if (status === 'error') {
      return (
        <div className="au-page is-narrow">
          <Empty icon="🫥" title={error?.status === 404 ? 'Élément introuvable' : 'Chargement impossible'}
            action={<Link className="au-btn" to={`/auteur/${pid}/reglages#corbeille`}>Voir la corbeille</Link>}>
            {error?.status === 404 ? 'Il a peut-être été mis à la corbeille.' : humanError(error)}
          </Empty>
        </div>
      );
    }
    return <div className="au-page"><p className="au-muted">Chargement…</p></div>;
  }

  const reloadEntity = () => doc.refresh();
  const cat = categories.find((c) => c.id === e.categoryId);
  const tl = timelines.find((t) => t.id === e.timelineId);

  const trash = async () => {
    if (!(await confirm({ title: 'Mettre à la corbeille ?', message: `« ${e.title} » et ses relations seront masqués ; tout reste restaurable depuis Réglages → Corbeille.`, confirmLabel: 'Mettre à la corbeille', danger: true }))) return;
    try {
      await doc.save();
      await P.entities.remove(e.id);
      bump();
      toast.success('Mis à la corbeille');
      navigate(`/auteur/${pid}/${listRoute}`);
    } catch (err) { toast.error(humanError(err)); }
  };

  const toggleFav = async () => {
    await P.entities.favorite(e.id, !e.isFavorite);
    doc.setBase({ ...doc.base, isFavorite: !e.isFavorite });
    bump();
  };

  const menuItems = [
    e.kind === 'chapter' && { label: 'Écrire ce chapitre', icon: '✍️', onClick: () => navigate(`/auteur/${pid}/ecrire/${e.id}`) },
    e.kind === 'event' && { label: 'Voir sur la chronologie', icon: '⏳', onClick: () => navigate(`/auteur/${pid}/chronologie?focus=${e.id}`) },
    { label: 'Voir dans le graphe', icon: '🕸️', onClick: () => navigate(`/auteur/${pid}/graphe?focus=${e.id}`) },
    { label: 'Historique du texte', icon: '🕘', onClick: async () => { await doc.save(); setHistory(true); } },
    e.kind === 'note' && { label: 'Transformer en fiche…', icon: '✨', onClick: () => setConvert(true) },
    { label: e.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: '⭐', onClick: toggleFav },
    { sep: true },
    { label: 'Mettre à la corbeille', icon: '🗑', danger: true, onClick: trash },
  ];

  return (
    <div className="au-page is-wide au-entity">
      <BackupBanner backup={doc.backup} onRestore={doc.restoreBackup} onDiscard={doc.discardBackup} />
      <ConflictDialog doc={e} conflict={doc.conflict} onResolve={doc.resolveConflict} />
      {status === 'error' && <ErrorLine error={error} />}

      <header className="au-entity-head">
        <KindAvatar entity={e} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="au-entity-kind">
            <span style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
            {e.kind === 'chapter' && e.number && <span>· Chapitre {e.number}{e.actTitle ? ` — ${e.actTitle}` : ''}</span>}
            {cat && <span>· {cat.icon} {cat.name}</span>}
            {tl && <span>· {tl.name}{e.dateLabel ? ` — ${e.dateLabel}` : ''}</span>}
            <span className="au-faint">· modifié {relativeTime(e.updatedAt)}</span>
          </div>
          <FieldInput def={{ key: 'title', label: 'Titre', type: 'text', big: true }} doc={e} setField={doc.setField} />
        </div>
        <div className="au-entity-actions">
          <Btn variant="ghost" icon on={e.isFavorite} onClick={toggleFav} title={e.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={e.isFavorite}>{e.isFavorite ? '★' : '☆'}</Btn>
          {e.kind === 'chapter' && <Btn variant="primary" onClick={() => navigate(`/auteur/${pid}/ecrire/${e.id}`)}>✍️ Écrire</Btn>}
          <Btn variant="ghost" icon onClick={(ev) => openMenu(ev, menuItems)} aria-label="Plus d'actions">⋯</Btn>
        </div>
      </header>

      {e.kind === 'chapter' && <ChapterStrip e={e} />}
      {e.kind === 'chapter' && (
        <div className="au-card" style={{ marginBottom: 18 }}>
          <ChapterPublish ch={e} beforeAction={doc.save} onChange={() => doc.refresh()} />
        </div>
      )}

      <div className="au-entity-grid">
        <div className="au-entity-main">
          {meta.sections.map((s, si) => {
            const fields = s.fields.filter((f) => !(si === 0 && f.key === 'title'));
            if (!fields.length) return null;
            return (
              <Section key={s.id} id={`${e.kind}:${s.id}`} title={s.title}>
                <div className="au-grid2">
                  {fields.map((f) => (
                    <div key={f.key} className={cx('au-field', !f.half && 'is-full')}>
                      <label className="au-field-label" htmlFor={`f-${f.key}`}>{f.label}</label>
                      <FieldInput def={f} doc={e} setField={doc.setField} />
                      {f.hint && <div className="au-field-hint">{f.hint}</div>}
                    </div>
                  ))}
                </div>
              </Section>
            );
          })}
          {e.kind === 'place' && (
            <div className="au-card" style={{ marginBottom: 18 }}><PlaceMap place={e} onChanged={reloadEntity} /></div>
          )}
        </div>

        <aside className="au-entity-side">
          <div className="au-card"><RelationsPanel entity={e} onChanged={reloadEntity} /></div>

          <div className="au-card">
            <div className="au-card-title">🏷️ Classement</div>
            <Field label="Tags">
              <TagInput value={e.tags} onChange={(names) => doc.setField('tags', names)} allTags={tags} />
            </Field>
            <AliasesEditor value={e.aliases} onChange={(list) => doc.setField('aliases', list)} kind={e.kind} />
          </div>

          <div className="au-card"><MediaPanel entity={e} onChanged={reloadEntity} /></div>

          <TasksCard entity={e} onChanged={reloadEntity} />

          {e.kind !== 'note' && <div className="au-card"><CommentsThread entityId={e.id} /></div>}

          {e.boards.length > 0 && (
            <div className="au-card">
              <div className="au-card-title">🧩 Sur les tableaux</div>
              {e.boards.map((b) => <Link key={b.id} className="au-row" to={`/auteur/${pid}/tableaux/${b.id}`}>🧩 {b.title}</Link>)}
            </div>
          )}
        </aside>
      </div>

      {menu}
      <RevisionsDialog open={history} onClose={() => setHistory(false)} entity={e} field="body" current={e.body}
        onRestored={() => doc.reload()} />
      {convert && <ConvertNoteDialog note={e} onClose={() => setConvert(false)} onDone={(created) => { setConvert(false); doc.setField('status', 'a_integrer'); navigate(entityPath(pid, created)); }} />}
    </div>
  );
}

function ChapterStrip({ e }) {
  const st = chapterStatus(e.status);
  const target = e.targetWords || 0;
  return (
    <div className="au-card au-chapter-strip">
      <span className="au-pill" style={{ '--pill': st.color }}>{st.label}</span>
      <span><strong>{formatCount(e.wordCount)}</strong> mots</span>
      <span className="au-muted">{formatCount(e.charCount)} signes</span>
      {target > 0 && (
        <span style={{ flex: 1, minWidth: 160 }}>
          <ProgressBar value={e.wordCount / target} title={`${Math.round((e.wordCount / target) * 100)} % de l'objectif`} />
          <span className="au-faint" style={{ fontSize: 11 }}>objectif {formatCount(target)} mots</span>
        </span>
      )}
      {e.contentUpdatedAt && <span className="au-faint" style={{ fontSize: 12 }}>texte modifié {relativeTime(e.contentUpdatedAt)}</span>}
    </div>
  );
}

function AliasesEditor({ value = [], onChange, kind }) {
  const [text, setText] = useState('');
  const add = (aliasKind) => {
    const a = text.trim();
    if (!a) return;
    onChange([...value, { alias: a, kind: aliasKind, note: '' }]);
    setText('');
  };
  const useful = ['character', 'place', 'lore'].includes(kind);
  return (
    <Field label="Autres noms" hint={useful ? 'Un « ancien nom » est signalé par la cohérence s\'il traîne encore dans un chapitre.' : undefined}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
        {value.map((a, i) => (
          <span key={`${a.alias}-${i}`} className="au-chip" title={a.kind === 'ancien_nom' ? 'Ancien nom' : 'Alias'}>
            {a.kind === 'ancien_nom' ? '⌛ ' : ''}{a.alias}
            <button type="button" aria-label={`Retirer ${a.alias}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        {value.length === 0 && <span className="au-faint" style={{ fontSize: 12.5 }}>Aucun.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="au-input" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Surnom, alias…" maxLength={200}
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add('alias'); } }} />
        <Btn size="small" onClick={() => add('alias')} disabled={!text.trim()}>Alias</Btn>
        <Btn size="small" variant="ghost" onClick={() => add('ancien_nom')} disabled={!text.trim()} title="Nom abandonné (renommage)">Ancien nom</Btn>
      </div>
    </Field>
  );
}

function TasksCard({ entity, onChanged }) {
  const { P, bump } = useAuthor();
  const [title, setTitle] = useState('');
  const add = async () => {
    if (!title.trim()) return;
    await P.tasks.create({ title: title.trim(), entityId: entity.id });
    setTitle('');
    bump();
    onChanged();
  };
  const toggle = async (t) => { await P.tasks.update(t.id, { done: !t.done }); bump(); onChanged(); };
  return (
    <div className="au-card">
      <div className="au-card-title">✅ Tâches liées</div>
      {entity.tasks.map((t) => (
        <label key={t.id} className="au-row" style={{ cursor: 'pointer', minHeight: 38 }}>
          <input type="checkbox" className="au-check" checked={t.done} onChange={() => toggle(t)} />
          <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--au-faint)' : undefined }}>{t.title}</span>
        </label>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input className="au-input" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="Développer, vérifier, corriger…"
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } }} maxLength={300} />
        <Btn size="small" onClick={add} disabled={!title.trim()}>＋</Btn>
      </div>
    </div>
  );
}

// Brainstorming → univers : une idée mûre devient une vraie fiche (personnage,
// lieu, lore…), reliée à l'idée d'origine ; l'idée passe « À intégrer ».
function ConvertNoteDialog({ note, onClose, onDone }) {
  const { P, createEntity } = useAuthor();
  const [kind, setKind] = useState('character');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const created = await createEntity(kind, {
        title: note.title, summary: (note.body || '').slice(0, 300), body: note.body || '',
        tags: (note.tags || []).map((t) => t.name),
      });
      await P.links.create({ fromId: note.id, toId: created.id, kind: 'lie_a', label: 'Idée d\'origine' });
      onDone(created);
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="✨ Transformer l'idée en fiche" width={480}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={go} disabled={busy}>Créer la fiche</Btn></>}>
      <ErrorLine error={error} />
      <p className="au-muted" style={{ marginBottom: 12, fontSize: 13 }}>Une fiche est créée avec le titre et le texte de l&apos;idée, puis reliée à elle. L&apos;idée reste dans le brainstorming (statut « À intégrer »).</p>
      <div className="au-kind-pick">
        {KIND_ORDER.filter((k) => k !== 'note').map((k) => (
          <button key={k} type="button" className={cx('au-chip', kind === k && 'is-sel')} onClick={() => setKind(k)}>{KINDS[k].icon} {KINDS[k].label}</button>
        ))}
      </div>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import {
  KINDS, LINK_SECTIONS, RELATION_GROUPS, defaultRelation, kindMeta, relationOptions, resolveRelationChoice,
} from './kinds';
import {
  Btn, Dialog, EntityPicker, ErrorLine, Field, KindAvatar, Pill, entityPath, humanError, useMenu,
} from './ui';

// Relations d'un élément, lues dans les deux sens et regroupées par type de
// l'élément relié : « Personnages », « Factions & lore », « Lieux »… C'est la
// vue « tout ce qui touche à X » du cahier des charges.

export function RelationsPanel({ entity, onChanged, compact = false }) {
  const { pid, P, bump } = useAuthor();
  const [adding, setAdding] = useState(null); // { kinds?: [...] }
  const [editing, setEditing] = useState(null);
  const [openMenu, menu] = useMenu();
  const confirm = useConfirm();
  const toast = useToast();

  const groups = useMemo(() => LINK_SECTIONS.map((s) => ({
    ...s,
    links: entity.links.filter((l) => l.other.kind === s.kind)
      .sort((a, b) => (a.other.number ?? 0) - (b.other.number ?? 0) || a.other.title.localeCompare(b.other.title)),
  })), [entity.links]);

  const remove = async (l) => {
    if (!(await confirm({ title: 'Supprimer la relation ?', message: `${l.label} — ${l.other.title}`, confirmLabel: 'Supprimer', danger: true }))) return;
    try { await P.links.remove(l.id); bump(); onChanged?.(); } catch (err) { toast.error(humanError(err)); }
  };

  const total = entity.links.length;
  return (
    <div className="au-relations">
      <div className="au-card-title">
        🔗 Relations <span className="au-faint" style={{ fontWeight: 500 }}>{total}</span>
        <span className="au-actions">
          <Link to={`/auteur/${pid}/graphe?focus=${entity.id}`} className="au-btn is-ghost is-small" title="Voir dans le graphe">🕸️</Link>
          <Btn size="small" variant="primary" onClick={() => setAdding({})}>＋ Relier</Btn>
        </span>
      </div>
      {total === 0 && (
        <p className="au-muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Aucune relation. Relie cet élément à un personnage, un lieu, une faction, un chapitre…
        </p>
      )}
      {groups.map((g) => (g.links.length > 0 ? (
        <div key={g.kind} className="au-rel-group">
          <div className="au-rel-head">
            <span>{KINDS[g.kind].icon} {g.title}</span>
            <button type="button" className="au-btn is-ghost is-small" onClick={() => setAdding({ kinds: [g.kind] })} aria-label={`Relier : ${g.title}`}>＋</button>
          </div>
          {g.links.map((l) => (
            <div key={l.id} className="au-rel-row" onContextMenu={(e) => openMenu(e, [
              { label: 'Modifier le libellé / la note', icon: '✎', onClick: () => setEditing(l) },
              { label: 'Supprimer la relation', icon: '✕', danger: true, onClick: () => remove(l) },
            ])}>
              <Link to={entityPath(pid, l.other)} className="au-rel-link">
                <KindAvatar entity={l.other} />
                <span style={{ minWidth: 0 }}>
                  <span className="au-row-title" style={{ display: 'block' }}>{l.other.number ? `${l.other.number}. ` : ''}{l.other.title}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Pill color={kindMeta(l.other.kind).color}>{l.label}</Pill>
                    {l.note && <span className="au-row-meta" title={l.note}>{l.note}</span>}
                  </span>
                </span>
              </Link>
              <button type="button" className="au-btn is-ghost is-small is-icon" aria-label="Actions de la relation"
                onClick={(e) => openMenu(e, [
                  { label: 'Modifier le libellé / la note', icon: '✎', onClick: () => setEditing(l) },
                  { label: 'Supprimer la relation', icon: '✕', danger: true, onClick: () => remove(l) },
                ])}>⋯</button>
            </div>
          ))}
        </div>
      ) : null))}
      {!compact && total === 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LINK_SECTIONS.filter((s) => s.kind !== 'note').map((s) => (
            <button key={s.kind} type="button" className="au-chip" onClick={() => setAdding({ kinds: [s.kind] })}>＋ {KINDS[s.kind].icon} {KINDS[s.kind].label}</button>
          ))}
        </div>
      )}
      {menu}
      <AddRelationDialog open={!!adding} kinds={adding?.kinds} entity={entity} onClose={() => setAdding(null)} onDone={() => { setAdding(null); onChanged?.(); }} />
      <EditRelationDialog link={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged?.(); }} />
    </div>
  );
}

export function RelationSelect({ value, onChange }) {
  const options = relationOptions();
  return (
    <select className="au-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Type de relation">
      {RELATION_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function AddRelationDialog({ open, kinds, entity, onClose, onDone }) {
  const { P, search, createEntity, bump } = useAuthor();
  const [target, setTarget] = useState(null);
  const [choice, setChoice] = useState('lie_a');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setTarget(null); setLabel(''); setNote(''); setError(null); } }, [open]);

  const pick = (t) => {
    setTarget(t);
    setChoice(defaultRelation(entity.kind, t.kind));
  };
  const create = async (kind, title) => {
    try { pick(await createEntity(kind, { title })); } catch (err) { setError(err); }
  };
  const submit = async () => {
    if (!target || busy) return;
    const { kind, reversed } = resolveRelationChoice(choice);
    setBusy(true);
    try {
      await P.links.create({
        fromId: reversed ? target.id : entity.id, toId: reversed ? entity.id : target.id,
        kind, label: label.trim(), note: note.trim(),
      });
      bump();
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Relier « ${entity.title} »`} width={560}
      footer={target ? (
        <>
          <Btn variant="ghost" onClick={() => setTarget(null)}>← Changer</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>Relier</Btn>
        </>
      ) : null}>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {!target ? (
        <EntityPicker search={search} kinds={kinds} exclude={[entity.id]} onPick={pick} onCreate={create}
          placeholder={kinds?.length === 1 ? `Chercher : ${KINDS[kinds[0]].plural.toLowerCase()}…` : 'Chercher un élément à relier…'} />
      ) : (
        <>
          <div className="au-rel-preview">
            <KindAvatar entity={entity} /><span className="au-row-title">{entity.title}</span>
            <span className="au-faint">→</span>
            <KindAvatar entity={target} /><span className="au-row-title">{target.title}</span>
          </div>
          <Field label="Relation">
            <RelationSelect value={choice} onChange={setChoice} />
          </Field>
          <Field label="Libellé personnalisé (facultatif)" hint="Remplace l'intitulé affiché : « demi-sœur », « ancien maître »…">
            <input className="au-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Note (facultatif)">
            <textarea className="au-textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
    </Dialog>
  );
}

function EditRelationDialog({ link, onClose, onDone }) {
  const { P, bump } = useAuthor();
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { if (link) { setLabel(link.customLabel || ''); setNote(link.note || ''); setError(null); } }, [link]);
  if (!link) return null;
  const save = async () => {
    try { await P.links.update(link.id, { label: label.trim(), note: note.trim() }); bump(); onDone(); } catch (err) { setError(err); }
  };
  return (
    <Dialog open onClose={onClose} title={`Relation — ${link.other.title}`} width={480}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={save}>Enregistrer</Btn></>}>
      <ErrorLine error={error} />
      <Field label="Libellé personnalisé" hint={`Vide = « ${link.label} »`}>
        <input className="au-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} data-autofocus />
      </Field>
      <Field label="Note">
        <textarea className="au-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Dialog>
  );
}

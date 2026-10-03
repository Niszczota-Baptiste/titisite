import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { CHAPTER_STATUSES, chapterStatus } from '../kinds';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import { Btn, Empty, ErrorLine, ProgressBar, cx, humanError, relativeTime, useMenu } from '../ui';
import { useDnd } from '../useDnd';
import { itemKey, usePlan } from '../usePlan';
import { CreateEntityDialog } from './EntityList';

// Liste des chapitres dans l'ordre du livre, regroupés par acte. On les
// réordonne par glisser-déposer (poignée ⠿) ; le numéro suit l'ordre.

export function Chapters() {
  const { pid, P, bump } = useAuthor();
  const { cols, error, setError, move, load } = usePlan();
  const [creating, setCreating] = useState(null); // { actId }
  const [filter, setFilter] = useState('');
  const [openMenu, menu] = useMenu();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const dnd = useDnd({ onDrop: ({ id, to, index }) => move(id, to, index), disabled: !!filter });
  useShellPage({ crumbs: [{ label: 'Chapitres' }], title: 'Chapitres' });

  const stats = useMemo(() => {
    const all = (cols || []).flatMap((c) => c.items.filter((i) => i.type === 'chapter'));
    return { count: all.length, words: all.reduce((a, c) => a + (c.wordCount || 0), 0) };
  }, [cols]);
  const hasActs = cols?.some((c) => c.actId !== null);

  const setStatus = async (ch, status) => {
    try {
      await P.entities.update(ch.id, { revision: ch.revision, status });
      if (ch.validatedAt && status !== 'termine') toast.info('Chapitre retiré des lecteurs : il n\'est plus « Terminé ».');
      bump();
    } catch (err) {
      toast.error(err.status === 409 ? 'Ce chapitre a été modifié ailleurs — rechargé.' : humanError(err));
      load();
    }
  };

  const validate = async (ch, value) => {
    try {
      await P.entities.validate(ch.id, value);
      toast.success(value ? 'Chapitre ouvert aux lecteurs' : 'Chapitre retiré des lecteurs');
      bump();
    } catch (err) { toast.error(humanError(err)); }
  };

  const actions = (ch, col) => [
    { label: 'Écrire', icon: '✍️', onClick: () => navigate(`/auteur/${pid}/ecrire/${ch.id}`) },
    { label: 'Ouvrir la fiche', icon: '↗', onClick: () => navigate(`/auteur/${pid}/e/${ch.id}`) },
    ch.status === 'termine' && (ch.validatedAt
      ? { label: 'Retirer des lecteurs', icon: '📕', onClick: () => validate(ch, false) }
      : { label: 'Valider pour les lecteurs', icon: '📖', onClick: () => validate(ch, true) }),
    { sep: true },
    ...CHAPTER_STATUSES.filter((s) => s.key !== ch.status).map((s) => ({ label: `Statut : ${s.label}`, icon: '●', onClick: () => setStatus(ch, s.key) })),
    { sep: true },
    ...(cols || []).filter((c) => c.key !== col.key).map((c) => ({ label: `Déplacer vers « ${c.act ? c.act.title : 'Hors actes'} »`, icon: '→', onClick: () => move(itemKey(ch), c.key, c.items.length) })),
    { sep: true },
    { label: 'Mettre à la corbeille', icon: '🗑', danger: true, onClick: async () => {
      if (!(await confirm({ title: 'Mettre le chapitre à la corbeille ?', message: `« ${ch.title} » (texte compris) reste restaurable depuis Réglages.`, confirmLabel: 'Mettre à la corbeille', danger: true }))) return;
      await P.entities.remove(ch.id); bump();
    } },
  ];

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div>
          <h1>📖 Chapitres</h1>
          <div className="au-sub">{stats.count} chapitre{stats.count > 1 ? 's' : ''} · {formatCount(stats.words)} mots · <Link to={`/auteur/${pid}/plan`} style={{ color: 'var(--au-acc)' }}>vue Plan →</Link></div>
        </div>
        <div className="au-actions">
          <Btn variant="primary" onClick={() => setCreating({ actId: null })}>＋ Nouveau chapitre</Btn>
        </div>
      </div>

      <div className="au-chips-row">
        <button type="button" className={cx('au-chip', !filter && 'is-sel')} onClick={() => setFilter('')}>Tous</button>
        {CHAPTER_STATUSES.map((s) => (
          <button key={s.key} type="button" className={cx('au-chip', filter === s.key && 'is-sel')} onClick={() => setFilter(filter === s.key ? '' : s.key)}>
            <span className="au-dot" style={{ '--dot': s.color }} /> {s.label}
          </button>
        ))}
        {filter && <span className="au-faint" style={{ fontSize: 12 }}>(réordonner désactivé pendant le filtre)</span>}
      </div>

      <ErrorLine error={error} onClose={() => setError(null)} />
      {cols && stats.count === 0 && !cols.some((c) => c.items.length) && (
        <Empty icon="📖" title="Aucun chapitre" action={<Btn variant="primary" onClick={() => setCreating({ actId: null })}>＋ Premier chapitre</Btn>}>
          Les chapitres se rangent ensuite par actes dans la vue Plan.
        </Empty>
      )}

      {cols && cols.map((col) => {
        const items = filter ? col.items.filter((i) => i.type === 'chapter' && i.status === filter) : col.items;
        if (!col.act && col.items.length === 0 && hasActs) return null;
        if (col.act === null && !hasActs && col.items.length === 0) return null;
        const words = col.items.reduce((a, i) => a + (i.wordCount || 0), 0);
        return (
          <section key={col.key} className="au-chgroup">
            {(hasActs || col.act) && (
              <header className="au-chgroup-head">
                <span className="au-dot" style={{ '--dot': col.act?.color || 'var(--au-faint)' }} />
                <h2>{col.act ? col.act.title : 'Hors actes'}</h2>
                <span className="au-faint">{col.items.filter((i) => i.type === 'chapter').length} ch. · {formatCount(words)} mots</span>
                <Btn size="small" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => setCreating({ actId: col.actId })}>＋ Chapitre</Btn>
              </header>
            )}
            <div ref={dnd.container(col.key)} className="au-chlist">
              {items.map((it, i) => (
                <div key={itemKey(it)}>
                  {dnd.marker(col.key, i)}
                  {it.type === 'beat'
                    ? <div {...dnd.item(itemKey(it), col.key, { handle: true })} className={cx('au-beat-row', dnd.isSource(itemKey(it)) && 'is-drag-source')}>
                      <span className="au-drag-handle" data-dnd-handle aria-label="Déplacer">⠿</span>⚡ {it.title}
                    </div>
                    : <ChapterRow pid={pid} ch={it} dnd={dnd} colKey={col.key} onStatus={(s) => setStatus(it, s)} onMenu={(e) => openMenu(e, actions(it, col))} />}
                </div>
              ))}
              {dnd.marker(col.key, items.length)}
              {items.length === 0 && <div className="au-kcol-empty">{filter ? 'Aucun chapitre à ce statut.' : 'Glisse un chapitre ici'}</div>}
            </div>
          </section>
        );
      })}
      {menu}
      <CreateEntityDialog open={!!creating} kind="chapter" onClose={() => setCreating(null)}
        defaults={creating?.actId ? { actId: creating.actId } : {}}
        onCreated={(e) => navigate(`/auteur/${pid}/ecrire/${e.id}`)} />
    </div>
  );
}

function ChapterRow({ pid, ch, dnd, colKey, onStatus, onMenu }) {
  const st = chapterStatus(ch.status);
  const key = itemKey(ch);
  return (
    <div {...dnd.item(key, colKey, { handle: true })} className={cx('au-chrow', dnd.isSource(key) && 'is-drag-source')} onContextMenu={onMenu}>
      <span className="au-drag-handle" data-dnd-handle aria-label="Déplacer (glisser)" title="Glisser pour réordonner">⠿</span>
      <span className="au-chnum">{ch.number}</span>
      <Link to={`/auteur/${pid}/e/${ch.id}`} className="au-chmain">
        <span className="au-row-title" style={{ display: 'block' }}>
          {ch.title}
          {ch.validatedAt && <span className="au-validated" title="Validé : visible par les lecteurs">📖 publié</span>}
        </span>
        <span className="au-row-meta" style={{ display: 'block' }}>{ch.summary || <span className="au-faint">Pas encore de résumé</span>}</span>
      </Link>
      <span className="au-chstats au-desktop-only">
        <span>{formatCount(ch.wordCount)} mots</span>
        {ch.targetWords ? <ProgressBar value={ch.wordCount / ch.targetWords} /> : null}
        {ch.contentUpdatedAt && <span className="au-faint" style={{ fontSize: 11 }}>{relativeTime(ch.contentUpdatedAt)}</span>}
      </span>
      <label className="au-status-select is-compact" style={{ '--pill': st.color }}>
        <span className="au-dot" style={{ '--dot': st.color }} />
        <select className="au-select" value={ch.status} onChange={(e) => onStatus(e.target.value)} aria-label="Statut">
          {CHAPTER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <Link to={`/auteur/${pid}/ecrire/${ch.id}`} className="au-btn is-small" title="Écrire">✍️<span className="au-desktop-only">Écrire</span></Link>
      <button type="button" className="au-btn is-ghost is-small is-icon" onClick={onMenu} aria-label="Actions">⋯</button>
    </div>
  );
}

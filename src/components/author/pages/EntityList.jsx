import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { KINDS } from '../kinds';
import { useShellPage } from '../Shell';
import {
  Btn, Dialog, Empty, ErrorLine, Field, KindAvatar, TagChip, Tabs, cx, entityPath, humanError, relativeTime, useLongPress, useMenu,
} from '../ui';

// Liste générique d'un type d'élément (personnages, lieux, lore, événements) :
// recherche plein-texte côté serveur, filtres (catégorie, tag, favoris), tri,
// vue cartes ou liste, pagination « charger plus ».

const PAGE = 60;

export function EntityList({ kind }) {
  const meta = KINDS[kind];
  const { pid, P, version, tags, categoriesOf, bump } = useAuthor();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(() => { try { return localStorage.getItem(`au-view:${kind}`) || 'cards'; } catch { return 'cards'; } });
  const [q, setQ] = useState(params.get('q') || '');
  const [openMenu, menu] = useMenu();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  useShellPage({ crumbs: [{ label: meta.plural }], title: meta.plural });

  const category = params.get('categorie');
  const tag = params.get('tag');
  const fav = params.get('favoris') === '1';
  const sort = params.get('tri') || (kind === 'event' ? 'date' : 'updated');
  const cats = meta.categoryDomain ? categoriesOf(meta.categoryDomain) : [];

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v === null || v === undefined || v === '') next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const query = useMemo(() => ({
    kind, sort, limit: PAGE,
    q: params.get('q') || undefined,
    tag: tag || undefined,
    favorite: fav ? '1' : undefined,
    category: category || undefined,
  }), [kind, sort, params, tag, fav, category]);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const r = await P.entities.list({ ...query, offset });
      setItems((prev) => (offset ? [...prev, ...r.items] : r.items));
      setTotal(r.total);
      setError(null);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [P, query]);

  useEffect(() => { load(0); }, [load, version]);

  // Recherche : debounce avant de toucher l'URL (et donc le serveur).
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') || '') !== q) setParam('q', q.trim()); }, 260);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const changeView = (v) => { setView(v); try { localStorage.setItem(`au-view:${kind}`, v); } catch { /* ignore */ } };

  const actions = (e) => [
    { label: 'Ouvrir', icon: '↗', onClick: () => navigate(entityPath(pid, e)) },
    { label: e.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: '⭐', onClick: async () => { await P.entities.favorite(e.id, !e.isFavorite); bump(); } },
    { sep: true },
    { label: 'Mettre à la corbeille', icon: '🗑', danger: true, onClick: async () => {
      if (!(await confirm({ title: 'Mettre à la corbeille ?', message: `« ${e.title} » pourra être restauré depuis Réglages → Corbeille.`, confirmLabel: 'Mettre à la corbeille', danger: true }))) return;
      try { await P.entities.remove(e.id); bump(); toast.success('Élément mis à la corbeille'); } catch (err) { toast.error(humanError(err)); }
    } },
  ];

  const catOf = (id) => cats.find((c) => c.id === id);

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div>
          <h1>{meta.icon} {meta.plural}</h1>
          <div className="au-sub">{total} élément{total > 1 ? 's' : ''}{kind === 'event' && <> · <Link to={`/auteur/${pid}/chronologie`} style={{ color: 'var(--au-acc)' }}>voir la chronologie →</Link></>}</div>
        </div>
        <div className="au-actions">
          <Btn variant="primary" onClick={() => setCreating(true)}>＋ {meta.newLabel}</Btn>
        </div>
      </div>

      <div className="au-toolbar">
        <input className="au-input au-grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Chercher dans ${meta.plural.toLowerCase()}…`} aria-label="Recherche" />
        <select className="au-select" style={{ width: 'auto' }} value={sort} onChange={(e) => setParam('tri', e.target.value)} aria-label="Tri">
          {kind === 'event' && <option value="date">Chronologique</option>}
          <option value="updated">Modifiés récemment</option>
          <option value="title">A → Z</option>
          <option value="created">Créés récemment</option>
        </select>
        {tags.length > 0 && (
          <select className="au-select" style={{ width: 'auto', maxWidth: 170 }} value={tag || ''} onChange={(e) => setParam('tag', e.target.value)} aria-label="Tag">
            <option value="">Tous les tags</option>
            {tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}
          </select>
        )}
        <Btn on={fav} onClick={() => setParam('favoris', fav ? null : '1')} title="Favoris seulement">⭐</Btn>
        <Tabs value={view} onChange={changeView} options={[['cards', '▦ Cartes'], ['list', '☰ Liste']]} />
      </div>

      {cats.length > 0 && (
        <div className="au-chips-row">
          <button type="button" className={cx('au-chip', !category && 'is-sel')} onClick={() => setParam('categorie', null)}>Toutes</button>
          {cats.map((c) => (
            <button key={c.id} type="button" className={cx('au-chip', String(c.id) === category && 'is-sel')} onClick={() => setParam('categorie', String(c.id) === category ? null : c.id)}>
              {c.icon} {c.name} <span className="au-faint">{c.used}</span>
            </button>
          ))}
          <button type="button" className={cx('au-chip', category === 'none' && 'is-sel')} onClick={() => setParam('categorie', category === 'none' ? null : 'none')}>Sans catégorie</button>
        </div>
      )}

      <ErrorLine error={error} onClose={() => setError(null)} />

      {!loading && items.length === 0 ? (
        <Empty icon={meta.icon} title={params.toString() ? 'Aucun résultat' : `Aucun ${meta.label.toLowerCase()} pour l'instant`}
          action={<Btn variant="primary" onClick={() => setCreating(true)}>＋ {meta.newLabel}</Btn>}>
          {params.toString() ? 'Essaie d\'autres filtres.' : 'Crée le premier : une fiche se remplit au fil de l\'écriture.'}
        </Empty>
      ) : (
        <div className={view === 'cards' ? 'au-cards' : 'au-list'}>
          {items.map((e) => (
            <EntityCard key={e.id} pid={pid} e={e} view={view} cat={catOf(e.categoryId)} meta={meta}
              onMenu={(ev) => openMenu(ev, actions(e))} />
          ))}
        </div>
      )}
      {items.length < total && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Btn onClick={() => load(items.length)} disabled={loading}>{loading ? 'Chargement…' : `Charger plus (${total - items.length})`}</Btn>
        </div>
      )}
      {menu}
      <CreateEntityDialog open={creating} kind={kind} onClose={() => setCreating(false)}
        defaults={category && category !== 'none' ? { categoryId: Number(category) } : {}}
        onCreated={(e) => navigate(entityPath(pid, e))} />
    </div>
  );
}

function EntityCard({ pid, e, view, cat, meta, onMenu }) {
  const longPress = useLongPress(onMenu);
  const sub = [cat ? `${cat.icon} ${cat.name}` : null, meta.listMeta?.(e)].filter(Boolean).join(' · ');
  if (view === 'list') {
    return (
      <Link to={entityPath(pid, e)} className="au-row" {...longPress}>
        <KindAvatar entity={e} />
        <span className="au-row-main">
          <span className="au-row-title" style={{ display: 'block' }}>{e.isFavorite && '⭐ '}{e.title}</span>
          <span className="au-row-meta" style={{ display: 'block' }}>{sub || e.summary || '—'}</span>
        </span>
        <span className="au-row-end au-desktop-only">
          {e.tags.slice(0, 3).map((t) => <TagChip key={t.id} tag={t} />)}
          {e.linkCount > 0 && <span className="au-faint" style={{ fontSize: 11.5 }} title="Relations">🔗 {e.linkCount}</span>}
          <span className="au-faint" style={{ fontSize: 11.5, minWidth: 70, textAlign: 'right' }}>{relativeTime(e.updatedAt)}</span>
        </span>
        <button type="button" className="au-btn is-ghost is-small is-icon" onClick={(ev) => { ev.preventDefault(); onMenu(ev); }} aria-label="Actions">⋯</button>
      </Link>
    );
  }
  return (
    <Link to={entityPath(pid, e)} className="au-ecard" style={{ '--kc': e.color || meta.color }} {...longPress}>
      <div className="au-ecard-top">
        <KindAvatar entity={e} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="au-row-title">{e.title}</div>
          {sub && <div className="au-row-meta">{sub}</div>}
        </div>
        {e.isFavorite && <span aria-label="Favori">⭐</span>}
        <button type="button" className="au-btn is-ghost is-small is-icon" onClick={(ev) => { ev.preventDefault(); onMenu(ev); }} aria-label="Actions">⋯</button>
      </div>
      {e.summary && <p className="au-ecard-sum">{e.summary}</p>}
      <div className="au-ecard-foot">
        {e.tags.slice(0, 4).map((t) => <TagChip key={t.id} tag={t} />)}
        <span className="au-faint" style={{ marginLeft: 'auto', fontSize: 11 }}>{e.linkCount > 0 ? `🔗 ${e.linkCount} · ` : ''}{relativeTime(e.updatedAt)}</span>
      </div>
    </Link>
  );
}

// Création rapide : le nom suffit, la fiche s'ouvre ensuite pour le reste.
export function CreateEntityDialog({ open, kind, onClose, onCreated, defaults = {} }) {
  const { categoriesOf, timelines, createEntity } = useAuthor();
  const meta = KINDS[kind];
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [timelineId, setTimelineId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cats = meta?.categoryDomain ? categoriesOf(meta.categoryDomain) : [];

  useEffect(() => {
    if (!open) return;
    setTitle(defaults.title || '');
    setCategoryId(defaults.categoryId ? String(defaults.categoryId) : '');
    setTimelineId(defaults.timelineId ? String(defaults.timelineId) : (timelines[timelines.length - 1]?.id ? String(timelines[timelines.length - 1].id) : ''));
    setError(null);
  }, [open]); // eslint-disable-line

  if (!meta) return null;
  const submit = async (ev) => {
    ev?.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const fields = { title: title.trim(), ...defaults };
      if (cats.length) fields.categoryId = categoryId ? Number(categoryId) : null;
      if (kind === 'event') fields.timelineId = timelineId ? Number(timelineId) : null;
      const e = await createEntity(kind, fields);
      onClose();
      onCreated?.(e);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`${meta.icon} ${meta.newLabel}`} width={460}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={submit} disabled={!title.trim() || busy}>Créer</Btn></>}>
      <form onSubmit={submit}>
        <ErrorLine error={error} />
        <Field label={kind === 'chapter' || kind === 'event' || kind === 'note' ? 'Titre' : 'Nom'}>
          <input className="au-input" value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
        </Field>
        {cats.length > 0 && (
          <Field label={kind === 'place' ? 'Type de lieu' : 'Catégorie'}>
            <select className="au-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— Aucune —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>
        )}
        {kind === 'event' && (
          <Field label="Ligne de temps">
            <select className="au-select" value={timelineId} onChange={(e) => setTimelineId(e.target.value)}>
              <option value="">— Aucune —</option>
              {timelines.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <button type="submit" hidden aria-hidden />
      </form>
    </Dialog>
  );
}

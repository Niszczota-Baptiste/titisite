import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthor } from '../context';
import { KINDS } from '../kinds';
import { useShellPage } from '../Shell';
import { Empty, ErrorLine, KindAvatar, TagChip, cx, entityPath, relativeTime } from '../ui';

// Liste en lecture d'un type d'élément (personnages, lieux, lore) : recherche,
// filtre par catégorie et par tag, cartes. Aucun geste d'édition.

export function GuestList({ kind }) {
  const meta = KINDS[kind];
  const { pid, P, version, tags, categoriesOf } = useAuthor();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState(params.get('q') || '');
  useShellPage({ crumbs: [{ label: meta.plural }], title: meta.plural });

  const category = params.get('categorie');
  const tag = params.get('tag');
  const cats = meta.categoryDomain ? categoriesOf(meta.categoryDomain) : [];
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (!v) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setParam('q', q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const query = useMemo(() => ({
    kind, sort: 'title', limit: 1000, q: params.get('q') || undefined, tag: tag || undefined, category: category || undefined,
  }), [kind, params, tag, category]);

  useEffect(() => {
    let alive = true;
    P.entities.list(query).then((r) => { if (alive) setData(r); }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [P, query, version]);

  const catOf = (id) => cats.find((c) => c.id === id);
  const usedTags = tags.filter((t) => t.used > 0);

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div>
          <h1>{meta.icon} {meta.plural}</h1>
          <div className="au-sub">{data ? `${data.total} fiche${data.total > 1 ? 's' : ''}` : '…'}</div>
        </div>
      </div>
      <input className="au-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Chercher dans : ${meta.plural.toLowerCase()}…`}
        aria-label="Rechercher" style={{ marginBottom: 10 }} />
      {cats.length > 0 && (
        <div className="au-chips-row">
          <button type="button" className={cx('au-chip', !category && 'is-sel')} onClick={() => setParam('categorie', '')}>Toutes</button>
          {cats.filter((c) => c.used > 0).map((c) => (
            <button key={c.id} type="button" className={cx('au-chip', category === String(c.id) && 'is-sel')}
              onClick={() => setParam('categorie', category === String(c.id) ? '' : String(c.id))}>{c.icon} {c.name}</button>
          ))}
        </div>
      )}
      {usedTags.length > 0 && (
        <div className="au-chips-row">
          {usedTags.map((t) => (
            <TagChip key={t.id} tag={String(t.id) === tag ? { ...t, name: `${t.name} ✓` } : t}
              onClick={() => setParam('tag', String(t.id) === tag ? '' : String(t.id))} />
          ))}
        </div>
      )}
      <ErrorLine error={error} onClose={() => setError(null)} />
      {data?.items.length === 0 && <Empty icon={meta.icon} title="Rien ici">Aucune fiche ne correspond.</Empty>}
      <div className="au-cards">
        {data?.items.map((e) => {
          const cat = catOf(e.categoryId);
          const sub = [cat ? `${cat.icon} ${cat.name}` : null, meta.listMeta?.(e)].filter(Boolean).join(' · ');
          return (
            <Link key={e.id} to={entityPath(pid, e)} className="au-ecard" style={{ '--kc': e.color || meta.color }}>
              <div className="au-ecard-top">
                <KindAvatar entity={e} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="au-row-title">{e.title}</div>
                  {sub && <div className="au-row-meta">{sub}</div>}
                </div>
              </div>
              {e.summary && <p className="au-ecard-sum">{e.summary}</p>}
              <div className="au-ecard-foot">
                {e.tags.slice(0, 4).map((t) => <TagChip key={t.id} tag={t} />)}
                <span className="au-faint" style={{ marginLeft: 'auto', fontSize: 11 }}>{e.linkCount > 0 ? `🔗 ${e.linkCount} · ` : ''}{relativeTime(e.updatedAt)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthor } from '../context';
import { KINDS, KIND_ORDER, kindMeta } from '../kinds';
import { useShellPage } from '../Shell';
import { Empty, ErrorLine, Highlight, KindAvatar, TagChip, cx, entityPath } from '../ui';

// Recherche globale plein-texte (titres, fiches, textes des chapitres, alias,
// tags), filtrable par type et par tag. La palette Ctrl/⌘ K en est la version
// express.

export function SearchPage() {
  const { pid, P, tags } = useAuthor();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const kinds = (params.get('types') || '').split(',').filter((k) => KINDS[k]);
  const tag = params.get('tag') || '';
  useShellPage({ crumbs: [{ label: 'Recherche' }], title: 'Recherche' });

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (!v) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setParam('q', q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  const query = params.get('q') || '';
  useEffect(() => {
    if (!query && !tag) { setResults(null); return undefined; }
    let alive = true;
    const run = query
      ? P.search(query, { kinds: kinds.join(',') || undefined, tag: tag || undefined, limit: 100 })
      : P.entities.list({ tag, kinds: kinds.join(',') || undefined, limit: 200 }).then((r) => r.items.map((e) => ({ ...e, snippet: e.summary })));
    run.then((r) => { if (alive) setResults(r); }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [P, query, tag, params]); // eslint-disable-line

  const toggleKind = (k) => {
    const set = new Set(kinds);
    if (set.has(k)) set.delete(k); else set.add(k);
    setParam('types', [...set].join(','));
  };

  return (
    <div className="au-page is-narrow">
      <div className="au-page-head"><div><h1>🔎 Recherche</h1><div className="au-sub">Dans tout l&apos;univers : fiches, idées, textes des chapitres.</div></div></div>
      <input className="au-input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Un nom, un mot, une phrase…" style={{ fontSize: 17, minHeight: 48, marginBottom: 12 }} aria-label="Rechercher" />
      <div className="au-chips-row">
        {KIND_ORDER.map((k) => (
          <button key={k} type="button" className={cx('au-chip', kinds.includes(k) && 'is-sel')} onClick={() => toggleKind(k)}>{KINDS[k].icon} {KINDS[k].plural}</button>
        ))}
      </div>
      {tags.length > 0 && (
        <div className="au-chips-row">
          {tags.map((t) => <TagChip key={t.id} tag={t.id === Number(tag) ? { ...t, name: `${t.name} ✓` } : t} onClick={() => setParam('tag', String(t.id) === tag ? '' : String(t.id))} />)}
        </div>
      )}
      <ErrorLine error={error} onClose={() => setError(null)} />
      {results === null && <p className="au-muted" style={{ fontSize: 13 }}>Astuce : <strong>Ctrl/⌘ K</strong> ouvre la recherche n&apos;importe où.</p>}
      {results && results.length === 0 && <Empty icon="🔍" title="Aucun résultat">Essaie un autre mot ou retire un filtre.</Empty>}
      {results && results.length > 0 && (
        <div className="au-list">
          <div className="au-faint" style={{ fontSize: 12, margin: '4px 0 8px' }}>{results.length} résultat{results.length > 1 ? 's' : ''}</div>
          {results.map((r) => (
            <Link key={r.id} to={r.kind === 'chapter' && query ? `/auteur/${pid}/ecrire/${r.id}` : entityPath(pid, r)} className="au-row" style={{ alignItems: 'flex-start' }}>
              <KindAvatar entity={r} />
              <span className="au-row-main">
                <span className="au-row-title" style={{ display: 'block' }}>{r.number ? `${r.number}. ` : ''}{r.title}</span>
                <span className="au-faint" style={{ fontSize: 11.5 }}>{kindMeta(r.kind).label}</span>
                {r.snippet && <span className="au-search-snippet"><Highlight text={r.snippet} /></span>}
                {r.tags?.length > 0 && <span style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>{r.tags.map((t) => <TagChip key={t.id} tag={t} />)}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

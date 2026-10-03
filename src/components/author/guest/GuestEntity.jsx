import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CommentsThread } from '../comments/CommentsThread';
import { useAuthor } from '../context';
import { LINK_SECTIONS, chapterStatus, kindMeta } from '../kinds';
import { Markdown } from '../markdown';
import { useShellPage } from '../Shell';
import { formatCount } from '../text';
import {
  Dialog, Empty, ErrorLine, KindAvatar, Pill, TagChip, entityPath, humanError, relativeTime,
} from '../ui';

// Fiche en LECTURE pour un invité omniscient : les mêmes sections que la fiche
// du propriétaire (registre kinds.js), rendues comme du texte, sans le moindre
// champ éditable. Un chapitre s'affiche comme une page de livre, et un passage
// sélectionné peut être cité dans un commentaire.

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function FieldView({ def, e, ctx }) {
  const v = e[def.key];
  switch (def.type) {
    case 'markdown':
      return <Markdown content={v} pid={ctx.pid} resolve={ctx.resolve} />;
    case 'select':
      return <p className="au-ro-text">{def.options.find(([k]) => k === v)?.[1] ?? v}</p>;
    case 'category': {
      const c = ctx.categories.find((x) => x.id === v);
      return <p className="au-ro-text">{c ? `${c.icon} ${c.name}` : '—'}</p>;
    }
    case 'timeline':
      return <p className="au-ro-text">{ctx.timelines.find((t) => t.id === v)?.name ?? '—'}</p>;
    case 'chapterStatus': {
      const st = chapterStatus(v);
      return <p className="au-ro-text"><Pill color={st.color}>{st.label}</Pill></p>;
    }
    case 'number':
      return <p className="au-ro-text">{typeof v === 'number' ? v.toLocaleString('fr-FR') : v}</p>;
    default:
      return <p className="au-ro-text">{String(v)}</p>;
  }
}

export function GuestEntity() {
  const { id } = useParams();
  const entityId = Number(id);
  const { pid, P, version, resolve, categories, timelines } = useAuthor();
  const [e, setE] = useState(null);
  const [error, setError] = useState(null);
  const [quote, setQuote] = useState('');
  const commentsRef = useRef(null);
  const meta = kindMeta(e?.kind);
  const listRoute = e?.kind === 'event' ? 'chronologie' : meta.route;

  useEffect(() => {
    let alive = true;
    setError(null);
    P.entities.get(entityId).then((x) => { if (alive) setE(x); }).catch((err) => { if (alive) { setE(null); setError(err); } });
    return () => { alive = false; };
  }, [P, entityId, version]);

  useShellPage({
    crumbs: e ? [{ label: meta.plural, to: `/auteur/${pid}/${listRoute}` }, { label: e.title || 'Sans titre' }] : [{ label: '…' }],
    title: e?.title,
  });

  const cite = useCallback((text) => {
    setQuote(text);
    commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => commentsRef.current?.querySelector('textarea')?.focus(), 350);
  }, []);

  if (!e) {
    if (error) {
      return (
        <div className="au-page is-narrow">
          <Empty icon="🫥" title={error.status === 404 ? 'Élément introuvable' : 'Chargement impossible'}>
            {error.status === 404 ? 'Il n\'existe plus, ou il n\'est pas partagé.' : humanError(error)}
          </Empty>
        </div>
      );
    }
    return <div className="au-page"><p className="au-muted">Chargement…</p></div>;
  }

  const ctx = { pid, resolve, categories, timelines };
  const cat = categories.find((c) => c.id === e.categoryId);
  const tl = timelines.find((t) => t.id === e.timelineId);
  const isChapter = e.kind === 'chapter';
  const sections = meta.sections
    .map((s, si) => ({ ...s, fields: s.fields.filter((f) => !(si === 0 && f.key === 'title') && !isEmpty(e[f.key])) }))
    .filter((s) => s.fields.length);

  return (
    <div className="au-page is-wide au-entity">
      <header className="au-entity-head">
        <KindAvatar entity={e} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="au-entity-kind">
            <span style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
            {isChapter && e.number && <span>· Chapitre {e.number}{e.actTitle ? ` — ${e.actTitle}` : ''}</span>}
            {cat && <span>· {cat.icon} {cat.name}</span>}
            {tl && <span>· {tl.name}{e.dateLabel ? ` — ${e.dateLabel}` : ''}</span>}
            <span className="au-faint">· modifié {relativeTime(e.updatedAt)}</span>
          </div>
          <h1 className="au-ro-title">{e.title}</h1>
        </div>
      </header>

      {isChapter && (
        <div className="au-card au-chapter-strip">
          <Pill color={chapterStatus(e.status).color}>{chapterStatus(e.status).label}</Pill>
          <span><strong>{formatCount(e.wordCount)}</strong> mots</span>
          {e.contentUpdatedAt && <span className="au-faint" style={{ fontSize: 12 }}>texte modifié {relativeTime(e.contentUpdatedAt)}</span>}
        </div>
      )}

      <div className="au-entity-grid">
        <div className="au-entity-main">
          {isChapter && <ChapterText e={e} ctx={ctx} onCite={cite} />}
          {sections.map((s) => (
            <section key={s.id} className="au-card au-ro-section">
              <div className="au-card-title">{s.title}</div>
              <div className="au-grid2">
                {s.fields.map((f) => (
                  <div key={f.key} className={f.half ? 'au-field' : 'au-field is-full'}>
                    <div className="au-field-label">{f.label}</div>
                    <FieldView def={f} e={e} ctx={ctx} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {!isChapter && sections.length === 0 && <p className="au-faint">Cette fiche est encore vide.</p>}
          {e.kind === 'place' && e.map && <PlaceMapView place={e} />}
          <div className="au-card" ref={commentsRef}>
            <CommentsThread entityId={e.id} quote={quote} onClearQuote={() => setQuote('')} />
          </div>
        </div>

        <aside className="au-entity-side">
          <RelationsView e={e} pid={pid} />
          {(e.tags.length > 0 || e.aliases.length > 0) && (
            <div className="au-card">
              <div className="au-card-title">🏷️ Classement</div>
              {e.tags.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>{e.tags.map((t) => <TagChip key={t.id} tag={t} />)}</div>}
              {e.aliases.length > 0 && (
                <div className="au-muted" style={{ fontSize: 13 }}>
                  Aussi appelé : {e.aliases.map((a) => (a.kind === 'ancien_nom' ? `${a.alias} (ancien nom)` : a.alias)).join(', ')}
                </div>
              )}
            </div>
          )}
          <GalleryView e={e} />
          {e.boards.length > 0 && (
            <div className="au-card">
              <div className="au-card-title">🧩 Sur les tableaux</div>
              {e.boards.map((b) => <Link key={b.id} className="au-row" to={`/auteur/${pid}/tableaux/${b.id}`}>🧩 {b.title}</Link>)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Texte d'un chapitre en page de livre + « citer ce passage ».
function ChapterText({ e, ctx, onCite }) {
  const box = useRef(null);
  const [sel, setSel] = useState(null); // { text, x, y }

  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !box.current || !box.current.contains(s.anchorNode)) { setSel(null); return; }
      const text = s.toString().replace(/\s+/g, ' ').trim();
      if (text.length < 3) { setSel(null); return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text: text.slice(0, 600), x: r.left + r.width / 2, y: r.bottom + 8 });
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  return (
    <div className="au-card au-ro-chapter">
      <div className="au-ro-prose" ref={box}>
        <Markdown content={e.content} pid={ctx.pid} resolve={ctx.resolve} />
      </div>
      <p className="au-faint" style={{ fontSize: 12, margin: '10px 0 0' }}>Sélectionne un passage pour le citer dans un commentaire.</p>
      {sel && (
        <button type="button" className="au-cite-btn" style={{ left: sel.x, top: sel.y }}
          onPointerDown={(ev) => ev.preventDefault()} onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => { onCite(sel.text); window.getSelection()?.removeAllRanges(); setSel(null); }}>
          💬 Commenter ce passage
        </button>
      )}
    </div>
  );
}

function RelationsView({ e, pid }) {
  const groups = LINK_SECTIONS.filter((s) => s.kind !== 'note')
    .map((s) => ({ ...s, links: e.links.filter((l) => l.other.kind === s.kind) }))
    .filter((g) => g.links.length);
  return (
    <div className="au-card">
      <div className="au-card-title">
        🔗 Relations <span className="au-faint" style={{ fontWeight: 500 }}>{e.links.length}</span>
        <span className="au-actions"><Link to={`/auteur/${pid}/graphe?focus=${e.id}`} className="au-btn is-ghost is-small" title="Voir dans le graphe">🕸️</Link></span>
      </div>
      {groups.length === 0 && <p className="au-faint" style={{ fontSize: 12.5, margin: 0 }}>Aucune relation.</p>}
      {groups.map((g) => (
        <div key={g.kind} className="au-rel-group">
          <div className="au-rel-head"><span>{g.title}</span></div>
          {g.links.map((l) => (
            <div key={l.id} className="au-rel-row">
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
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function GalleryView({ e }) {
  const [view, setView] = useState(null);
  const media = [...(e.cover && !e.media.some((m) => m.id === e.cover.id) ? [e.cover] : []), ...e.media];
  if (media.length === 0) return null;
  return (
    <div className="au-card">
      <div className="au-card-title">🖼️ Références visuelles <span className="au-faint" style={{ fontWeight: 500 }}>{media.length}</span></div>
      <div className="au-gallery">
        {media.map((m) => (
          <button key={m.id} type="button" className="au-thumb" onClick={() => setView(m)} title={m.caption || ''}>
            <img src={m.thumbUrl} alt={m.caption || ''} loading="lazy" />
          </button>
        ))}
      </div>
      <Dialog open={!!view} onClose={() => setView(null)} title={view?.caption || 'Image'} width={900}>
        {view && <img src={view.url} alt={view.caption || ''} style={{ width: '100%', height: 'auto', borderRadius: 10 }} />}
      </Dialog>
    </div>
  );
}

// Carte d'un lieu, points cliquables (lecture seule).
function PlaceMapView({ place }) {
  const { pid, P } = useAuthor();
  const [pins, setPins] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { P.pins.list(place.id).then(setPins).catch(setError); }, [P, place.id]);
  return (
    <div className="au-card" style={{ marginBottom: 18 }}>
      <div className="au-card-title">🗺️ Carte</div>
      <ErrorLine error={error} />
      <div className="au-map">
        <img src={place.map.url} alt={`Carte : ${place.title}`} />
        {pins.map((p) => (
          <button key={p.id} type="button" className={`au-pin${open === p.id ? ' is-open' : ''}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, '--pin': p.color || '#e8c86a' }}
            onClick={() => setOpen(open === p.id ? null : p.id)} aria-label={p.label || p.target?.title || 'Point'}>
            <span className="au-pin-dot" />
            {(p.label || p.target) && <span className="au-pin-label">{p.label || p.target.title}</span>}
            {open === p.id && p.target && (
              <span className="au-pin-pop"><Link to={entityPath(pid, p.target)} onClick={(ev) => ev.stopPropagation()}>{kindMeta(p.target.kind).icon} {p.target.title} →</Link></span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

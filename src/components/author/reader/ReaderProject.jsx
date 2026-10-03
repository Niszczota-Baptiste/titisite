import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client';
import { Markdown } from '../markdown';
import { formatCount } from '../text';
import { Btn, Empty, ErrorLine, cx, formatDateTime, humanError } from '../ui';

// Liseuse du rôle « lecteur » : seulement les chapitres terminés ET validés
// par l'auteur (le serveur ne sert rien d'autre), dans une mise en page de
// livre. Sert aussi d'« aperçu lecteur » au propriétaire (`preview`).

const PREFS_KEY = 'au-reader-prefs';
const DEFAULT_PREFS = { size: 19, font: 'serif' };

function usePrefs() {
  const [prefs, setPrefs] = useState(() => {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
  });
  const update = (patch) => setPrefs((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return [prefs, update];
}

export default function ReaderProject({ pid, theme, setTheme }) {
  return <ReaderView pid={pid} theme={theme} setTheme={setTheme} />;
}

export function ReaderView({ pid, preview = false, theme, setTheme }) {
  const P = useMemo(() => api.author.p(pid), [pid]);
  const [project, setProject] = useState(null);
  const [chapters, setChapters] = useState(null);
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = usePrefs();
  const base = preview ? `/auteur/${pid}/apercu` : `/auteur/${pid}`;

  useEffect(() => {
    Promise.all([P.get(), P.reader.list()])
      .then(([p, list]) => { setProject(p); setChapters(list); })
      .catch(setError);
  }, [P]);

  useEffect(() => { if (project) document.title = `${project.title} — Lecture`; }, [project]);

  const style = { '--reader-size': `${prefs.size}px`, '--reader-font': prefs.font === 'serif' ? 'var(--au-serif)' : 'var(--au-font)' };

  return (
    <div className="au-reader" style={style}>
      <header className="au-reader-bar">
        <Link to={base} className="au-reader-brand">
          <span aria-hidden>📖</span>
          <span style={{ minWidth: 0 }}>
            <strong>{project?.title || '…'}</strong>
            {project?.ownerName && <small>de {project.ownerName}</small>}
          </span>
        </Link>
        <div className="au-reader-tools">
          <Btn size="small" variant="ghost" icon onClick={() => setPrefs({ size: Math.max(15, prefs.size - 1) })} aria-label="Texte plus petit">A−</Btn>
          <Btn size="small" variant="ghost" icon onClick={() => setPrefs({ size: Math.min(26, prefs.size + 1) })} aria-label="Texte plus grand">A+</Btn>
          <Btn size="small" variant="ghost" icon onClick={() => setPrefs({ font: prefs.font === 'serif' ? 'sans' : 'serif' })} aria-label="Changer de police"
            title={prefs.font === 'serif' ? 'Police sans empattements' : 'Police avec empattements'}>
            <span style={{ fontFamily: prefs.font === 'serif' ? 'var(--au-font)' : 'var(--au-serif)' }}>Aa</span>
          </Btn>
          {setTheme && (
            <Btn size="small" variant="ghost" icon onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label="Thème clair / sombre">
              {theme === 'light' ? '🌙' : '☀️'}
            </Btn>
          )}
          {preview
            ? <Link to={`/auteur/${pid}/reglages`} className="au-btn is-small">Quitter l&apos;aperçu</Link>
            : <Link to="/auteur?choisir" className="au-btn is-ghost is-small" title="Mes livres partagés">↩</Link>}
        </div>
      </header>
      {preview && (
        <div className="au-reader-preview-note">
          👁️ Aperçu : c&apos;est exactement ce que voit un compte au rôle « lecteur ». Seuls les chapitres « Terminés » que tu as publiés y figurent.
        </div>
      )}
      <ErrorLine error={error} onClose={() => setError(null)} />
      <Routes>
        <Route index element={<Contents project={project} chapters={chapters} base={base} />} />
        <Route path="lire/:id" element={<ChapterPage P={P} base={base} chapters={chapters} />} />
        <Route path="*" element={<Contents project={project} chapters={chapters} base={base} />} />
      </Routes>
    </div>
  );
}

function Contents({ project, chapters, base }) {
  if (!chapters) return <div className="au-reader-page"><p className="au-muted">Chargement…</p></div>;
  const words = chapters.reduce((a, c) => a + c.wordCount, 0);
  return (
    <div className="au-reader-page">
      <div className="au-reader-cover">
        <h1>{project?.title}</h1>
        {project?.subtitle && <p className="au-reader-sub">{project.subtitle}</p>}
        {project?.ownerName && <p className="au-faint">{project.ownerName}</p>}
      </div>
      {chapters.length === 0 ? (
        <Empty icon="📖" title="Rien à lire pour l'instant">Les chapitres apparaîtront ici dès que l&apos;auteur les aura terminés et publiés.</Empty>
      ) : (
        <>
          <div className="au-reader-toc-head">
            <span>Sommaire</span>
            <span className="au-faint">{chapters.length} chapitre{chapters.length > 1 ? 's' : ''} · {formatCount(words)} mots</span>
          </div>
          <ol className="au-reader-toc">
            {chapters.map((c) => (
              <li key={c.id}>
                <Link to={`${base}/lire/${c.id}`}>
                  <span className="au-reader-toc-num">{c.number}</span>
                  <span className="au-reader-toc-title">{c.title}</span>
                  <span className="au-faint au-reader-toc-meta">~{Math.max(1, Math.round(c.wordCount / 230))} min</span>
                </Link>
              </li>
            ))}
          </ol>
          <Link to={`${base}/lire/${chapters[0].id}`} className="au-btn is-primary" style={{ marginTop: 18 }}>Commencer la lecture →</Link>
        </>
      )}
    </div>
  );
}

function ChapterPage({ P, base, chapters }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ch, setCh] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setCh(null);
    setError(null);
    P.reader.get(Number(id)).then((c) => { if (alive) { setCh(c); window.scrollTo(0, 0); } }).catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [P, id]);

  // ← → pour tourner les pages.
  useEffect(() => {
    const onKey = (e) => {
      if (!ch || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight' && ch.next) navigate(`${base}/lire/${ch.next.id}`);
      if (e.key === 'ArrowLeft' && ch.prev) navigate(`${base}/lire/${ch.prev.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ch, base, navigate]);

  if (error) {
    return (
      <div className="au-reader-page">
        <Empty icon="📕" title={error.status === 404 ? 'Chapitre indisponible' : 'Chargement impossible'}
          action={<Link to={base} className="au-btn">Sommaire</Link>}>
          {error.status === 404 ? 'L\'auteur l\'a peut-être retiré pour le retravailler.' : humanError(error)}
        </Empty>
      </div>
    );
  }
  if (!ch) return <div className="au-reader-page"><p className="au-muted">Chargement…</p></div>;
  const total = chapters?.length || 0;
  const idx = chapters ? chapters.findIndex((c) => c.id === ch.id) + 1 : 0;
  return (
    <article className="au-reader-page">
      <div className="au-reader-kicker">Chapitre {ch.number}{total ? <span className="au-faint"> · {idx}/{total}</span> : null}</div>
      <h1 className="au-reader-title">{ch.title}</h1>
      <div className="au-reader-text">
        <Markdown content={ch.content} />
      </div>
      <div className="au-reader-end au-faint">Publié le {formatDateTime(ch.validatedAt)}</div>
      <nav className="au-reader-nav" aria-label="Chapitres">
        {ch.prev ? <Link to={`${base}/lire/${ch.prev.id}`} className={cx('au-btn')}>← {ch.prev.title}</Link> : <span />}
        <Link to={base} className="au-btn is-ghost">Sommaire</Link>
        {ch.next ? <Link to={`${base}/lire/${ch.next.id}`} className="au-btn is-primary">{ch.next.title} →</Link> : <span />}
      </nav>
    </article>
  );
}

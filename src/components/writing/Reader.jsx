import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { renderMarkdown } from './markdown';
import { hexToRgb } from './tokens';
import { ReaderNav, ReaderShell, NotFound } from './shell';

const chapterAnchor = (id) => `chapitre-${id}`;

export function Reader() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const mobile = useIsMobile(860);

  const [work, setWork] = useState(null);
  const [glossary, setGlossary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const articleRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.ecriture.get(slug).catch(() => null),
      api.ecriture.lexique().catch(() => []),
    ]).then(([w, lex]) => {
      if (!alive) return;
      setWork(w);
      setGlossary(Array.isArray(lex) ? lex : []);
      setLoading(false);
      setActiveId(w?.chapters?.[0]?.id ?? null);
    });
    return () => { alive = false; };
  }, [slug]);

  const acc = work?.accentColor || '#c9a8e8';
  const rgb = hexToRgb(acc) || '201,168,232';

  // Active chapter (TOC highlight) + overall reading progress.
  useEffect(() => {
    if (!work?.chapters?.length) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(Number(visible[0].target.dataset.chapterId));
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
    );
    work.chapters.forEach((c) => {
      const el = document.getElementById(chapterAnchor(c.id));
      if (el) obs.observe(el);
    });
    const onScroll = () => {
      const el = articleRef.current;
      if (!el) return;
      const total = el.scrollHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-el.getBoundingClientRect().top, 0), Math.max(total, 1));
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { obs.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, [work]);

  const goTo = (id) => {
    const el = document.getElementById(chapterAnchor(id));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  };

  if (loading) {
    return <ReaderShell><div style={loadingStyle}>loading…</div></ReaderShell>;
  }
  if (!work) {
    return (
      <ReaderShell>
        <NotFound label="Texte introuvable" onBack={() => navigate('/projets/ecriture')} backLabel="← Bibliothèque" />
      </ReaderShell>
    );
  }

  const ctx = { characters: work.characters || [], glossary, accent: acc };

  return (
    <ReaderShell>
      {/* Reading progress bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 60, background: 'transparent' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, rgba(${rgb},0.4), rgb(${rgb}))`, transition: 'width 0.1s linear' }} />
      </div>

      <ReaderNav
        crumb={work.title}
        accent={acc}
        onBack={() => navigate('/projets/ecriture')}
        right={mobile ? (
          <button onClick={() => setTocOpen((o) => !o)} style={tocToggleStyle(rgb)}>Sommaire</button>
        ) : null}
      />

      <div style={{
        maxWidth: 1180, margin: '0 auto', padding: 'clamp(36px,6vh,72px) clamp(16px,5vw,56px) 120px',
        display: 'grid', gridTemplateColumns: mobile ? '1fr' : '240px 1fr', gap: mobile ? 0 : 48,
      }}>
        {/* TOC */}
        {!mobile && (
          <aside style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            <Toc work={work} activeId={activeId} onGo={goTo} rgb={rgb} acc={acc} />
          </aside>
        )}
        {mobile && tocOpen && (
          <div onClick={() => setTocOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(2,1,10,0.7)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 280, maxWidth: '82vw', background: '#0b0620', borderLeft: `1px solid rgba(${rgb},0.25)`, padding: '20px 18px', overflowY: 'auto' }}>
              <Toc work={work} activeId={activeId} onGo={goTo} rgb={rgb} acc={acc} />
            </div>
          </div>
        )}

        {/* Article */}
        <article ref={articleRef}>
          <header style={{ marginBottom: 48 }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgba(${rgb},0.7)`, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Lecture
            </p>
            <h1 style={{
              fontFamily: "'Georgia',serif", fontSize: 'clamp(34px,5vw,58px)', fontWeight: 700,
              color: '#ede8f8', letterSpacing: '-1px', lineHeight: 1.08, marginBottom: 12,
            }}>
              {work.title}
              {work.titleKr && <span style={{ display: 'block', fontSize: '0.5em', color: `rgba(${rgb},0.75)`, fontFamily: "'Noto Sans KR','Inter',sans-serif", marginTop: 8 }}>{work.titleKr}</span>}
            </h1>
            {work.subtitle && (
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, color: 'rgba(180,170,200,0.75)', lineHeight: 1.7, maxWidth: 620 }}>{work.subtitle}</p>
            )}
            {work.description && (
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'rgba(160,150,185,0.7)', lineHeight: 1.8, maxWidth: 620, marginTop: 14, fontStyle: 'italic' }}>{work.description}</p>
            )}
          </header>

          {work.chapters.map((ch) => (
            <ChapterBlock key={ch.id} chapter={ch} ctx={ctx} rgb={rgb} acc={acc} />
          ))}

          {!work.chapters.length && (
            <p style={{ fontFamily: "'Inter',sans-serif", color: 'rgba(180,170,200,0.5)', padding: '40px 0' }}>
              Aucun chapitre publié pour l’instant.
            </p>
          )}
        </article>
      </div>
    </ReaderShell>
  );
}

function Toc({ work, activeId, onGo, rgb, acc }) {
  return (
    <nav>
      <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'rgba(180,170,200,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 14 }}>
        Sommaire
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {work.chapters.map((c) => {
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onGo(c.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: active ? `rgba(${rgb},0.1)` : 'transparent', border: 'none',
                  borderLeft: `2px solid ${active ? acc : 'transparent'}`,
                  padding: '7px 12px', borderRadius: '0 6px 6px 0',
                  color: active ? acc : 'rgba(180,170,200,0.7)',
                  fontFamily: "'Inter',sans-serif", fontSize: 13, transition: 'all 0.18s',
                }}
              >
                <span style={{ display: 'block', fontSize: 10, opacity: 0.7, fontFamily: "'JetBrains Mono',monospace" }}>{c.number}</span>
                <span style={{ fontWeight: active ? 600 : 400 }}>{c.title || '—'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ChapterBlock({ chapter, ctx, rgb, acc }) {
  const body = useMemo(() => renderMarkdown(chapter.content, ctx), [chapter.content, ctx]);
  return (
    <section
      id={chapterAnchor(chapter.id)}
      data-chapter-id={chapter.id}
      style={{ marginBottom: 72, scrollMarginTop: 80 }}
    >
      <div style={{ marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid rgba(${rgb},0.18)` }}>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: `rgba(${rgb},0.75)`, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>
          {chapter.number}
        </p>
        <h2 style={{ fontFamily: "'Georgia',serif", fontSize: 'clamp(24px,3.4vw,34px)', fontWeight: 700, color: '#ede8f8', letterSpacing: '-0.5px' }}>
          {chapter.title}
          {chapter.titleKr && <span style={{ marginLeft: 12, fontSize: '0.6em', color: `rgba(${rgb},0.7)`, fontFamily: "'Noto Sans KR','Inter',sans-serif", fontWeight: 600 }}>{chapter.titleKr}</span>}
        </h2>
      </div>
      <div style={{ fontFamily: "'Georgia','Times New Roman',serif", fontSize: 'clamp(16px,1.15vw,18px)', color: 'rgba(216,208,232,0.92)', maxWidth: 680 }}>
        {body}
      </div>
    </section>
  );
}

const loadingStyle = {
  minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: "'JetBrains Mono',monospace", color: '#4a3860', fontSize: 13,
};
const tocToggleStyle = (rgb) => ({
  background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)`, color: `rgb(${rgb})`,
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 12.5,
});

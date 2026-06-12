import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, trackClick } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AmbientEffect } from './AmbientEffect';
import { Lightbox } from './Lightbox';
import { WritingWorldMap } from './map/WorldMap';
import { renderMarkdown } from './markdown';
import { ReaderAudio } from './ReaderAudio';
import { ReaderSettings, readerVars, useReaderPrefs } from './ReaderSettings';
import { hexToRgb } from './tokens';
import { ReaderNav, ReaderShell, NotFound } from './shell';

const chapterAnchor = (id) => `chapitre-${id}`;

export function Reader() {
  const { project, work: workSlug } = useParams();
  const navigate = useNavigate();
  const mobile = useIsMobile(860);

  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [resume, setResume] = useState(null); // saved position banner
  const [prefs, setPrefs] = useReaderPrefs();
  const articleRef = useRef(null);
  const activeIdRef = useRef(null);
  usePageMeta(work ? work.title : null, work ? (work.subtitle || work.description || '') : null);

  // Resume-reading: position saved per work in localStorage.
  const posKey = `titisite-reader-pos:${project}/${workSlug}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.ecriture.work(project, workSlug).then(
      (w) => { if (!alive) return; setWork(w); setLoading(false); setActiveId(w?.chapters?.[0]?.id ?? null); },
      () => { if (!alive) return; setWork(null); setLoading(false); },
    );
    return () => { alive = false; };
  }, [project, workSlug]);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Offer to resume where the reader left off (only when meaningfully scrolled).
  useEffect(() => {
    if (!work?.chapters?.length) return;
    try {
      const saved = JSON.parse(localStorage.getItem(posKey) || 'null');
      if (saved && saved.scrollY > 600 && work.chapters.some((c) => c.id === saved.chapterId)) {
        setResume(saved);
      }
    } catch { /* corrupt entry — ignore */ }
  }, [work]); // eslint-disable-line

  // Persist the last chapter + scroll position (throttled via rAF).
  useEffect(() => {
    if (!work?.chapters?.length) return undefined;
    let raf = 0;
    const save = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          localStorage.setItem(posKey, JSON.stringify({
            chapterId: activeIdRef.current,
            scrollY: window.scrollY,
            ts: Date.now(),
          }));
        } catch { /* quota */ }
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [work, posKey]);

  const glossary = work?.glossary || [];

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

  // Navigate within the writing zone and beacon the hop (powers the
  // "parcours / transitions" section of the Fréquentation dashboard).
  const goWriting = useCallback((to) => {
    trackClick(to, 'writing_nav');
    navigate(to);
  }, [navigate]);

  if (loading) {
    return <ReaderShell><div style={loadingStyle}>loading…</div></ReaderShell>;
  }
  if (!work) {
    return (
      <ReaderShell>
        <NotFound label="Texte introuvable" onBack={() => goWriting(`/projets/ecriture/${project}`)} backLabel="← Le projet" />
      </ReaderShell>
    );
  }

  const ctx = { characters: work.characters || [], glossary, accent: acc };

  // Track to play for the chapter currently in view. Chapters without a track
  // keep the previous one playing (no cut), so we only surface a real track.
  const activeChapter = work.chapters.find((c) => c.id === activeId);
  const elementTrack = work.track?.filename ? work.track : null;
  const activeTrack = (activeChapter?.track?.filename ? activeChapter.track : null) || elementTrack;
  const hasAnyTrack = Boolean(elementTrack) || work.chapters.some((c) => c.track?.filename);

  // Flat, in-reading-order media list so the lightbox can sweep the whole work.
  const flatMedia = [];
  work.chapters.forEach((c) => (c.media || []).forEach((m) => flatMedia.push(m)));
  (work.media || []).forEach((m) => flatMedia.push(m));
  const mediaIndex = (id) => flatMedia.findIndex((m) => m.id === id);

  return (
    <ReaderShell>
      <AmbientEffect effect={work.ambientEffect} accent={acc} />

      {/* Reading progress bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 60, background: 'transparent' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, rgba(${rgb},0.4), rgb(${rgb}))`, transition: 'width 0.1s linear' }} />
      </div>

      <ReaderNav
        crumb={`${work.project?.title || project} / ${work.title}`}
        accent={acc}
        onBack={() => goWriting(`/projets/ecriture/${project}`)}
        right={(
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ReaderSettings prefs={prefs} onChange={setPrefs} rgb={rgb} />
            {mobile && (
              <button type="button" onClick={() => setTocOpen((o) => !o)} style={tocToggleStyle(rgb)}>Sommaire</button>
            )}
          </span>
        )}
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
        <article ref={articleRef} style={readerVars(prefs)}>
          <header style={{ marginBottom: 48 }}>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgba(${rgb},0.7)`, letterSpacing: '1.5px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <button type="button" onClick={() => goWriting(`/projets/ecriture/${project}`)} style={{ background: 'none', border: 'none', color: `rgba(${rgb},0.7)`, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>{work.project?.title || project}</button>
              {(work.trail || []).map((t) => (
                <span key={t.slug}><span style={{ opacity: 0.4 }}> / </span><button type="button" onClick={() => goWriting(`/projets/ecriture/${project}/${t.slug}`)} style={{ background: 'none', border: 'none', color: `rgba(${rgb},0.7)`, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>{t.title}</button></span>
              ))}
              {work.type && <span style={{ marginLeft: 6, color: `rgb(${rgb})`, border: `1px solid rgba(${rgb},0.4)`, borderRadius: 4, padding: '1px 7px', textTransform: 'uppercase' }}>{work.type}</span>}
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

          {!!(work.linkedCharacters || []).length && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 36 }}>
              {work.linkedCharacters.map((c) => (
                <button type="button" key={c.id} onClick={() => goWriting(`/projets/ecriture/${project}/personnages/${c.slug}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `rgba(${rgb},0.08)`, border: `1px solid rgba(${rgb},0.28)`, borderRadius: 20, padding: '5px 14px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                  {c.note && <span style={{ fontSize: 10, color: `rgb(${rgb})`, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'JetBrains Mono',monospace" }}>{c.note}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ede8f8' }}>{c.name}</span>
                </button>
              ))}
            </div>
          )}

          {work.map?.zones?.length > 0 && (
            <section style={{ marginBottom: 48 }}>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: `rgba(${rgb},0.85)`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 18 }}>
                Carte de {work.title}
              </h2>
              <WritingWorldMap
                map={work.map}
                accent={acc}
                characters={work.characters || []}
                glossary={work.glossary || []}
                onNavigate={goWriting}
              />
            </section>
          )}

          {work.content && (
            <div style={{ ...readerTextStyle, marginBottom: work.chapters.length ? 56 : 24 }}>
              {renderMarkdown(work.content, ctx)}
            </div>
          )}

          <div style={{ background: 'var(--reader-bg, transparent)', borderRadius: 14, padding: 'var(--reader-pad, 0px)' }}>
            {work.chapters.map((ch) => (
              <ChapterBlock key={ch.id} chapter={ch} ctx={ctx} rgb={rgb} onOpenMedia={(id) => setLightbox(mediaIndex(id))} />
            ))}

            {work.chapters.length > 0 && (
              <ChapterFooterNav
                chapters={work.chapters}
                activeId={activeId}
                onGo={goTo}
                rgb={rgb}
              />
            )}
          </div>

          {!!(work.children || []).length && (
            <section style={{ marginTop: work.chapters.length || work.content ? 40 : 0, paddingTop: 28, borderTop: `1px solid rgba(${rgb},0.18)` }}>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: `rgba(${rgb},0.85)`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 18 }}>
                Contient
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                {work.children.map((c) => (
                  <button type="button" key={c.id} onClick={() => goWriting(`/projets/ecriture/${project}/${c.slug}`)}
                    style={{ textAlign: 'left', background: 'rgba(14,9,28,0.72)', border: `1px solid rgba(${rgb},0.2)`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${rgb},0.55)`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = `rgba(${rgb},0.2)`; e.currentTarget.style.transform = 'none'; }}>
                    <span style={{ display: 'block', fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: `rgb(${rgb})`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>{c.type}</span>
                    <span style={{ display: 'block', fontFamily: "'Georgia',serif", fontSize: 17, fontWeight: 700, color: '#ede8f8' }}>{c.title}</span>
                    {c.subtitle && <span style={{ display: 'block', fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(180,170,200,0.65)', marginTop: 3 }}>{c.subtitle}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {!work.chapters.length && !work.content && !(work.children || []).length && (
            <p style={{ fontFamily: "'Inter',sans-serif", color: 'rgba(180,170,200,0.5)', padding: '40px 0' }}>
              Cet élément est encore vide.
            </p>
          )}

          {!!(work.media || []).length && (
            <section style={{ marginTop: 24, paddingTop: 28, borderTop: `1px solid rgba(${rgb},0.18)` }}>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: `rgba(${rgb},0.85)`, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 18 }}>
                Galerie &amp; cartes
              </h2>
              <MediaGrid media={work.media} rgb={rgb} onOpen={(id) => setLightbox(mediaIndex(id))} />
            </section>
          )}
        </article>
      </div>

      {resume && (
        <ResumeBanner
          chapter={work.chapters.find((c) => c.id === resume.chapterId)}
          rgb={rgb}
          onResume={() => {
            window.scrollTo({ top: resume.scrollY, behavior: 'smooth' });
            setResume(null);
          }}
          onDismiss={() => setResume(null)}
        />
      )}

      {hasAnyTrack && <ReaderAudio activeTrack={activeTrack} accent={acc} />}
      <Lightbox items={flatMedia} index={lightbox} onClose={() => setLightbox(null)} onNavigate={setLightbox} />
    </ReaderShell>
  );
}

export function MediaGrid({ media = [], rgb, onOpen }) {
  if (!media.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
      {media.map((m) => (
        <figure key={m.id} style={{ margin: 0 }}>
          <button
            type="button"
            onClick={() => onOpen(m.id)}
            style={{
              display: 'block', width: '100%', padding: 0, cursor: 'zoom-in',
              border: `1px solid rgba(${rgb},0.22)`, borderRadius: 12, overflow: 'hidden',
              background: 'rgba(12,8,24,0.8)', aspectRatio: '4/3', transition: 'border-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${rgb},0.55)`)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = `rgba(${rgb},0.22)`)}
          >
            <img src={m.url} alt={m.caption || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
          {m.caption && (
            <figcaption style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: 'rgba(180,170,200,0.65)', marginTop: 6, lineHeight: 1.5 }}>{m.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
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
              <button type="button"
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

function ChapterBlock({ chapter, ctx, rgb, onOpenMedia }) {
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
        <h2 style={{ fontFamily: "'Georgia',serif", fontSize: 'clamp(24px,3.4vw,34px)', fontWeight: 700, color: 'var(--reader-heading, #ede8f8)', letterSpacing: '-0.5px' }}>
          {chapter.title}
          {chapter.titleKr && <span style={{ marginLeft: 12, fontSize: '0.6em', color: `rgba(${rgb},0.7)`, fontFamily: "'Noto Sans KR','Inter',sans-serif", fontWeight: 600 }}>{chapter.titleKr}</span>}
        </h2>
      </div>
      <div style={readerTextStyle}>
        {body}
      </div>
      {!!(chapter.media || []).length && (
        <div style={{ marginTop: 28 }}>
          <MediaGrid media={chapter.media} rgb={rgb} onOpen={onOpenMedia} />
        </div>
      )}
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

// Text blocks consume the reading preferences (size / width / theme) through
// the CSS variables set on the <article> by readerVars().
const readerTextStyle = {
  fontFamily: "'Georgia','Times New Roman',serif",
  fontSize: 'var(--reader-fs, clamp(16px,1.15vw,18px))',
  color: 'var(--reader-text, rgba(216,208,232,0.92))',
  maxWidth: 'var(--reader-maxw, 680px)',
};

// « chapitre X/N » + previous/next links, pinned after the last chapter and
// driven by the chapter currently in view.
function ChapterFooterNav({ chapters, activeId, onGo, rgb }) {
  const idx = Math.max(0, chapters.findIndex((c) => c.id === activeId));
  const prev = chapters[idx - 1];
  const next = chapters[idx + 1];
  const linkStyle = (disabled) => ({
    background: 'none', border: `1px solid rgba(${rgb},${disabled ? 0.12 : 0.35})`,
    color: disabled ? `rgba(${rgb},0.3)` : `rgb(${rgb})`,
    borderRadius: 10, padding: '10px 16px', cursor: disabled ? 'default' : 'pointer',
    fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
    maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  });
  return (
    <nav
      aria-label="Navigation entre chapitres"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        marginTop: 8, paddingTop: 24, borderTop: `1px solid rgba(${rgb},0.18)`,
      }}
    >
      <button type="button" disabled={!prev} onClick={() => prev && onGo(prev.id)} style={linkStyle(!prev)}>
        ← {prev ? (prev.title || prev.number || 'Chapitre précédent') : 'Début'}
      </button>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: `rgba(${rgb},0.7)`, flexShrink: 0 }}>
        chapitre {idx + 1}/{chapters.length}
      </span>
      <button type="button" disabled={!next} onClick={() => next && onGo(next.id)} style={linkStyle(!next)}>
        {next ? (next.title || next.number || 'Chapitre suivant') : 'Fin'} →
      </button>
    </nav>
  );
}

// Discreet « reprendre la lecture » banner shown when a saved position exists.
function ResumeBanner({ chapter, rgb, onResume, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 65,
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'rgba(10,6,24,0.94)', backdropFilter: 'blur(14px)',
      border: `1px solid rgba(${rgb},0.35)`, borderRadius: 999,
      padding: '8px 10px 8px 18px', maxWidth: 'min(440px, calc(100vw - 32px))',
      boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
    }}>
      <span style={{
        fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'rgba(220,212,238,0.9)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        Reprendre au chapitre {chapter ? (chapter.number || chapter.title || '') : ''} ?
      </span>
      <button
        type="button"
        onClick={onResume}
        style={{
          background: `rgb(${rgb})`, color: '#08051a', border: 'none', borderRadius: 999,
          padding: '7px 16px', cursor: 'pointer', flexShrink: 0,
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5, fontWeight: 700,
        }}
      >
        Reprendre
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Ignorer"
        style={{
          background: 'none', border: 'none', color: 'rgba(180,170,200,0.6)',
          cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '2px 6px', flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

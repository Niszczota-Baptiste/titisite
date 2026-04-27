import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ACCENTS, TWEAK_DEFAULTS } from '../data/constants';
import { projects as defaultProjects } from '../data/projects';
import { i18n } from '../data/i18n';

function readTweaks() {
  try { return { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem('portfolio_tweaks') || '{}') }; }
  catch { return { ...TWEAK_DEFAULTS }; }
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  const lang = localStorage.getItem('portfolio_lang') || 'fr';
  const mode = localStorage.getItem('portfolio_mode') || 'dark';
  const tweaks = readTweaks();
  const acc = ACCENTS[tweaks.accent] || ACCENTS.violet;
  const t = i18n[lang] || i18n.fr;

  useEffect(() => {
    document.body.classList.toggle('mode-light', mode === 'light');
    return () => document.body.classList.remove('mode-light');
  }, [mode]);

  useEffect(() => {
    api.list('projects')
      .then((rows) => {
        const items = rows?.length ? rows : defaultProjects;
        setProject(items.find((p) => String(p.id) === String(id)) ?? null);
        setLoading(false);
      })
      .catch(() => {
        setProject(defaultProjects.find((p) => String(p.id) === String(id)) ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-faint)', fontFamily: "'Inter',sans-serif", fontSize: 14,
      }}>
        Chargement…
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16,
      }}>
        <p style={{ color: 'var(--text-muted)', fontFamily: "'Inter',sans-serif", fontSize: 15 }}>
          Projet introuvable.
        </p>
        <button onClick={() => navigate('/')} style={backBtnStyle(acc)}>
          ← Retour au portfolio
        </button>
      </div>
    );
  }

  const sections = project.problem
    ? [
        { key: 'problem', fr: 'Problème', en: 'Problem', ko: '문제', val: project.problem },
        { key: 'solution', fr: 'Solution', en: 'Solution', ko: '솔루션', val: project.solution },
        { key: 'impact', fr: 'Impact', en: 'Impact', ko: '성과', val: project.impact },
      ]
    : [];

  const sectionLabel = (s) => lang === 'fr' ? s.fr : lang === 'ko' ? s.ko : s.en;

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      fontFamily: "'Inter',sans-serif",
    }}>
      {/* Top nav bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid var(--nav-border)',
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={() => navigate('/')} style={backBtnStyle(acc)}>
          ← {lang === 'ko' ? '포트폴리오로' : lang === 'en' ? 'Back to portfolio' : 'Retour au portfolio'}
        </button>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15,
          color: 'var(--text-faint)', letterSpacing: '-0.2px',
        }}>
          Baptiste<span style={{ color: acc.hex }}>.</span>
        </span>
      </header>

      {/* Hero banner */}
      <div style={{
        width: '100%', height: 280, position: 'relative', overflow: 'hidden',
        background: project.color,
      }}>
        {project.pageImageUrl ? (
          <img
            src={project.pageImageUrl}
            alt={project.title}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              opacity: 0.85,
            }}
          />
        ) : (
          <div style={{
            padding: '32px 48px', fontFamily: 'monospace', fontSize: 13,
            color: 'rgba(255,255,255,0.35)', lineHeight: 2, userSelect: 'none',
          }}>
            <span style={{ opacity: 0.5 }}>// {project.type}</span><br />
            {'{'}<br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '66' }}>title</span>: "{project.title}",<br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '66' }}>stack</span>: [{project.tags.join(', ')}],<br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '66' }}>status</span>: "{project.wip ? 'wip' : 'shipped'}",<br />
            {'}'}
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to bottom, transparent 40%, var(--bg))`,
        }} />
      </div>

      {/* Content */}
      <main style={{
        maxWidth: 720, margin: '0 auto', padding: '0 24px 80px',
      }}>
        {/* Title + meta */}
        <div style={{ marginTop: -40, position: 'relative', zIndex: 1, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <h1 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 700,
              color: 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1.15,
              flex: 1, minWidth: 200,
            }}>{project.title}</h1>
            {project.wip && (
              <span style={{
                background: `rgba(${acc.rgb},0.12)`, color: acc.hex,
                fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20,
                flexShrink: 0, marginTop: 8,
              }}>{t.projects.wip}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.5px',
              color: acc.hex, background: `rgba(${acc.rgb},0.1)`,
              padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase',
            }}>{project.type}</span>
            {project.tags.map((tag) => (
              <span key={tag} style={{
                background: 'var(--tag-bg)', border: '1px solid var(--tag-border)',
                color: 'var(--tag-color)', fontSize: 12,
                padding: '3px 10px', borderRadius: 20,
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.75,
          marginBottom: 40, borderBottom: '1px solid var(--border-dim)',
          paddingBottom: 32,
        }}>
          {project.desc[lang]}
        </p>

        {/* Problem / Solution / Impact */}
        {sections.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 48 }}>
            {sections.map((s) => (
              s.val?.[lang] ? (
                <div key={s.key}>
                  <h2 style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700,
                    color: acc.hex, letterSpacing: '2px', textTransform: 'uppercase',
                    marginBottom: 10,
                  }}>
                    {sectionLabel(s)}
                  </h2>
                  <p style={{
                    fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.75,
                  }}>
                    {s.val[lang]}
                  </p>
                </div>
              ) : null
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap',
          paddingTop: 24, borderTop: '1px solid var(--border-dim)',
        }}>
          {project.demoMode === 'external' && project.demoUrl && (
            <a
              href={project.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={actionLinkStyle(acc, true)}
            >
              ↗ {t.projects.demo}
            </a>
          )}
          {project.codeUrl && (
            <a
              href={project.codeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={actionLinkStyle(acc, false)}
            >
              {t.projects.code} →
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

function backBtnStyle(acc) {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-faint)', fontFamily: "'Inter',sans-serif",
    fontSize: 13, padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6,
    transition: 'color 0.2s',
  };
}

function actionLinkStyle(acc, primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: primary ? `rgba(${acc.rgb},0.12)` : 'var(--surface)',
    color: primary ? acc.hex : 'var(--text-muted)',
    border: `1px solid ${primary ? `rgba(${acc.rgb},0.35)` : 'var(--border)'}`,
    borderRadius: 10, padding: '10px 20px',
    fontSize: 13.5, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", textDecoration: 'none',
    transition: 'all 0.2s',
  };
}

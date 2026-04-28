import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { ACCENTS, TWEAK_DEFAULTS } from '../data/constants';
import { projects as defaultProjects } from '../data/projects';
import { i18n } from '../data/i18n';

function readPrefs() {
  try {
    const tweaks = { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem('portfolio_tweaks') || '{}') };
    return {
      lang: localStorage.getItem('portfolio_lang') || 'fr',
      mode: localStorage.getItem('portfolio_mode') || 'dark',
      accent: tweaks.accent || 'violet',
    };
  } catch {
    return { lang: 'fr', mode: 'dark', accent: 'violet' };
  }
}

// ── Terminal prompt ──────────────────────────────────────────────────────────
function Prompt({ command, acc }) {
  return (
    <p style={{
      fontFamily: 'monospace', fontSize: 13,
      marginBottom: 10, userSelect: 'none',
    }}>
      <span style={{ color: acc.hex }}>Baptiste</span>
      <span style={{ color: `rgba(${acc.rgb},0.5)` }}>@portfolio</span>
      <span style={{ color: 'var(--text-faint)' }}>:~$ </span>
      <span style={{ color: 'var(--text-muted)' }}>{command}</span>
    </p>
  );
}

// ── Section header — "## Title" ──────────────────────────────────────────────
function SectionH({ children, acc }) {
  return (
    <h2 style={{
      fontFamily: 'monospace', fontSize: 22, fontWeight: 700,
      color: 'var(--text)', marginBottom: 20, letterSpacing: '-0.3px',
      display: 'flex', alignItems: 'baseline', gap: 10,
    }}>
      <span style={{ color: acc.hex, fontWeight: 700 }}>##</span>
      {children}
    </h2>
  );
}

// ── Status dot color ─────────────────────────────────────────────────────────
function statusColor(status) {
  if (!status) return 'rgba(180,170,200,0.5)';
  const s = status.toLowerCase();
  if (s === 'en ligne' || s === 'shipped') return '#5cb85c';
  if (s === 'beta') return '#e8a347';
  if (s === 'wip' || s === 'en cours') return '#c9a8e8';
  return 'rgba(180,170,200,0.6)';
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang, mode, accent } = readPrefs();
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const t = i18n[lang] || i18n.fr;

  const [project, setProject] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.body.classList.toggle('mode-light', mode === 'light');
    return () => document.body.classList.remove('mode-light');
  }, [mode]);

  useEffect(() => {
    api.list('projects')
      .then((rows) => {
        const items = rows?.length ? rows : defaultProjects;
        setAllProjects(items);
        setProject(items.find((p) => String(p.id) === String(id)) ?? null);
        setLoading(false);
      })
      .catch(() => {
        setAllProjects(defaultProjects);
        setProject(defaultProjects.find((p) => String(p.id) === String(id)) ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: 'var(--text-faint)', fontSize: 13,
    }}>
      loading…
    </div>
  );

  if (!project) return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 20,
    }}>
      <p style={{ fontFamily: 'monospace', color: 'var(--text-faint)', fontSize: 14 }}>
        404 — projet introuvable
      </p>
      <button onClick={() => navigate('/')} style={navBtnStyle}>
        ← cd ..
      </button>
    </div>
  );

  const others = allProjects.filter((p) => String(p.id) !== String(id)).slice(0, 3);
  const typeShort = { web: 'WEB', mobile: 'MOB', experimental: 'EXP' }[project.type] || project.type.toUpperCase().slice(0, 3);
  const slug = project.title.toLowerCase().replace(/\s+/g, '-');
  const overviewText = project.desc?.[lang] || project.desc?.fr || '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "'Inter',sans-serif" }}>

      {/* ── Sticky nav ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(20px) saturate(1.6)',
        borderBottom: '1px solid var(--nav-border)',
        padding: '0 48px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={() => navigate('/')} style={navBtnStyle}>
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
            <span style={{ color: 'var(--text-faint)' }}>← cd .. / </span>
            <span style={{ color: acc.hex }}>projects/</span>
            <span style={{ color: 'var(--text-muted)' }}>{slug}</span>
          </span>
        </button>
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15,
          color: 'var(--text-faint)', letterSpacing: '-0.2px',
        }}>
          Baptiste<span style={{ color: acc.hex }}>.</span>
        </span>
      </header>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 1100, margin: '0 auto', padding: '56px 48px 48px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start',
      }}>
        {/* Left */}
        <div>
          {/* Type badge */}
          <p style={{
            fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
            color: acc.hex, marginBottom: 16, letterSpacing: '1px',
          }}>
            [{typeShort}] {project.type.toUpperCase()}
          </p>

          {/* Title */}
          <h1 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 48, fontWeight: 800,
            color: 'var(--text)', letterSpacing: '-1.5px', lineHeight: 1.05,
            marginBottom: 16,
          }}>{project.title}</h1>

          {/* Tagline */}
          {project.tagline && (
            <p style={{
              fontFamily: "'Inter',sans-serif", fontSize: 15,
              color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28,
            }}>{project.tagline}</p>
          )}

          {/* Meta cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {project.status && (
              <MetaCard label="STATUT" acc={acc}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'monospace', fontSize: 14, color: 'var(--text)',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: statusColor(project.status), flexShrink: 0,
                  }} />
                  {project.status}
                </span>
              </MetaCard>
            )}
            {project.year && (
              <MetaCard label="ANNÉE" acc={acc}>
                <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--text)' }}>
                  {project.year}
                </span>
              </MetaCard>
            )}
            <MetaCard label="CATÉGORIE" acc={acc}>
              <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--text)' }}>
                {project.type}
              </span>
            </MetaCard>
            {(project.links || []).length > 0 && (
              <MetaCard label="LIENS" acc={acc}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(project.links || []).map((lk) => (
                    lk.url ? (
                      <a key={lk.label} href={lk.url} target="_blank" rel="noopener noreferrer"
                        style={{
                          fontFamily: 'monospace', fontSize: 12,
                          background: `rgba(${acc.rgb},0.12)`, color: acc.hex,
                          border: `1px solid rgba(${acc.rgb},0.3)`,
                          borderRadius: 20, padding: '3px 10px',
                          textDecoration: 'none',
                        }}>
                        {lk.label}
                      </a>
                    ) : (
                      <span key={lk.label} style={{
                        fontFamily: 'monospace', fontSize: 12,
                        background: 'rgba(180,170,200,0.08)', color: 'rgba(180,170,200,0.6)',
                        border: '1px solid rgba(180,170,200,0.15)',
                        borderRadius: 20, padding: '3px 10px',
                      }}>{lk.label}: soon</span>
                    )
                  ))}
                </div>
              </MetaCard>
            )}
          </div>

          {/* Tags */}
          {(project.tags || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {project.tags.map((tag) => (
                <span key={tag} style={{
                  fontFamily: 'monospace', fontSize: 12,
                  background: 'var(--tag-bg)', border: '1px solid var(--tag-border)',
                  color: 'var(--tag-color)', borderRadius: 20, padding: '4px 12px',
                }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Right — fake window preview */}
        <div style={{
          background: 'rgba(10,6,22,0.8)', borderRadius: 12,
          border: '1px solid rgba(80,50,130,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {/* Window chrome */}
          <div style={{
            background: 'rgba(18,12,36,0.95)', padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid rgba(80,50,130,0.18)',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <span style={{
              flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: 11,
              color: 'rgba(180,170,200,0.4)',
            }}>
              {slug}.preview
            </span>
          </div>
          {/* Preview area */}
          <div style={{ aspectRatio: '16/10', position: 'relative', overflow: 'hidden' }}>
            {project.pageImageUrl ? (
              <img
                src={project.pageImageUrl}
                alt={`${project.title} preview`}
                loading="lazy"
                decoding="async"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%', position: 'relative',
                background: project.color || 'var(--surface)',
                backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.015) 0,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 12,
                  color: 'rgba(180,170,200,0.25)', userSelect: 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ opacity: 0.6 }}>▣</span>
                  hero shot · {slug}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '0 48px',
      }}>
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-dim)', margin: 0 }} />
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 48px 80px' }}>

        {/* Overview */}
        <div style={{ marginBottom: 72 }}>
          <Prompt command="cat overview.md" acc={acc} />
          <SectionH acc={acc}>Vue d'ensemble</SectionH>
          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 15.5,
            color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 680,
          }}>{overviewText}</p>
        </div>

        {/* Problem / Solution / Impact */}
        {(project.problem?.[lang] || project.solution?.[lang] || project.impact?.[lang]) && (
          <div style={{ marginBottom: 72 }}>
            <Prompt command="cat details.md" acc={acc} />
            <SectionH acc={acc}>Détails</SectionH>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
              {[
                { key: 'problem', fr: 'Problème', en: 'Problem', ko: '문제' },
                { key: 'solution', fr: 'Solution', en: 'Solution', ko: '솔루션' },
                { key: 'impact', fr: 'Impact', en: 'Impact', ko: '성과' },
              ].map(({ key, fr, en, ko }) => {
                const val = project[key]?.[lang];
                if (!val) return null;
                const label = lang === 'fr' ? fr : lang === 'ko' ? ko : en;
                return (
                  <div key={key} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '20px 22px',
                  }}>
                    <p style={{
                      fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                      color: acc.hex, letterSpacing: '1.5px', textTransform: 'uppercase',
                      marginBottom: 10,
                    }}>{label}</p>
                    <p style={{
                      fontFamily: "'Inter',sans-serif", fontSize: 13.5,
                      color: 'var(--text-muted)', lineHeight: 1.7,
                    }}>{val}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Highlights */}
        {(project.highlights || []).length > 0 && (
          <div style={{ marginBottom: 72 }}>
            <Prompt command="ls ./highlights" acc={acc} />
            <SectionH acc={acc}>Points forts</SectionH>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {project.highlights.map((h, i) => (
                <div key={i} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 18,
                }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                    color: acc.hex, flexShrink: 0, minWidth: 24,
                  }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 14,
                    color: 'var(--text-muted)',
                  }}>{h}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Screenshots */}
        {(project.screenshots || []).filter(Boolean).length > 0 && (
          <div style={{ marginBottom: 72 }}>
            <Prompt command="ls ./screenshots" acc={acc} />
            <SectionH acc={acc}>Screenshots</SectionH>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min((project.screenshots || []).filter(Boolean).length, 3)}, 1fr)`,
              gap: 16,
            }}>
              {(project.screenshots || []).filter(Boolean).map((url, i) => (
                <div key={i} style={{
                  borderRadius: 12, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  aspectRatio: (project.type === 'mobile') ? '9/16' : '16/10',
                }}>
                  <img
                    src={url}
                    alt={`${project.title} / screen ${String(i + 1).padStart(2, '0')}`}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {(project.codeUrl || (project.demoMode === 'external' && project.demoUrl)) && (
          <div style={{ marginBottom: 72 }}>
            <div style={{
              borderTop: '1px solid var(--border-dim)', paddingTop: 32,
              display: 'flex', gap: 12, flexWrap: 'wrap',
            }}>
              {project.demoMode === 'external' && project.demoUrl && (
                <a href={project.demoUrl} target="_blank" rel="noopener noreferrer"
                  style={actionLink(acc, true)}>
                  ↗ {t.projects.demo}
                </a>
              )}
              {project.codeUrl && (
                <a href={project.codeUrl} target="_blank" rel="noopener noreferrer"
                  style={actionLink(acc, false)}>
                  {t.projects.code} →
                </a>
              )}
            </div>
          </div>
        )}

        {/* Other projects */}
        {others.length > 0 && (
          <div>
            <Prompt command="ls ../" acc={acc} />
            <SectionH acc={acc}>Autres projets</SectionH>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))',
              gap: 16,
            }}>
              {others.map((p) => {
                const short = { web: 'WEB', mobile: 'MOB', experimental: 'EXP' }[p.type] || p.type.toUpperCase().slice(0, 3);
                const snippet = p.tagline || (p.desc?.[lang] || p.desc?.fr || '').slice(0, 80) + '…';
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '18px 20px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.2s, transform 0.2s',
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `rgba(${acc.rgb},0.5)`;
                      e.currentTarget.style.transform = 'translateY(-3px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
                        background: `rgba(${acc.rgb},0.12)`, color: acc.hex,
                        border: `1px solid rgba(${acc.rgb},0.25)`,
                        borderRadius: 6, padding: '3px 8px', letterSpacing: '0.5px',
                      }}>{short}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        {p.year && (
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-faint)' }}>
                            {p.year}
                          </span>
                        )}
                        {(p.status || p.wip) && (
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: statusColor(p.status || (p.wip ? 'WIP' : '')) }}>
                            · {p.status || 'WIP'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p style={{
                        fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700,
                        color: 'var(--text)', letterSpacing: '-0.3px', marginBottom: 4,
                      }}>/{p.title}</p>
                      <p style={{
                        fontFamily: "'Inter',sans-serif", fontSize: 13,
                        color: 'var(--text-muted)', lineHeight: 1.5,
                      }}>{snippet}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(p.tags || []).slice(0, 3).map((tag) => (
                          <span key={tag} style={{
                            fontFamily: 'monospace', fontSize: 10,
                            background: 'var(--tag-bg)', border: '1px solid var(--tag-border)',
                            color: 'var(--tag-color)', borderRadius: 20, padding: '2px 8px',
                          }}>{tag}</span>
                        ))}
                      </div>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 11,
                        color: `rgba(${acc.rgb},0.6)`, flexShrink: 0,
                      }}>open →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function MetaCard({ label, acc, children }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 14px', minWidth: 100,
    }}>
      <p style={{
        fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700,
        color: 'var(--text-faint)', letterSpacing: '1.5px',
        textTransform: 'uppercase', marginBottom: 6,
      }}>{label}</p>
      {children}
    </div>
  );
}

const navBtnStyle = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-faint)', padding: 0,
  display: 'flex', alignItems: 'center',
};

function actionLink(acc, primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: primary ? `rgba(${acc.rgb},0.12)` : 'var(--surface)',
    color: primary ? acc.hex : 'var(--text-muted)',
    border: `1px solid ${primary ? `rgba(${acc.rgb},0.35)` : 'var(--border)'}`,
    borderRadius: 10, padding: '10px 22px',
    fontSize: 13.5, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", textDecoration: 'none',
  };
}

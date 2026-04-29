import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { TWEAK_DEFAULTS } from '../data/constants';
import { projects as defaultProjects } from '../data/projects';
import {
  AmbientCanvas,
  PdpKeyframes,
  WaveformDeco,
  useReveal,
} from '../components/project/detail/Ambient';
import {
  BrowserShot,
  DetailCard,
  MetricCard,
  OtherCard,
  SectionCmd,
  TechBadge,
} from '../components/project/detail/Parts';

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

const TYPE_SHORT = { web: 'WEB', mobile: 'MOB', experimental: 'EXP' };
const FALLBACK_TECH_COLORS = ['#c9a8e8', '#7eb8f7', '#9ad4ae', '#e8a87c', '#ff9a70', '#61dafb'];

function buildTech(project) {
  if (Array.isArray(project.tech) && project.tech.length > 0) {
    return project.tech.filter((t) => t && t.name);
  }
  return (project.tags || []).map((name, i) => ({
    name,
    color: FALLBACK_TECH_COLORS[i % FALLBACK_TECH_COLORS.length],
  }));
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lang } = readPrefs();

  const [project, setProject] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useReveal([id, loading]);

  useEffect(() => {
    let cancelled = false;
    api.list('projects')
      .then((rows) => {
        if (cancelled) return;
        const items = rows?.length ? rows : defaultProjects;
        setAllProjects(items);
        setProject(items.find((p) => String(p.id) === String(id)) ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAllProjects(defaultProjects);
        setProject(defaultProjects.find((p) => String(p.id) === String(id)) ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050511',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono',monospace", color: '#4a3860', fontSize: 13,
      }}>loading…</div>
    );
  }

  if (!project) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050511',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 20,
      }}>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", color: '#4a3860', fontSize: 14 }}>
          404 — projet introuvable
        </p>
        <button onClick={() => navigate('/')} style={{
          background: 'transparent', border: '1px solid rgba(201,168,232,0.35)',
          color: '#c9a8e8', borderRadius: 8, padding: '8px 16px',
          cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace",
        }}>← cd ..</button>
      </div>
    );
  }

  const slug = (project.title || '').toLowerCase().replace(/\s+/g, '-');
  const typeShort = TYPE_SHORT[project.type] || (project.type || '').toUpperCase().slice(0, 3);
  const desc = project.desc?.[lang] || project.desc?.fr || '';
  const problem = project.problem?.[lang] || project.problem?.fr || '';
  const solution = project.solution?.[lang] || project.solution?.fr || '';
  const impact = project.impact?.[lang] || project.impact?.fr || '';
  const tech = buildTech(project);
  const metrics = (project.metrics || []).filter((m) => m && (m.value || m.label));
  const screenshots = (project.screenshots || []).filter(Boolean);
  const heroImage = project.pageImageUrl || screenshots[0] || '';
  const others = allProjects.filter((p) => String(p.id) !== String(id)).slice(0, 4);

  return (
    <div style={{ minHeight: '100vh', position: 'relative', background: '#050511', color: '#ede8f8', fontFamily: "'Inter',sans-serif" }}>
      <PdpKeyframes />
      <AmbientCanvas />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Nav ── */}
        <nav style={{
          height: 52, background: 'rgba(5,5,17,0.88)',
          borderBottom: '1px solid rgba(60,40,100,0.25)',
          backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center',
          padding: '0 clamp(16px,4vw,48px)',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, opacity: 0.75,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.75')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
              {[3, 5, 2, 4, 3].map((h, i) => (
                <div key={i} style={{
                  width: 2, borderRadius: 1, background: '#c9a8e8',
                  height: h + 2, opacity: 0.55,
                }} />
              ))}
            </div>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#c9a8e8' }}>← back</span>
          </button>
          <span style={{ color: 'rgba(201,168,232,0.2)', margin: '0 12px', fontSize: 14 }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
            <span style={{ color: 'rgba(201,168,232,0.3)' }}>♩</span>
            <span style={{ color: 'rgba(201,168,232,0.35)' }}>projects</span>
            <span style={{ color: 'rgba(201,168,232,0.18)' }}>/</span>
            <span style={{ color: '#c9a8e8', fontWeight: 600 }}>{slug}</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14,
            color: '#ede8f8',
          }}>Baptiste<span style={{ color: '#c9a8e8' }}>.</span></span>
        </nav>

        {/* ── Hero ── */}
        <section style={{
          padding: 'clamp(48px,8vh,88px) clamp(16px,6vw,88px) 64px',
          maxWidth: 1280, margin: '0 auto',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
            gap: 64, alignItems: 'center',
          }}>
            <div style={{ animation: 'pdpFadeUp 0.7s ease both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <span style={{
                  background: 'rgba(201,168,232,0.08)',
                  border: '1px solid rgba(201,168,232,0.25)',
                  color: '#c9a8e8',
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
                  padding: '3px 10px', borderRadius: 4,
                }}>[{typeShort}]</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#4a3860' }}>
                  {(project.type || '').toLowerCase()}
                </span>
                {project.wip && (
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 10, color: '#e8a87c',
                    border: '1px solid rgba(232,168,124,0.3)',
                    padding: '2px 8px', borderRadius: 4,
                  }}>WIP</span>
                )}
              </div>

              <h1 style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 'clamp(36px,5.5vw,72px)', fontWeight: 800,
                color: '#ede8f8', letterSpacing: '-2px', lineHeight: 1.05, marginBottom: 20,
              }}>{project.title}</h1>

              {(project.tagline || desc) && (
                <p style={{
                  fontSize: 15, color: '#7a6888', lineHeight: 1.8,
                  marginBottom: 28, maxWidth: 480,
                }}>{project.tagline || desc}</p>
              )}

              <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
                {[
                  { label: 'Année', value: project.year },
                  { label: 'Statut', value: project.status },
                  { label: 'Type', value: project.type },
                ].filter((m) => m.value).map((m) => (
                  <div key={m.label}>
                    <p style={{
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
                      color: '#4a3860', letterSpacing: '1.2px',
                      textTransform: 'uppercase', marginBottom: 4,
                    }}>{m.label}</p>
                    <p style={{
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 13, fontWeight: 600, color: '#c9a8e8',
                    }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {tech.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                  {tech.map((t) => <TechBadge key={t.name} tech={t} />)}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4 }}>
                <WaveformDeco playing color="#c9a8e8" />
                <span style={{
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                  color: '#4a3860', letterSpacing: '1px', whiteSpace: 'nowrap',
                }}>ambient · en cours</span>
              </div>
            </div>

            <div style={{ animation: 'pdpFadeUp 0.7s ease 0.2s both' }}>
              <BrowserShot slug={slug} imageUrl={heroImage} alt={project.title} />
            </div>
          </div>
        </section>

        {/* ── Metrics ── */}
        {metrics.length > 0 && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 80px', maxWidth: 1280, margin: '0 auto' }}>
            <SectionCmd cmd="metrics.json" title="## Métriques" trackNum="00" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))',
              gap: 14,
            }}>
              {metrics.map((m, i) => (
                <MetricCard key={`${m.label}-${i}`} metric={m} delay={i * 0.08} />
              ))}
            </div>
          </section>
        )}

        {/* ── Overview ── */}
        {desc && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 80px', maxWidth: 1280, margin: '0 auto' }}>
            <SectionCmd cmd="overview.md" title="## Vue d'ensemble" trackNum="01" />
            <p className="pdp-reveal" style={{
              fontFamily: "'Inter',sans-serif", fontSize: 16,
              color: '#8a7898', lineHeight: 1.9, maxWidth: 760,
              paddingLeft: 20, borderLeft: '2px solid rgba(201,168,232,0.2)',
              whiteSpace: 'pre-wrap',
            }}>{desc}</p>
          </section>
        )}

        {/* ── Details ── */}
        {(problem || solution || impact) && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 80px', maxWidth: 1280, margin: '0 auto' }}>
            <SectionCmd cmd="details.md" title="## Détails" trackNum="02" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))',
              gap: 16,
            }}>
              {problem && <DetailCard label="Problème" icon="🔍" color="#ff7070" text={problem} delay={0} />}
              {solution && <DetailCard label="Solution" icon="⚡" color="#c9a8e8" text={solution} delay={0.1} />}
              {impact && <DetailCard label="Impact" icon="📈" color="#9ad4ae" text={impact} delay={0.2} />}
            </div>
          </section>
        )}

        {/* ── Tech Stack ── */}
        {tech.length > 0 && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 80px', maxWidth: 1280, margin: '0 auto' }}>
            <SectionCmd cmd="stack.json" title="## Stack technique" trackNum="03" />
            <div className="pdp-reveal" style={{
              background: 'rgba(10,6,22,0.8)',
              border: '1px solid rgba(80,50,130,0.22)',
              borderRadius: 16, padding: '28px 32px', backdropFilter: 'blur(12px)',
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 13,
                lineHeight: 2.2, marginBottom: 24,
              }}>
                <span style={{ color: '#2a1e40' }}>{'{'}</span><br />
                {tech.map((t, i) => (
                  <div key={t.name} style={{
                    paddingLeft: 24,
                    animation: `pdpSlideIn 0.3s ease ${0.1 + i * 0.08}s both`,
                  }}>
                    <span style={{ color: '#9ad4ae' }}>"{t.name}"</span>
                    <span style={{ color: '#4a3860' }}>: </span>
                    <span style={{ color: '#e8a87c' }}>"latest"</span>
                    {i < tech.length - 1 && <span style={{ color: '#4a3860' }}>,</span>}
                  </div>
                ))}
                <span style={{ color: '#2a1e40' }}>{'}'}</span>
              </div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8,
                borderTop: '1px solid rgba(60,40,100,0.2)', paddingTop: 20,
              }}>
                {tech.map((t) => <TechBadge key={t.name} tech={t} />)}
              </div>
            </div>
          </section>
        )}

        {/* ── Screenshots ── */}
        {screenshots.length > 0 && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 80px', maxWidth: 1280, margin: '0 auto' }}>
            <SectionCmd cmd="screenshots" title="## Screenshots" trackNum="04" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill,minmax(${project.type === 'mobile' ? '220px' : '320px'},1fr))`,
              gap: 14,
            }}>
              {screenshots.map((url, i) => (
                <div key={i} className="pdp-reveal" style={{
                  transitionDelay: `${i * 0.1}s`,
                  border: '1px solid rgba(80,50,130,0.25)',
                  borderRadius: 14, overflow: 'hidden',
                  background: 'rgba(12,8,24,0.8)',
                  aspectRatio: project.type === 'mobile' ? '9/16' : '16/9',
                  position: 'relative', transition: 'all 0.3s',
                }}>
                  <img
                    src={url}
                    alt={`${project.title} / screen ${String(i + 1).padStart(2, '0')}`}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.03) 0px,rgba(0,0,0,0.03) 1px,transparent 1px,transparent 3px)',
                    pointerEvents: 'none',
                  }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Action links ── */}
        {(project.codeUrl || (project.demoMode === 'external' && project.demoUrl) || (project.links || []).some((l) => l.url)) && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 80px', maxWidth: 1280, margin: '0 auto' }}>
            <div style={{
              borderTop: '1px solid rgba(60,40,100,0.15)', paddingTop: 32,
              display: 'flex', gap: 12, flexWrap: 'wrap',
            }}>
              {project.demoMode === 'external' && project.demoUrl && (
                <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" style={actionLink(true)}>↗ Voir la démo</a>
              )}
              {project.codeUrl && (
                <a href={project.codeUrl} target="_blank" rel="noopener noreferrer" style={actionLink(false)}>Code source →</a>
              )}
              {(project.links || []).filter((l) => l.url).map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={actionLink(false)}>
                  {l.label} →
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── Other projects ── */}
        {others.length > 0 && (
          <section style={{ padding: '0 clamp(16px,6vw,88px) 100px', maxWidth: 1280, margin: '0 auto' }}>
            <SectionCmd cmd="autres projets" title="## Autres projets" trackNum="05" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
              gap: 14,
            }}>
              {others.map((p) => (
                <div key={p.id} className="pdp-reveal">
                  <OtherCard p={p} lang={lang} onOpen={() => navigate(`/projects/${p.id}`)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer style={{
          borderTop: '1px solid rgba(60,40,100,0.15)',
          padding: '28px clamp(16px,6vw,88px)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a4870', padding: 0,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a8e8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#5a4870')}
          >← Retour au portfolio</button>
          <p style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#2a1e40',
          }}>Baptiste Niszczota · {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}

function actionLink(primary) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: primary ? 'rgba(201,168,232,0.12)' : 'rgba(14,9,28,0.72)',
    color: primary ? '#c9a8e8' : '#7a6888',
    border: `1px solid ${primary ? 'rgba(201,168,232,0.35)' : 'rgba(80,50,130,0.28)'}`,
    borderRadius: 10, padding: '10px 22px',
    fontSize: 13.5, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", textDecoration: 'none',
  };
}

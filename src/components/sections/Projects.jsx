import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACCENTS } from '../../data/constants';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

export function Projects({ t, lang, accent, items = [] }) {
  const [filter, setFilter] = useState('all');
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const keys = ['all', 'web', 'mobile', 'experimental'];
  const vis = filter === 'all' ? items : items.filter((p) => p.type === filter);

  return (
    <Section id="projects">
      <SectionHeader title={t.projects.title} subtitle={t.projects.subtitle} accent={accent} />
      <div className="reveal" style={{ display: 'flex', gap: 8, marginBottom: 44, flexWrap: 'wrap' }}>
        {keys.map((k, i) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              background: filter === k ? acc.hex : 'var(--filter-bg)',
              color: filter === k ? '#08051a' : 'var(--text-faint)',
              border: `1px solid ${filter === k ? acc.hex : 'var(--border)'}`,
              borderRadius: 20, padding: '6px 18px', cursor: 'pointer',
              fontFamily: "'Inter',sans-serif", fontSize: 13,
              fontWeight: filter === k ? 700 : 400,
              transition: 'all 0.2s', backdropFilter: 'blur(8px)',
            }}
          >
            {t.projects.filters[i]}
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
          gap: 18,
        }}
      >
        {vis.map((p, i) => (
          <div key={p.id} className="reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
            <ProjectCard p={p} t={t} lang={lang} accent={accent} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProjectDetailModal({ p, t, lang, accent, onClose }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', fn); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2,1,10,0.85)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '60px 20px 40px', overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680, background: '#0b0620',
          border: '1px solid rgba(80,50,130,0.35)', borderRadius: 16,
          boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
        }}
      >
        {/* Header with color banner */}
        <div style={{
          width: '100%', height: 120, borderRadius: '16px 16px 0 0',
          background: p.color, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 22px', fontFamily: 'monospace', fontSize: 11,
            color: 'rgba(255,255,255,0.45)', lineHeight: 1.9, userSelect: 'none',
          }}>
            <span style={{ opacity: 0.6 }}>// {p.type}</span><br />
            {'{'}<br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '88' }}>title</span>: "{p.title}"
            <br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '88' }}>stack</span>: [{p.tags.slice(0, 3).join(', ')}]
            <br />
            {'}'}
          </div>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(135deg,rgba(${acc.rgb},0.06),transparent)`,
          }} />
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 14,
            background: 'rgba(0,0,0,0.4)', border: 'none', color: 'rgba(255,255,255,0.7)',
            borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
            fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        <div style={{ padding: '22px 26px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700,
              color: 'var(--text)', letterSpacing: '-0.4px',
            }}>{p.title}</h2>
            {p.wip && (
              <span style={{
                background: `rgba(${acc.rgb},0.1)`, color: acc.hex,
                fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                flexShrink: 0, marginTop: 4,
              }}>{t.projects.wip}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {p.tags.map((tag) => (
              <span key={tag} style={{
                background: 'var(--tag-bg)', border: '1px solid var(--tag-border)',
                color: 'var(--tag-color)', fontSize: 11, fontWeight: 500,
                padding: '3px 9px', borderRadius: 20,
              }}>{tag}</span>
            ))}
          </div>

          <p style={{
            fontFamily: "'Inter',sans-serif", fontSize: 14, color: 'var(--text-muted)',
            lineHeight: 1.7, marginBottom: 22,
          }}>{p.desc[lang]}</p>

          {p.problem && [
            ['Problème', 'Problem', '문제', p.problem],
            ['Solution', 'Solution', '솔루션', p.solution],
            ['Impact', 'Impact', '성과', p.impact],
          ].map(([fr, en, ko, val]) => val && (
            <div key={fr} style={{ marginBottom: 18 }}>
              <p style={{
                fontFamily: "'Inter',sans-serif", fontSize: 10.5,
                color: acc.hex, letterSpacing: '1px', textTransform: 'uppercase',
                marginBottom: 6, fontWeight: 600,
              }}>
                {lang === 'fr' ? fr : lang === 'ko' ? ko : en}
              </p>
              <p style={{
                fontFamily: "'Inter',sans-serif", fontSize: 13.5,
                color: 'var(--text-muted)', lineHeight: 1.7,
              }}>{val[lang]}</p>
            </div>
          ))}

          {p.demoUrl && (
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-dim)' }}>
              <a
                href={p.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: `rgba(${acc.rgb},0.12)`, color: acc.hex,
                  border: `1px solid rgba(${acc.rgb},0.3)`, borderRadius: 8,
                  padding: '9px 18px', fontSize: 13, fontWeight: 600,
                  fontFamily: "'Inter',sans-serif", textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
              >
                ↗ {t.projects.demo}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ p, t, lang, accent }) {
  const [hov, setHov] = useState(false);
  const [expanded, setExp] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const navigate = useNavigate();

  return (
    <div
      data-interactive
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'var(--surface-hov)' : 'var(--surface)',
        border: `1px solid ${hov ? acc.hex + '55' : 'var(--border)'}`,
        borderRadius: 16, cursor: 'pointer',
        transition: 'all 0.32s cubic-bezier(.22,1,.36,1)',
        transform: hov ? 'translateY(-5px)' : 'none',
        boxShadow: hov ? '0 20px 48px rgba(80,40,160,0.18)' : 'none',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ padding: 28, paddingBottom: 20 }}>
        <div
          style={{
            width: '100%', height: 128, borderRadius: 10, marginBottom: 20,
            background: p.color, position: 'relative', overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              padding: '12px 16px', fontFamily: 'monospace', fontSize: 10.5,
              color: 'var(--code-muted)', lineHeight: 1.9, userSelect: 'none',
            }}
          >
            <span style={{ opacity: 0.6 }}>// {p.type}</span>
            <br />
            {'{'}
            <br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '88' }}>title</span>: "{p.title}"
            <br />
            &nbsp;&nbsp;<span style={{ color: acc.hex + '88' }}>stack</span>: [{p.tags.slice(0, 2).join(', ')}]
            <br />
            {'}'}
          </div>
          {hov && (
            <div
              style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(135deg,rgba(${acc.rgb},0.08),transparent)`,
              }}
            />
          )}
          {p.wip && (
            <span
              style={{
                position: 'absolute', top: 10, right: 10,
                background: `rgba(${acc.rgb},0.12)`, color: acc.hex,
                fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
              }}
            >
              {t.projects.wip}
            </span>
          )}
        </div>
        <h3
          style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700,
            color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.3px',
          }}
        >
          {p.title}
        </h3>
        <p
          style={{
            fontFamily: "'Inter',sans-serif", fontSize: 13.5,
            color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 16,
          }}
        >
          {p.desc[lang]}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {p.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: 'var(--tag-bg)',
                border: '1px solid var(--tag-border)',
                color: 'var(--tag-color)',
                fontSize: 11, fontWeight: 500,
                padding: '3px 9px', borderRadius: 20,
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {p.problem && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExp((x) => !x);
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-faint)', fontFamily: "'Inter',sans-serif",
              fontSize: 12, padding: 0, display: 'flex', alignItems: 'center',
              gap: 6, transition: 'color 0.2s', marginBottom: expanded ? 14 : 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = acc.hex)}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
          >
            <span
              style={{
                transition: 'transform 0.2s', display: 'inline-block',
                transform: expanded ? 'rotate(90deg)' : 'none',
              }}
            >
              ▶
            </span>
            {expanded
              ? lang === 'ko' ? '접기' : 'Réduire'
              : lang === 'ko' ? '상세' : 'Impact & détails'}
          </button>
        )}

        {expanded && p.problem && (
          <div
            style={{
              borderTop: '1px solid var(--border-dim)',
              paddingTop: 16,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            {[
              ['Problème', 'Problem', '문제', p.problem],
              ['Solution', 'Solution', '솔루션', p.solution],
              ['Impact', 'Impact', '성과', p.impact],
            ].map(([fr, en, ko, val]) => (
              <div key={fr}>
                <p
                  style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 10.5,
                    color: acc.hex, letterSpacing: '1px', textTransform: 'uppercase',
                    marginBottom: 4, fontWeight: 600,
                  }}
                >
                  {lang === 'fr' ? fr : lang === 'ko' ? ko : en}
                </p>
                <p
                  style={{
                    fontFamily: "'Inter',sans-serif", fontSize: 13,
                    color: 'var(--text-muted)', lineHeight: 1.65,
                  }}
                >
                  {val[lang]}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--border-dim)',
          padding: '14px 28px', display: 'flex', gap: 10,
        }}
      >
        {/* Demo button — internal page / external URL / modal fallback */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (p.demoMode === 'internal') { navigate(`/projects/${p.id}`); }
            else if (p.demoMode === 'external' && p.demoUrl) { window.open(p.demoUrl, '_blank', 'noopener,noreferrer'); }
            else { setDetailOpen(true); }
          }}
          style={{
            flex: 1, background: 'none',
            border: '1px solid var(--border)', color: 'var(--text-muted)',
            borderRadius: 8, padding: '8px', fontSize: 12, cursor: 'pointer',
            transition: 'all 0.2s', fontFamily: "'Inter',sans-serif",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = acc.hex; e.currentTarget.style.color = acc.hex; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {t.projects.demo}
        </button>

        {/* Code button — opens git URL if set, otherwise disabled */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (p.codeUrl) window.open(p.codeUrl, '_blank', 'noopener,noreferrer');
          }}
          disabled={!p.codeUrl}
          style={{
            flex: 1, background: 'none',
            border: '1px solid var(--border)',
            color: p.codeUrl ? 'var(--text-muted)' : 'var(--text-faint)',
            borderRadius: 8, padding: '8px', fontSize: 12,
            cursor: p.codeUrl ? 'pointer' : 'default',
            transition: 'all 0.2s', fontFamily: "'Inter',sans-serif",
            opacity: p.codeUrl ? 1 : 0.45,
          }}
          onMouseEnter={(e) => { if (p.codeUrl) { e.currentTarget.style.borderColor = acc.hex; e.currentTarget.style.color = acc.hex; } }}
          onMouseLeave={(e) => { if (p.codeUrl) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
        >
          {t.projects.code}
        </button>
      </div>

      {detailOpen && (
        <ProjectDetailModal p={p} t={t} lang={lang} accent={accent} onClose={() => setDetailOpen(false)} />
      )}
    </div>
  );
}

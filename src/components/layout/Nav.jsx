import { useEffect, useState } from 'react';
import { ACCENTS } from '../../data/constants';
import { useIsMobile } from '../../hooks/useIsMobile';

const NAV_IDS = new Set(['projects', 'photos', 'music', 'about', 'education', 'experience', 'contact']);

export function Nav({ lang, setLang, t, accent, mode, toggleMode, sections }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useIsMobile(860);
  const acc = ACCENTS[accent] || ACCENTS.violet;

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // Collapse the open menu as soon as we leave the mobile breakpoint.
  useEffect(() => {
    if (!mobile) setMenuOpen(false);
  }, [mobile]);

  const links = sections
    ? sections.filter((s) => s.visible && NAV_IDS.has(s.id)).map((s) => s.id)
    : [...NAV_IDS];
  const scroll = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  const solid = scrolled || (mobile && menuOpen);

  const modeButton = (
    <button type="button"
      data-interactive
      onClick={toggleMode}
      aria-label={mode === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
        color: 'var(--text-faint)', transition: 'color 0.2s,transform 0.3s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = acc.hex;
        e.currentTarget.style.transform = 'rotate(20deg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-faint)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {mode === 'dark' ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );

  const langSwitcher = (
    <div
      style={{
        display: 'flex', gap: 2, background: 'var(--lang-bg)',
        borderRadius: 8, padding: 3, border: '1px solid var(--border)',
      }}
    >
      {['fr', 'en', 'ko'].map((l) => (
        <button type="button"
          key={l}
          onClick={() => setLang(l)}
          style={{
            background: lang === l ? acc.hex : 'none',
            color: lang === l ? (mode === 'light' ? '#fff' : '#0a0518') : 'var(--text-faint)',
            border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            fontFamily: l === 'ko' ? "'Noto Sans KR',sans-serif" : "'Inter',sans-serif",
            fontSize: 12, fontWeight: lang === l ? 700 : 400,
            transition: 'all 0.2s',
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <nav
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: solid ? 'var(--nav-bg)' : 'transparent',
          backdropFilter: solid ? 'blur(20px) saturate(1.6)' : 'none',
          borderBottom: `1px solid ${solid ? 'var(--nav-border)' : 'transparent'}`,
          transition: 'background 0.4s ease,border-color 0.4s ease',
          padding: mobile ? '0 20px' : '0 48px', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setMenuOpen(false); }}
          style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17,
            cursor: 'pointer', letterSpacing: '-0.3px', color: 'var(--text)', userSelect: 'none',
          }}
        >
          Baptiste<span style={{ color: acc.hex }}>.</span>
        </span>

        {mobile ? (
          <button type="button"
            data-interactive
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 6,
              color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {menuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
            )}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div style={{ display: 'flex', gap: 24 }}>
              {links.map((k) => (
                <button type="button"
                  key={k}
                  onClick={() => scroll(k)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--nav-link)',
                    cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13.5,
                    letterSpacing: '0.2px', padding: 0, transition: 'color 0.2s', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => (e.target.style.color = acc.hex)}
                  onMouseLeave={(e) => (e.target.style.color = 'var(--nav-link)')}
                >
                  {t.nav[k]}
                </button>
              ))}
            </div>
            {modeButton}
            {langSwitcher}
          </div>
        )}
      </nav>

      {mobile && (
        <div
          style={{
            position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99,
            background: 'var(--nav-bg)', backdropFilter: 'blur(20px) saturate(1.6)',
            borderBottom: `1px solid ${menuOpen ? 'var(--nav-border)' : 'transparent'}`,
            overflow: 'hidden',
            maxHeight: menuOpen ? 480 : 0,
            opacity: menuOpen ? 1 : 0,
            transition: 'max-height 0.35s ease,opacity 0.3s ease,border-color 0.3s ease',
            pointerEvents: menuOpen ? 'auto' : 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 20px 20px' }}>
            {links.map((k) => (
              <button type="button"
                key={k}
                onClick={() => scroll(k)}
                style={{
                  background: 'none', border: 'none', color: 'var(--nav-link)',
                  cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 16,
                  letterSpacing: '0.2px', padding: '13px 0', textAlign: 'left',
                  borderBottom: '1px solid var(--border-dim)',
                }}
              >
                {t.nav[k]}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 18 }}>
              {modeButton}
              {langSwitcher}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

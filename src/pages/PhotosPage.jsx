import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ACCENTS, TWEAK_DEFAULTS } from '../data/constants';
import { i18n } from '../data/i18n';
import { photos as defaultPhotos } from '../data/photos';
import { usePageMeta } from '../hooks/usePageMeta';
import { useReveal } from '../hooks/useReveal';
import { SectionHeader } from '../components/layout/SectionHeader';
import { PhotoGrid } from '../components/photos/PhotoGrid';

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

// Galerie complète : toutes les photos, filtres par catégorie, lightbox.
// Accessible depuis « Voir toutes les photos » sur la home.
export default function PhotosPage() {
  const navigate = useNavigate();
  const { lang, mode, accent } = readPrefs();
  const t = i18n[lang] || i18n.fr;
  const acc = ACCENTS[accent] || ACCENTS.violet;

  const [photos, setPhotos] = useState(null);
  usePageMeta(t.photos.title, t.photos.subtitle);
  useReveal();

  useEffect(() => {
    window.scrollTo(0, 0);
    // En arrivée directe sur /photos, le body n'a pas encore la classe de mode.
    document.body.classList.toggle('mode-light', mode === 'light');
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    api.list('photos')
      .then((rows) => { if (!cancelled) setPhotos(rows?.length ? rows : defaultPhotos); })
      .catch(() => { if (!cancelled) setPhotos(defaultPhotos); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: lang === 'ko' ? "'Noto Sans KR','Inter',sans-serif" : "'Inter',sans-serif",
    }}>
      {/* ── Mini nav ── */}
      <nav style={{
        height: 52, background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--nav-border)',
        backdropFilter: 'blur(20px) saturate(1.6)',
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
            padding: 0, opacity: 0.75, transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.75')}
        >
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: acc.hex }}>← back</span>
        </button>
        <span style={{ color: 'var(--border)', margin: '0 12px', fontSize: 14 }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
          <span style={{ color: 'var(--text-faint)' }}>◎</span>
          <span style={{ color: 'var(--text-faint)' }}>photos</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14,
          color: 'var(--text)',
        }}>Baptiste<span style={{ color: acc.hex }}>.</span></span>
      </nav>

      {/* ── Galerie ── */}
      <main style={{
        maxWidth: 1160, margin: '0 auto',
        padding: 'clamp(48px,7vw,80px) clamp(20px,6vw,80px) 80px',
      }}>
        <SectionHeader title={t.photos.title} subtitle={t.photos.subtitle} accent={accent} />

        {photos === null ? (
          <p style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
            color: 'var(--text-faint)', textAlign: 'center', padding: '60px 0',
          }}>…</p>
        ) : photos.length === 0 ? (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 14,
            padding: '52px 20px', textAlign: 'center',
            color: 'var(--text-faint)', fontFamily: "'Inter',sans-serif", fontSize: 13.5,
          }}>
            ◎ {t.photos.empty}
          </div>
        ) : (
          <PhotoGrid items={photos} t={t} acc={acc} />
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border-dim)',
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
            color: 'var(--text-faint)', padding: 0,
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = acc.hex)}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
        >← Retour au portfolio</button>
        <p style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-faint)',
        }}>Baptiste Niszczota · {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

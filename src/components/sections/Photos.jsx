import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCENTS } from '../../data/constants';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';
import { PhotoCarousel } from '../photos/PhotoCarousel';
import { PhotoGrid } from '../photos/PhotoGrid';
import { PhotoLightbox } from '../photos/shared';

// Nombre max de photos dans le manège — la page /photos montre tout.
const CAROUSEL_MAX = 12;

export function Photos({ t, accent, items = [] }) {
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const [lightbox, setLightbox] = useState(-1);
  const carousel = items.slice(0, CAROUSEL_MAX);

  return (
    <Section id="photos">
      <SectionHeader title={t.photos.title} subtitle={t.photos.subtitle} accent={accent} />

      {items.length === 0 ? (
        <div
          className="reveal"
          style={{
            border: '1px dashed var(--border)', borderRadius: 14,
            padding: '52px 20px', textAlign: 'center',
            color: 'var(--text-faint)', fontFamily: "'Inter',sans-serif", fontSize: 13.5,
          }}
        >
          ◎ {t.photos.empty}
        </div>
      ) : items.length < 3 ? (
        // Pas assez de photos pour un manège : grille simple.
        <PhotoGrid items={items} t={t} acc={acc} />
      ) : (
        <>
          <div className="reveal photo-reveal">
            <PhotoCarousel photos={carousel} acc={acc} onOpen={setLightbox} />
          </div>
          <p
            className="reveal"
            aria-hidden="true"
            style={{
              marginTop: 18, textAlign: 'center',
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
              color: 'var(--text-faint)', letterSpacing: '1px',
            }}
          >
            {t.photos.hint}
          </p>
        </>
      )}

      {items.length > 0 && (
        <div className="reveal" style={{ marginTop: 30, textAlign: 'center' }}>
          <Link
            to="/photos"
            data-interactive
            style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5,
              color: acc.hex, textDecoration: 'none',
              borderBottom: `1px solid ${acc.hex}40`, paddingBottom: 2,
            }}
          >
            {t.photos.viewAll} →
          </Link>
        </div>
      )}

      {lightbox >= 0 && carousel[lightbox] && (
        <PhotoLightbox
          photos={carousel}
          index={lightbox}
          setIndex={setLightbox}
          onClose={() => setLightbox(-1)}
          acc={acc}
        />
      )}
    </Section>
  );
}

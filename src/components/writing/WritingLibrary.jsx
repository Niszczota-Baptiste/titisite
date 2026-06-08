import { useMemo, useState } from 'react';
import { WritingCard } from './WritingCard';
import { hexToRgb } from './tokens';

// Presentational grid of writing works, with a genre/tag filter (same idea as
// the code-projects Tous/Web/Mobile filter). Data is fetched by the parent so
// this drops both inside the home #projects section and on /projets/ecriture.
export function WritingLibrary({ works = [], loading = false, emptyHint, accentHex = '#c9a8e8' }) {
  const [genre, setGenre] = useState('all');
  const rgb = hexToRgb(accentHex) || '201,168,232';

  // Distinct genres across all works, in order of first appearance.
  const genres = useMemo(() => {
    const seen = [];
    works.forEach((w) => (w.tags || []).forEach((t) => { if (!seen.includes(t)) seen.push(t); }));
    return seen;
  }, [works]);

  const visible = genre === 'all' ? works : works.filter((w) => (w.tags || []).includes(genre));

  if (loading) {
    return (
      <p style={{ fontFamily: "'Inter',sans-serif", color: 'var(--text-faint)', fontSize: 13, padding: '20px 0' }}>
        Chargement…
      </p>
    );
  }
  if (!works.length) {
    return (
      <p style={{
        fontFamily: "'Inter',sans-serif", color: 'var(--text-faint)', fontSize: 14,
        padding: '40px 0', textAlign: 'center', lineHeight: 1.7,
      }}>
        {emptyHint || 'Aucun texte publié pour le moment.'}
      </p>
    );
  }

  const chip = (active) => ({
    background: active ? `rgb(${rgb})` : 'var(--filter-bg)',
    color: active ? '#08051a' : 'var(--text-faint)',
    border: `1px solid ${active ? `rgb(${rgb})` : 'var(--border)'}`,
    borderRadius: 20, padding: '5px 15px', cursor: 'pointer',
    fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: active ? 700 : 400,
    transition: 'all 0.2s', backdropFilter: 'blur(8px)',
  });

  return (
    <div>
      {genres.length >= 2 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => setGenre('all')} style={chip(genre === 'all')}>Tous</button>
          {genres.map((g) => (
            <button key={g} onClick={() => setGenre(g)} style={chip(genre === g)}>{g}</button>
          ))}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
        gap: 18,
      }}>
        {visible.map((w, i) => (
          <div key={w.id} className="reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
            <WritingCard work={w} />
          </div>
        ))}
      </div>
      {visible.length === 0 && (
        <p style={{ fontFamily: "'Inter',sans-serif", color: 'var(--text-faint)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          Aucun texte dans ce genre.
        </p>
      )}
    </div>
  );
}

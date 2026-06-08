import { WritingCard } from './WritingCard';

// Presentational grid of writing works. Data is fetched by the parent so this
// component can be dropped both inside the home #projects section and on the
// dedicated /projets/ecriture page.
export function WritingLibrary({ works = [], loading = false, emptyHint }) {
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
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',
      gap: 18,
    }}>
      {works.map((w, i) => (
        <div key={w.id} className="reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
          <WritingCard work={w} />
        </div>
      ))}
    </div>
  );
}

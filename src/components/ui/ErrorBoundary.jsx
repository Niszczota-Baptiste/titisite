import { Component } from 'react';

// Root error boundary: a render crash anywhere in the tree shows this styled
// fallback instead of a blank page. Class component — React only supports
// error boundaries as classes (componentDidCatch / getDerivedStateFromError).
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep a trace in the console for debugging; no external reporting.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', background: '#050511', color: '#ede8f8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, textAlign: 'center',
        fontFamily: "'Inter',sans-serif",
      }}>
        <div style={{
          maxWidth: 460, background: 'rgba(14,9,28,0.72)',
          border: '1px solid rgba(80,50,130,0.3)', borderRadius: 14,
          padding: '40px 32px',
        }}>
          <p style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            color: 'rgba(201,168,232,0.75)', letterSpacing: '2px',
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            Erreur
          </p>
          <h1 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 24,
            fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 12,
          }}>
            Quelque chose s&apos;est cassé
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(180,170,200,0.7)', lineHeight: 1.7, marginBottom: 24 }}>
            Une erreur inattendue a interrompu l&apos;affichage de la page.
            Recharger devrait suffire — si ça persiste, revenez plus tard.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#c9a8e8', color: '#08051a', border: 'none',
              borderRadius: 10, padding: '12px 28px', cursor: 'pointer',
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
            }}
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}

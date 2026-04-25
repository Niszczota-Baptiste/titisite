import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
        background: '#050511',
        color: '#e0e0ff',
        textAlign: 'center',
        fontFamily: 'inherit',
      }}>
        <p style={{ fontSize: 32, margin: 0 }}>⚠</p>
        <h2 style={{ margin: 0, fontWeight: 600 }}>Une erreur est survenue</h2>
        <p style={{ margin: 0, opacity: 0.6, maxWidth: 480 }}>
          {error.message || 'Erreur inattendue'}
        </p>
        <button
          onClick={this.reset}
          style={{
            marginTop: 8,
            padding: '8px 20px',
            border: '1px solid #4f8ef7',
            borderRadius: 6,
            background: 'transparent',
            color: '#4f8ef7',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }
}

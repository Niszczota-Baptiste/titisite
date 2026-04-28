import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ACC, ACC_RGB, Button, Field, Input } from './ui';

export function Login({ onSuccess, title = 'Admin', subtitle = 'Authentification requise.' }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (ex) {
      if (ex.status === 401) setErr('Identifiants invalides.');
      else setErr('Serveur injoignable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#050511',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 380, background: 'rgba(14,9,28,0.72)',
        border: `1px solid rgba(${ACC_RGB},0.3)`, borderRadius: 16, padding: 32,
        boxShadow: `0 24px 64px rgba(0,0,0,0.5), 0 0 80px rgba(${ACC_RGB},0.05)`,
        backdropFilter: 'blur(20px)',
      }}>
        <h1 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700,
          color: '#ede8f8', marginBottom: 6, letterSpacing: '-0.3px',
        }}>
          {title}
        </h1>
        <p style={{
          fontFamily: "'Inter',sans-serif", fontSize: 13,
          color: 'rgba(180,170,200,0.6)', marginBottom: 24,
        }}>
          {subtitle}
        </p>

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {err && (
          <p style={{
            color: '#ff8a9b', fontSize: 12, fontFamily: "'Inter',sans-serif",
            marginBottom: 14,
          }}>
            {err}
          </p>
        )}

        <Button type="submit" disabled={loading} style={{ width: '100%', padding: '11px' }}>
          {loading ? '…' : 'Se connecter'}
        </Button>

        <p style={{
          marginTop: 20, fontSize: 11, color: 'rgba(120,110,140,0.6)',
          fontFamily: "'Inter',sans-serif", textAlign: 'center',
        }}>
          <a href="/" style={{ color: ACC, textDecoration: 'none' }}>← Retour au site</a>
        </p>
      </form>
    </div>
  );
}

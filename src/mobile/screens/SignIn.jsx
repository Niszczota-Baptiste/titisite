import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Btn } from '../../components/author/ui';
import { useEnv } from '../env';
import { FormField } from '../ui';

// Connexion au site relié. Le mot de passe part directement au site (POST
// /api/auth/login, même origine) ; le cookie de session est posé HttpOnly par
// le serveur et gardé par le WebView — le JavaScript ne le voit jamais.

const MESSAGES = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  too_many_attempts: 'Trop de tentatives. Patiente une minute avant de réessayer.',
  rate_limited: 'Trop de requêtes. Réessaie dans un instant.',
};

export function SignIn({ onDone, embedded = false }) {
  const { config, session } = useEnv();
  const [email, setEmail] = useState(session.user?.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await session.login(email.trim(), password);
      setPassword('');
      onDone?.();
    } catch (err) {
      setError(err.status ? (MESSAGES[err.message] || `Connexion refusée (${err.message}).`) : 'Site injoignable. Vérifie le réseau — ce que tu captures reste sur l\'appareil en attendant.');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="am-form" onSubmit={submit}>
      <FormField label="E-mail">
        <input className="au-input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} required />
      </FormField>
      <FormField label="Mot de passe">
        <input className="au-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </FormField>
      {error && <div className="au-error" role="alert">{error}</div>}
      <Btn type="submit" variant="primary" disabled={busy || !email || !password} style={{ width: '100%' }}>{busy ? 'Connexion…' : 'Se connecter'}</Btn>
    </form>
  );
  if (embedded) return form;

  return (
    <div className="am-screen am-narrow">
      <header className="am-head">
        <Link to="/" className="au-btn is-ghost is-small" aria-label="Retour à l'accueil">←</Link>
        <h1>Se connecter</h1>
      </header>
      <p className="au-muted am-lead">Site relié : <strong>{config.serverUrl}</strong></p>
      {form}
      <p className="au-faint am-note">
        Capturer une idée et enregistrer un son restent possibles sans connexion : tout est gardé sur l&apos;appareil.
      </p>
      {config.native && <Link to="/serveur" className="au-btn is-ghost is-small">Changer de site</Link>}
    </div>
  );
}

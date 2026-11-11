import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useAuthState } from './offline/hooks.js';
import { Btn, Dialog } from './ui';

// Session de l'atelier : expirée (401) ou compte sans accès (403), dit
// clairement et sans quitter la page — le texte en cours reste à l'écran et sur
// l'appareil, et repart dès la reconnexion (useEntityDoc et la synchronisation
// écoutent le retour de la session).

const LOGIN_ERRORS = {
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  too_many_attempts: 'Trop de tentatives. Patiente une minute avant de réessayer.',
};

export function ReLoginDialog({ open, onClose }) {
  const { user, login } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err.status ? (LOGIN_ERRORS[err.message] || `Connexion refusée (${err.message}).`) : 'Site injoignable pour l\'instant. Ton texte reste gardé sur cet appareil.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="🔑 Se reconnecter" width={420}>
      <form onSubmit={submit}>
        <p className="au-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Ta session a expiré. Rien n&apos;est perdu : ce que tu as écrit est gardé sur cet appareil et partira juste après.
        </p>
        <label className="au-field" style={{ display: 'block' }}>
          <span className="au-field-label" style={{ display: 'block' }}>E-mail</span>
          <input className="au-input" type="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="au-field" style={{ display: 'block' }}>
          <span className="au-field-label" style={{ display: 'block' }}>Mot de passe</span>
          <input className="au-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required data-autofocus />
        </label>
        {error && <div className="au-error" role="alert">{error}</div>}
        <Btn type="submit" variant="primary" disabled={busy || !email || !password} style={{ width: '100%' }}>{busy ? 'Connexion…' : 'Se reconnecter'}</Btn>
      </form>
    </Dialog>
  );
}

export function SessionBanner() {
  const auth = useAuthState();
  const [open, setOpen] = useState(false);
  if (auth.state === 'forbidden') {
    return (
      <div className="au-banner au-session-banner" role="alert">
        <span>🚫 Ce compte n&apos;a pas (ou plus) accès à l&apos;atelier. Ce qui n&apos;est pas encore parti reste gardé sur cet appareil, rattaché au compte qui l&apos;a écrit.</span>
      </div>
    );
  }
  if (auth.state !== 'expired' && !open) return null;
  return (
    <>
      {auth.state === 'expired' && (
        <div className="au-banner au-session-banner" role="alert">
          <span>🔑 Session expirée. Ce que tu écris reste gardé sur cet appareil ; reconnecte-toi pour l&apos;envoyer.</span>
          <span style={{ marginLeft: 'auto' }}><Btn size="small" variant="primary" onClick={() => setOpen(true)}>Se reconnecter</Btn></span>
        </div>
      )}
      <ReLoginDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

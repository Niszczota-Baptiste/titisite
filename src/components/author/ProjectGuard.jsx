import { Navigate } from 'react-router-dom';
import { useAuthor } from './context';
import { Btn, ErrorLine } from './ui';

// Projet devenu introuvable en cours de route (supprimé ailleurs, partage
// retiré) → retour au choix du livre.
export function ProjectGuard({ children }) {
  const { loadError } = useAuthor();
  if (loadError?.status === 404 || loadError?.status === 403) {
    try { localStorage.removeItem('au-last-project'); } catch { /* ignore */ }
    return <Navigate to="/auteur?choisir" replace />;
  }
  if (loadError) {
    return (
      <div className="au-page is-narrow">
        <ErrorLine error={loadError} />
        <Btn onClick={() => window.location.reload()}>Réessayer</Btn>
      </div>
    );
  }
  return children;
}

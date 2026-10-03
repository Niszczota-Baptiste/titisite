import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Login } from '../components/admin/Login';
import { usePageMeta } from '../hooks/usePageMeta';

// Atelier d'auteur (/auteur) — espace d'écriture privé.
//
// Ce garde-fou n'est qu'un CONFORT d'affichage : la sécurité est côté serveur
// (rôle admin + users.can_author + propriété du projet sur chaque route
// /api/author/*, ou partage en lecture pour un invité). Un compte sans le droit
// ne télécharge même pas le code de l'atelier (chunk paresseux chargé
// seulement après la vérification).

const AuthorApp = lazy(() => import('../components/author/AuthorApp'));

function Splash({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#050511', color: '#ede8f8', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: "'Inter',sans-serif", padding: 20, textAlign: 'center',
    }}>
      {children}
    </div>
  );
}

export default function Auteur() {
  const { user, loading } = useAuth();
  usePageMeta('Atelier d\'auteur');

  // Espace privé : jamais indexé, même si une URL fuitait.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (loading) return <Splash><span style={{ color: 'rgba(180,170,200,0.6)', fontSize: 13 }}>Chargement…</span></Splash>;
  if (!user) return <Login title="Atelier d'auteur" subtitle="Espace privé. Connecte-toi pour continuer." />;
  if (!user.canAuthor && !user.authorShared) {
    return (
      <Splash>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700 }}>Accès refusé</h1>
        <p style={{ color: 'rgba(180,170,200,0.6)', fontSize: 13 }}>Cet espace est privé.</p>
        <Link to="/" style={{ color: '#c9a8e8', fontSize: 13, textDecoration: 'none' }}>← Retour au site</Link>
      </Splash>
    );
  }
  return (
    <Suspense fallback={<Splash><span style={{ color: 'rgba(180,170,200,0.6)', fontSize: 13 }}>Ouverture de l&apos;atelier…</span></Splash>}>
      <AuthorApp />
    </Suspense>
  );
}

import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Dashboard } from '../components/admin/Dashboard';
import { Login } from '../components/admin/Login';

export default function Admin() {
  const { user, loading, isAdmin } = useAuth();

  useEffect(() => { document.body.style.cursor = ''; }, []);

  if (loading) return <Loading />;
  if (!user) return <Login title="Admin" subtitle="Espace d'édition du portfolio." />;

  if (!isAdmin) {
    return <Forbidden />;
  }

  return <Dashboard />;
}

function Loading() {
  return (
    <div style={{
      minHeight: '100vh', background: '#050511',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13,
    }}>
      Chargement…
    </div>
  );
}

function Forbidden() {
  return (
    <div style={{
      minHeight: '100vh', background: '#050511',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
      color: '#ede8f8', fontFamily: "'Inter',sans-serif",
    }}>
      <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700 }}>
        Accès refusé
      </h1>
      <p style={{ color: 'rgba(180,170,200,0.6)', fontSize: 13 }}>
        Ton compte n'a pas les droits admin.
      </p>
      <a href="/project" style={{ color: '#c9a8e8', fontSize: 13, textDecoration: 'none' }}>
        → Espace projet
      </a>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Comments } from './Comments';
import { HomeShell } from './ProjectLayout';
import { ACC, card, muted } from './shared';

export function DiscussionPage() {
  const { user, logout, isAdmin } = useAuth();
  return (
    <HomeShell user={user} logout={logout} isAdmin={isAdmin}>
      <main style={{ maxWidth: 780, margin: '0 auto', padding: '36px 32px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Link to="/project" style={{
            color: 'rgba(180,170,200,0.6)', textDecoration: 'none',
            fontSize: 13, fontFamily: "'Inter',sans-serif",
          }}>← Projets</Link>
        </div>
        <h1 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.5px', marginBottom: 6,
        }}>Discussion d'équipe</h1>
        <p style={{ ...muted, fontSize: 14, marginBottom: 22 }}>
          Fil général — pour les sujets qui ne rentrent pas dans un projet particulier.
        </p>

        <div style={{ ...card, padding: 20 }}>
          <Comments targetType="discussion" targetId={0} />
        </div>
      </main>
    </HomeShell>
  );
}

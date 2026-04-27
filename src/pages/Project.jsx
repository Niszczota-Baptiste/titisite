import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Login } from '../components/admin/Login';
import { BuildsTab } from '../components/project/Builds';
import { CalendarTab } from '../components/project/Calendar';
import { DiscussionPage } from '../components/project/DiscussionPage';
import { DocumentsTab } from '../components/project/Documents';
import { Home } from '../components/project/Home';
import { KanbanTab } from '../components/project/Kanban';
import { MeetingsTab } from '../components/project/Meetings';
import { MinecraftTab } from '../components/project/Minecraft';
import { OverviewTab } from '../components/project/Overview';
import { ProjectLayout } from '../components/project/ProjectLayout';

export default function Project() {
  const { user, loading, isMember } = useAuth();
  useEffect(() => { document.body.style.cursor = ''; }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050511',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(180,170,200,0.5)', fontFamily: "'Inter',sans-serif", fontSize: 13,
      }}>Chargement…</div>
    );
  }
  if (!user) {
    return <Login title="Espace projet" subtitle="Réservé aux membres du projet." />;
  }
  if (!isMember) {
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
          Ton compte n'a pas accès à l'espace projet.
        </p>
      </div>
    );
  }

  return (
    <Routes>
      <Route index              element={<Home />} />
      <Route path="discussion"  element={<DiscussionPage />} />
      <Route path=":slug" element={<ProjectLayout />}>
        <Route index              element={<Navigate to="overview" replace />} />
        <Route path="overview"    element={<OverviewTab />} />
        <Route path="kanban"      element={<KanbanTab />} />
        <Route path="calendar"    element={<CalendarTab />} />
        <Route path="documents"   element={<DocumentsTab />} />
        <Route path="builds"      element={<BuildsTab />} />
        <Route path="meetings"    element={<MeetingsTab />} />
        <Route path="minecraft"   element={<MinecraftTab />} />
        <Route path="*"           element={<Navigate to="overview" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/project" replace />} />
    </Routes>
  );
}

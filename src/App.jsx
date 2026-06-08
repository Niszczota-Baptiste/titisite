import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { usePageTracking } from './hooks/usePageTracking';

const Public = lazy(() => import('./pages/Public'));
const Admin = lazy(() => import('./pages/Admin'));
const Project = lazy(() => import('./pages/Project'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const Ecriture = lazy(() => import('./pages/Ecriture'));
const Stairs = lazy(() => import('./pages/Stairs'));

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#050511' }} />;
}

// Fires a pageview hit + dwell-time / scroll beacons on every public route
// change. Skipped server-side too for /admin and /project workspaces.
function RouteTracker() {
  usePageTracking();
  return null;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <RouteTracker />
      <Routes>
        <Route path="/admin/*"        element={<Admin />} />
        <Route path="/project/*"      element={<Project />} />
        <Route path="/projects/:id"   element={<ProjectDetailPage />} />
        <Route path="/projets/ecriture/*" element={<Ecriture />} />
        <Route path="/stairs"         element={<Stairs />} />
        <Route path="*"               element={<Public />} />
      </Routes>
    </Suspense>
  );
}

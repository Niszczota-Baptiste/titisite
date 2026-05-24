import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api/client';

const Public = lazy(() => import('./pages/Public'));
const Admin = lazy(() => import('./pages/Admin'));
const Project = lazy(() => import('./pages/Project'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const Stairs = lazy(() => import('./pages/Stairs'));

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#050511' }} />;
}

// Fires one analytics beacon per public route change. The back-office areas
// (/admin, /project) are skipped here and server-side, so they never count.
function RouteTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/admin') || pathname.startsWith('/project')) return;
    api.analytics.hit(pathname, document.referrer).catch(() => {});
  }, [pathname]);
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
        <Route path="/stairs"         element={<Stairs />} />
        <Route path="*"               element={<Public />} />
      </Routes>
    </Suspense>
  );
}

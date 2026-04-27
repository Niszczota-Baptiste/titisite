import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

const Public = lazy(() => import('./pages/Public'));
const Admin = lazy(() => import('./pages/Admin'));
const Project = lazy(() => import('./pages/Project'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#050511' }} />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/admin/*"        element={<Admin />} />
        <Route path="/project/*"      element={<Project />} />
        <Route path="/projects/:id"   element={<ProjectDetailPage />} />
        <Route path="*"               element={<Public />} />
      </Routes>
    </Suspense>
  );
}

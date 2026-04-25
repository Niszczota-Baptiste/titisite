import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';

const Public = lazy(() => import('./pages/Public'));
const Admin = lazy(() => import('./pages/Admin'));
const Project = lazy(() => import('./pages/Project'));

function Loading() {
  return <div style={{ minHeight: '100vh', background: '#050511' }} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/admin/*"   element={<ErrorBoundary><Admin /></ErrorBoundary>} />
          <Route path="/project/*" element={<ErrorBoundary><Project /></ErrorBoundary>} />
          <Route path="*"          element={<ErrorBoundary><Public /></ErrorBoundary>} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

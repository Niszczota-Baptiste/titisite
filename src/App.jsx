import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

const Public = lazy(() => import('./pages/Public'));
const Admin = lazy(() => import('./pages/Admin'));

function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050511',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }} />
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="*" element={<Public />} />
      </Routes>
    </Suspense>
  );
}

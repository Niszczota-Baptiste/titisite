import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '../api/client';
import { Dashboard } from '../components/admin/Dashboard';
import { Login } from '../components/admin/Login';

export default function Admin() {
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    document.body.style.cursor = '';
    if (!getToken()) { setAuthed(false); return; }
    api.me().then(
      () => setAuthed(true),
      () => { clearToken(); setAuthed(false); },
    );
  }, []);

  if (authed === null) {
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

  return authed
    ? <Dashboard onLogout={() => setAuthed(false)} />
    : <Login onSuccess={() => setAuthed(true)} />;
}

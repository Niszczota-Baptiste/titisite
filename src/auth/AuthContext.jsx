import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, ensureAuthorCacheOwner, getStoredUser, setStoredUser } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Optimistic: render with the cached user info immediately, then verify the
  // session with the server. The HttpOnly cookie is the actual source of
  // truth — the cached copy is only used so the UI doesn't flash blank.
  const cached = getStoredUser();
  const [user, setUser] = useState(cached);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(
      (me) => { setUser(me); setStoredUser(me); ensureAuthorCacheOwner(me.id); },
      (err) => {
        // Hors connexion (aucune réponse du serveur) : on garde l'utilisateur
        // mis en cache pour que l'atelier d'auteur reste utilisable ; le
        // serveur revérifiera la session au premier appel. Seul un refus
        // explicite (401/403) déconnecte.
        if (!err?.status) return;
        clearSession(); setUser(null);
      },
    ).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const out = await api.login(email, password);
    await ensureAuthorCacheOwner(out.user.id);
    setUser(out.user);
    return out.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAdmin: user?.role === 'admin',
      isMember: user?.role === 'member' || user?.role === 'admin',
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

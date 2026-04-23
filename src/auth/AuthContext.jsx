import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, getStoredUser, getToken, setStoredUser } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(() => !!getToken() && !getStoredUser());

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then(
      (me) => { setUser(me); setStoredUser(me); setLoading(false); },
      () => { clearSession(); setUser(null); setLoading(false); },
    );
  }, []);

  const login = useCallback(async (email, password) => {
    const out = await api.login(email, password);
    setUser(out.user);
    return out.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
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

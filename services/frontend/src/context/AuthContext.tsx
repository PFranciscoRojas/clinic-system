import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, type Me } from '@/api/auth';

interface AuthState {
  user: Me | null;
  isLoading: boolean;
  login: (orgSlug: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<Me | null>(null);
  const [isLoading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!localStorage.getItem('access_token')) { setLoading(false); return; }
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      localStorage.clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (orgSlug: string, email: string, password: string) => {
    const tokens = await authApi.login(orgSlug, email, password);
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    await fetchMe();
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token') ?? '';
    try { await authApi.logout(refresh); } catch { /* ignore */ }
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, type Me } from '@/api/auth';

interface AuthState {
  user: Me | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<Me | null>;
  updateProfile: (displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<Me | null>(null);
  const [isLoading, setLoading] = useState(true);

  const fetchMe = useCallback(async (): Promise<Me | null> => {
    if (!localStorage.getItem('access_token')) { setLoading(false); return null; }
    try {
      const me = await authApi.me();
      setUser(me);
      return me;
    } catch {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email: string, password: string): Promise<Me> => {
    const tokens = await authApi.login(email, password);
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    const me = await fetchMe();
    if (!me) throw new Error('auth/me failed after login');
    return me;
  };

  const updateProfile = async (displayName: string) => {
    const tokens = await authApi.updateProfile(displayName);
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    await fetchMe();
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token') ?? '';
    try { await authApi.logout(refresh); } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser: fetchMe, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

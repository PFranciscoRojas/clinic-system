import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type Me } from '@/api/auth';
import { flushClinicalDrafts, clearClinicalDrafts } from '@/lib/clinicalDrafts';

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
  const queryClient = useQueryClient();
  const [user, setUser]       = useState<Me | null>(null);
  // Only start in "loading" when there is actually a session to restore — the
  // no-token case is decidable synchronously at init, not inside the effect.
  const [isLoading, setLoading] = useState(() => !!localStorage.getItem('access_token'));

  const fetchMe = useCallback(async (): Promise<Me | null> => {
    if (!localStorage.getItem('access_token')) return null;
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

  // Session restore is a genuine external sync: every setState inside fetchMe
  // happens after an await (or not at all), so no sync render cascade exists —
  // the rule just can't see through the async boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email: string, password: string): Promise<Me> => {
    const tokens = await authApi.login(email, password);
    // Every cached query (templates, patients, agenda…) is tenant data and
    // the query keys don't carry the org id — a login into a different
    // organization in the same tab would otherwise keep serving the previous
    // org's cached responses until each query refetches.
    queryClient.clear();
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
    // Clinical drafts in localStorage are PHI: push any in-progress content
    // to the server while the access token is still valid, then remove the
    // local copies so nothing clinical stays behind on the device.
    await flushClinicalDrafts();
    const refresh = localStorage.getItem('refresh_token') ?? '';
    try { await authApi.logout(refresh); } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    clearClinicalDrafts();
    queryClient.clear();
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

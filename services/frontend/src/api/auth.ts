import { api } from './client';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Me {
  user_id: string;
  organization_id: string;
  email: string;
  display_name?: string | null;
  roles: string[];
  permissions: string[];
}

export const authApi = {
  login: (org_slug: string, email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { org_slug, email, password }),

  me: () => api.get<Me>('/auth/me'),

  logout: (refresh_token: string) =>
    api.post<void>('/auth/logout', { refresh_token }),
};

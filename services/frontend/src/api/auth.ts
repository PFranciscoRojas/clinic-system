import { api } from './client';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Me {
  user_id: string;
  org_id: string;
  organization_id?: string;  // alias — backend returns org_id
  email?: string;
  display_name?: string | null;
  roles: string[];
  permissions?: string[];
  onboarding_completed?: boolean;
  data_reset_enabled?: boolean;  // admin-only test-data wipe is available
}

export const authApi = {
  login: (org_slug: string, email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { org_slug, email, password }),

  register: (invite_code: string, email: string, password: string, display_name: string) =>
    api.post<TokenPair>('/auth/register', { invite_code, email, password, display_name }),

  me: () => api.get<Me>('/auth/me'),

  logout: (refresh_token: string) =>
    api.post<void>('/auth/logout', { refresh_token }),

  invite: (role_name = 'PROFESSIONAL') =>
    api.post<{ invite_code: string; expires_at: string }>('/auth/invite', { role_name }),

  resetPassword: (target_email: string, new_password: string) =>
    api.post<void>('/auth/reset-password', { target_email, new_password }),

  // Self-service: requests a reset link by email. Always resolves (the backend
  // returns 200 whether or not the address is registered).
  forgotPassword: (email: string) =>
    api.post<void>('/auth/forgot-password', { email }),

  confirmReset: (token: string, new_password: string) =>
    api.post<void>('/auth/reset-password-confirm', { token, new_password }),

  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('/auth/change-password', { current_password, new_password }),
  onboardingComplete: () =>
    api.post<void>('/auth/onboarding-complete', {}),
  updateProfile: (display_name: string) =>
    api.patch<TokenPair>('/auth/profile', { display_name }),
};

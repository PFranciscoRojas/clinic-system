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
  org_name?: string;             // the tenant/clinic name, shown in the sidebar
  roles: string[];
  permissions?: string[];
  onboarding_completed?: boolean;
  data_reset_enabled?: boolean;  // admin-only test-data wipe is available
  subscription_status?: string;  // trialing | active | past_due | canceled
  trial_ends_at?: string;        // RFC3339, when subscription_status = trialing
  trial_days_left?: number;      // whole days remaining in the trial, >= 0
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { email, password }),

  // Self-serve signup = create a new organization. org_name is the clinic, and
  // full_name is the admin's own name. Emails a verification link; the account
  // can't log in until the email is confirmed.
  signup: (org_name: string, full_name: string, email: string, password: string) =>
    api.post<void>('/auth/signup', { org_name, full_name, email, password }),

  // Confirms the address from the one-time token in the verification email link.
  verifyEmail: (token: string) =>
    api.post<void>('/auth/verify-email', { token }),

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

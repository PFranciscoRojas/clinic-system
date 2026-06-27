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
  dpa_accepted?: boolean;        // false = show DPA modal on first login (Ley 1581/2012)
  data_reset_enabled?: boolean;  // admin-only test-data wipe is available
  subscription_status?: string;  // trialing | active | past_due | canceled
  trial_ends_at?: string;        // RFC3339, when subscription_status = trialing
  trial_days_left?: number;      // whole days remaining in the trial, >= 0
  current_period_end?: string;   // RFC3339, when subscription_status = active
  entitled?: boolean;            // false when the trial/subscription has lapsed → block access
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<TokenPair>('/auth/login', { email, password }),

  // Self-serve signup = create a new organization. org_name is the clinic, and
  // full_name is the admin's own name. Emails a verification link; the account
  // can't log in until the email is confirmed. accepted_terms/terms_version are
  // stored in users for Ley 1581/2012 audit trail.
  signup: (org_name: string, full_name: string, email: string, password: string, is_professional: boolean, accepted_terms: boolean) =>
    api.post<void>('/auth/signup', { org_name, full_name, email, password, is_professional, accepted_terms, terms_version: '2026-06-24' }),

  // Confirms the address from the one-time token in the verification email link.
  verifyEmail: (token: string) =>
    api.post<void>('/auth/verify-email', { token }),

  // Re-sends the verification email. Always resolves (200 whether or not the
  // address exists or is already verified).
  resendVerification: (email: string) =>
    api.post<void>('/auth/resend-verification', { email }),

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

  verifyPassword: (password: string) =>
    api.post<void>('/auth/verify-password', { password }),
  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('/auth/change-password', { current_password, new_password }),
  onboardingComplete: () =>
    api.post<void>('/auth/onboarding-complete', {}),
  updateProfile: (display_name: string) =>
    api.patch<TokenPair>('/auth/profile', { display_name }),

  requestEmailChange: (new_email: string) =>
    api.patch<{ status: string }>('/auth/me/email', { new_email }),
  verifyEmailChange: (token: string) =>
    api.post<void>('/auth/verify-email-change', { token }),

  listOrgUsers: () =>
    api.get<{ items: OrgUser[] }>('/users'),
  changeUserRole: (user_id: string, role_name: string) =>
    api.patch<void>(`/users/${user_id}/role`, { role_name }),
  deactivateUser: (user_id: string) =>
    api.delete<void>(`/users/${user_id}`),

  reactivateUser: (user_id: string, role_name: string) =>
    api.post<void>(`/users/${user_id}/reactivate`, { role_name }),

  // Records the caller's explicit acceptance of the Data Processing Agreement
  // (Contrato Encargado-Responsable, Ley 1581/2012). Idempotent.
  acceptDpa: () =>
    api.post<void>('/auth/accept-dpa', {}),
};

export interface OrgUser {
  id: string;
  display_name: string | null;
  email: string;
  role_name: string;
  is_active: boolean;
  last_login_at: string | null;
}

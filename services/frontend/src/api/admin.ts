import { api } from './client';

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
}

// Admin-only maintenance. resetClinicalData only exists on the server when
// ALLOW_DATA_RESET is on (reflected by me.data_reset_enabled). The org/billing
// endpoints are SYSTEM_ADMIN-only (the SaaS operator console).
export const adminApi = {
  resetClinicalData: (confirmation: string) =>
    api.post<{ status: string; deleted: Record<string, number> }>(
      '/admin/reset-clinical-data',
      { confirmation },
    ),

  listOrgs: () => api.get<AdminOrg[]>('/admin/orgs'),

  // Marks a tenant paid for `months` (cash, Nequi, transfer). Extends from the
  // later of the current period end or now.
  activateOrg: (id: string, months: number) =>
    api.post<{ subscription_status: string; current_period_end: string }>(
      `/admin/orgs/${id}/activate`,
      { months },
    ),
};

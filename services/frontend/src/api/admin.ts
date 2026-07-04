import { api } from './client';

export interface AdminOrgUser {
  id: string;
  display_name: string | null;
  email: string;
  role_name: string;
  is_active: boolean;
  last_login_at: string | null;
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  total_users: number;
  total_patients: number;
  signup_phone: string | null;
  signup_source: string | null;
  owner_email: string | null;
}

export interface SystemHealth {
  cpu_pct: number;
  disk: { total_gb: number; used_gb: number; free_gb: number; used_pct: number };
  mem: { total_gb: number; used_gb: number; free_gb: number; used_pct: number };
  db: {
    size_mb: number;
    total_conns: number;
    idle_conns: number;
    active_conns: number;
    top_tables: { name: string; size_mb: number }[];
  };
  redis: { ping_ms: number; used_memory_human: string; ok: boolean };
  tenants: {
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
    total_users: number;
    total_patients: number;
  };
  pg: {
    buffer_hit_pct: number;
    commits: number;
    rollbacks: number;
    deadlocks: number;
    slow_queries: number;
    active_locks: number;
    stats_age_hours: number;
  };
  ai_queue: { pending: number; processing: number; draft_ready: number; error: number };
  backup: { last_ok_at: string | null; size_human: string; hours_ago: number; ok: boolean };
  uptime_sec: number;
  collected_at: string;
  alerts: { level: string; code: string; message: string; tip: string }[];
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

  activateOrg: (id: string, months: number) =>
    api.post<{ subscription_status: string; current_period_end: string }>(
      `/admin/orgs/${id}/activate`,
      { months },
    ),

  systemHealth: () => api.get<SystemHealth>('/admin/system/health'),

  suspendOrg: (id: string) =>
    api.post<{ subscription_status: string }>(`/admin/orgs/${id}/suspend`, {}),

  cancelOrg: (id: string) =>
    api.post<{ subscription_status: string }>(`/admin/orgs/${id}/cancel`, {}),

  extendTrial: (id: string, days = 30) =>
    api.post<{ subscription_status: string; trial_ends_at: string }>(
      `/admin/orgs/${id}/extend-trial`,
      { days },
    ),

  listOrgUsers: (id: string) =>
    api.get<{ items: AdminOrgUser[] }>(`/admin/orgs/${id}/users`),

  removeOrgUser: (orgId: string, userId: string) =>
    api.delete<void>(`/admin/orgs/${orgId}/users/${userId}`),

  reactivateOrgUser: (orgId: string, userId: string, role_name: string) =>
    api.post<void>(`/admin/orgs/${orgId}/users/${userId}/reactivate`, { role_name }),

  getPlatformMP: () => api.get<PlatformMPConfig>('/admin/platform/mp'),
  updatePlatformMP: (data: { plan_amount?: number; plan_reason?: string; webhook_enforce?: boolean }) =>
    api.put<void>('/admin/platform/mp', data),
  updatePlatformTokens: (data: { access_token?: string; webhook_secret?: string }) =>
    api.put<void>('/admin/platform/mp/tokens', data),
};

export interface PlatformMPConfig {
  plan_amount: number;
  plan_reason: string;
  webhook_enforce: boolean;
  access_token_set: boolean;
  access_token_source: 'db' | 'env' | 'none';
  webhook_secret_set: boolean;
  webhook_secret_source: 'db' | 'env' | 'none';
}

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
  is_test: boolean;
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
  build: {
    version: string;          // SHA de git, o "dev" si no pasó por CI
    colour: string;           // blue | green | unknown
    migration_version: number;
    migration_dirty: boolean;
  };
  deploy: {
    active_colour: string;
    active_sha: string;
    switched_at: string | null;
    fallback_colour: string;
    fallback_sha: string;
    fallback_running: boolean;
    history: { at: string; colour: string; sha: string }[];
  };
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
    // Status still active/trialing but the access deadline already passed —
    // these tenants are locked out by the API gate.
    expired: number;
    suspended: number;
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

/** One step of the activation funnel. `median_hours` is null for `signup` (its
 *  own origin) and for `paid` (nothing records when a tenant started paying). */
export interface ActivationStep {
  key: string;
  label: string;
  orgs: number;
  pct: number;
  median_hours: number | null;
}

export interface ActivationOrg {
  org_id: string;
  name: string;
  slug: string;
  subscription_status: string;
  signup_source: string | null;
  created_at: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  last_login_at: string | null;
  total_patients: number;
  total_appointments: number;
  total_records: number;
  total_ai_drafts: number;
  /** One entry per timestamped step; null means the tenant never reached it. */
  reached: Record<string, string | null>;
  paid: boolean;
  /** Where the money came from: a real charge, a MercadoPago checkout with no
   *  charge recorded yet, or a manual activation from the console. Empty when
   *  the tenant is not paying. */
  paid_source: 'charged' | 'checkout' | 'manual' | '';
  furthest_step: string;
}

export interface ActivationMetrics {
  cohort_total: number;
  steps: ActivationStep[];
  orgs: ActivationOrg[];
  paid_breakdown: { charged: number; checkout: number; manual: number };
  /** Sample size below which the percentages say nothing. */
  min_readable_cohort: number;
}

// Admin-only maintenance. resetClinicalData only ever works for operational
// fixture orgs (reflected by me.data_reset_enabled) — never a real tenant.
// The org/billing endpoints are SYSTEM_ADMIN-only (the SaaS operator console).
export const adminApi = {
  resetClinicalData: (confirmation: string) =>
    api.post<{ status: string; deleted: Record<string, number> }>(
      '/admin/reset-clinical-data',
      { confirmation },
    ),

  listOrgs: () => api.get<AdminOrg[]>('/admin/orgs'),

  activateOrg: (id: string, months: number, seats = 0) =>
    api.post<{ subscription_status: string; current_period_end: string }>(
      `/admin/orgs/${id}/activate`,
      { months, seats }, // seats 0 = keep the org's current seat_limit
    ),

  systemHealth: () => api.get<SystemHealth>('/admin/system/health'),

  activationMetrics: () => api.get<ActivationMetrics>('/admin/metrics/activation'),

  suspendOrg: (id: string) =>
    api.post<{ subscription_status: string }>(`/admin/orgs/${id}/suspend`, {}),

  cancelOrg: (id: string) =>
    api.post<{ subscription_status: string }>(`/admin/orgs/${id}/cancel`, {}),

  extendTrial: (id: string, days = 30) =>
    api.post<{ subscription_status: string; trial_ends_at: string }>(
      `/admin/orgs/${id}/extend-trial`,
      { days },
    ),

  setOrgTestFlag: (id: string, isTest: boolean) =>
    api.patch<{ is_test: boolean }>(`/admin/orgs/${id}/test-flag`, { is_test: isTest }),

  /** Hard-deletes the entire organization — every table, users, keys, audio.
   *  confirmation must be the org's exact slug. */
  deleteOrg: (id: string, confirmation: string) =>
    api.delete<{ status: string; slug: string; deleted: Record<string, number> }>(
      `/admin/orgs/${id}`,
      { confirmation },
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

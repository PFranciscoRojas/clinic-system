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

export interface SystemHealth {
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
  uptime_sec: number;
  collected_at: string;
  alerts: { level: string; code: string; message: string; tip: string }[];
}

export interface ActionResult {
  action: string;
  description: string;
  output: string;
  ok: boolean;
  duration_ms: number;
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

  systemAction: (action: string) =>
    api.post<ActionResult>('/admin/system/actions', { action }),
};

import { api } from './client';

// Admin-only maintenance. The endpoint only exists on the server when
// ALLOW_DATA_RESET is on (reflected by me.data_reset_enabled).
export const adminApi = {
  resetClinicalData: (confirmation: string) =>
    api.post<{ status: string; deleted: Record<string, number> }>(
      '/admin/reset-clinical-data',
      { confirmation },
    ),
};

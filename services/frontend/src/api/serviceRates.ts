import { api } from './client';

export type RateModality = 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';

/** A row in the clinic's service-rate catalogue (BC-6). */
export interface ServiceRate {
  id: string;
  name: string;
  description?: string;
  amount: string; // decimal string — money is never a float
  currency: string;
  modality?: RateModality | null;
  staff_id?: string | null; // null/absent = org-wide rate
  is_active: boolean;
  created_at: string;
}

export interface ServiceRateInput {
  name: string;
  description?: string;
  amount: string;
  currency?: string;
  modality?: RateModality | null;
  staff_id?: string | null;
}

export const serviceRatesApi = {
  list: (includeInactive = false) =>
    api.get<ServiceRate[]>(`/service-rates${includeInactive ? '?include_inactive=true' : ''}`),
  create: (input: ServiceRateInput) => api.post<ServiceRate>('/service-rates', input),
  update: (id: string, input: ServiceRateInput) => api.put<ServiceRate>(`/service-rates/${id}`, input),
  setActive: (id: string, active: boolean) =>
    api.patch<ServiceRate>(`/service-rates/${id}/active`, { active }),
};

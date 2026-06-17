import { api } from './client';

export interface DayAvailability {
  date: string;    // YYYY-MM-DD
  slots: string[]; // ["09:00","09:30",…] local time
}

export interface BookingForm {
  org_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  modality: 'VIRTUAL' | 'IN_PERSON';
  preferred_date: string; // YYYY-MM-DD (the chosen slot's day)
  preferred_time: string; // HH:MM (the chosen slot)
  notes?: string;
}

export interface OrgInfo {
  public_name: string;
  brand_color: string;
}

// Public booking API — no auth. Used by /book/:slug.
export const publicBookingApi = {
  orgInfo: (slug: string) =>
    api.get<OrgInfo>(`/public/org?org_slug=${encodeURIComponent(slug)}`),

  availability: (slug: string, modality: string, from: string, to: string) =>
    api.get<{ days: DayAvailability[] }>(
      `/public/availability?org_slug=${encodeURIComponent(slug)}&modality=${modality}&from=${from}&to=${to}`,
    ),

  // Reuses the existing public booking endpoint; in Phase 1 this creates a
  // pending request (the clinic confirms). Phase 2 will route through payment.
  create: (body: BookingForm) => api.post<{ id: string }>('/public/booking/', body),
};

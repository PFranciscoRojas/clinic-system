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

  // Reuses the existing public booking endpoint; creates a pending request
  // (the clinic confirms). Kept as a no-payment fallback.
  create: (body: BookingForm) => api.post<{ id: string }>('/public/booking/', body),

  // Holds the slot and returns a MercadoPago checkout URL + a summary to show
  // before redirecting to pay.
  checkout: (body: { org_slug: string; modality: string; date: string; time: string; name: string; email: string; phone: string }) =>
    api.post<{ init_point: string; summary: { date: string; time: string; modality: string; amount: number; currency: string } }>(
      '/public/pay/checkout', body,
    ),

  // Booking status for the post-payment return page (PAID once the webhook lands).
  status: (id: string) =>
    api.get<{ status: string; modality: string; scheduled_at: string; clinic_name: string }>(
      `/public/pay/status?id=${encodeURIComponent(id)}`,
    ),
};

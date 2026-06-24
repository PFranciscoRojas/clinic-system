import { api } from './client';

export interface DayAvailability {
  date: string;    // YYYY-MM-DD
  slots: string[]; // ["09:00","09:30",…] local time
}

export interface OrgInfo {
  public_name: string;
  brand_color: string;
  website: string;
}

// Public booking API — no auth. Used by /book/:slug.
export const publicBookingApi = {
  orgInfo: (slug: string) =>
    api.get<OrgInfo>(`/public/org?org_slug=${encodeURIComponent(slug)}`),

  availability: (slug: string, modality: string, from: string, to: string) =>
    api.get<{ days: DayAvailability[] }>(
      `/public/availability?org_slug=${encodeURIComponent(slug)}&modality=${modality}&from=${from}&to=${to}`,
    ),

  // Holds the slot and returns a MercadoPago checkout URL + a summary to show
  // before redirecting to pay. prev_booking_id releases a hold created earlier
  // in the same wizard session (so editing the summary and re-submitting works).
  checkout: (body: { org_slug: string; modality: string; date: string; time: string; name: string; email: string; phone: string; policy_accepted: boolean; prev_booking_id?: string }) =>
    api.post<{ init_point: string; booking_id: string; summary: { date: string; time: string; modality: string; amount: number; currency: string } }>(
      '/public/pay/checkout', body,
    ),

  // Booking status for the post-payment return page (PAID once the webhook
  // lands). For deferred payments (Efecty/cash) it stays PENDING_PAYMENT but
  // carries the voucher URL + hold deadline so the page can tell the patient to
  // pay the voucher. 404 means the booking was rejected/released (definitive).
  status: (id: string) =>
    api.get<{ status: string; modality: string; scheduled_at: string; clinic_name: string; org_slug: string; website: string; payment_type: string; voucher_url: string; hold_expires_at: string }>(
      `/public/pay/status?id=${encodeURIComponent(id)}`,
    ),

  // Frees a held slot immediately when the patient abandons/cancels payment.
  release: (id: string) => api.post<void>('/public/pay/release', { id }),
};

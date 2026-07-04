import { api } from './client';

export interface PlanInfo {
  subscription_status: string;
  seat_limit: number;      // paid clinical seats (PROFESSIONAL/INTERN)
  seats_used: number;      // active clinical staff today
  per_seat_amount: number; // monthly COP per professional
  currency: string;
}

export const billingApi = {
  // Creates the tenant's MercadoPago subscription plan and returns the hosted
  // checkout URL to redirect to. Allowed even when the trial has lapsed.
  // seats is optional — the backend never charges for fewer seats than the
  // org's current active clinical headcount.
  checkout: (seats?: number) =>
    api.post<{ init_point: string }>('/billing/checkout', seats ? { seats } : {}),

  // Seats and per-seat price for the billing UI (CLINIC_ADMIN only).
  plan: () => api.get<PlanInfo>('/billing/plan'),
};

// startCheckout requests the hosted checkout URL and sends the browser there.
// Throws if billing isn't available yet (503) or the gateway errors.
export async function startCheckout(seats?: number): Promise<void> {
  const { init_point } = await billingApi.checkout(seats);
  window.location.href = init_point;
}

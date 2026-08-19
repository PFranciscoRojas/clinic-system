import { api } from './client';

export type BillingPeriod = 'monthly' | 'annual';

export interface PlanInfo {
  subscription_status: string;
  seat_limit: number;             // paid clinical seats (PROFESSIONAL/INTERN)
  seats_used: number;             // active clinical staff today
  per_seat_amount: number;        // monthly COP per professional (card only)
  per_seat_annual_amount: number; // 12 months COP per professional, billed once (10 months — 2 free; accepts PSE/Efecty/Nequi)
  currency: string;
}

export const billingApi = {
  /** Asks MercadoPago again whether this tenant's subscription is paid, and
   *  applies whatever it answers. The checkout return page calls it once; the
   *  expired-subscription screen calls it for anyone whose payment went
   *  through without reaching us. */
  reconcile: () =>
    api.post<{ subscription_status: string }>('/billing/reconcile', {}),

  // Creates the tenant's MercadoPago checkout and returns the hosted URL to
  // redirect to. Allowed even when the trial has lapsed. seats is optional —
  // the backend never charges for fewer seats than the org's current active
  // clinical headcount. period "annual" is a one-time prepay (10 months, 2
  // free) instead of the monthly card subscription.
  checkout: (seats?: number, period: BillingPeriod = 'monthly') =>
    api.post<{ init_point: string }>('/billing/checkout', { ...(seats ? { seats } : {}), period }),

  // Seats and per-seat price for the billing UI (CLINIC_ADMIN only).
  plan: () => api.get<PlanInfo>('/billing/plan'),
};

// startCheckout requests the hosted checkout URL and sends the browser there.
// Throws if billing isn't available yet (503) or the gateway errors.
export async function startCheckout(seats?: number, period: BillingPeriod = 'monthly'): Promise<void> {
  const { init_point } = await billingApi.checkout(seats, period);
  window.location.href = init_point;
}

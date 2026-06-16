import { api } from './client';

export const billingApi = {
  // Creates the tenant's MercadoPago subscription plan and returns the hosted
  // checkout URL to redirect to. Allowed even when the trial has lapsed.
  checkout: () => api.post<{ init_point: string }>('/billing/checkout', {}),
};

// startCheckout requests the hosted checkout URL and sends the browser there.
// Throws if billing isn't available yet (503) or the gateway errors.
export async function startCheckout(): Promise<void> {
  const { init_point } = await billingApi.checkout();
  window.location.href = init_point;
}

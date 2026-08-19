import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reconcile = vi.fn();
vi.mock('@/api/billing', () => ({ billingApi: { reconcile: () => reconcile() } }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { user_id: 'u1', roles: ['CLINIC_ADMIN'], subscription_status: 'trialing' } }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { SubscriptionExpired } from './AppShell';

const reload = vi.fn();

beforeEach(() => {
  reconcile.mockReset();
  reload.mockReset();
  Object.defineProperty(window, 'location', { value: { reload }, writable: true });
});
afterEach(cleanup);

describe('SubscriptionExpired', () => {
  it('lets someone who already paid ask again', async () => {
    // On 2026-08-18 a tenant's charge went through, three bugs swallowed it,
    // and this screen kept offering to take a payment already made. The only
    // caller of reconcile lived on the checkout return page, so missing that
    // page once left no way back in at all.
    reconcile.mockResolvedValue({ subscription_status: 'active' });
    render(<SubscriptionExpired onLogout={vi.fn()} />);

    await userEvent.click(screen.getByText('Ya pagué, verificar'));

    await waitFor(() => expect(reconcile).toHaveBeenCalled());
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('says so when MercadoPago still does not report the payment', async () => {
    // Reloading into the same wall would read as the button doing nothing.
    reconcile.mockResolvedValue({ subscription_status: 'trialing' });
    render(<SubscriptionExpired onLogout={vi.fn()} />);

    await userEvent.click(screen.getByText('Ya pagué, verificar'));

    await waitFor(() => expect(screen.getByText(/todavía no reporta el pago/)).toBeTruthy());
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not strand the screen when the check itself fails', async () => {
    reconcile.mockRejectedValue(new Error('502'));
    render(<SubscriptionExpired onLogout={vi.fn()} />);

    await userEvent.click(screen.getByText('Ya pagué, verificar'));

    await waitFor(() => expect(screen.getByText(/No pudimos consultar tu pago/)).toBeTruthy());
    expect(screen.getByText('Ya pagué, verificar')).toBeTruthy();
  });
});

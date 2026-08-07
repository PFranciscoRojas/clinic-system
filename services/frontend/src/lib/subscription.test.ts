import { describe, it, expect } from 'vitest';
import { orgAccess } from './subscription';

const NOW = new Date('2026-08-07T20:00:00Z');

describe('orgAccess', () => {
  // The bug: the superadmin badge read subscription_status alone, so a paid
  // period that lapsed still rendered as "Activo" while the API's entitlement
  // gate (middleware.Entitled) was already locking the clinic out.
  it('reports a lapsed paid period as expired, not active', () => {
    const a = orgAccess(
      { subscription_status: 'active', trial_ends_at: '2026-07-02T14:27:52Z', current_period_end: '2026-07-26T22:32:49Z' },
      NOW,
    );
    expect(a.entitled).toBe(false);
    expect(a.state).toBe('expired');
    expect(a.label).toBe('Vencido');
    expect(a.rawStatus).toBe('active');
    expect(a.days).toBe(-12);
    expect(a.detail).toBe('venció hace 12 días');
  });

  it('reports a lapsed trial as expired', () => {
    const a = orgAccess(
      { subscription_status: 'trialing', trial_ends_at: '2026-08-01T23:18:14Z', current_period_end: null },
      NOW,
    );
    expect(a.entitled).toBe(false);
    expect(a.state).toBe('expired');
    expect(a.label).toBe('Trial vencido');
  });

  it('keeps a paid period in the future active', () => {
    const a = orgAccess(
      { subscription_status: 'active', trial_ends_at: '2026-08-05T02:26:10Z', current_period_end: '2026-09-07T20:39:07Z' },
      NOW,
    );
    expect(a.entitled).toBe(true);
    expect(a.state).toBe('active');
    expect(a.label).toBe('Activo');
    // 31 days and 39 minutes out — the partial day counts, like /me does.
    expect(a.days).toBe(32);
    expect(a.detail).toBe('vence en 32 días');
  });

  it('prefers the paid period over the trial date, like the API gate', () => {
    // Trial long gone, paid period running: still entitled.
    const a = orgAccess(
      { subscription_status: 'active', trial_ends_at: '2026-01-01T00:00:00Z', current_period_end: '2026-08-20T00:00:00Z' },
      NOW,
    );
    expect(a.entitled).toBe(true);
    expect(a.until).toBe('2026-08-20T00:00:00Z');
  });

  it('falls back to the trial date when there is no paid period', () => {
    const a = orgAccess(
      { subscription_status: 'trialing', trial_ends_at: '2026-08-20T00:00:00Z', current_period_end: null },
      NOW,
    );
    expect(a.entitled).toBe(true);
    expect(a.state).toBe('trialing');
    expect(a.label).toBe('Trial');
    expect(a.until).toBe('2026-08-20T00:00:00Z');
  });

  it('treats active with no date at all as blocked, and says so', () => {
    const a = orgAccess(
      { subscription_status: 'active', trial_ends_at: null, current_period_end: null },
      NOW,
    );
    expect(a.entitled).toBe(false);
    expect(a.state).toBe('expired');
    expect(a.days).toBeNull();
    expect(a.detail).toBe('sin fecha de vencimiento');
  });

  it('rounds the last day up so a period ending tonight still reads as one day', () => {
    const a = orgAccess(
      { subscription_status: 'trialing', trial_ends_at: '2026-08-07T23:59:00Z', current_period_end: null },
      NOW,
    );
    expect(a.entitled).toBe(true);
    expect(a.days).toBe(1);
    expect(a.detail).toBe('vence en 1 día');
  });

  it('labels suspended, canceled and past_due without inventing entitlement', () => {
    const future = '2099-01-01T00:00:00Z';
    for (const [status, label] of [
      ['suspended', 'Suspendido'],
      ['canceled', 'Cancelado'],
      ['past_due', 'Pago pendiente'],
    ] as const) {
      const a = orgAccess({ subscription_status: status, trial_ends_at: null, current_period_end: future }, NOW);
      expect(a.entitled).toBe(false);
      expect(a.state).toBe(status);
      expect(a.label).toBe(label);
    }
  });

  it('keeps an unknown status visible instead of swallowing it', () => {
    const a = orgAccess({ subscription_status: 'weird', trial_ends_at: null, current_period_end: null }, NOW);
    expect(a.entitled).toBe(false);
    expect(a.label).toBe('weird');
  });

  // The badge tells the truth about access; the raw DB status stays visible
  // next to it so the operator can trace *why* (active but unpaid vs. canceled).
  it('flags when the badge and the stored status disagree', () => {
    const lapsed = orgAccess({ subscription_status: 'active', trial_ends_at: null, current_period_end: '2026-07-26T22:32:49Z' }, NOW);
    const fine = orgAccess({ subscription_status: 'active', trial_ends_at: null, current_period_end: '2026-09-07T20:39:07Z' }, NOW);
    expect(lapsed.mismatch).toBe(true);
    expect(fine.mismatch).toBe(false);
  });
});

// Access state of a tenant, derived the same way the API derives it.
//
// The server gate is middleware.Entitled(status, accessUntil): only 'active' or
// 'trialing' pass, and only while COALESCE(current_period_end, trial_ends_at)
// is still in the future. subscription_status alone is *not* the answer — a
// clinic whose paid period lapsed keeps the column at 'active' until an
// operator or a payment moves it, so any screen that reads only the column
// shows a green "Activo" for a clinic the API is already locking out.

export type AccessState =
  | 'active'
  | 'trialing'
  | 'expired'
  | 'suspended'
  | 'canceled'
  | 'past_due'
  | 'unknown';

export interface OrgBillingFields {
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export interface OrgAccess {
  /** What the API gate actually decides for this org. */
  entitled: boolean;
  state: AccessState;
  /** Badge text: says what access *is*, not what the column says. */
  label: string;
  color: string;
  /** subscription_status as stored, kept for traceability next to the badge. */
  rawStatus: string;
  /** true when the stored status reads better than the real access state. */
  mismatch: boolean;
  /** The date the gate compares against (paid period, else trial). */
  until: string | null;
  /** Whole days to `until`, rounded away from zero. Negative = already past. */
  days: number | null;
  /** Human phrasing of `days`, e.g. "venció hace 12 días". */
  detail: string;
}

const COLORS = {
  green: '#16a34a',
  indigo: '#2a2769',
  red: '#dc2626',
  amber: '#d97706',
  gray: '#9ca3af',
};

const DAY_MS = 86_400_000;

export function orgAccess(org: OrgBillingFields, now: Date = new Date()): OrgAccess {
  const status = org.subscription_status;
  const until = org.current_period_end ?? org.trial_ends_at;
  const untilMs = until ? new Date(until).getTime() : NaN;
  const valid = Number.isFinite(untilMs);

  const entitled = (status === 'active' || status === 'trialing') && valid && untilMs > now.getTime();

  // Whole days, rounded away from now: a period ending in 3 hours reads as
  // "1 día" (matching /me's trial_days_left), one that lapsed 3 hours ago as
  // "hace 1 día" — never "hace 0 días".
  let days: number | null = null;
  if (valid) {
    const raw = (untilMs - now.getTime()) / DAY_MS;
    days = raw >= 0 ? Math.ceil(raw) : -Math.ceil(-raw);
  }

  let detail: string;
  if (days === null) {
    detail = 'sin fecha de vencimiento';
  } else if (days >= 0) {
    detail = `vence en ${days} ${days === 1 ? 'día' : 'días'}`;
  } else {
    const ago = -days;
    detail = `venció hace ${ago} ${ago === 1 ? 'día' : 'días'}`;
  }

  let state: AccessState;
  let label: string;
  let color: string;
  if (entitled) {
    state = status === 'active' ? 'active' : 'trialing';
    label = status === 'active' ? 'Activo' : 'Trial';
    color = status === 'active' ? COLORS.green : COLORS.indigo;
  } else if (status === 'active' || status === 'trialing') {
    state = 'expired';
    label = status === 'active' ? 'Vencido' : 'Trial vencido';
    color = COLORS.red;
  } else if (status === 'suspended') {
    state = 'suspended';
    label = 'Suspendido';
    color = COLORS.amber;
  } else if (status === 'canceled') {
    state = 'canceled';
    label = 'Cancelado';
    color = COLORS.gray;
  } else if (status === 'past_due') {
    state = 'past_due';
    label = 'Pago pendiente';
    color = COLORS.amber;
  } else {
    state = 'unknown';
    label = status;
    color = COLORS.gray;
  }

  return {
    entitled,
    state,
    label,
    color,
    rawStatus: status,
    mismatch: state === 'expired',
    until,
    days,
    detail,
  };
}

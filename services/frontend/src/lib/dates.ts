// Helpers for calendar dates (DATE columns: session_date, birth_date,
// diagnosed_at…). These arrive as "2026-07-02" or "2026-07-02T00:00:00Z";
// feeding either to `new Date(string)` yields UTC midnight, which in
// America/Bogota (UTC-5) renders as the previous day. Anchoring to local
// noon keeps the calendar day stable in every timezone.
// Never use these for real timestamps (created_at, scheduled_at…) — a
// timestamp can legitimately fall at UTC midnight and must not be shifted.

export function parseDateOnly(value: string): Date {
  return new Date(value.slice(0, 10) + 'T12:00:00');
}

export function fmtDateOnly(value: string, options?: Intl.DateTimeFormatOptions): string {
  return parseDateOnly(value).toLocaleDateString('es-CO', options ?? { day: '2-digit', month: 'short', year: 'numeric' });
}

// Today's calendar date where the user is, as "YYYY-MM-DD". Use this instead
// of letting the backend default to the server clock: the server runs in UTC,
// so a Bogotá evening (19:00+) would be stamped with tomorrow's date.
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A real timestamp with its time of day. Several drafts land on the same day,
// and the day alone does not tell two of them apart in a list. No anchoring
// here, deliberately: a timestamp means the instant it says, and shifting it
// to local noon the way parseDateOnly does would be a lie about when it
// happened.
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}, ${
    d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
}

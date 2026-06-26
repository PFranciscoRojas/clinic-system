// Per-patient break-the-glass reason, scoped to the browser session.
// Cleared automatically when the tab/window closes (sessionStorage semantics).

const key = (patientId: string) => `btg_reason_${patientId}`;

export const getClinicalAccessReason = (patientId: string): string | null =>
  sessionStorage.getItem(key(patientId));

export const setClinicalAccessReason = (patientId: string, reason: string): void =>
  sessionStorage.setItem(key(patientId), reason);

// A user has CLINIC_ADMIN but no clinical role (PROFESSIONAL or INTERN).
export function isPureAdmin(roles: string[] | undefined): boolean {
  if (!roles) return false;
  const hasAdmin = roles.includes('CLINIC_ADMIN');
  const hasClinical = roles.some(r => r === 'PROFESSIONAL' || r === 'INTERN');
  return hasAdmin && !hasClinical;
}

// A user has CLINIC_ADMIN but no clinical role (PROFESSIONAL or INTERN).
export function isPureAdmin(roles: string[] | undefined): boolean {
  if (!roles) return false;
  const hasAdmin = roles.includes('CLINIC_ADMIN');
  const hasClinical = roles.some(r => r === 'PROFESSIONAL' || r === 'INTERN');
  return hasAdmin && !hasClinical;
}

// Birth-date helpers shared by every form that captures fecha de nacimiento.
// A half-typed <input type="date"> can submit year 0001 and the patient ends
// up "2025 años" — every entry point validates and every display guards.

export const MIN_BIRTH_DATE = '1900-01-01';

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns null for missing or implausible dates instead of a nonsense age.
export function calcAge(birthIso: string | null | undefined): number | null {
  if (!birthIso) return null;
  if (birthIso < MIN_BIRTH_DATE || birthIso > todayISO()) return null;
  const b = new Date(birthIso + 'T12:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

// Error message for forms, or null when the date is acceptable (empty = optional).
export function validateBirthDate(birthIso: string): string | null {
  if (!birthIso) return null;
  if (birthIso > todayISO()) return 'La fecha de nacimiento no puede ser futura.';
  if (birthIso < MIN_BIRTH_DATE) return 'Fecha de nacimiento inválida — revisa el año.';
  return null;
}

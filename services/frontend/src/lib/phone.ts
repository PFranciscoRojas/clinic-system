// Shared phone helpers for the public booking wizard and professional onboarding.
// Country dial codes with flags + the expected national number length and an
// optional first-digit rule (Colombian mobiles are 10 digits starting with 3).

export interface Country {
  flag: string;
  code: string;
  name: string;
  len: number;
  starts?: string;
}

export const COUNTRIES: Country[] = [
  { flag: '🇨🇴', code: '+57', name: 'Colombia', len: 10, starts: '3' },
  { flag: '🇲🇽', code: '+52', name: 'México', len: 10 },
  { flag: '🇵🇪', code: '+51', name: 'Perú', len: 9 },
  { flag: '🇨🇱', code: '+56', name: 'Chile', len: 9 },
  { flag: '🇦🇷', code: '+54', name: 'Argentina', len: 10 },
  { flag: '🇪🇨', code: '+593', name: 'Ecuador', len: 9 },
  { flag: '🇻🇪', code: '+58', name: 'Venezuela', len: 10 },
  { flag: '🇺🇸', code: '+1', name: 'EE. UU.', len: 10 },
  { flag: '🇪🇸', code: '+34', name: 'España', len: 9 },
];

// Returns an error message when the number is invalid for the country, or '' when valid.
export function validatePhone(code: string, digits: string): string {
  const c = COUNTRIES.find(x => x.code === code);
  if (!c) return '';
  if (digits.length !== c.len) return `El número debe tener ${c.len} dígitos.`;
  if (c.starts && !digits.startsWith(c.starts)) return `En ${c.name} el celular empieza por ${c.starts}.`;
  return '';
}

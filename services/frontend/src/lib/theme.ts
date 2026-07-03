export const ACCENT_COLORS = ['#363285','#5b52ad','#f59e0b','#10b981','#ef4444','#7d75c7','#f97316','#0ea5e9'] as const;

const THEMES: Record<string, { base: string; dark: string; light: string }> = {
  '#363285': { base: '#363285', dark: '#2a2769', light: '#e4e2f6' },
  '#5b52ad': { base: '#5b52ad', dark: '#464093', light: '#e4e2f6' },
  '#f59e0b': { base: '#f59e0b', dark: '#d97706', light: '#fef3c7' },
  '#10b981': { base: '#10b981', dark: '#059669', light: '#d1fae5' },
  '#ef4444': { base: '#ef4444', dark: '#dc2626', light: '#fee2e2' },
  '#7d75c7': { base: '#7d75c7', dark: '#5b52ad', light: '#e4e2f6' },
  '#f97316': { base: '#f97316', dark: '#ea580c', light: '#ffedd5' },
  '#0ea5e9': { base: '#0ea5e9', dark: '#0284c7', light: '#e0f2fe' },
};

export function applyAccentColor(color: string) {
  const t = THEMES[color];
  if (!t) return;
  const r = document.documentElement;
  r.style.setProperty('--teal',   t.base);
  r.style.setProperty('--teal-d', t.dark);
  r.style.setProperty('--teal-l', t.light);
}

export function loadSavedAccent(userId?: string) {
  const key = userId ? `sghcp_accent_${userId}` : 'sghcp_accent';
  const saved = localStorage.getItem(key);
  if (saved && THEMES[saved]) applyAccentColor(saved);
}

export function saveAccentColor(color: string, userId?: string) {
  const key = userId ? `sghcp_accent_${userId}` : 'sghcp_accent';
  localStorage.setItem(key, color);
  applyAccentColor(color);
}

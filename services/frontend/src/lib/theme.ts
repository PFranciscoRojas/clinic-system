export const ACCENT_COLORS = ['#14b8a6','#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#f97316','#0ea5e9'] as const;

const THEMES: Record<string, { base: string; dark: string; light: string }> = {
  '#14b8a6': { base: '#14b8a6', dark: '#0f766e', light: '#ccfbf1' },
  '#6366f1': { base: '#6366f1', dark: '#4f46e5', light: '#e0e7ff' },
  '#f59e0b': { base: '#f59e0b', dark: '#d97706', light: '#fef3c7' },
  '#10b981': { base: '#10b981', dark: '#059669', light: '#d1fae5' },
  '#ef4444': { base: '#ef4444', dark: '#dc2626', light: '#fee2e2' },
  '#8b5cf6': { base: '#8b5cf6', dark: '#7c3aed', light: '#ede9fe' },
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

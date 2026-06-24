// Screen-lock preference — stored per-user in localStorage, the same as the
// unlock PIN (sghcp_pin_${userId}). The lock is a device-local preference, so
// it never hits the backend. Auto-lock only fires when a PIN is also set
// (without a PIN there is nothing to unlock with).

const EVENT = 'sghcp-lock-config';

export interface LockConfig {
  enabled: boolean;
  minutes: number;
}

const DEFAULTS: LockConfig = { enabled: true, minutes: 5 };

function enabledKey(userId?: string): string {
  return `sghcp_lock_enabled_${userId ?? ''}`;
}
function minutesKey(userId?: string): string {
  return `sghcp_lock_minutes_${userId ?? ''}`;
}

export function getLockConfig(userId?: string): LockConfig {
  const rawEnabled = localStorage.getItem(enabledKey(userId));
  const rawMinutes = localStorage.getItem(minutesKey(userId));
  const minutes = rawMinutes ? Number(rawMinutes) : DEFAULTS.minutes;
  return {
    enabled: rawEnabled === null ? DEFAULTS.enabled : rawEnabled === 'true',
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULTS.minutes,
  };
}

export function setLockConfig(userId: string | undefined, cfg: LockConfig): void {
  localStorage.setItem(enabledKey(userId), String(cfg.enabled));
  localStorage.setItem(minutesKey(userId), String(cfg.minutes));
  // Notify the running AppShell so the change applies without a reload.
  window.dispatchEvent(new Event(EVENT));
}

// Subscribe to config changes (storage events fire across tabs; the custom
// event covers same-tab updates). Returns an unsubscribe function.
export function onLockConfigChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

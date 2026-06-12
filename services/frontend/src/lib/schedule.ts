// Working-schedule config. Written by the onboarding wizard and
// Settings → Horario y agenda; read by the appointment scheduler so the
// offered slots match the professional's real working hours.
// Stored in localStorage until a server-side settings API exists.

export interface ScheduleConfig {
  activeDays: string[];   // 'Lun'…'Dom' — same labels the pickers render
  startHour: string;      // 'HH:MM'
  endHour: string;        // 'HH:MM'
  sessionLen: number;     // default session duration in minutes
  breakStart?: string;    // 'HH:MM' — midday break (no slots offered)
  breakEnd?: string;
  buffer?: number;        // free minutes required between sessions
  maxPerDay?: number;     // workload warning threshold
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  activeDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
  startHour: '08:00',
  endHour: '19:00',
  sessionLen: 50,
  breakStart: '13:00',
  breakEnd: '14:00',
  buffer: 10,
  maxPerDay: 8,
};

const STORAGE_KEY = 'sghcp_schedule';

// getDay(): 0=Sunday … 6=Saturday
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function loadSchedule(): ScheduleConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...DEFAULT_SCHEDULE, ...saved };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function saveSchedule(cfg: ScheduleConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ── Server sync ───────────────────────────────────────────────────────────────
// The schedule lives in professional_profiles.working_hours so it follows the
// professional across devices; localStorage is the offline cache.

export async function fetchScheduleFromServer(): Promise<ScheduleConfig | null> {
  const { profilesApi } = await import('@/api/profiles');
  try {
    const { schedule } = await profilesApi.getSchedule();
    if (schedule && typeof schedule === 'object') {
      const merged = { ...DEFAULT_SCHEDULE, ...(schedule as Partial<ScheduleConfig>) };
      saveSchedule(merged); // refresh the cache
      return merged;
    }
  } catch { /* no profile yet or offline — cache/defaults apply */ }
  return null;
}

export async function persistSchedule(cfg: ScheduleConfig): Promise<void> {
  saveSchedule(cfg);
  try {
    const { profilesApi } = await import('@/api/profiles');
    await profilesApi.saveSchedule(cfg);
  } catch { /* offline or no profile — cached locally, syncs on next save */ }
}

export function dayLabelOf(isoDate: string): string {
  return DAY_LABELS[new Date(isoDate + 'T12:00:00').getDay()];
}

export function isWorkingDay(isoDate: string, cfg: ScheduleConfig): boolean {
  return cfg.activeDays.includes(dayLabelOf(isoDate));
}

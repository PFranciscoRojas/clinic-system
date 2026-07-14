// Working-schedule config. Written by the onboarding wizard and
// Settings → Horario y agenda; read by the appointment scheduler so the
// offered slots match the professional's real working hours.
// Stored in localStorage until a server-side settings API exists.

export interface ScheduleConfig {
  activeDays: string[];   // 'Lun'…'Dom' — same labels the pickers render
  startHour: string;      // 'HH:MM'
  endHour: string;        // 'HH:MM'
  sessionLen: number;     // default session duration in minutes — fallback for the three below
  sessionLenInitial?: number;   // 'Sesión inicial' override — falls back to sessionLen when unset
  sessionLenFollowup?: number;  // 'Seguimiento' override — falls back to sessionLen when unset
  sessionLenDischarge?: number; // 'Sesión de alta' override — falls back to sessionLen when unset
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

// SLOT_STEP_MIN must match the new-appointment page grid so a quick-booked time
// lands exactly on an offered slot.
export const SLOT_STEP_MIN = 30;

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// timeSlotsFor returns the bookable 'HH:MM' start times for a given date,
// honouring working days, working hours and the midday break. Empty when the
// date is not a working day.
export function timeSlotsFor(isoDate: string, cfg: ScheduleConfig): string[] {
  if (!isWorkingDay(isoDate, cfg)) return [];
  const start = toMinutes(cfg.startHour);
  const end   = toMinutes(cfg.endHour);
  const brkS  = cfg.breakStart ? toMinutes(cfg.breakStart) : -1;
  const brkE  = cfg.breakEnd   ? toMinutes(cfg.breakEnd)   : -1;
  const slots: string[] = [];
  for (let m = start; m < end; m += SLOT_STEP_MIN) {
    if (brkS >= 0 && brkE > brkS && m >= brkS && m < brkE) continue;
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return slots;
}

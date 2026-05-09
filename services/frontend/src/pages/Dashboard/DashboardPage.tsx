import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Video, MapPin,
  Brain, FileText, Bell, BellOff, Users, Receipt,
  UserPlus, ClipboardList, CalendarDays, Sparkles,
  X, ChevronDown, AlertTriangle, LayoutList, CalendarRange,
} from 'lucide-react';

import { appointmentsApi, type Appointment } from '@/api/appointments';
import { patientsApi, type Patient } from '@/api/patients';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FilterTab  = 'all' | 'upcoming' | 'confirmed' | 'pending' | 'completed';
type ViewMode   = 'list' | 'week';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'Todas'       },
  { key: 'upcoming',  label: 'Próxima'     },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'pending',   label: 'Pendientes'  },
  { key: 'completed', label: 'Completadas' },
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tzOffset(): string {
  const off  = new Date().getTimezoneOffset();
  const sign = off <= 0 ? '+' : '-';
  const abs  = Math.abs(off);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function localISO(date: string, time: string): string {
  return `${date}T${time}:00${tzOffset()}`;
}

function fmtShortDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function navDateLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDateFromISO(isoUTC: string): string {
  // Convert UTC ISO to local YYYY-MM-DD
  const d = new Date(isoUTC);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Week helpers
function getWeekDays(iso: string): string[] {
  const d   = new Date(iso + 'T12:00:00');
  const dow = d.getDay(); // 0=Sun
  const mondayOff = dow === 0 ? -6 : 1 - dow;
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + mondayOff + i);
    days.push(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
  }
  return days;
}

function weekRangeLabel(days: string[]): string {
  const s = new Date(days[0] + 'T12:00:00');
  const e = new Date(days[6] + 'T12:00:00');
  const sm = MONTH_NAMES[s.getMonth()];
  const em = MONTH_NAMES[e.getMonth()];
  if (sm === em) return `${s.getDate()}–${e.getDate()} ${sm} ${s.getFullYear()}`;
  return `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${e.getFullYear()}`;
}

function fmtTime(isoOrHHMM: string) {
  if (isoOrHHMM.includes('T')) {
    return new Date(isoOrHHMM).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return isoOrHHMM;
}

function endTime(appt: Appointment) {
  const end = new Date(new Date(appt.scheduled_at).getTime() + appt.duration_min * 60_000);
  return end.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function isInProgress(appt: Appointment) {
  const start = new Date(appt.scheduled_at).getTime();
  const end   = start + appt.duration_min * 60_000;
  const now   = Date.now();
  return now >= start && now < end && appt.status !== 'COMPLETED' && appt.status !== 'CANCELLED';
}

function isPast(appt: Appointment) {
  const end = new Date(appt.scheduled_at).getTime() + appt.duration_min * 60_000;
  return Date.now() >= end;
}

function statusMeta(appt: Appointment): { label: string; color: string; bg: string; border: string } {
  if (appt.status === 'COMPLETED')  return { label: 'Completada', color: '#374151', bg: '#f3f4f6', border: '#d1d5db' };
  if (appt.status === 'CANCELLED')  return { label: 'Cancelada',  color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' };
  if (appt.status === 'NO_SHOW')    return { label: 'No asistió', color: '#92400e', bg: '#fef3c7', border: '#fcd34d' };
  if (isInProgress(appt))           return { label: 'En curso',   color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' };
  if (isPast(appt))                 return { label: 'Pendiente',  color: '#92400e', bg: '#fff7ed', border: '#fdba74' };
  return { label: 'Confirmada', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' };
}

function filterAppts(appts: Appointment[], tab: FilterTab): Appointment[] {
  switch (tab) {
    case 'upcoming':  return appts.filter(a => isInProgress(a) || (!isPast(a) && a.status === 'SCHEDULED'));
    case 'confirmed': return appts.filter(a => a.status === 'SCHEDULED' && !isPast(a));
    case 'pending':   return appts.filter(a => isPast(a) && a.status === 'SCHEDULED');
    case 'completed': return appts.filter(a => a.status === 'COMPLETED');
    default:          return appts.filter(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW');
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function patientFullName(p: Patient) {
  return [p.first_name, p.paternal_last_name].filter(Boolean).join(' ');
}

function greeting(name: string) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  return `${g}, ${name.split(/[\s@]/)[0]} 👋`;
}

// ─── PatientCell (per-row patient fetch) ──────────────────────────────────────

function usePatient(id: string) {
  return useQuery<Patient>({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id),
    staleTime: 5 * 60_000,
  });
}

// ─── AppointmentRow ───────────────────────────────────────────────────────────

function AppointmentRow({
  appt, isFirst, showNowLine,
}: { appt: Appointment; isFirst: boolean; showNowLine: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { data: patient } = usePatient(appt.patient_id);

  const meta   = statusMeta(appt);
  const inProg = isInProgress(appt);
  const name   = patient ? patientFullName(patient) : `Paciente #${appt.patient_id.slice(-4)}`;
  const abbr   = patient ? initials(patientFullName(patient)) : '??';
  const start  = fmtTime(appt.scheduled_at);
  const end    = endTime(appt);

  const borderColor = inProg ? 'var(--teal)'
    : appt.status === 'COMPLETED' ? 'var(--s200)'
    : appt.status === 'CANCELLED' ? '#fca5a5'
    : 'var(--s300)';

  return (
    <>
      {showNowLine && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 2px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px #22c55e' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            EN CURSO — {nowHHMM()}
          </span>
          <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
        </div>
      )}

      <div
        style={{
          display: 'flex', alignItems: 'stretch',
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--s200)',
          marginTop: isFirst && !showNowLine ? 0 : 6,
          background: inProg ? '#f0fdfa' : '#fff',
          transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.07)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        <div style={{ width: 4, background: borderColor, flexShrink: 0 }} />

        <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', minWidth: 52, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)', fontFamily: "'DM Mono', monospace" }}>{start}</span>
          <span style={{ fontSize: 11, color: 'var(--s400)', fontFamily: "'DM Mono', monospace" }}>{end}</span>
        </div>

        <div style={{ flex: 1, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--teal), var(--teal-d))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
          }}>
            {abbr}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 14, fontWeight: 600, color: 'var(--s800)',
                textDecoration: appt.status === 'COMPLETED' ? 'line-through' : 'none',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {name}
              </span>
              {appt.modality === 'VIRTUAL' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6366f1', background: '#eef2ff', padding: '2px 8px', borderRadius: 20, border: '1px solid #c7d2fe', whiteSpace: 'nowrap' }}>
                  <Video size={10} />Virtual
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#0f766e', background: '#f0fdfa', padding: '2px 8px', borderRadius: 20, border: '1px solid #99f6e4', whiteSpace: 'nowrap' }}>
                  <MapPin size={10} />Presencial
                </span>
              )}
            </div>
            {appt.notes ? (
              <div style={{ fontSize: 12, color: 'var(--s500)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {appt.notes}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
            color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
            whiteSpace: 'nowrap',
          }}>
            {meta.label}
          </span>

          {appt.status === 'SCHEDULED' && (
            <button
              onClick={() => navigate(`/patients/${appt.patient_id}`)}
              style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Abrir
            </button>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 2 }}
          >
            <ChevronDown size={15} style={{ transform: expanded ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 2, marginBottom: 4,
          background: 'var(--s50)', borderRadius: '0 0 10px 10px',
          border: '1px solid var(--s200)', borderTop: 'none',
          padding: '12px 14px 12px 74px',
          fontSize: 12, color: 'var(--s600)',
          display: 'flex', gap: 20, flexWrap: 'wrap',
        }}>
          <span><b style={{ color: 'var(--s800)' }}>Duración:</b> {appt.duration_min} min</span>
          <span><b style={{ color: 'var(--s800)' }}>Modalidad:</b> {appt.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial'}</span>
          {appt.location_or_link && (
            <span><b style={{ color: 'var(--s800)' }}>Enlace/Lugar:</b> {appt.location_or_link}</span>
          )}
          {appt.notes && (
            <span><b style={{ color: 'var(--s800)' }}>Notas:</b> {appt.notes}</span>
          )}
          <button
            onClick={() => navigate(`/patients/${appt.patient_id}`)}
            style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Ver historia clínica →
          </button>
        </div>
      )}
    </>
  );
}

// ─── WeekApptChip ─────────────────────────────────────────────────────────────

function WeekApptChip({ appt }: { appt: Appointment }) {
  const navigate = useNavigate();
  const { data: patient } = usePatient(appt.patient_id);
  const inProg = isInProgress(appt);
  const cancelled = appt.status === 'CANCELLED';
  const completed = appt.status === 'COMPLETED';
  const time = fmtTime(appt.scheduled_at);
  const firstName = patient
    ? (patient.first_name || patientFullName(patient)).split(' ')[0]
    : '···';

  const bg     = inProg    ? 'var(--teal)'    : completed ? 'var(--s100)' : cancelled ? '#fee2e2' : 'var(--teal-l)';
  const border = inProg    ? 'var(--teal-d)'  : completed ? 'var(--s300)' : cancelled ? '#fca5a5' : 'var(--teal)';
  const clr    = inProg    ? '#fff'           : completed ? 'var(--s500)' : cancelled ? '#991b1b' : 'var(--teal-d)';
  const sub    = inProg    ? 'rgba(255,255,255,0.80)' : cancelled ? '#b91c1c' : 'var(--s500)';

  return (
    <button
      onClick={e => { e.stopPropagation(); navigate(`/patients/${appt.patient_id}`); }}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: bg,
        borderLeft: `3px solid ${border}`,
        borderRadius: 5, padding: '3px 7px',
        opacity: cancelled ? 0.7 : 1,
        transition: 'opacity 0.12s',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, color: clr, fontFamily: "'DM Mono', monospace" }}>{time}</div>
      <div style={{ fontSize: 11, color: sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstName}</div>
    </button>
  );
}

// ─── WeekView ─────────────────────────────────────────────────────────────────

function WeekView({
  days, appointments, onDayClick, isLoading,
}: {
  days: string[];
  appointments: Appointment[];
  onDayClick: (iso: string) => void;
  isLoading: boolean;
}) {
  const today = todayISO();

  // Group by local date
  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const d of days) map[d] = [];
    for (const a of appointments) {
      const localDate = localDateFromISO(a.scheduled_at);
      if (map[localDate] !== undefined) map[localDate].push(a);
    }
    // Sort each day by time
    for (const d of days) map[d].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    return map;
  }, [days, appointments]);

  const maxAppts = Math.max(...days.map(d => byDay[d]?.length ?? 0), 3);

  return (
    <div>
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner size={24} color="var(--teal)" />
        </div>
      )}

      {!isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
          {days.map((day, idx) => {
            const isToday   = day === today;
            const d         = new Date(day + 'T12:00:00');
            const dayNum    = d.getDate();
            const monthAbbr = MONTH_NAMES[d.getMonth()];
            const appts     = byDay[day] ?? [];
            const hasAppts  = appts.length > 0;

            return (
              <div
                key={day}
                onClick={() => onDayClick(day)}
                style={{
                  background: isToday ? '#f0fdfa' : '#fff',
                  borderRadius: 12,
                  border: `1.5px solid ${isToday ? 'var(--teal)' : 'var(--s200)'}`,
                  cursor: 'pointer',
                  minHeight: Math.max(140, 60 + maxAppts * 44),
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  if (!isToday) (e.currentTarget as HTMLElement).style.borderColor = 'var(--teal)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(20,184,166,0.12)';
                }}
                onMouseLeave={e => {
                  if (!isToday) (e.currentTarget as HTMLElement).style.borderColor = 'var(--s200)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}
              >
                {/* Day header */}
                <div style={{
                  padding: '10px 10px 8px',
                  borderBottom: `1px solid ${isToday ? '#99f6e4' : 'var(--s100)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? 'var(--teal-d)' : 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {DAY_NAMES[idx === 6 ? 0 : idx + 1]}
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    width: 26, height: 26, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isToday ? 'var(--teal)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--s700)',
                  }}>
                    {dayNum}
                  </span>
                </div>

                {/* Month label (when week spans 2 months) */}
                {dayNum === 1 && (
                  <div style={{ padding: '2px 10px 0', fontSize: 10, color: 'var(--teal)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {monthAbbr}
                  </div>
                )}

                {/* Appointment chips */}
                <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {hasAppts ? (
                    appts.map(a => <WeekApptChip key={a.id} appt={a} />)
                  ) : (
                    <div style={{ paddingTop: 14, textAlign: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--s300)' }}>—</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── InboxItem ────────────────────────────────────────────────────────────────

interface InboxItemProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  time: string;
  action?: string;
  actionColor?: string;
  urgent?: boolean;
  onDismiss?: () => void;
}

function InboxItem({ icon: Icon, iconColor, iconBg, title, subtitle, time, action, actionColor = 'var(--teal)', urgent, onDismiss }: InboxItemProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--s100)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={iconColor} />
          </div>
          {urgent && (
            <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '1.5px solid #fff' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--s800)' }}>{title}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--s500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
          <div style={{ fontSize: 10, color: 'var(--s400)', marginTop: 2 }}>{time}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {action && (
            <button style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: actionColor, border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
              {action}
            </button>
          )}
          <button
            onClick={() => { onDismiss?.(); setDismissed(true); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s300)', padding: 0, display: 'flex' }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate]     = useState(todayISO());
  const [filter, setFilter]                 = useState<FilterTab>('all');
  const [viewMode, setViewMode]             = useState<ViewMode>('list');

  const displayName = user?.display_name ?? user?.email ?? 'Usuario';

  // ── Day query ─────────────────────────────────────────────────────────────
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments-day', selectedDate, user?.user_id],
    queryFn: () => appointmentsApi.list({
      staff_id:  user?.user_id,
      date_from: localISO(selectedDate, '00:00'),
      date_to:   localISO(selectedDate, '23:59'),
      limit: 50,
    }),
    enabled: viewMode === 'list' && !!user,
    refetchInterval: 60_000,
  });

  // ── Week query ────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  const { data: weekAppointments = [], isLoading: weekLoading } = useQuery({
    queryKey: ['appointments-week', weekDays[0], user?.user_id],
    queryFn: () => appointmentsApi.list({
      staff_id:  user?.user_id,
      date_from: localISO(weekDays[0], '00:00'),
      date_to:   localISO(weekDays[6], '23:59'),
      limit: 100,
    }),
    enabled: viewMode === 'week' && !!user,
    refetchInterval: 60_000,
  });

  // Sort by scheduled_at
  const sorted = useMemo(() =>
    [...appointments].sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ), [appointments]
  );

  const filtered = useMemo(() => filterAppts(sorted, filter), [sorted, filter]);

  // Stats
  const completedCount = sorted.filter(a => a.status === 'COMPLETED').length;
  const inProgressAppt = sorted.find(a => isInProgress(a));
  const isToday        = selectedDate === todayISO();

  // EN CURSO marker index
  const nowMs = Date.now();
  const nowLineAfterIndex = useMemo(() => {
    if (!isToday) return -1;
    for (let i = filtered.length - 1; i >= 0; i--) {
      const start = new Date(filtered[i].scheduled_at).getTime();
      if (start <= nowMs) return i;
    }
    return -1;
  }, [filtered, nowMs, isToday]);

  // Navigation step: 7 days in week mode, 1 in list mode
  const navStep = viewMode === 'week' ? 7 : 1;

  // When clicking a day in week view → switch to list for that day
  function handleDayClick(iso: string) {
    setSelectedDate(iso);
    setViewMode('list');
  }

  return (
    <div style={{
      display: viewMode === 'week' ? 'block' : 'grid',
      gridTemplateColumns: '1fr 260px',
      height: 'calc(100vh - var(--topbar-h))',
      overflow: 'hidden',
    }}>
      {/* ── Week mode: full-width layout ───────────────────────────────────── */}
      {viewMode === 'week' && (
        <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--s800)', margin: '0 0 4px' }}>
                {greeting(displayName)}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--s500)', margin: 0 }}>
                {weekRangeLabel(weekDays)} · {weekAppointments.filter(a => a.status !== 'CANCELLED').length} citas esta semana
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* View switcher */}
              <ViewSwitcher mode={viewMode} onChange={setViewMode} />

              {/* Week nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setSelectedDate(d => shiftDate(d, -7))} style={navBtn}>
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setSelectedDate(todayISO())}
                  style={{
                    padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px solid var(--s200)',
                    background: weekDays.includes(todayISO()) ? 'var(--teal)' : '#fff',
                    color: weekDays.includes(todayISO()) ? '#fff' : 'var(--s800)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Esta semana
                </button>
                <button onClick={() => setSelectedDate(d => shiftDate(d, 7))} style={navBtn}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Week grid */}
          <WeekView
            days={weekDays}
            appointments={weekAppointments}
            onDayClick={handleDayClick}
            isLoading={weekLoading}
          />
        </div>
      )}

      {/* ── List mode: 2-col layout ────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          {/* Left column */}
          <div style={{ overflowY: 'auto', padding: '28px 32px' }}>

            {/* Greeting + date nav */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--s800)', margin: '0 0 4px' }}>
                  {greeting(displayName)}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--s500)', margin: 0, textTransform: 'capitalize' }}>
                  {fmtShortDate(selectedDate)} · {sorted.filter(a => a.status !== 'CANCELLED').length} citas agendadas
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ViewSwitcher mode={viewMode} onChange={setViewMode} />

                <button onClick={() => setSelectedDate(d => shiftDate(d, -navStep))} style={navBtn}>
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setSelectedDate(todayISO())}
                  style={{
                    padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px solid var(--s200)',
                    background: selectedDate === todayISO() ? 'var(--teal)' : '#fff',
                    color: selectedDate === todayISO() ? '#fff' : 'var(--s800)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {navDateLabel(selectedDate)}
                </button>
                <button onClick={() => setSelectedDate(d => shiftDate(d, navStep))} style={navBtn}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
              <StatCard
                icon={CalendarDays}
                iconColor="#0ea5e9"
                badge={isToday && completedCount > 0 ? `${completedCount} completadas` : undefined}
                badgeColor="#0ea5e9"
                value={sorted.filter(a => a.status !== 'CANCELLED').length}
                label="Citas de hoy"
              />
              <StatCard icon={Users} iconColor="#8b5cf6" badge="+3 este mes" badgeColor="#8b5cf6" value="—" label="Pacientes activos" />
              <StatCard icon={Sparkles} iconColor="#f59e0b" badge="Pendientes de revisión" badgeColor="#f59e0b" value="—" label="Borradores IA" />
              <StatCard icon={Receipt} iconColor="#10b981" badge="— cobrado" badgeColor="#10b981" value="—" label="Facturación del mes" />
            </div>

            {/* Agenda del día */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CalendarDays size={16} color="var(--teal)" />
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>Agenda del día</h2>
                  {inProgressAppt && isToday && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 20, border: '1px solid #6ee7b7' }}>
                      EN CURSO
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  {FILTER_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setFilter(tab.key)}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                        border: filter === tab.key ? 'none' : '1px solid var(--s200)',
                        background: filter === tab.key ? 'var(--teal)' : 'transparent',
                        color: filter === tab.key ? '#fff' : 'var(--s600)',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                  <Spinner size={24} color="var(--teal)" />
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--s400)' }}>
                  <CalendarDays size={44} color="var(--s200)" style={{ marginBottom: 12 }} />
                  <p style={{ margin: 0, fontSize: 14 }}>Sin citas para este filtro</p>
                  <Link to="/appointments/new" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>
                    + Agendar nueva cita
                  </Link>
                </div>
              ) : (
                <div>
                  {filtered.map((appt, idx) => {
                    const showNowLine = isToday && idx === nowLineAfterIndex + 1 && idx > 0;
                    return (
                      <AppointmentRow
                        key={appt.id}
                        appt={appt}
                        isFirst={idx === 0}
                        showNowLine={showNowLine}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Inbox + Acciones rápidas */}
          <div style={{
            borderLeft: '1px solid var(--s200)',
            overflowY: 'auto',
            padding: '28px 18px',
            display: 'flex', flexDirection: 'column', gap: 24,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Brain size={15} color="var(--teal)" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>Inbox Clínico</span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#ef4444', padding: '1px 7px', borderRadius: 20 }}>
                  3 urgentes
                </span>
              </div>

              <div>
                <InboxItem icon={Sparkles} iconColor="#f59e0b" iconBg="#fef3c7" title="Borrador IA listo" subtitle="Ana Ríos · Sesión #1" time="Hace 1h" action="Revisar" actionColor="#f59e0b" urgent />
                <InboxItem icon={Sparkles} iconColor="#f59e0b" iconBg="#fef3c7" title="Borrador IA listo" subtitle="Carlos Mendoza · Sesión #8" time="Hace 3h" action="Revisar" actionColor="#f59e0b" urgent />
                <InboxItem icon={FileText} iconColor="var(--teal)" iconBg="var(--teal-l)" title="Consentimiento pendiente" subtitle="Rodrigo Parra — subir firmado" time="Ayer" action="Subir" actionColor="var(--teal)" />
                <InboxItem icon={FileText} iconColor="var(--teal)" iconBg="var(--teal-l)" title="Consentimiento pendiente" subtitle="Isabella Cruz — subir firmado" time="Hace 2d" action="Subir" actionColor="var(--teal)" />
                <InboxItem icon={AlertTriangle} iconColor="#ef4444" iconBg="#fee2e2" title="Pago vencido" subtitle="Factura #092 · Miguel Torres" time="Vence hoy" action="Cobrar" actionColor="#ef4444" urgent />
                <InboxItem icon={Bell} iconColor="var(--s500)" iconBg="var(--s100)" title="Recordatorio enviado" subtitle="Sofía Campos — cita 15:30" time="Hace 30min" />
              </div>

              <button style={{ marginTop: 8, fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                Ver todo el historial →
              </button>
            </div>

            {/* Acciones rápidas */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Sparkles size={13} color="var(--s500)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>Acciones rápidas</span>
              </div>

              {[
                { icon: UserPlus,      label: 'Nuevo paciente',     to: '/patients/new' },
                { icon: ClipboardList, label: 'Nueva evaluación',   to: '/evaluations'  },
                { icon: Receipt,       label: 'Generar factura',     to: '/billing'      },
                { icon: BellOff,       label: 'Enviar recordatorio', to: '/'             },
              ].map(({ icon: Icon, label, to }) => (
                <button
                  key={label}
                  onClick={() => navigate(to)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 12px',
                    border: '1px solid var(--s200)', borderRadius: 9,
                    background: '#fff', cursor: 'pointer', marginBottom: 6,
                    fontSize: 13, color: 'var(--s700)', fontWeight: 500,
                    textAlign: 'left', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--teal-l)'; e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal-d)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'var(--s200)'; e.currentTarget.style.color = 'var(--s700)'; }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} color="var(--s500)" />
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ViewSwitcher ─────────────────────────────────────────────────────────────

function ViewSwitcher({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--s200)', borderRadius: 8, overflow: 'hidden', background: 'var(--s50)' }}>
      {([
        { key: 'list' as ViewMode, icon: LayoutList,   title: 'Lista' },
        { key: 'week' as ViewMode, icon: CalendarRange, title: 'Semana' },
      ] as const).map(({ key, icon: Icon, title }) => (
        <button
          key={key}
          title={title}
          onClick={() => onChange(key)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', border: 'none', cursor: 'pointer',
            background: mode === key ? 'var(--teal)' : 'transparent',
            color: mode === key ? '#fff' : 'var(--s500)',
            fontSize: 12, fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          <Icon size={14} />
          {title}
        </button>
      ))}
    </div>
  );
}

// ─── NavBtn style ─────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  border: '1px solid var(--s200)', background: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--s600)',
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, iconColor, badge, badgeColor, value, label }: {
  icon: React.ElementType;
  iconColor: string;
  badge?: string;
  badgeColor?: string;
  value: string | number;
  label: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '1px solid var(--s200)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: iconColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={iconColor} />
        </div>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 600, color: badgeColor, background: (badgeColor ?? '#000') + '15', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--s800)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--s500)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

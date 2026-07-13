import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Video, MapPin,
  Brain, UserPlus, CalendarDays, Sparkles,
  ChevronDown, AlertTriangle, LayoutList, CalendarRange,
} from 'lucide-react';

import { appointmentsApi, type Appointment } from '@/api/appointments';
import { patientsApi, type Patient } from '@/api/patients';
import { clinicalRecordsApi } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';
import { useIsCompact } from '@/lib/useMediaQuery';
import { AgendaCalendar } from './AgendaCalendar';
import { PendingNotesCard } from './PendingNotesCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'upcoming' | 'confirmed' | 'pending' | 'completed';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'Todas'       },
  { key: 'upcoming',  label: 'Próxima'     },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'pending',   label: 'Pendientes'  },
  { key: 'completed', label: 'Completadas' },
];


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
  return { label: 'Confirmada', color: '#2a2769', bg: '#f3f2fb', border: '#cbc7ee' };
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
    enabled: !!id, // guest reservations have no patient yet
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
  const name   = patient ? patientFullName(patient) : appt.guest_name || `Paciente #${appt.patient_id.slice(-4)}`;
  const abbr   = patient ? initials(patientFullName(patient)) : appt.guest_name ? initials(appt.guest_name) : '??';
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
          background: inProg ? '#f3f2fb' : '#fff',
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
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#5b52ad', background: '#f3f2fb', padding: '2px 8px', borderRadius: 20, border: '1px solid #cbc7ee', whiteSpace: 'nowrap' }}>
                  <Video size={10} />Virtual
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#2a2769', background: '#f3f2fb', padding: '2px 8px', borderRadius: 20, border: '1px solid #cbc7ee', whiteSpace: 'nowrap' }}>
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

          {(appt.status === 'SCHEDULED' || appt.status === 'IN_PROGRESS') && (
            <button
              onClick={() => navigate(`/appointments/${appt.id}`)}
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
          {appt.patient_id && (
            <button
              onClick={() => navigate(`/patients/${appt.patient_id}`)}
              style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Ver historia clínica →
            </button>
          )}
        </div>
      )}
    </>
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
  onAction?: () => void;
}

function InboxItem({ icon: Icon, iconColor, iconBg, title, subtitle, time, action, actionColor = 'var(--teal)', urgent, onAction }: InboxItemProps) {
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

        {action && (
          <button
            onClick={onAction}
            style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: actionColor, border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}
          >
            {action}
          </button>
        )}
      </div>
    </div>
  );
}

function AppointmentInboxItem({ appt, onOpen, variant = 'unfinished' }: {
  appt: Appointment;
  onOpen: () => void;
  variant?: 'unfinished' | 'pending-note';
}) {
  const { data: patient } = usePatient(appt.patient_id);
  const name = patient ? patientFullName(patient) : appt.guest_name || `Paciente #${appt.patient_id.slice(-4)}`;
  const isNote = variant === 'pending-note';

  return (
    <InboxItem
      icon={isNote ? Brain : AlertTriangle}
      iconColor={isNote ? 'var(--teal)' : '#f59e0b'}
      iconBg={isNote ? 'var(--teal-l)' : '#fef3c7'}
      title={isNote ? 'Nota de sesión pendiente' : 'Cita sin completar'}
      subtitle={`${name} · ${fmtTime(appt.scheduled_at)}`}
      time="Hoy"
      action={isNote ? 'Registrar' : 'Abrir'}
      actionColor={isNote ? 'var(--teal)' : '#f59e0b'}
      onAction={onOpen}
    />
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mainTab, setMainTab]           = useState<'agenda' | 'calendario'>(
    () => (localStorage.getItem('sghcp_agenda_tab') as 'agenda' | 'calendario') || 'agenda'
  );
  const changeTab = (t: 'agenda' | 'calendario') => { setMainTab(t); localStorage.setItem('sghcp_agenda_tab', t); };
  // Survives navigating into an appointment and back (per-tab, resets on close).
  const [selectedDate, setSelectedDateRaw] = useState(() => sessionStorage.getItem('sghcp_agenda_date') || todayISO());
  const setSelectedDate = (v: string | ((prev: string) => string)) => {
    setSelectedDateRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      sessionStorage.setItem('sghcp_agenda_date', next);
      return next;
    });
  };
  const [filter, setFilter]             = useState<FilterTab>('all');

  const compact = useIsCompact();
  const displayName = user?.display_name || user?.email?.split('@')[0] || user?.email || '';

  // ── Day query ─────────────────────────────────────────────────────────────
  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments-day', selectedDate, user?.user_id],
    queryFn: () => appointmentsApi.list({
      date_from: localISO(selectedDate, '00:00'),
      date_to:   localISO(selectedDate, '23:59'),
      limit: 50,
    }),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // ── Today query (inbox + stat tile) — same key as the day query when
  // selectedDate is today, so react-query deduplicates them ────────────────
  const today = todayISO();
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ['appointments-day', today, user?.user_id],
    queryFn: () => appointmentsApi.list({
      date_from: localISO(today, '00:00'),
      date_to:   localISO(today, '23:59'),
      limit: 50,
    }),
    enabled: !!user,
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
  const completedToday  = todayAppointments.filter(a => a.status === 'COMPLETED').length;
  const inProgressAppt  = sorted.find(a => isInProgress(a));
  const isToday         = selectedDate === today;

  // Inbox: today's appointments already past their slot but still SCHEDULED
  const unfinishedToday = useMemo(() =>
    todayAppointments
      .filter(a => a.status === 'SCHEDULED' && isPast(a))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [todayAppointments]
  );
  // Completed sessions still waiting for their clinical note (grace window):
  // surfaced here so finishing on time and attending the next patient is safe.
  const completedApptsToday = useMemo(
    () => todayAppointments.filter(a => a.status === 'COMPLETED' && a.patient_id),
    [todayAppointments]
  );
  const recordQueries = useQueries({
    queries: [...new Set(completedApptsToday.map(a => a.patient_id))].map(pid => ({
      queryKey: ['clinical-records', 'patient', pid],
      queryFn: () => clinicalRecordsApi.list(pid),
      staleTime: 60_000,
    })),
  });
  const recordsReady = recordQueries.every(q => q.isSuccess);
  // finalized !== false: an unfinalized autosave draft must NOT count as "the
  // note is done" — that's exactly the reminder this inbox exists to give.
  const notedApptIds = new Set(
    recordQueries.flatMap(q => (q.data?.items ?? []).filter(r => r.finalized !== false).map(r => r.appointment_id)),
  );
  const pendingNotes = recordsReady ? completedApptsToday.filter(a => !notedApptIds.has(a.id)) : [];

  const inboxCount = unfinishedToday.length + pendingNotes.length;

  // EN CURSO marker index — the clock lives in state (updated each minute)
  // so render stays pure and the marker still advances on an idle dashboard.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nowLineAfterIndex = useMemo(() => {
    if (!isToday) return -1;
    for (let i = filtered.length - 1; i >= 0; i--) {
      const start = new Date(filtered[i].scheduled_at).getTime();
      if (start <= nowMs) return i;
    }
    return -1;
  }, [filtered, nowMs, isToday]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...(compact ? { minHeight: 'calc(100dvh - var(--topbar-h))' } : { height: 'calc(100dvh - var(--topbar-h))', overflow: 'hidden' }) }}>

      {/* ── Sub-tab bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0,
        borderBottom: '1px solid var(--s200)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 4,
        background: '#fff',
      }}>
        {([
          { key: 'agenda'     as const, icon: LayoutList,   label: 'Agenda del día' },
          { key: 'calendario' as const, icon: CalendarRange, label: 'Calendario'     },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => changeTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', border: 'none', cursor: 'pointer',
              borderRadius: 8, fontSize: 13, fontWeight: mainTab === key ? 700 : 500,
              background: mainTab === key ? 'var(--teal-l)' : 'transparent',
              color: mainTab === key ? 'var(--teal-d)' : 'var(--s500)',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { if (mainTab !== key) e.currentTarget.style.background = 'var(--s100)'; }}
            onMouseLeave={e => { if (mainTab !== key) e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon size={14} color={mainTab === key ? 'var(--teal)' : 'var(--s400)'} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Calendario tab ──────────────────────────────────────────────────── */}
      {mainTab === 'calendario' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AgendaCalendar initialDate={selectedDate} />
        </div>
      )}

      {/* ── Agenda tab ──────────────────────────────────────────────────────── */}
      {mainTab === 'agenda' && (
        // minmax(0,…) — a bare 1fr track grows to its content's min-width and drags the whole page into horizontal scroll on phones
        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 260px', flex: 1, overflow: compact ? 'visible' : 'hidden' }}>
          {/* Left column */}
          <div style={{ overflowY: compact ? 'visible' : 'auto', padding: compact ? '20px 16px' : '28px 32px' }}>

            {/* Greeting + date nav */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--s800)', margin: '0 0 4px' }}>
                  {greeting(displayName)}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--s500)', margin: 0, textTransform: 'capitalize' }}>
                  {fmtShortDate(selectedDate)} · {sorted.filter(a => a.status !== 'CANCELLED').length} citas agendadas
                  {isToday && completedToday > 0 ? ` · ${completedToday} completada${completedToday !== 1 ? 's' : ''}` : ''}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setSelectedDate(d => shiftDate(d, -1))} style={navBtn}>
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
                <button onClick={() => setSelectedDate(d => shiftDate(d, 1))} style={navBtn}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Sesiones completadas que aún no tienen nota — no olvidar cerrarlas */}
            <PendingNotesCard />

            {/* Agenda del día */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CalendarDays size={16} color="var(--teal)" />
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>Agenda del día</h2>
                  {inProgressAppt && isToday && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 20, border: '1px solid #6ee7b7' }}>
                      EN CURSO
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                  <Link to={`/appointments/new?date=${selectedDate}`} style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--teal)', fontWeight: 600 }}>
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
            borderLeft: compact ? 'none' : '1px solid var(--s200)',
            borderTop: compact ? '1px solid var(--s200)' : 'none',
            overflowY: compact ? 'visible' : 'auto',
            padding: compact ? '20px 16px' : '28px 18px',
            display: 'flex', flexDirection: 'column', gap: 24,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Brain size={15} color="var(--teal)" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>Inbox Clínico</span>
                </div>
                {inboxCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#ef4444', padding: '1px 7px', borderRadius: 20 }}>
                    {inboxCount} pendiente{inboxCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {inboxCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--s400)' }}>
                  <p style={{ margin: 0, fontSize: 13 }}>Sin pendientes 🎉</p>
                </div>
              ) : (
                <div>
                  {unfinishedToday.map(a => (
                    <AppointmentInboxItem
                      key={a.id}
                      appt={a}
                      onOpen={() => navigate(`/appointments/${a.id}`)}
                    />
                  ))}
                  {pendingNotes.map(a => (
                    <AppointmentInboxItem
                      key={`note-${a.id}`}
                      appt={a}
                      variant="pending-note"
                      onOpen={() => navigate(`/appointments/${a.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Acciones rápidas */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Sparkles size={13} color="var(--s500)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s700)' }}>Acciones rápidas</span>
              </div>

              {[
                { icon: UserPlus,     label: 'Nuevo paciente', to: '/patients/new'     },
                { icon: CalendarDays, label: 'Nueva cita',     to: '/appointments/new' },
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
        </div>
      )}
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


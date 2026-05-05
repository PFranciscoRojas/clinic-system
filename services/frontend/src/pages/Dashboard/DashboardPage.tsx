import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, User,
  Plus, Video, Stethoscope, TrendingUp, Users, FileText,
  AlertTriangle, Brain,
} from 'lucide-react';
import { appointmentsApi, type Appointment } from '@/api/appointments';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/context/AuthContext';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    SCHEDULED:  { label: 'Programada',  color: '#0369a1', bg: '#e0f2fe' },
    IN_PROGRESS:{ label: 'En curso',    color: '#065f46', bg: '#d1fae5' },
    COMPLETED:  { label: 'Completada',  color: '#374151', bg: '#f3f4f6' },
    CANCELLED:  { label: 'Cancelada',   color: '#991b1b', bg: '#fee2e2' },
    NO_SHOW:    { label: 'No asistió',  color: '#92400e', bg: '#fef3c7' },
  };
  const s = map[status] ?? { label: status, color: 'var(--s600)', bg: 'var(--s100)' };
  return <Badge label={s.label} color={s.color} bg={s.bg} size="sm" />;
}

function modalityIcon(m: string) {
  if (m === 'VIDEO_CALL') return <Video size={13} color="var(--s400)" />;
  return <Stethoscope size={13} color="var(--s400)" />;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [calDate, setCalDate] = useState(new Date());

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments', selectedDate],
    queryFn: () => appointmentsApi.list({
      date_from: selectedDate + 'T00:00:00Z',
      date_to:   selectedDate + 'T23:59:59Z',
      limit: 50,
    }),
  });

  const calDays = buildCalDays(calDate);
  const today = todayStr();

  const stats = [
    { label: 'Citas hoy',       value: appointments?.length ?? 0,       Icon: CalendarDays, color: 'var(--teal)' },
    { label: 'Pacientes activos', value: '—',                             Icon: Users,        color: '#6366f1'     },
    { label: 'Borradores IA',   value: '—',                             Icon: Brain,        color: '#f59e0b'     },
    { label: 'Completadas/sem', value: '—',                             Icon: TrendingUp,   color: '#10b981'     },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
      {/* Left column */}
      <div>
        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--s800)', margin: '0 0 4px' }}>
            {greeting()}, {firstName(user?.display_name ?? user?.email ?? '')}
          </h1>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: 0 }}>
            {formatDate(selectedDate)} · {appointments?.length ?? 0} citas programadas
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {stats.map(({ label, value, Icon, color }) => (
            <div key={label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--s400)', fontWeight: 500 }}>{label}</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={color} />
                </div>
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Agenda del día */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>Agenda del día</h2>
            <button
              onClick={() => navigate('/appointments/new')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Nueva cita
            </button>
          </div>

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner size={24} color="var(--teal)" />
            </div>
          ) : appointments?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--s400)' }}>
              <CalendarDays size={40} color="var(--s200)" style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 14 }}>Sin citas para este día</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {appointments?.map(appt => (
                <AppointmentRow key={appt.id} appt={appt} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right column — mini calendar + inbox */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Mini calendar */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={() => setCalDate(d => prevMonth(d))} style={calNavBtn}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--s700)' }}>
              {MONTHS[calDate.getMonth()]} {calDate.getFullYear()}
            </span>
            <button onClick={() => setCalDate(d => nextMonth(d))} style={calNavBtn}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', gap: 2 }}>
            {DAYS.map(d => (
              <div key={d} style={{ fontSize: 11, fontWeight: 600, color: 'var(--s400)', padding: '4px 0' }}>{d}</div>
            ))}
            {calDays.map((day, i) => {
              const str = day ? dateStr(calDate, day) : '';
              const isToday = str === today;
              const isSelected = str === selectedDate;
              return (
                <button
                  key={i}
                  disabled={!day}
                  onClick={() => day && setSelectedDate(str)}
                  style={{
                    padding: '6px 0', borderRadius: 8, border: 'none', cursor: day ? 'pointer' : 'default',
                    fontSize: 12, fontWeight: isToday || isSelected ? 700 : 400,
                    background: isSelected ? 'var(--teal)' : isToday ? 'var(--teal-10)' : 'transparent',
                    color: isSelected ? '#fff' : isToday ? 'var(--teal)' : day ? 'var(--s700)' : 'transparent',
                    transition: 'all .1s',
                  }}
                >
                  {day ?? ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clinical inbox */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)', margin: '0 0 16px' }}>
            Inbox clínico
          </h3>
          <InboxItem
            Icon={Brain}
            iconColor="#f59e0b"
            iconBg="#fef3c7"
            title="Borrador IA listo"
            subtitle="Sesión con paciente del martes"
            action="Revisar"
          />
          <InboxItem
            Icon={FileText}
            iconColor="var(--teal)"
            iconBg="var(--teal-10)"
            title="Historia pendiente de firma"
            subtitle="Sesión de ayer · co-firma requerida"
            action="Firmar"
          />
          <InboxItem
            Icon={AlertTriangle}
            iconColor="#ef4444"
            iconBg="#fee2e2"
            title="Alerta de riesgo detectada"
            subtitle="Indicadores en última sesión"
            action="Ver"
          />
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({ appt }: { appt: Appointment }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/patients/${appt.patient_id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
        borderRadius: 12, border: '1.5px solid var(--s100)', cursor: 'pointer',
        transition: 'all .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal)', e.currentTarget.style.background = 'var(--teal-10)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--s100)', e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <User size={18} color="var(--s400)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>
          Paciente #{appt.patient_id.slice(-6)}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Clock size={11} color="var(--s400)" />
          <span style={{ fontSize: 12, color: 'var(--s400)' }}>
            {fmtTime(appt.scheduled_at)} · {appt.duration_min} min
          </span>
          {modalityIcon(appt.modality)}
        </div>
      </div>
      {statusBadge(appt.status)}
    </div>
  );
}

function InboxItem({ Icon, iconColor, iconBg, title, subtitle, action }: {
  Icon: React.ElementType; iconColor: string; iconBg: string;
  title: string; subtitle: string; action: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--s100)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>{title}</p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>{subtitle}</p>
      </div>
      <button style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {action}
      </button>
    </div>
  );
}

const calNavBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--s500)', display: 'flex', alignItems: 'center',
  borderRadius: 6, padding: 4,
};

function buildCalDays(d: Date): (number | null)[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  const days  = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = Array(first).fill(null);
  for (let i = 1; i <= days; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dateStr(base: Date, day: number) {
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prevMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() - 1, 1); }
function nextMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName(name: string) {
  return name.split(/[\s@]/)[0];
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, User, Phone, Mail, Calendar, FileText,
  Brain, Plus, Clock, ChevronRight, AlertCircle,
  CreditCard, MapPin, Video, Upload,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { appointmentsApi, type Appointment } from '@/api/appointments';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'historia' | 'citas' | 'borradores' | 'documentos';

type AppointmentStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stringToColor(s = ''): string {
  const palette = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#ef4444', '#14b8a6'];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function calcAge(iso: string): number {
  const b = new Date(iso + 'T12:00:00');
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function fmtBirthDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; color: string; bg: string; border: string }> = {
  SCHEDULED:   { label: 'Confirmada',  color: '#0f766e', bg: '#f0fdfa', border: 'var(--teal)'   },
  IN_PROGRESS: { label: 'En curso',    color: '#065f46', bg: '#d1fae5', border: '#059669'        },
  COMPLETED:   { label: 'Completada',  color: '#374151', bg: '#f3f4f6', border: 'var(--s300)'    },
  CANCELLED:   { label: 'Cancelada',   color: '#991b1b', bg: '#fee2e2', border: '#f87171'        },
  NO_SHOW:     { label: 'No asistió',  color: '#92400e', bg: '#fef3c7', border: '#fbbf24'        },
};

function apptBorderColor(status: AppointmentStatus): string {
  if (status === 'COMPLETED') return 'var(--teal)';
  if (status === 'SCHEDULED' || status === 'IN_PROGRESS') return '#6366f1';
  return 'var(--s200)';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--s500)', background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 10px' }}>
      {icon}
      {text}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--s50)',
      border: '1px solid var(--s100)',
      borderRadius: 10,
      padding: '12px 16px',
      minWidth: 0,
    }}>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--s800)' }}>
        {value}
      </p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', fontWeight: 500 }}>
        {value}
      </p>
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function HistoryTab({ patient }: { patient: Patient }) {
  return (
    <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 28 }}>
      {/* Datos personales */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 20px' }}>
        Datos personales
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px 24px', marginBottom: 32 }}>
        <InfoField label="Tipo de documento"    value={patient.document_type_code} />
        <InfoField label="Número de documento"  value={patient.document_number} />
        <InfoField label="Fecha de nacimiento"  value={patient.birth_date ? fmtBirthDate(patient.birth_date) : '—'} />
        <InfoField label="Edad"                 value={patient.birth_date ? `${calcAge(patient.birth_date)} años` : '—'} />
        <InfoField label="Género"               value={patient.gender ?? '—'} />
        <InfoField label="Teléfono"             value={patient.phone ?? '—'} />
        <InfoField label="Correo electrónico"   value={patient.email ?? '—'} />
        <InfoField label="Dirección"            value={patient.address ?? '—'} />
        <InfoField label="Estado"               value={patient.is_active ? 'Activo' : 'Inactivo'} />
      </div>

      {/* Notas clínicas */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)', margin: '0 0 12px' }}>
        Notas clínicas
      </h3>
      <div style={{
        background: 'var(--s50)',
        borderRadius: 10,
        padding: 14,
        minHeight: 80,
        fontSize: 13,
        color: 'var(--s600)',
        fontStyle: 'italic',
        lineHeight: 1.6,
      }}>
        Sin notas registradas
      </div>
    </div>
  );
}

function AppointmentsTab({
  appointments,
  navigate,
  patientId,
}: {
  appointments: Appointment[];
  navigate: (path: string) => void;
  patientId: string;
}) {
  if (appointments.length === 0) {
    return (
      <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 56, textAlign: 'center' }}>
        <Calendar size={44} color="var(--s200)" style={{ marginBottom: 14 }} />
        <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--s500)' }}>Sin citas registradas</p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--s400)' }}>Agenda la primera cita para este paciente.</p>
        <button
          onClick={() => navigate(`/appointments/new?patient_id=${patientId}`)}
          style={{ padding: '9px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Agendar primera cita
        </button>
      </div>
    );
  }

  return (
    <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {appointments.map((appt, idx) => {
        const status = appt.status as AppointmentStatus;
        const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.SCHEDULED;
        const isVirtual = appt.modality === 'VIRTUAL';

        return (
          <div
            key={appt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 20px',
              borderBottom: idx < appointments.length - 1 ? '1px solid var(--s100)' : 'none',
              borderLeft: `4px solid ${apptBorderColor(status)}`,
            }}
          >
            {/* Date column */}
            <div style={{ minWidth: 100, flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--s800)' }}>{fmtDate(appt.scheduled_at)}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--s400)' }}>{fmtTime(appt.scheduled_at)}</p>
            </div>

            {/* Info */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {/* Modality badge */}
              <span style={{
                fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 9px',
                background: isVirtual ? '#eef2ff' : '#f0fdfa',
                color: isVirtual ? '#6366f1' : 'var(--teal)',
                border: `1px solid ${isVirtual ? '#c7d2fe' : '#99f6e4'}`,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {isVirtual ? <Video size={10} /> : <MapPin size={10} />}
                {isVirtual ? 'Virtual' : 'Presencial'}
              </span>

              {/* Duration chip */}
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--s400)', background: 'var(--s50)', border: '1px solid var(--s100)', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} /> {appt.duration_min} min
              </span>

              {/* Notes snippet */}
              {appt.notes && (
                <span style={{ fontSize: 12, color: 'var(--s400)', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {appt.notes}
                </span>
              )}
            </div>

            {/* Status badge */}
            <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} size="sm" />

            <ChevronRight size={14} color="var(--s300)" style={{ flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );
}

function DraftsTab() {
  return (
    <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 56, textAlign: 'center' }}>
      <Brain size={44} color="var(--s200)" style={{ marginBottom: 14 }} />
      <p style={{ margin: 0, fontSize: 14, color: 'var(--s400)' }}>Sin borradores de IA generados</p>
    </div>
  );
}

function DocsTab() {
  return (
    <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 56, textAlign: 'center' }}>
      <FileText size={44} color="var(--s200)" style={{ marginBottom: 14 }} />
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--s400)' }}>Sin documentos adjuntos</p>
      <button
        onClick={() => {}}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'transparent', color: 'var(--s600)', border: '1px solid var(--s200)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
      >
        <Upload size={13} /> Subir documento
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('historia');

  // Patient query
  const { data: patient, isLoading: patLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  // Appointments always-enabled (needed for quick stats)
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', 'patient', id],
    queryFn: () => appointmentsApi.list({ patient_id: id!, limit: 50 }),
    enabled: !!id,
  });

  // ── Loading / error states ──────────────────────────────────────────────────

  if (patLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
        <Spinner size={28} color="var(--teal)" />
      </div>
    );
  }

  if (isError || !patient) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24, fontSize: 14 }}>
        <AlertCircle size={16} /> Paciente no encontrado
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const displayName = [patient.first_name, patient.middle_name, patient.paternal_last_name, patient.maternal_last_name]
    .filter(Boolean).join(' ');

  const initials = (
    (patient.first_name?.[0] ?? '') + (patient.paternal_last_name?.[0] ?? '')
  ).toUpperCase();

  const avatarColor = stringToColor(patient.paternal_last_name);

  // Quick-stats derived from appointments
  const totalAppts = appointments.length;
  const completedAppts = appointments.filter(a => a.status === 'COMPLETED').length;

  const now = new Date();
  const upcoming = appointments
    .filter(a => a.status === 'SCHEDULED' && new Date(a.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const lastCompleted = appointments
    .filter(a => a.status === 'COMPLETED')
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  const nextApptLabel = upcoming[0] ? fmtShortDate(upcoming[0].scheduled_at) : 'Sin citas';
  const lastSessionLabel = lastCompleted[0] ? fmtShortDate(lastCompleted[0].scheduled_at) : '—';

  // Tab definitions
  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'historia',   label: 'Historia clínica', Icon: FileText  },
    { id: 'citas',      label: 'Citas',            Icon: Calendar  },
    { id: 'borradores', label: 'Borradores IA',    Icon: Brain     },
    { id: 'documentos', label: 'Documentos',       Icon: FileText  },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px' }}>

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver a pacientes
      </button>

      {/* ── Hero Header Card ──────────────────────────────────────────────── */}
      <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 20, background: '#fff' }}>

        {/* Gradient banner */}
        <div style={{ height: 100, background: 'linear-gradient(135deg, var(--teal-d), #6366f1)' }} />

        {/* Content below banner */}
        <div style={{ padding: '0 28px 24px' }}>

          {/* Avatar (overlapping banner) */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: avatarColor,
            border: '4px solid #fff',
            marginTop: -36,
            marginLeft: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700, color: '#fff',
            letterSpacing: 1,
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            {initials || <User size={28} color="#fff" />}
          </div>

          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--s800)' }}>{displayName}</h1>
            <Badge
              label={patient.is_active ? 'Activo' : 'Inactivo'}
              color={patient.is_active ? '#065f46' : 'var(--s500)'}
              bg={patient.is_active ? '#d1fae5' : 'var(--s100)'}
            />
          </div>

          {/* Info chips row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <InfoChip
              icon={<CreditCard size={12} />}
              text={`${patient.document_type_code} ${patient.document_number}`}
            />
            {patient.birth_date && (
              <InfoChip icon={<Calendar size={12} />} text={`${calcAge(patient.birth_date)} años`} />
            )}
            {patient.gender && (
              <InfoChip icon={<User size={12} />} text={patient.gender} />
            )}
            {patient.email && (
              <InfoChip icon={<Mail size={12} />} text={patient.email} />
            )}
            {patient.phone && (
              <InfoChip icon={<Phone size={12} />} text={patient.phone} />
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => navigate(`/appointments/new?patient_id=${patient.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={14} /> Agendar cita
            </button>
            <button
              onClick={() => navigate(`/patients/${patient.id}/edit`)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'transparent', color: 'var(--s700)', border: '1px solid var(--s200)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Editar datos
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Stats Row ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard label="Citas totales"  value={String(totalAppts)} />
        <StatCard label="Completadas"    value={String(completedAppts)} />
        <StatCard label="Próxima cita"   value={nextApptLabel} />
        <StatCard label="Última sesión"  value={lastSessionLabel} />
      </div>

      {/* ── Pill Tab Bar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--s100)', borderRadius: 12, padding: 4 }}>
        {TABS.map(({ id: tabId, label, Icon }) => {
          const isActive = tab === tabId;
          const showBadge = tabId === 'citas' && totalAppts > 0;
          return (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                background: isActive ? '#fff' : 'transparent',
                color: isActive ? 'var(--s800)' : 'var(--s400)',
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all .15s',
              }}
            >
              <Icon size={14} />
              {label}
              {showBadge && (
                <span style={{ marginLeft: 2, fontSize: 10, fontWeight: 700, background: 'var(--teal)', color: '#fff', borderRadius: 10, padding: '1px 6px', lineHeight: 1.4 }}>
                  {totalAppts}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      {tab === 'historia'   && <HistoryTab patient={patient} />}
      {tab === 'citas'      && <AppointmentsTab appointments={appointments} navigate={navigate} patientId={id!} />}
      {tab === 'borradores' && <DraftsTab />}
      {tab === 'documentos' && <DocsTab />}
    </div>
  );
}

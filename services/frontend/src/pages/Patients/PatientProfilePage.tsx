import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, User, Phone, Mail, Calendar, FileText,
  Brain, Plus, Clock, ChevronRight, AlertCircle,
} from 'lucide-react';
import { patientsApi, type Patient } from '@/api/patients';
import { appointmentsApi, type Appointment } from '@/api/appointments';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

type Tab = 'historia' | 'citas' | 'borradores' | 'documentos';

export function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('historia');

  const { data: patient, isLoading: patLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  const { data: appointments } = useQuery({
    queryKey: ['appointments', 'patient', id],
    queryFn: () => appointmentsApi.list({ patient_id: id!, limit: 20 }),
    enabled: !!id && tab === 'citas',
  });

  if (patLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={28} color="var(--teal)" /></div>;
  }

  if (isError || !patient) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24 }}>
        <AlertCircle size={16} /> Paciente no encontrado
      </div>
    );
  }

  const fullName = [patient.paternal_last_name, patient.maternal_last_name, patient.first_name, patient.middle_name]
    .filter(Boolean).join(' ');

  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'historia',    label: 'Historia clínica', Icon: FileText  },
    { id: 'citas',       label: 'Citas',            Icon: Calendar  },
    { id: 'borradores',  label: 'Borradores IA',    Icon: Brain     },
    { id: 'documentos',  label: 'Documentos',       Icon: FileText  },
  ];

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Volver a pacientes
      </button>

      {/* Header card */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--teal), #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={32} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>{fullName}</h1>
              <Badge
                label={patient.is_active ? 'Activo' : 'Inactivo'}
                color={patient.is_active ? '#065f46' : 'var(--s500)'}
                bg={patient.is_active ? '#d1fae5' : 'var(--s100)'}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', marginBottom: 16 }}>
              {patient.email && (
                <span style={{ fontSize: 13, color: 'var(--s500)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Mail size={13} /> {patient.email}
                </span>
              )}
              {patient.phone && (
                <span style={{ fontSize: 13, color: 'var(--s500)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={13} /> {patient.phone}
                </span>
              )}
              {patient.birth_date && (
                <span style={{ fontSize: 13, color: 'var(--s500)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={13} /> {formatBirthDate(patient.birth_date)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => navigate(`/appointments/new?patient_id=${patient.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Agendar cita
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--s100)', borderRadius: 12, padding: 4 }}>
        {TABS.map(({ id: tabId, label, Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === tabId ? 600 : 400,
              background: tab === tabId ? '#fff' : 'transparent',
              color: tab === tabId ? 'var(--s800)' : 'var(--s400)',
              boxShadow: tab === tabId ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all .15s',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'historia' && <HistoryTab patient={patient} />}
      {tab === 'citas' && <AppointmentsTab appointments={appointments ?? []} navigate={navigate} patientId={id!} />}
      {tab === 'borradores' && <DraftsTab />}
      {tab === 'documentos' && <DocsTab />}
    </div>
  );
}

function HistoryTab({ patient }: { patient: Patient }) {
  return (
    <div className="card" style={{ padding: 28 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: '0 0 20px' }}>Datos clínicos</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <InfoField label="Tipo documento" value={patient.document_type_code} />
        <InfoField label="Número de documento" value={patient.document_number} />
        <InfoField label="Género" value={patient.gender ?? '—'} />
        <InfoField label="Fecha de nacimiento" value={patient.birth_date ? formatBirthDate(patient.birth_date) : '—'} />
        <InfoField label="Teléfono" value={patient.phone ?? '—'} />
        <InfoField label="Dirección" value={patient.address ?? '—'} />
      </div>
    </div>
  );
}

function AppointmentsTab({ appointments, navigate, patientId }: { appointments: Appointment[]; navigate: (p: string) => void; patientId: string }) {
  if (appointments.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--s400)' }}>
        <Calendar size={40} color="var(--s200)" style={{ marginBottom: 12 }} />
        <p style={{ margin: 0, fontSize: 14 }}>Sin citas registradas</p>
        <button
          onClick={() => navigate(`/appointments/new?patient_id=${patientId}`)}
          style={{ marginTop: 16, padding: '8px 18px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Agendar primera cita
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      {appointments.map((appt, idx) => (
        <div
          key={appt.id}
          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: idx < appointments.length - 1 ? '1px solid var(--s100)' : 'none' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--s50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={16} color="var(--s400)" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>
              {new Date(appt.scheduled_at).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>
              {new Date(appt.scheduled_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {appt.duration_min} min · {appt.modality}
            </p>
          </div>
          <Badge label={appt.status} color="var(--s600)" bg="var(--s100)" size="sm" />
          <ChevronRight size={14} color="var(--s300)" />
        </div>
      ))}
    </div>
  );
}

function DraftsTab() {
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--s400)' }}>
      <Brain size={40} color="var(--s200)" style={{ marginBottom: 12 }} />
      <p style={{ margin: 0, fontSize: 14 }}>Sin borradores de IA generados</p>
    </div>
  );
}

function DocsTab() {
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--s400)' }}>
      <FileText size={40} color="var(--s200)" style={{ marginBottom: 12 }} />
      <p style={{ margin: 0, fontSize: 14 }}>Sin documentos adjuntos</p>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', fontWeight: 500 }}>{value}</p>
    </div>
  );
}

function formatBirthDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

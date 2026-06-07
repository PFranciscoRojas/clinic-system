import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, Calendar, FileText,
  Clock, AlertCircle,
  CreditCard, MapPin, Video, Upload, Target, Layers,
  Info, FileCheck, TrendingDown, Cake, Stethoscope, UserRound,
  Pencil, Lock, X,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { patientsApi, type Patient } from '@/api/patients';
import { appointmentsApi, type Appointment } from '@/api/appointments';
import { clinicalRecordsApi, consentsApi, type RecordMeta, type Consent, type ConsentType } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'historial' | 'plan' | 'consentimientos' | 'graficas';

type AppointmentStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(iso: string): number {
  const b = new Date(iso + 'T12:00:00');
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function fmtBirthDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Status config ────────────────────────────────────────────────────────────

const RECORD_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  borrador:   { label: 'Borrador',   color: '#92400e', bg: '#fef3c7' },
  firmada:    { label: 'Firmada',    color: '#065f46', bg: '#d1fae5' },
  confirmada: { label: 'Confirmada', color: '#1e40af', bg: '#dbeafe' },
  pendiente:  { label: 'Pendiente',  color: '#374151', bg: '#f1f5f9' },
  SCHEDULED:  { label: 'Confirmada', color: '#1e40af', bg: '#dbeafe' },
  IN_PROGRESS:{ label: 'En curso',   color: '#065f46', bg: '#d1fae5' },
  COMPLETED:  { label: 'Firmada',    color: '#065f46', bg: '#d1fae5' },
  CANCELLED:  { label: 'Cancelada',  color: '#991b1b', bg: '#fee2e2' },
  NO_SHOW:    { label: 'Pendiente',  color: '#374151', bg: '#f1f5f9' },
};

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inicial', EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta', INTERCONSULTATION: 'Interconsulta',
};

const CR_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:    { label: 'Borrador',  color: '#92400e', bg: '#fef3c7' },
  APPROVED: { label: 'Aprobado', color: '#065f46', bg: '#d1fae5' },
};

// ─── Tab: Historial ───────────────────────────────────────────────────────────

function HistorialTab({
  appointments,
  records,
  navigate,
  patientId,
}: {
  appointments: Appointment[];
  records: RecordMeta[];
  navigate: (path: string) => void;
  patientId: string;
}) {
  if (appointments.length === 0) {
    return (
      <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 56, textAlign: 'center' }}>
        <Calendar size={44} color="var(--s200)" style={{ marginBottom: 14 }} />
        <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--s500)' }}>Sin sesiones registradas</p>
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
    <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

    {/* ── Registros clínicos ─────────────────────────────────────────────── */}
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--s100)' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Registros clínicos</span>
        {(() => {
          const target =
            appointments.find(a => a.status === 'IN_PROGRESS') ??
            appointments.filter(a => a.status === 'SCHEDULED').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ??
            appointments[0];
          if (!target) return null;
          return (
            <button
              onClick={() => navigate(`/appointments/${target.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              <FileText size={12} /> Nuevo registro
            </button>
          );
        })()}
      </div>
      {records.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <FileText size={32} color="var(--s200)" style={{ marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin registros clínicos aún</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 110px 110px', gap: 8, padding: '8px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s200)' }}>
            {['Fecha', 'Tipo', 'Estado', 'Co-firma', 'Acción'].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          {records.map((rec, idx) => {
            const cfg = CR_STATUS_CONFIG[rec.status] ?? CR_STATUS_CONFIG.DRAFT;
            return (
              <div key={rec.id} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 110px 110px', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: idx < records.length - 1 ? '1px solid var(--s100)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--s700)' }}>{fmtDate(rec.session_date)}</span>
                <span style={{ fontSize: 13, color: 'var(--s600)' }}>{RECORD_TYPE_LABEL[rec.record_type] ?? rec.record_type}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: cfg.bg, color: cfg.color, display: 'inline-flex', width: 'fit-content' }}>
                  {cfg.label}
                </span>
                <span style={{ fontSize: 12, color: rec.requires_cosign && !rec.supervisor_id ? 'var(--red)' : 'var(--s400)' }}>
                  {rec.requires_cosign ? (rec.supervisor_id ? 'Firmado' : 'Pendiente') : '—'}
                </span>
                <button
                  onClick={() => navigate(`/clinical-records/${rec.id}`)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s700)', cursor: 'pointer', width: 'fit-content' }}
                >
                  Ver
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>

    {/* ── Citas ──────────────────────────────────────────────────────────── */}
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--s100)' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Citas agendadas</span>
      </div>
      {appointments.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <Calendar size={32} color="var(--s200)" style={{ marginBottom: 8 }} />
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--s400)' }}>Sin citas registradas</p>
          <button onClick={() => navigate(`/appointments/new?patient_id=${patientId}`)} style={{ padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Agendar primera cita
          </button>
        </div>
      ) : (
    <>
      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 1fr 80px 100px 120px', gap: 8, padding: '10px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s200)' }}>
        {['Ses#', 'Fecha', 'Tipo', 'Modalidad', 'Duración', 'Estado', 'Acciones'].map(h => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {appointments.map((appt, idx) => {
        const status = appt.status as AppointmentStatus;
        const cfg = RECORD_STATUS_CONFIG[status] ?? RECORD_STATUS_CONFIG.pendiente;
        const isVirtual = appt.modality === 'VIRTUAL';

        return (
          <div
            key={appt.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr 1fr 1fr 80px 100px 120px',
              gap: 8,
              alignItems: 'center',
              padding: '12px 20px',
              borderBottom: idx < appointments.length - 1 ? '1px solid var(--s100)' : 'none',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s600)' }}>#{idx + 1}</span>
            <span style={{ fontSize: 13, color: 'var(--s700)' }}>{fmtDate(appt.scheduled_at)}</span>
            <span style={{ fontSize: 13, color: 'var(--s600)' }}>Seguimiento</span>
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 9px',
              background: isVirtual ? '#eef2ff' : '#f0fdfa',
              color: isVirtual ? '#6366f1' : 'var(--teal)',
              border: `1px solid ${isVirtual ? '#c7d2fe' : '#99f6e4'}`,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              width: 'fit-content',
            }}>
              {isVirtual ? <Video size={10} /> : <MapPin size={10} />}
              {isVirtual ? 'Virtual' : 'Presencial'}
            </span>
            <span style={{ fontSize: 13, color: 'var(--s600)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} /> {appt.duration_min}m
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 9px',
              background: cfg.bg, color: cfg.color,
              display: 'inline-flex', alignItems: 'center',
              width: 'fit-content',
            }}>
              {cfg.label}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => navigate(`/appointments/${appt.id}`)}
                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s700)', cursor: 'pointer' }}
              >
                Ver
              </button>
            </div>
          </div>
        );
      })}
    </>
    )}
    </div>
    </div>
  );
}

// ─── Tab: Plan terapéutico ────────────────────────────────────────────────────

function PlanTab() {
  return (
    <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info notice */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '12px 16px' }}>
        <Info size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--teal-d)', lineHeight: 1.6 }}>
          Este módulo se completará con datos clínicos reales en la siguiente fase
        </p>
      </div>

      {/* 2-col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Objetivos */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={15} color="var(--teal)" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Objetivos terapéuticos</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Reducir síntomas de ansiedad generalizada', 'Desarrollar habilidades de regulación emocional', 'Mejorar calidad del sueño y rutinas'].map(obj => (
              <label key={obj} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" style={{ marginTop: 2, accentColor: 'var(--teal)', width: 14, height: 14 }} />
                <span style={{ fontSize: 13, color: 'var(--s700)', lineHeight: 1.5 }}>{obj}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Técnicas */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={15} color="#7c3aed" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Técnicas aplicadas</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Terapia cognitivo-conductual (TCC)', 'Mindfulness y técnicas de relajación', 'Activación conductual'].map(t => (
                <li key={t} style={{ fontSize: 13, color: 'var(--s700)', lineHeight: 1.5 }}>{t}</li>
              ))}
            </ul>
          </div>

          {/* Detalles */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Info size={15} color="#1d4ed8" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)' }}>Detalles del plan</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Enfoque', value: 'TCC + Mindfulness' },
                { label: 'Frecuencia', value: 'Semanal' },
                { label: 'Inicio', value: 'Mayo 2026' },
                { label: 'Duración estimada', value: '6 meses' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--s100)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                  <span style={{ fontSize: 13, color: 'var(--s700)', fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Consentimientos ─────────────────────────────────────────────────────

const CONSENT_TYPE_LABEL: Record<ConsentType, string> = {
  TREATMENT:           'Consentimiento de tratamiento',
  RECORDING:           'Autorización de grabación',
  DATA_PROCESSING:     'Tratamiento de datos personales',
  INFORMATION_SHARING: 'Compartir información clínica',
};

function ConsentimientosTab({ patientId }: { patientId: string }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<ConsentType>('TREATMENT');
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['consents', patientId],
    queryFn: () => consentsApi.list(patientId),
    enabled: !!patientId,
  });
  const consents: Consent[] = data?.items ?? [];

  const handleCreate = async () => {
    setSaving(true);
    try {
      await consentsApi.create(patientId, { consent_type: newType });
      await refetch();
      setAdding(false);
    } catch {
      // silent for now
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--s100)' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>Documentos de consentimiento</span>
        <button
          onClick={() => setAdding(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          <Upload size={13} /> Registrar consentimiento
        </button>
      </div>

      {adding && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--s100)', background: 'var(--s50)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Tipo de consentimiento</label>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as ConsentType)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s700)', background: '#fff' }}
            >
              {(Object.keys(CONSENT_TYPE_LABEL) as ConsentType[]).map(t => (
                <option key={t} value={t}>{CONSENT_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{ padding: '9px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={() => setAdding(false)}
            style={{ padding: '9px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Cancelar
          </button>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={22} color="var(--teal)" /></div>
      ) : consents.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <FileCheck size={36} color="var(--s200)" style={{ marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin consentimientos registrados</p>
        </div>
      ) : (
        consents.map((c, idx) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: idx < consents.length - 1 ? '1px solid var(--s100)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: c.revoked_at ? '#fee2e2' : '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileCheck size={16} color={c.revoked_at ? '#991b1b' : '#059669'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>{CONSENT_TYPE_LABEL[c.consent_type] ?? c.consent_type}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--s400)' }}>
                Firmado: {c.signed_at} · Método: {c.signing_method}
                {c.revoked_at && <span style={{ color: 'var(--red)', marginLeft: 8 }}>· Revocado</span>}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Tab: Gráficas ────────────────────────────────────────────────────────────

const SYMPTOM_DATA = [
  { session: 'Ses. 1', phq9: 19 },
  { session: 'Ses. 2', phq9: 16 },
  { session: 'Ses. 3', phq9: 13 },
  { session: 'Ses. 4', phq9: 10 },
  { session: 'Ses. 5', phq9: 8  },
];

interface KpiCardProps {
  label: string;
  value: string;
  color: string;
  bg: string;
}

function KpiCard({ label, value, color, bg }: KpiCardProps) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 0 }}>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--s800)' }}>{value}</p>
    </div>
  );
}

function GraficasTab({ appointments }: { appointments: Appointment[] }) {
  const total     = appointments.length;
  const completed = appointments.filter(a => a.status === 'COMPLETED').length;
  const pending   = appointments.filter(a => a.status === 'SCHEDULED').length;
  const now       = new Date();
  const nextAppt  = appointments
    .filter(a => a.status === 'SCHEDULED' && new Date(a.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  return (
    <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12 }}>
        <KpiCard label="Sesiones totales" value={String(total)}     color="var(--teal-d)"  bg="#f0fdfa" />
        <KpiCard label="Completadas"       value={String(completed)} color="#065f46"        bg="#d1fae5" />
        <KpiCard label="Pendientes"        value={String(pending)}   color="#92400e"        bg="#fef3c7" />
        <KpiCard label="Próxima"           value={nextAppt ? fmtShortDate(nextAppt.scheduled_at) : 'Sin citas'} color="#1e40af" bg="#dbeafe" />
      </div>

      {/* Chart */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>Evolución de síntomas</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>PHQ-9 · GAD-7</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={SYMPTOM_DATA} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#14b8a6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--s100)" />
            <XAxis dataKey="session" tick={{ fontSize: 11, fill: 'var(--s500)' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 27]} tick={{ fontSize: 11, fill: 'var(--s500)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid var(--s200)', fontSize: 12 }}
              formatter={(v) => [v, 'PHQ-9']}
            />
            <Area type="monotone" dataKey="phq9" stroke="#14b8a6" strokeWidth={2.5} fill="url(#tealGrad)" dot={{ fill: '#14b8a6', r: 4 }} activeDot={{ r: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Info notice */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '12px 16px' }}>
        <Info size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--teal-d)', lineHeight: 1.6 }}>
          Los datos de evaluaciones se cargarán automáticamente desde los registros clínicos
        </p>
      </div>
    </div>
  );
}

// ─── Edit patient modal ───────────────────────────────────────────────────────

const DOC_TYPES = [
  { code: 'CC',  name: 'CC — Cédula de Ciudadanía'  },
  { code: 'TI',  name: 'TI — Tarjeta de Identidad'  },
  { code: 'CE',  name: 'CE — Cédula de Extranjería'  },
  { code: 'PA',  name: 'PA — Pasaporte'              },
  { code: 'RC',  name: 'RC — Registro Civil'         },
  { code: 'PPT', name: 'PPT — Permiso de Protección Temporal' },
  { code: 'PEP', name: 'PEP — Permiso Especial de Permanencia' },
];

function EditPatientModal({ patient, onClose, onSaved }: {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [docType,   setDocType]   = useState(patient.document_type_code ?? '');
  const [docNumber, setDocNumber] = useState(patient.document_number ?? '');
  const [firstName,   setFirstName]   = useState(patient.first_name);
  const [middleName,  setMiddleName]  = useState(patient.middle_name ?? '');
  const [paternalLn,  setPaternalLn]  = useState(patient.paternal_last_name);
  const [maternalLn,  setMaternalLn]  = useState(patient.maternal_last_name ?? '');
  const [phone,    setPhone]    = useState(patient.phone ?? '');
  const [email,    setEmail]    = useState(patient.email ?? '');
  const [address,  setAddress]  = useState(patient.address ?? '');
  const [birthDate, setBirthDate] = useState(patient.birth_date ?? '');
  const [gender,   setGender]   = useState(patient.gender ?? '');
  const [error,    setError]    = useState('');

  const mutation = useMutation({
    mutationFn: () => patientsApi.update(patient.id, {
      document_type_code: docType || undefined,
      document_number:    docNumber || undefined,
      first_name:         firstName,
      middle_name:        middleName || undefined,
      paternal_last_name: paternalLn,
      maternal_last_name: maternalLn || undefined,
      phone:              phone || undefined,
      email:              email || undefined,
      address:            address || undefined,
      birth_date:         birthDate || undefined,
      gender:             gender || undefined,
    }),
    onSuccess: () => { onSaved(); onClose(); },
    onError: () => setError('No se pudo guardar. Intenta de nuevo.'),
  });

  const iLabel = (label: string, required?: boolean) => (
    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>
      {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );

  const iStyle: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 7,
    border: '1.5px solid var(--s200)', fontSize: 13, color: 'var(--s800)',
    background: '#fff', boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pencil size={16} color="var(--teal)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>Editar datos administrativos</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Legal notice */}
          <div style={{ display: 'flex', gap: 10, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '11px 14px' }}>
            <Lock size={14} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--teal-d)', lineHeight: 1.6 }}>
              <strong>Datos administrativos editables</strong> (Ley 1581/2012 — habeas data).
              Los registros clínicos son inmutables una vez aprobados (Res. 1995/1999).
              Todos los cambios quedan registrados en la bitácora de auditoría.
            </p>
          </div>

          {/* Nombre */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre completo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {iLabel('Primer nombre', true)}
                <input style={iStyle} value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                {iLabel('Segundo nombre')}
                <input style={iStyle} value={middleName} onChange={e => setMiddleName(e.target.value)} />
              </div>
              <div>
                {iLabel('Primer apellido', true)}
                <input style={iStyle} value={paternalLn} onChange={e => setPaternalLn(e.target.value)} />
              </div>
              <div>
                {iLabel('Segundo apellido')}
                <input style={iStyle} value={maternalLn} onChange={e => setMaternalLn(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Documento */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documento de identidad</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {iLabel('Tipo')}
                <select style={iStyle} value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="">— Sin especificar —</option>
                  {DOC_TYPES.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                </select>
              </div>
              <div>
                {iLabel('Número')}
                <input style={iStyle} value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Ej. 1234567890" />
              </div>
            </div>
          </div>

          {/* Datos de contacto */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contacto y datos personales</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {iLabel('Teléfono')}
                <input style={iStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
              </div>
              <div>
                {iLabel('Correo electrónico')}
                <input style={iStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                {iLabel('Fecha de nacimiento')}
                <input style={iStyle} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
              </div>
              <div>
                {iLabel('Género')}
                <input style={iStyle} value={gender} onChange={e => setGender(e.target.value)} placeholder="Según Decreto 1227/2015" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {iLabel('Dirección')}
                <input style={iStyle} value={address} onChange={e => setAddress(e.target.value)} />
              </div>
            </div>
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={13} /> {error}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid var(--s100)' }}>
            <button
              onClick={onClose}
              style={{ padding: '9px 18px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => { setError(''); mutation.mutate(); }}
              disabled={mutation.isPending || !firstName || !paternalLn}
              style={{
                padding: '9px 18px', background: 'var(--teal)', color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: mutation.isPending ? 'wait' : 'pointer',
                opacity: mutation.isPending || !firstName || !paternalLn ? 0.7 : 1,
              }}
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('historial');
  const [editOpen, setEditOpen] = useState(false);

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

  // Clinical records list (metadata only — no decryption)
  const { data: recordsData } = useQuery({
    queryKey: ['clinical-records', 'patient', id],
    queryFn: () => clinicalRecordsApi.list(id!),
    enabled: !!id,
  });
  const records: RecordMeta[] = recordsData?.items ?? [];

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

  const now = new Date();
  const upcoming = appointments
    .filter(a => a.status === 'SCHEDULED' && new Date(a.scheduled_at) >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const nextApptLabel = upcoming[0] ? fmtShortDate(upcoming[0].scheduled_at) : 'Sin citas';

  // Tab definitions
  const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'historial',       label: 'Historial de consultas', Icon: Clock      },
    { id: 'plan',            label: 'Plan terapéutico',       Icon: Target     },
    { id: 'consentimientos', label: 'Consentimientos',         Icon: FileCheck  },
    { id: 'graficas',        label: 'Gráficas de evolución',  Icon: TrendingDown },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Topbar breadcrumb ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid var(--s200)', padding: '0 28px', height: 52, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => navigate('/patients')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 13, fontWeight: 600, padding: 0 }}
        >
          <ArrowLeft size={14} /> Pacientes
        </button>
        <span style={{ color: 'var(--s300)', fontSize: 14 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--s700)', fontWeight: 500 }}>{displayName}</span>
        <span style={{ color: 'var(--s300)', fontSize: 14 }}>·</span>
        <span style={{ fontSize: 13, color: 'var(--s500)' }}>Historia clínica #{patient.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* ── Header card ─────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--s200)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>

            {/* Avatar + info */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: 1, minWidth: 0 }}>
              {/* Avatar */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #14b8a6, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 1,
              }}>
                {initials}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Name + badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--s800)' }}>{displayName}</h1>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '3px 10px',
                    background: patient.is_active ? '#d1fae5' : 'var(--s100)',
                    color: patient.is_active ? '#065f46' : 'var(--s500)',
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: patient.is_active ? '#10b981' : 'var(--s300)',
                      animation: patient.is_active ? 'pulse 2s infinite' : 'none',
                    }} />
                    {patient.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Info row 1 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                  {patient.birth_date && (
                    <InfoChip icon={<Cake size={12} />} text={`${calcAge(patient.birth_date)} años · ${fmtBirthDate(patient.birth_date)}`} />
                  )}
                  <InfoChip icon={<CreditCard size={12} />} text={`${patient.document_type_code} ${patient.document_number}`} />
                  {patient.email && <InfoChip icon={<Mail size={12} />} text={patient.email} />}
                  {patient.phone && <InfoChip icon={<Phone size={12} />} text={patient.phone} />}
                </div>

                {/* Info row 2 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <InfoChip
                    icon={<Stethoscope size={12} />}
                    text="Ansiedad generalizada"
                    style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}
                  />
                  <InfoChip icon={<Calendar size={12} />} text={`Próxima: ${nextApptLabel}`} />
                  <InfoChip icon={<UserRound size={12} />} text="Terapeuta asignado" />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
              <button
                onClick={() => setEditOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: 'var(--s700)', border: '1px solid var(--s200)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <Pencil size={13} /> Editar datos
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: 'var(--s700)', border: '1px solid var(--s200)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Upload size={13} /> Subir documento
              </button>
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <FileText size={13} /> Nueva evaluación
              </button>
              <button
                onClick={() => navigate(`/appointments/new?patient_id=${patient.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <Calendar size={13} /> Nueva cita
              </button>
            </div>
          </div>
        </div>

        {/* ── Pill Tab Bar ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--s100)', borderRadius: 12, padding: 4 }}>
          {TABS.map(({ id: tabId, label, Icon }) => {
            const isActive = tab === tabId;
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
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ───────────────────────────────────────────────────── */}
        {tab === 'historial'       && <HistorialTab appointments={appointments} records={records} navigate={navigate} patientId={id!} />}
        {tab === 'plan'            && <PlanTab />}
        {tab === 'consentimientos' && <ConsentimientosTab patientId={id!} />}
        {tab === 'graficas'        && <GraficasTab appointments={appointments} />}
      </div>

      {editOpen && patient && (
        <EditPatientModal
          patient={patient}
          onClose={() => setEditOpen(false)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['patient', id] })}
        />
      )}
    </div>
  );
}

// ─── InfoChip helper ──────────────────────────────────────────────────────────

function InfoChip({ icon, text, style }: { icon: React.ReactNode; text: string; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, color: 'var(--s600)',
      background: 'var(--s50)', border: '1px solid var(--s200)',
      borderRadius: 6, padding: '3px 10px',
      ...style,
    }}>
      {icon}
      {text}
    </span>
  );
}

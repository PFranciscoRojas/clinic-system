import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, Calendar, FileText,
  Clock, AlertCircle,
  CreditCard, MapPin, Video, FileCheck, Cake, Stethoscope, AlertTriangle,
  Pencil,
} from 'lucide-react';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { patientsApi } from '@/api/patients';
import { appointmentsApi, type Appointment } from '@/api/appointments';
import { clinicalRecordsApi, consentsApi, type RecordMeta, type Consent, type ConsentType } from '@/api/clinicalRecords';
import { diagnosesApi } from '@/api/diagnoses';
import { Spinner } from '@/components/ui/Spinner';
import { ConsentSignModal } from '@/components/consents/ConsentSignModal';
import { ConsentViewModal } from '@/components/consents/ConsentViewModal';
import { DiagnosesPanel } from '@/components/clinical/DiagnosesPanel';
import { riskMeta } from '@/components/clinical/constants';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'historial' | 'diagnosticos' | 'consentimientos';

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
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', display: 'flex', alignItems: 'center', gap: 10 }}>
          Registros clínicos
          {(() => {
            const last = records.find(r => r.risk_level);
            const rm = riskMeta(last?.risk_level);
            return rm ? (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: rm.bg, color: rm.color, border: `1px solid ${rm.border}` }}>
                Último riesgo: {rm.label}
              </span>
            ) : null;
          })()}
        </span>
        {(() => {
          // An in-progress/scheduled appointment keeps the note linked to it;
          // otherwise the standalone form covers walk-ins and late notes.
          const target =
            appointments.find(a => a.status === 'IN_PROGRESS') ??
            appointments.filter(a => a.status === 'SCHEDULED').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
          return (
            <button
              onClick={() => navigate(target ? `/appointments/${target.id}` : `/patients/${patientId}/records/new`)}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 90px 90px', gap: 8, padding: '8px 20px', background: 'var(--s50)', borderBottom: '1px solid var(--s200)' }}>
            {['Fecha', 'Tipo', 'Riesgo', 'Estado', 'Co-firma', 'Acción'].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
            ))}
          </div>
          {records.map((rec, idx) => {
            const cfg = CR_STATUS_CONFIG[rec.status] ?? CR_STATUS_CONFIG.DRAFT;
            return (
              <div key={rec.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 110px 90px 90px', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: idx < records.length - 1 ? '1px solid var(--s100)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--s700)' }}>{fmtDate(rec.session_date)}</span>
                <span style={{ fontSize: 13, color: 'var(--s600)' }}>{RECORD_TYPE_LABEL[rec.record_type] ?? rec.record_type}</span>
                {(() => {
                  const rm = riskMeta(rec.risk_level);
                  return rm ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: rm.bg, color: rm.color, display: 'inline-flex', width: 'fit-content' }}>{rm.label}</span>
                  ) : <span style={{ fontSize: 12, color: 'var(--s300)' }}>—</span>;
                })()}
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

const CONSENT_TYPE_LABEL: Record<string, string> = {
  TREATMENT: 'Tratamiento',
  RECORDING: 'Grabación de sesiones',
  DATA_PROCESSING: 'Tratamiento de datos',
  INFORMATION_SHARING: 'Compartir información',
};

const METHOD_SHORT: Record<string, string> = {
  DIGITAL: 'Firma digital',
  PHYSICAL_SCAN: 'Documento físico',
};

function ConsentimientosTab({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();
  const [signType, setSignType] = useState<ConsentType | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [linkSentFor, setLinkSentFor] = useState<ConsentType | null>(null);
  const [error, setError] = useState('');
  const fileInputType = useRef<ConsentType>('TREATMENT');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['consents', patientId],
    queryFn: () => consentsApi.list(patientId),
    enabled: !!patientId,
  });
  const consents: Consent[] = data?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['consents', patientId] });

  // Latest consent per type; an active (non-revoked) one wins over revoked ones.
  const latestByType = (type: ConsentType): Consent | undefined => {
    const ofType = consents.filter(c => c.consent_type === type);
    return ofType.find(c => !c.revoked_at) ?? ofType[0];
  };

  const handleSendLink = async (type: ConsentType) => {
    setError('');
    try {
      await consentsApi.sendLink(patientId, { consent_type: type });
      setLinkSentFor(type);
      setTimeout(() => setLinkSentFor(null), 6000);
    } catch (e) {
      setError(e instanceof Error && e.message.includes('email')
        ? 'El paciente no tiene email registrado — agrégalo en sus datos para enviar el link.'
        : 'No se pudo enviar el link. Intenta de nuevo.');
    }
  };

  const handleFilePicked = async (file: File) => {
    setError('');
    const form = new FormData();
    form.append('consent_type', fileInputType.current);
    form.append('signed_at', new Date().toISOString().slice(0, 10));
    form.append('file', file);
    try {
      await consentsApi.upload(patientId, form);
      invalidate();
    } catch {
      setError('No se pudo subir el archivo. Verifica que sea PDF, JPG o PNG de máximo 10 MB.');
    }
  };

  const handleRevoke = async () => {
    if (!revokeId || !revokeReason.trim()) return;
    setError('');
    try {
      await consentsApi.revoke(revokeId, revokeReason.trim());
      setRevokeId(null);
      setRevokeReason('');
      invalidate();
    } catch {
      setError('No se pudo revocar el consentimiento.');
    }
  };

  const actionBtn = (label: string, onClick: () => void, primary = false) => (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
        border: primary ? 'none' : '1px solid var(--s200)',
        background: primary ? 'var(--teal)' : '#fff',
        color: primary ? '#fff' : 'var(--s700)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="anim-fade-in" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--s100)' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>Documentos de consentimiento</span>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--s400)' }}>
          Firma en consultorio, envío por link al email del paciente, o carga del documento firmado físicamente.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = ''; }}
      />

      {error && (
        <div style={{ padding: '10px 20px', background: '#fee2e2', fontSize: 13, color: '#991b1b' }}>{error}</div>
      )}

      {isLoading ? (
        <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={22} color="var(--teal)" /></div>
      ) : (
        (Object.keys(CONSENT_TYPE_LABEL) as ConsentType[]).map((type, idx, arr) => {
          const c = latestByType(type);
          const active = c && !c.revoked_at;
          const revoked = c && c.revoked_at;
          return (
            <div key={type} style={{ padding: '14px 20px', borderBottom: idx < arr.length - 1 ? '1px solid var(--s100)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: active ? '#d1fae5' : revoked ? '#fee2e2' : 'var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileCheck size={16} color={active ? '#059669' : revoked ? '#991b1b' : 'var(--s400)'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>{CONSENT_TYPE_LABEL[type]}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--s400)' }}>
                    {active && <>Firmado el {c.signed_at} · {METHOD_SHORT[c.signing_method] ?? c.signing_method}</>}
                    {revoked && <span style={{ color: 'var(--red)' }}>Revocado el {new Date(c.revoked_at!).toLocaleDateString('es-CO')}</span>}
                    {!c && 'Sin firmar'}
                    {linkSentFor === type && <span style={{ color: '#059669', marginLeft: 8, fontWeight: 600 }}>✓ Link enviado — vence en 7 días</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {active ? (
                    <>
                      {actionBtn('Ver', () => setViewId(c.id))}
                      {actionBtn('Revocar', () => { setRevokeId(c.id); setRevokeReason(''); })}
                    </>
                  ) : (
                    <>
                      {actionBtn('Firmar ahora', () => setSignType(type), true)}
                      {actionBtn('Enviar link', () => handleSendLink(type))}
                      {actionBtn('Subir firmado', () => { fileInputType.current = type; fileRef.current?.click(); })}
                      {revoked && actionBtn('Ver anterior', () => setViewId(c.id))}
                    </>
                  )}
                </div>
              </div>

              {revokeId === c?.id && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#fef2f2', borderRadius: 9, border: '1px solid #fecaca' }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#991b1b', display: 'block', marginBottom: 6 }}>
                    Motivo de la revocación (requerido — habeas data)
                  </label>
                  <textarea
                    value={revokeReason}
                    onChange={e => setRevokeReason(e.target.value)}
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #fecaca', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                    {actionBtn('Cancelar', () => setRevokeId(null))}
                    <button
                      onClick={handleRevoke}
                      disabled={!revokeReason.trim()}
                      style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, border: 'none', background: revokeReason.trim() ? 'var(--red)' : 'var(--s200)', color: '#fff', cursor: revokeReason.trim() ? 'pointer' : 'not-allowed' }}
                    >
                      Confirmar revocación
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {signType && (
        <ConsentSignModal
          patientId={patientId}
          consentType={signType}
          onClose={() => setSignType(null)}
          onSigned={invalidate}
        />
      )}
      {viewId && <ConsentViewModal consentId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}

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

  // Active principal diagnosis feeds the header chip (was a hardcoded demo label)
  const { data: dxData } = useQuery({
    queryKey: ['diagnoses', id],
    queryFn: () => diagnosesApi.list(id!),
    enabled: !!id,
  });
  const activeDx = (dxData?.items ?? []).find(d => d.status === 'ACTIVE' && d.diagnosis_type === 'PRINCIPAL')
    ?? (dxData?.items ?? []).find(d => d.status === 'ACTIVE');

  // Consent evidence — Ley 1581/Ley 1090 require it before treatment
  const { data: consentsData } = useQuery({
    queryKey: ['consents', id],
    queryFn: () => consentsApi.list(id!),
    enabled: !!id,
  });
  const hasTreatmentConsent = (consentsData?.items ?? [])
    .some(c => !c.revoked_at && (c.consent_type === 'TREATMENT' || c.consent_type === 'DATA_PROCESSING'));

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
    { id: 'diagnosticos',    label: 'Diagnósticos',           Icon: Stethoscope },
    { id: 'consentimientos', label: 'Consentimientos',         Icon: FileCheck  },
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
                  {activeDx && (
                    <InfoChip
                      icon={<Stethoscope size={12} />}
                      text={`${activeDx.icd10_code} · ${activeDx.description}`}
                      style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}
                    />
                  )}
                  <InfoChip icon={<Calendar size={12} />} text={`Próxima: ${nextApptLabel}`} />
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
              <button
                onClick={() => navigate(`/patients/${patient.id}/records/new`)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: 'var(--teal)', border: '1px solid var(--s200)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <FileText size={13} /> Nuevo registro
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

        {/* ── Consent warning (Ley 1581 / Ley 1090) ─────────────────────────── */}
        {consentsData && !hasTreatmentConsent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, marginBottom: 20 }}>
            <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: '#92400e' }}>
              <strong>Sin consentimiento informado registrado.</strong> El consentimiento es obligatorio antes de iniciar tratamiento (Ley 1581/2012 · Ley 1090/2006).
            </span>
            <button
              onClick={() => setTab('consentimientos')}
              style={{ padding: '7px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
            >
              Registrar ahora
            </button>
          </div>
        )}

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
        {tab === 'diagnosticos'    && <DiagnosesPanel patientId={id!} />}
        {tab === 'consentimientos' && <ConsentimientosTab patientId={id!} />}
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

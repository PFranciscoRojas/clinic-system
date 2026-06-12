import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, Clock, MapPin, Video, User,
  Play, CheckCircle2, AlertTriangle, Brain, FileText,
  Mic, Upload, X, Phone, CreditCard, Cake, UserPlus,
} from 'lucide-react';
import { appointmentsApi, type AppointmentStatus } from '@/api/appointments';
import { patientsApi, type Patient } from '@/api/patients';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { PatientSearchBox } from '@/components/patients/PatientSearchBox';
import { calcAge } from '@/lib/age';
import { useIsCompact } from '@/lib/useMediaQuery';
import { clinicalRecordsApi, consentsApi, type RecordMeta } from '@/api/clinicalRecords';
import { ConsentViewModal } from '@/components/consents/ConsentViewModal';
import { RecordForm } from '@/components/clinical/RecordForm';
import { aiDraftsApi } from '@/api/aiDrafts';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AppointmentStatus, { label: string; color: string; bg: string }> = {
  SCHEDULED:   { label: 'Confirmada',  color: '#1e40af', bg: '#dbeafe' },
  IN_PROGRESS: { label: 'En curso',    color: '#065f46', bg: '#d1fae5' },
  COMPLETED:   { label: 'Completada',  color: '#374151', bg: '#f1f5f9' },
  CANCELLED:   { label: 'Cancelada',   color: '#991b1b', bg: '#fee2e2' },
  NO_SHOW:     { label: 'No asistió',  color: '#92400e', bg: '#fef3c7' },
};

const MODALITY_LABEL: Record<string, string> = {
  IN_PERSON: 'Presencial', VIRTUAL: 'Virtual', HYBRID: 'Híbrido',
};

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inicial', EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta', INTERCONSULTATION: 'Interconsulta',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ─── Audio upload section ─────────────────────────────────────────────────────

interface AudioSectionProps {
  appointmentId: string;
  patientId: string;
  draftId: string;
  onDraftCreated: (draftId: string) => void;
}

function AudioSection({ appointmentId, patientId, draftId, onDraftCreated }: AudioSectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const { data: draft } = useQuery({
    queryKey: ['ai-draft', draftId],
    queryFn: () => aiDraftsApi.get(draftId),
    enabled: !!draftId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return (s === 'PENDING' || s === 'PROCESSING') ? 3000 : false;
    },
  });

  const handleFile = async (file: File) => {
    setUploading(true); setUploadErr('');
    try {
      const res = await appointmentsApi.uploadAudio(appointmentId, patientId, file);
      onDraftCreated(res.draft_id);
    } catch {
      setUploadErr('Error al subir el audio. Verifica el formato (mp3, wav, m4a).');
    } finally {
      setUploading(false);
    }
  };

  if (draftId && draft) {
    const statusCfg: Record<string, { label: string; color: string; bg: string; pulse?: boolean }> = {
      PENDING:     { label: 'En cola',    color: '#6b7280', bg: '#f3f4f6' },
      PROCESSING:  { label: 'Procesando', color: '#0369a1', bg: '#e0f2fe', pulse: true },
      DRAFT_READY: { label: 'Listo para revisar', color: '#065f46', bg: '#d1fae5' },
      APPROVED:    { label: 'Aprobado',   color: '#fff',    bg: '#059669' },
      ERROR:       { label: 'Error',      color: '#991b1b', bg: '#fee2e2' },
    };
    const cfg = statusCfg[draft.status] ?? statusCfg.PENDING;
    const isProcessing = draft.status === 'PENDING' || draft.status === 'PROCESSING';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s200)' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isProcessing ? <Spinner size={18} color="#f59e0b" /> : <Brain size={18} color="#f59e0b" />}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>Borrador IA</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
            {isProcessing && <span style={{ fontSize: 11, color: 'var(--s400)' }}>Actualizando cada 3s…</span>}
          </div>
        </div>
        {(draft.status === 'DRAFT_READY' || draft.status === 'APPROVED') && (
          <a href={`/ai-drafts/${draftId}`} style={{ padding: '7px 14px', background: '#f59e0b', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Brain size={13} /> Revisar borrador
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          border: '2px dashed var(--s200)', borderRadius: 12, padding: '28px 20px',
          textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
          background: 'var(--s50)', transition: 'border-color .15s',
        }}
        onMouseEnter={e => !uploading && ((e.currentTarget as HTMLElement).style.borderColor = 'var(--teal)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--s200)')}
      >
        {uploading ? (
          <>
            <Spinner size={28} color="var(--teal)" />
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--s500)' }}>Subiendo audio…</p>
          </>
        ) : (
          <>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Mic size={22} color="var(--teal)" />
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--s700)' }}>Subir grabación de la sesión</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>MP3, WAV, M4A · El audio no sale de tu servidor</p>
            <button
              onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
              style={{ marginTop: 14, padding: '8px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Upload size={14} /> Seleccionar archivo
            </button>
          </>
        )}
      </div>
      {uploadErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8, marginTop: 10 }}>
          <AlertTriangle size={14} color="#dc2626" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>{uploadErr}</span>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const compactLayout = useIsCompact();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [statusLoading, setStatusLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [statusErr, setStatusErr] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  // When true, the edit modal is open and closing it after saving starts the session
  const [completeDataOpen, setCompleteDataOpen] = useState(false);

  // draft_id stored per appointment in localStorage
  const draftKey = `sghcp_draft_${id}`;
  const [draftId, setDraftId] = useState(() => localStorage.getItem(draftKey) ?? '');

  const { data: appt, isLoading, isError } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => appointmentsApi.get(id!),
    enabled: !!id,
  });

  const { data: patient } = useQuery({
    queryKey: ['patient', appt?.patient_id],
    queryFn: () => patientsApi.get(appt!.patient_id),
    enabled: !!appt?.patient_id,
  });

  const { data: recordsData, refetch: refetchRecords } = useQuery({
    queryKey: ['clinical-records', 'patient', appt?.patient_id],
    queryFn: () => clinicalRecordsApi.list(appt!.patient_id),
    enabled: !!appt?.patient_id,
  });

  // The TREATMENT consent covering this appointment (one signature per process)
  const { data: consentsData } = useQuery({
    queryKey: ['consents', appt?.patient_id],
    queryFn: () => consentsApi.list(appt!.patient_id),
    enabled: !!appt?.patient_id,
  });
  const treatmentConsent = (consentsData?.items ?? [])
    .find(c => c.consent_type === 'TREATMENT' && !c.revoked_at);
  const [viewConsentId, setViewConsentId] = useState<string | null>(null);

  // Records linked to this appointment
  const linkedRecords: RecordMeta[] = (recordsData?.items ?? []).filter(r => r.appointment_id === id);

  const handleStatusChange = async (status: AppointmentStatus) => {
    if (!id) return;
    setStatusLoading(true); setStatusErr('');
    try {
      await appointmentsApi.updateStatus(id, status);
      await queryClient.invalidateQueries({ queryKey: ['appointment', id] });
    } catch {
      setStatusErr('No se pudo cambiar el estado de la cita. Intenta de nuevo.');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await appointmentsApi.cancel(id, cancelReason.trim());
      queryClient.invalidateQueries({ queryKey: ['appointment', id] });
      setCancelOpen(false);
    } finally {
      setCancelling(false);
    }
  };

  const handleDraftCreated = (newDraftId: string) => {
    localStorage.setItem(draftKey, newDraftId);
    setDraftId(newDraftId);
  };

  const handleRecordSaved = async () => {
    // The session note closes the appointment lifecycle: once the clinical
    // record exists the appointment is done — no manual step, and the cancel
    // button disappears with it.
    if (appt && (appt.status === 'SCHEDULED' || appt.status === 'IN_PROGRESS')) {
      try { await appointmentsApi.updateStatus(id!, 'COMPLETED'); } catch { /* note saved; status stays */ }
      queryClient.invalidateQueries({ queryKey: ['appointment', id] });
    }
    await refetchRecords();
    queryClient.invalidateQueries({ queryKey: ['clinical-records', 'patient', appt?.patient_id] });
    setShowRecordForm(false);
  };

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={28} color="var(--teal)" /></div>;
  if (isError || !appt) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24 }}>
      <AlertTriangle size={16} /> Cita no encontrada
    </div>
  );

  const { date, time } = fmtDateTime(appt.scheduled_at);
  const statusCfg = STATUS_CFG[appt.status];
  const isVirtual = appt.modality === 'VIRTUAL';
  const isActive = appt.status === 'SCHEDULED' || appt.status === 'IN_PROGRESS';
  const isInProgress = appt.status === 'IN_PROGRESS';
  const isScheduled = appt.status === 'SCHEDULED';
  const isGuest = !appt.patient_id;

  const patientName = patient
    ? [patient.first_name, patient.middle_name, patient.paternal_last_name, patient.maternal_last_name].filter(Boolean).join(' ')
    : appt.guest_name || appt.patient_id.slice(0, 8);

  const patientInitials = patient
    ? ((patient.first_name?.[0] ?? '') + (patient.paternal_last_name?.[0] ?? '')).toUpperCase()
    : (appt.guest_name?.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');

  const patientAge = calcAge(patient?.birth_date);
  // Hard gates before a clinical session can start (Res. 1995/1999 + consent law)
  const canStartSession = !!patient && !!treatmentConsent;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: compactLayout ? '16px 12px' : '24px 24px 40px' }}>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: 0 }}>
        <ArrowLeft size={16} /> Volver
      </button>

      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>

          {/* Patient avatar */}
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--teal-d))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {patientInitials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--s800)' }}>{patientName}</h1>
              <Badge label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />
              {isGuest && <Badge label="Reserva — sin paciente" color="#92400e" bg="#fef3c7" />}
            </div>

            {/* Appointment info chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <InfoChip icon={<Calendar size={13} />} text={date} />
              <InfoChip icon={<Clock size={13} />} text={`${time} · ${appt.duration_min} min`} />
              <InfoChip
                icon={isVirtual ? <Video size={13} /> : <MapPin size={13} />}
                text={MODALITY_LABEL[appt.modality] ?? appt.modality}
                color={isVirtual ? '#6366f1' : undefined}
              />
              {user && <InfoChip icon={<User size={13} />} text={user.display_name ?? user.email ?? 'Terapeuta'} />}
              {/* Patient key data — what Marcela needs at hand during the session */}
              {patient && patientAge !== null && <InfoChip icon={<Cake size={13} />} text={`${patientAge} años`} />}
              {patient?.document_number && <InfoChip icon={<CreditCard size={13} />} text={`${patient.document_type_code ?? ''} ${patient.document_number}`.trim()} />}
              {patient?.phone && <InfoChip icon={<Phone size={13} />} text={patient.phone} />}
              {/* Consent coverage — derived from the active TREATMENT consent */}
              {isGuest ? null : treatmentConsent ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, background: '#d1fae5', color: '#065f46' }}>
                  <CheckCircle2 size={13} /> Consentimiento firmado el {treatmentConsent.signed_at}
                  <button
                    onClick={() => setViewConsentId(treatmentConsent.id)}
                    style={{ marginLeft: 2, border: 'none', background: 'none', color: '#065f46', cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: 0 }}
                  >
                    Ver
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => navigate(`/patients/${appt.patient_id}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 7, background: '#fef3c7', color: '#92400e', border: 'none', cursor: 'pointer' }}
                >
                  <AlertTriangle size={13} /> Sin consentimiento — firmar
                </button>
              )}
            </div>
          </div>

          {/* Patient profile link */}
          {!isGuest && (
            <button
              onClick={() => navigate(`/patients/${appt.patient_id}`)}
              style={{ padding: '8px 14px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <User size={13} /> Ver perfil
            </button>
          )}
        </div>

        {statusErr && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8 }}>
            <AlertTriangle size={14} color="#dc2626" />
            <span style={{ fontSize: 13, color: '#991b1b' }}>{statusErr}</span>
          </div>
        )}

        {/* ── Guest reservation: associate the patient before anything else ──── */}
        {isActive && isGuest && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--s100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <UserPlus size={15} color="#92400e" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>Asociar paciente</span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--s500)', lineHeight: 1.6 }}>
              Esta cita se reservó a nombre de <b>{appt.guest_name}</b> sin paciente registrado.
              Busca el paciente o regístralo para poder iniciar la sesión.
            </p>
            <div style={{ maxWidth: 420 }}>
              <PatientSearchBox
                selected={null}
                onSelect={async p => {
                  if (!p) return;
                  setStatusErr('');
                  try {
                    await appointmentsApi.assignPatient(id!, p.id);
                    await queryClient.invalidateQueries({ queryKey: ['appointment', id] });
                  } catch {
                    setStatusErr('No se pudo asociar el paciente. Intenta de nuevo.');
                  }
                }}
                onNewPatient={() => navigate(`/patients/new?appointment_id=${id}`)}
              />
            </div>
          </div>
        )}

        {/* ── Status action bar ──────────────────────────────────────────────── */}
        {isActive && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--s100)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {isScheduled && (
              <button
                onClick={() => {
                  if (!canStartSession) return;
                  const missing = !patient?.document_number || !patient?.birth_date;
                  if (missing) { setCompleteDataOpen(true); }
                  else { handleStatusChange('IN_PROGRESS'); }
                }}
                disabled={statusLoading || !canStartSession}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: canStartSession ? '#059669' : 'var(--s200)', color: canStartSession ? '#fff' : 'var(--s400)', border: 'none', borderRadius: 9, cursor: statusLoading || !canStartSession ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: statusLoading ? 0.7 : 1 }}
              >
                {statusLoading ? <Spinner size={15} color="#fff" /> : <Play size={15} />}
                Iniciar sesión
              </button>
            )}
            {isScheduled && !canStartSession && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#92400e' }}>
                <AlertTriangle size={13} />
                {isGuest
                  ? 'Asocia el paciente para poder iniciar la sesión.'
                  : 'El paciente debe firmar el consentimiento de tratamiento antes de iniciar.'}
              </span>
            )}
            {isInProgress && (
              <button
                onClick={() => handleStatusChange('COMPLETED')}
                disabled={statusLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: statusLoading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: statusLoading ? 0.7 : 1 }}
              >
                {statusLoading ? <Spinner size={15} color="#fff" /> : <CheckCircle2 size={15} />}
                Finalizar sesión
              </button>
            )}
            {linkedRecords.length === 0 && (
              <button
              onClick={() => setCancelOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              <X size={14} /> Cancelar cita
            </button>
            )}
          </div>
        )}

        {/* Cancel reason input */}
        {cancelOpen && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Motivo de cancelación</label>
              <input
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ej. Paciente no pudo asistir por emergencia…"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--s200)', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={handleCancel}
              disabled={!cancelReason.trim() || cancelling}
              style={{ padding: '9px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: !cancelReason.trim() ? 0.5 : 1 }}
            >
              {cancelling ? 'Cancelando…' : 'Confirmar'}
            </button>
            <button onClick={() => { setCancelOpen(false); setCancelReason(''); }} style={{ padding: '9px 14px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              Cerrar
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? '1fr' : '1fr 1fr', gap: 20 }}>

        {/* ── Historia clínica ─────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={17} color="var(--teal)" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>Historia clínica</span>
            </div>
            {linkedRecords.length > 0 && !showRecordForm && isActive && (
              <button
                onClick={() => setShowRecordForm(true)}
                style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--teal)', background: '#f0fdfa', color: 'var(--teal)', cursor: 'pointer' }}
              >
                + Nuevo
              </button>
            )}
          </div>

          {linkedRecords.length > 0 && !showRecordForm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {linkedRecords.map(rec => (
                <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s200)' }}>
                  <FileText size={16} color="var(--teal)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>
                      {RECORD_TYPE_LABEL[rec.record_type] ?? rec.record_type}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--s400)' }}>{rec.session_date}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: rec.status === 'APPROVED' ? '#d1fae5' : '#fef3c7', color: rec.status === 'APPROVED' ? '#065f46' : '#92400e' }}>
                    {rec.status === 'APPROVED' ? 'Aprobado' : 'Borrador'}
                  </span>
                  <button
                    onClick={() => navigate(`/clinical-records/${rec.id}`)}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s700)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Ver
                  </button>
                </div>
              ))}
            </div>
          ) : showRecordForm ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s600)' }}>Nuevo registro clínico</span>
                <button onClick={() => setShowRecordForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)' }}><X size={16} /></button>
              </div>
              <RecordForm patientId={appt.patient_id} appointmentId={id!} onSaved={handleRecordSaved} />
            </div>
          ) : isActive ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <FileText size={36} color="var(--s200)" style={{ marginBottom: 12 }} />
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--s500)' }}>Sin registro para esta sesión</p>
              <button
                onClick={() => setShowRecordForm(true)}
                style={{ padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <FileText size={14} /> Crear registro clínico
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin registros clínicos vinculados</p>
            </div>
          )}
        </div>

        {/* ── Grabación de sesión (AI) ─────────────────────────────────────── */}
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Brain size={17} color="#f59e0b" />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)', display: 'block' }}>Borrador IA</span>
              <span style={{ fontSize: 11, color: 'var(--s400)' }}>Audio → transcripción → borrador automático</span>
            </div>
          </div>

          {isActive ? (
            <AudioSection
              appointmentId={id!}
              patientId={appt.patient_id}
              draftId={draftId}
              onDraftCreated={handleDraftCreated}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--s400)', fontSize: 13 }}>
              La cita debe estar activa para subir grabaciones
            </div>
          )}
        </div>

      </div>

      {viewConsentId && <ConsentViewModal consentId={viewConsentId} onClose={() => setViewConsentId(null)} />}

      {completeDataOpen && patient && (
        <EditPatientModal
          patient={patient as Patient}
          requiredContext="El número de documento y la fecha de nacimiento son necesarios para iniciar la sesión clínica. Completa los datos y guarda para continuar."
          onClose={() => setCompleteDataOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['patient', appt?.patient_id] });
            handleStatusChange('IN_PROGRESS');
          }}
        />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoChip({ icon, text, color }: { icon: React.ReactNode; text: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: color ?? 'var(--s600)', background: 'var(--s50)', border: '1px solid var(--s200)', borderRadius: 20, padding: '4px 12px' }}>
      {icon} {text}
    </span>
  );
}

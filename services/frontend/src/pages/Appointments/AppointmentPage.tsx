import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, type NavigateOptions } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Calendar, Clock, MapPin, Video, User,
  Play, CheckCircle2, AlertTriangle, Brain, FileText,
  Mic, MicOff, Upload, X, Phone, CreditCard, Cake, UserPlus, Wallet,
  CalendarClock, Pause, RotateCcw,
} from 'lucide-react';
import { appointmentsApi, type AppointmentStatus } from '@/api/appointments';
import { ApiError } from '@/api/client';
import { patientsApi, type Patient } from '@/api/patients';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { PatientSearchBox } from '@/components/patients/PatientSearchBox';
import { calcAge } from '@/lib/age';
import { fmtDateOnly } from '@/lib/dates';
import { recordingStore } from '@/lib/recordingStore';
import { useIsCompact } from '@/lib/useMediaQuery';
import { CLR_DANGER, CLR_WARN, CLR_SUCCESS, CLR_INFO, CLR_PROC, CLR_NEUTRAL } from '@/lib/tokens';
import { clinicalRecordsApi, consentsApi, type RecordMeta, type RecordType } from '@/api/clinicalRecords';
import { recordTemplatesApi } from '@/api/recordTemplates';
import { ConsentViewModal } from '@/components/consents/ConsentViewModal';
import { UnifiedConsentSignModal } from '@/components/consents/UnifiedConsentSignModal';
import { RecordForm } from '@/components/clinical/RecordForm';
import type { UIRecordType } from '@/components/clinical/RecordSectionsForm';
import { RecapCard } from '@/components/clinical/RecapCard';
import { RiskBanner } from '@/components/clinical/RiskBanner';
import { aiDraftsApi } from '@/api/aiDrafts';
import { useAuth } from '@/context/AuthContext';
import { isPureAdmin } from '@/lib/clinicalAccess';
import { authApi } from '@/api/auth';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { SlotPicker } from '@/components/appointments/SlotPicker';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AppointmentStatus, { label: string; color: string; bg: string }> = {
  SCHEDULED:   { label: 'Confirmada',  color: CLR_INFO.text,    bg: CLR_INFO.bg },
  IN_PROGRESS: { label: 'En curso',    color: CLR_SUCCESS.text, bg: CLR_SUCCESS.bg },
  COMPLETED:   { label: 'Completada',  color: CLR_NEUTRAL.text, bg: '#f4eedd' },
  CANCELLED:   { label: 'Cancelada',   color: CLR_DANGER.text,  bg: CLR_DANGER.bg },
  NO_SHOW:     { label: 'No asistió',  color: CLR_WARN.text,    bg: CLR_WARN.bg },
  // Not a real appointment — an Efecty/cash-voucher hold pending payment.
  // Never actually loaded here (GET /appointments/:id only reads the
  // appointments table), kept only to satisfy the Record's exhaustiveness.
  PENDING_PAYMENT: { label: 'Pendiente de pago', color: CLR_WARN.text, bg: CLR_WARN.bg },
};

const MODALITY_LABEL: Record<string, string> = {
  IN_PERSON: 'Presencial', VIRTUAL: 'Virtual', HYBRID: 'Híbrido',
};

const RECORD_TYPE_LABEL: Record<string, string> = {
  INITIAL: 'Inicial', EVOLUTION: 'Evolución',
  DISCHARGE: 'Alta', INTERCONSULTATION: 'Interconsulta',
};

const CONSENT_SHORT: Record<string, string> = {
  TREATMENT: 'Tratamiento', DATA_PROCESSING: 'Datos',
  RECORDING: 'Grabación', INFORMATION_SHARING: 'Compartir info',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Timestamped name for a recovered-recording upload. Module-level so the
// clock read stays outside component render scope.
const recoveryFileName = (appointmentId: string) => `session-${appointmentId}-${Date.now()}.webm`;

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
  recordType: string;
  templateId?: string;
  sessionDate: string;
  processing?: boolean;
  linkedRecordId?: string;
  onDraftCreated: (draftId: string) => void;
}

function AudioSection({ appointmentId, patientId, draftId, recordType, templateId, sessionDate, processing, linkedRecordId, onDraftCreated }: AudioSectionProps) {
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

  // The session just ended and the recording is being saved/uploaded: show
  // an immediate "processing" state until the draft id exists.
  if (processing && !draftId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#e0f2fe', borderRadius: 10, border: '1px solid #bae6fd' }}>
        <Spinner size={18} color="#0369a1" />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>Procesando la grabación…</p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--s500)' }}>Transcribiendo el audio y preparando el borrador. Puede tardar unos minutos.</p>
        </div>
      </div>
    );
  }

  const handleFile = async (file: File) => {
    setUploading(true); setUploadErr('');
    try {
      const res = await appointmentsApi.uploadAudio(appointmentId, patientId, file, recordType, templateId);
      onDraftCreated(res.draft_id);
    } catch {
      setUploadErr('Error al subir el audio. Verifica el formato (mp3, wav, m4a).');
    } finally {
      setUploading(false);
    }
  };

  if (draftId && draft) {
    // A DRAFT_READY status only means the pipeline finished — it says nothing
    // about whether the AI actually found clinical content to structure. Check
    // the same way the draft page itself decides whether to show its "empty"
    // state, so the badge here never promises a draft that isn't there.
    const sections = (draft.draft_content_plain as Record<string, unknown> | null)?.sections as Record<string, string> | undefined;
    const isEmptyDraft = draft.status === 'DRAFT_READY'
      && (!sections || Object.values(sections).every(v => !(v ?? '').toString().trim()));

    const statusCfg: Record<string, { label: string; color: string; bg: string; pulse?: boolean }> = {
      PENDING:     { label: 'En cola',             color: CLR_NEUTRAL.icon, bg: CLR_NEUTRAL.bg },
      PROCESSING:  { label: 'Procesando',           color: CLR_PROC.text,    bg: CLR_PROC.bg, pulse: true },
      DRAFT_READY: { label: 'Listo para revisar',  color: CLR_SUCCESS.text, bg: CLR_SUCCESS.bg },
      APPROVED:    { label: 'Aprobado',             color: '#fff',           bg: CLR_SUCCESS.icon },
      ERROR:       { label: 'Error',                color: CLR_DANGER.text,  bg: CLR_DANGER.bg },
    };
    const cfg = isEmptyDraft
      ? { label: 'Sin contenido clínico', color: CLR_WARN.text, bg: CLR_WARN.bg }
      : (statusCfg[draft.status] ?? statusCfg.PENDING);
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
            {isEmptyDraft && <span style={{ fontSize: 11, color: 'var(--s400)' }}>La IA no encontró nada que estructurar — redacta manualmente.</span>}
          </div>
        </div>
        {(draft.status === 'DRAFT_READY' || draft.status === 'APPROVED') && (
          <a
            href={`/ai-drafts/${draftId}?appointment_id=${appointmentId}&session_date=${sessionDate}&record_type=${recordType}${linkedRecordId ? `&record_id=${linkedRecordId}` : ''}`}
            style={{ padding: '7px 14px', background: linkedRecordId ? 'var(--teal)' : isEmptyDraft ? 'var(--s400)' : '#f59e0b', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Brain size={13} /> {linkedRecordId ? 'Comparar con IA' : isEmptyDraft ? 'Redactar manualmente' : 'Revisar borrador'}
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
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f3f2fb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
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

// ─── Session timer ────────────────────────────────────────────────────────────

const WARN_MINUTES = 10;

// Counts DOWN the session duration from the moment "Iniciar sesión" was
// pressed (started_at) — not from the scheduled slot.
function SessionTimer({ startedAt, durationMin }: { startedAt: string; durationMin: number }) {
  const [now, setNow] = useState(() => Date.now());
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const start     = new Date(startedAt).getTime();
  const end       = start + durationMin * 60_000;
  const remainMin = Math.ceil((end - now) / 60_000);
  const over      = remainMin <= 0;
  const warn      = !over && remainMin <= WARN_MINUTES;

  const bg     = over ? '#fee2e2' : warn ? '#fef3c7' : '#f3f2fb';
  const border = over ? '#fca5a5' : warn ? '#fcd34d' : '#a9a3e0';
  const color  = over ? '#991b1b' : warn ? '#92400e' : '#2a2769';

  const mmss = (() => {
    const totalSec = Math.max(0, Math.floor((end - now) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  })();

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
      background: bg, border: `1.5px solid ${border}`, color,
      animation: (warn || over) && !prefersReducedMotion ? 'pulse 2s infinite' : undefined,
    }}>
      <Clock size={14} />
      {over
        ? `Tiempo cumplido (+${Math.abs(remainMin)} min)`
        : warn
        ? `Quedan ${mmss} min`
        : `En sesión · quedan ${mmss}`}
    </span>
  );
}

// Recording indicator with a live mic-level meter: five bars that react to
// the actual audio coming in, so the professional can confirm the mic is
// capturing — not just that recording "started".
function RecChip({ startMs, analyser, paused }: { startMs: number; analyser: AnalyserNode | null; paused: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      // RMS deviation from the 128 midpoint → 0..1 loudness
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  const sec = Math.max(0, Math.floor((now - startMs) / 1000));
  const mmss = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const bars = [0.15, 0.4, 0.7, 0.4, 0.15]; // per-bar sensitivity thresholds

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 14px',
      borderRadius: 9, fontSize: 13, fontWeight: 700,
      background: paused ? '#fef3c7' : '#fee2e2',
      border: `1.5px solid ${paused ? '#fcd34d' : '#fca5a5'}`,
      color: paused ? '#92400e' : '#991b1b',
    }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: paused ? '#d97706' : '#dc2626', animation: (!paused && !prefersReducedMotion) ? 'pulse 1.5s infinite' : undefined }} />
      {!paused && (
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
          {bars.map((thr, i) => {
            const active = level > thr;
            const h = active ? 4 + Math.round(level * 12) : 3;
            return <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: active ? '#dc2626' : '#fca5a5', transition: 'height .08s, background .08s' }} />;
          })}
        </span>
      )}
      {paused ? `En pausa · ${mmss}` : `Grabando · ${mmss}`}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const compactLayout = useIsCompact();
  const rawNavigate = useNavigate();
  const { user } = useAuth();
  const pureAdmin = isPureAdmin(user?.roles);
  const queryClient = useQueryClient();

  const [statusLoading, setStatusLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [statusErr, setStatusErr] = useState('');
  const [lastStatus, setLastStatus] = useState<AppointmentStatus | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reagendarOpen,  setReagendarOpen]  = useState(false);
  const [reagendaring,   setReagendaring]   = useState(false);
  const [reagendarErr,   setReagendarErr]   = useState('');
  const [showRecordForm, setShowRecordForm] = useState(false);
  // Session setup step: professional chooses type + format BEFORE opening the form
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupType, setSetupType] = useState<UIRecordType | null>(null);
  const [setupTemplateId, setSetupTemplateId] = useState<string>('');
  // When true, the edit modal is open and closing it after saving starts the session
  const [completeDataOpen, setCompleteDataOpen] = useState(false);
  const [signConsentOpen, setSignConsentOpen] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<Patient | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Justification set by "Registrar sesión pasada" — consumed by the record form.
  const lateReasonKey = `sghcp_late_reason_${id}`;
  const [lateReason] = useState(() => sessionStorage.getItem(lateReasonKey) ?? '');

  // draft_id stored per appointment in localStorage
  const draftKey = `sghcp_draft_${id}`;
  const [draftId, setDraftId] = useState(() => localStorage.getItem(draftKey) ?? '');

  // The record type the professional is actively filling — drives which format
  // the session recording / AI draft targets. Set by RecordForm via onTypeChange.
  const [selectedRecordType, setSelectedRecordType] = useState<RecordType | null>(null);
  // Template ID selected in RecordForm (undefined = integrated format)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();

  const { data: appt, isLoading, isError } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => appointmentsApi.get(id!),
    enabled: !!id,
  });

  // ── Session recorder ──────────────────────────────────────────────────────
  // Recording starts automatically with the session (RECORDING consent
  // required), stops at "Finalizar sesión" and uploads to the AI pipeline.
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Set once the professional confirms "Salir de todos modos" so the
  // back-button trap below stops re-arming itself on the exit's own
  // history.go() — otherwise the confirmed exit's popstate re-triggers the
  // same trap and the modal reopens, leaving the user stuck on the page.
  const exitingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [blockTarget, setBlockTarget] = useState<string | number | null>(null);
  const [recPaused, setRecPaused] = useState(false);
  const [recStart, setRecStart] = useState(0);
  const [recNote, setRecNote] = useState('');
  const [savedWhileRecording, setSavedWhileRecording] = useState(false);
  const [micError, setMicError] = useState('');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // true between "Finalizar sesión" and the draft appearing — drives the
  // "procesando grabación" feedback instead of the upload dropzone
  const [processingAudio, setProcessingAudio] = useState(false);
  // Chunks recovered from IndexedDB after a page refresh mid-recording
  const [recoveredChunks, setRecoveredChunks] = useState<Blob[]>([]);
  const [uploadingRecovery, setUploadingRecovery] = useState(false);

  const teardownAudio = () => {
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setAnalyser(null);
  };

  const startRecording = async () => {
    if (mediaRef.current) return;
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          recordingStore.appendChunk(id!, e.data).catch(() => {});
        }
      };
      rec.start(1000);
      mediaRef.current = rec;

      // Live level meter so the user can see the mic is actually capturing
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        audioCtxRef.current = ctx;
        setAnalyser(an);
      } catch { /* meter is best-effort */ }

      setRecording(true);
      setRecPaused(false);
      setRecStart(Date.now());
      setRecNote('');
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMicError('El navegador bloqueó el micrófono. En la barra de direcciones, busca el ícono de seguridad y selecciona "Permitir micrófono", luego usa el botón Reintentar.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setMicError('No se detectó ningún micrófono. Conecta uno e intenta de nuevo con el botón Reintentar.');
      } else if (name === 'SecurityError') {
        setMicError('El navegador requiere HTTPS para acceder al micrófono. Asegúrate de estar en https://...');
      } else {
        setMicError('No se pudo acceder al micrófono. Puedes subir el audio manualmente al finalizar la sesión.');
      }
    }
  };

  const pauseRecording = () => {
    const rec = mediaRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.pause();
    setRecPaused(true);
  };

  const resumeRecording = () => {
    const rec = mediaRef.current;
    if (!rec || rec.state !== 'paused') return;
    rec.resume();
    setRecPaused(false);
  };

  const stopRecording = (): Promise<File | null> => new Promise(resolve => {
    const rec = mediaRef.current;
    if (!rec) { resolve(null); return; }
    rec.onstop = () => {
      rec.stream.getTracks().forEach(t => t.stop());
      mediaRef.current = null;
      teardownAudio();
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      chunksRef.current = [];
      resolve(blob.size > 0 ? new File([blob], `session-${id}-${Date.now()}.webm`, { type: blob.type || 'audio/webm' }) : null);
    };
    rec.stop();
  });

  const navigate = (to: string | number, opts?: NavigateOptions) => {
    const path = typeof to === 'string' ? to : '';
    if (recording && !path.startsWith('/clinical-records/')) { setBlockTarget(to); return; }
    if (typeof to === 'number') rawNavigate(to);
    else rawNavigate(to, opts);
  };

  // Intercept browser back/forward and <Link>/<a> clicks while recording
  useEffect(() => {
    if (!recording) return;
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      if (exitingRef.current) return; // confirmed exit unwinding — let it through
      window.history.pushState(null, '', window.location.href);
      setBlockTarget(-1);
    };
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('/clinical-records/') || href.startsWith('#') || !href.startsWith('/')) return;
      e.preventDefault();
      e.stopPropagation();
      setBlockTarget(href);
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, [recording]);

  // Releases the mic if the user navigates away mid-recording
  useEffect(() => () => {
    const rec = mediaRef.current;
    if (rec) {
      rec.stream.getTracks().forEach(t => t.stop());
      mediaRef.current = null;
    }
    teardownAudio();
  }, []);

  // Recover audio chunks saved to IndexedDB from a previous recording that was
  // interrupted by a page refresh.
  useEffect(() => {
    if (!id) return;
    recordingStore.load(id).then(chunks => {
      if (chunks.length > 0) setRecoveredChunks(chunks);
    }).catch(() => {});
  }, [id]);

  // Warn the user before reloading while a recording is in progress.
  useEffect(() => {
    if (!recording) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [recording]);

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

  const { data: orgUsers = [] } = useQuery({
    queryKey: ['org-users'],
    queryFn: () => authApi.listOrgUsers().then(r => r.items),
    staleTime: 5 * 60_000,
  });

  // Draft linked to this appointment (for mutual-exclusion check)
  const { data: linkedDraft } = useQuery({
    queryKey: ['ai-draft', draftId],
    queryFn: () => aiDraftsApi.get(draftId),
    enabled: !!draftId,
    staleTime: 10_000,
  });

  // All templates fetched once when setup opens — unified format picker
  const { data: setupTemplates = [] } = useQuery({
    queryKey: ['record-templates-all'],
    queryFn: () => recordTemplatesApi.list(),
    enabled: setupOpen,
    staleTime: 60_000,
  });

  // Session-level persistence: survives F5 while the appointment is IN_PROGRESS,
  // and also survives leaving to review the AI draft (/ai-drafts/:id) and
  // coming back — the session is COMPLETED by then, but as long as nothing
  // was finalized yet the format/content already chosen should still be
  // there instead of asking to pick a format again.
  // Uses localStorage (not sessionStorage) so it also survives opening the
  // appointment in a new tab/window — sessionStorage is tab-scoped, so a new
  // tab would show the format picker again even though the actual draft
  // content (also in localStorage) is still there.
  const setupKey = `sghcp_sess_${id}`;
  useEffect(() => {
    if (!appt) return;
    const hasFinalizedNote = (recordsData?.items ?? []).some(r => r.appointment_id === id && r.finalized !== false);
    const canResume = appt.status === 'IN_PROGRESS' || (appt.status === 'COMPLETED' && !hasFinalizedNote);
    if (!canResume) return;
    try {
      const raw = localStorage.getItem(setupKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.setupType) {
        setSetupType(s.setupType as UIRecordType);
        setSetupTemplateId(s.setupTemplateId ?? '');
        if (s.showRecordForm) setShowRecordForm(true);
      }
    } catch { /* corrupt entry — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.status, setupKey, recordsData, id]);

  // Write session state whenever the form/setup changes.
  useEffect(() => {
    if (!id || (!showRecordForm && !setupOpen)) return;
    try {
      localStorage.setItem(setupKey, JSON.stringify({ setupType, setupTemplateId, showRecordForm }));
    } catch { /* storage full */ }
  }, [showRecordForm, setupOpen, setupType, setupTemplateId, id, setupKey]);
  const staffMember = orgUsers.find(u => u.id === appt?.staff_id);
  const staffName = staffMember?.display_name ?? staffMember?.email ?? null;
  const activeConsents = (consentsData?.items ?? []).filter(c => !c.revoked_at);
  const treatmentConsent = activeConsents.find(c => c.consent_type === 'TREATMENT');
  const [viewConsentId, setViewConsentId] = useState<string | null>(null);

  // Open process = a finalized INITIAL more recent than the last finalized
  // DISCHARGE. Only finalized records count — same rule the server enforces
  // (GetProcessDates) — so a started-and-abandoned autosave draft can never
  // permanently fake-open or fake-close a patient's process.
  const allRecords = (recordsData?.items ?? []).filter(r => r.finalized !== false);
  const lastInitial   = allRecords.filter(r => r.record_type === 'INITIAL').map(r => r.session_date).sort().pop();
  const lastDischarge = allRecords.filter(r => r.record_type === 'DISCHARGE').map(r => r.session_date).sort().pop();
  const hasOpenProcess = !!lastInitial && (!lastDischarge || lastInitial > lastDischarge);
  const defaultRecordType = hasOpenProcess ? 'EVOLUTION' as const : 'INITIAL' as const;
  // What the audio recording / AI draft targets: the type the professional is
  // actively filling (RecordForm), falling back to the inferred default.
  const aiRecordType: RecordType = selectedRecordType ?? defaultRecordType;
  // Template for the AI draft: the one the form reports, falling back to the
  // session-setup choice — the professional may record without ever opening
  // the form, and losing the template here would make the AI generate (and
  // the review page render) the wrong format.
  const aiTemplateId = selectedTemplateId ?? (setupTemplateId || undefined);

  // Records linked to this appointment
  const linkedRecords: RecordMeta[] = (recordsData?.items ?? []).filter(r => r.appointment_id === id);
  // finalizedRecords are real, authored notes — everything that today's UI
  // logic (gating, lists, mutual exclusion) should treat as "a note exists".
  // autosaveDraft is the one not-yet-finalized scratch row (if any) for this
  // appointment — used only to resume the form / pass to RecordForm so it can
  // recover server-side content on a fresh device.
  const finalizedRecords = linkedRecords.filter(r => r.finalized !== false);
  const autosaveDraft = linkedRecords.find(r => r.finalized === false && r.status === 'DRAFT');
  // Mutual exclusion: an APPROVED manual record blocks new AI draft; an APPROVED AI draft blocks new manual record.
  const hasApprovedRecord = finalizedRecords.some(r => r.status === 'APPROVED');
  const hasApprovedDraft = linkedDraft?.status === 'APPROVED';

  // Resume straight into the editor when there's an unfinalized autosave
  // draft and no finalized note yet — covers a fresh device/browser where
  // the local setup-state (sghcp_sess_${id}) isn't available, but the
  // server-side draft still has the content. The exact UI type (e.g.
  // PLAN vs EVOLUTION) gets corrected moments later by RecordForm's own
  // restore-from-server effect; this only needs to get the form open.
  // Also applies once COMPLETED (not just IN_PROGRESS): coming back from the
  // AI-draft review page shouldn't re-prompt for a format when nothing was
  // finalized yet — finalizedRecords.length > 0 below already excludes the
  // case where a note (manual or approved draft) already exists.
  useEffect(() => {
    if (appt?.status !== 'IN_PROGRESS' && appt?.status !== 'COMPLETED') return;
    if (!autosaveDraft || finalizedRecords.length > 0) return;
    if (showRecordForm || setupOpen) return;
    setSetupType(autosaveDraft.record_type as UIRecordType);
    setSetupTemplateId(autosaveDraft.template_id ?? '');
    setShowRecordForm(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.status, autosaveDraft?.id, finalizedRecords.length]);

  const handleStatusChange = async (status: AppointmentStatus) => {
    if (!id) return;
    setLastStatus(status);
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

  const recordingConsent = activeConsents.some(c => c.consent_type === 'RECORDING');

  const handleStartSession = async () => {
    // Request mic permission before the session starts so the browser dialog
    // appears while the professional can still react — not mid-session.
    if (recordingConsent) await startRecording();
    await handleStatusChange('IN_PROGRESS');
  };

  const handleFinishSession = async () => {
    const wasRecording = !!mediaRef.current;
    if (wasRecording) setProcessingAudio(true);
    const audio = await stopRecording();
    await handleStatusChange('COMPLETED');
    if (audio && appt?.patient_id) {
      try {
        const res = await appointmentsApi.uploadAudio(id!, appt.patient_id, audio, aiRecordType, aiTemplateId);
        handleDraftCreated(res.draft_id);
        recordingStore.clear(id!).catch(() => {});
        setRecoveredChunks([]);
      } catch {
        setProcessingAudio(false);
        setRecNote('La grabación terminó pero no se pudo subir. Haz clic en "Subir grabación" para reintentar.');
        // The IndexedDB chunks are intact (cleared only on success). Reload them so
        // the recovery banner appears immediately without requiring a page refresh.
        recordingStore.load(id!).then(chunks => {
          if (chunks.length > 0) setRecoveredChunks(chunks);
        }).catch(() => {});
      }
    } else {
      setProcessingAudio(false);
    }
  };

  const handleUploadRecovery = async () => {
    if (!appt?.patient_id || recoveredChunks.length === 0) return;
    setUploadingRecovery(true);
    try {
      const blob = new Blob(recoveredChunks, { type: 'audio/webm' });
      const file = new File([blob], recoveryFileName(id!), { type: 'audio/webm' });
      const res = await appointmentsApi.uploadAudio(id!, appt.patient_id, file, aiRecordType, aiTemplateId);
      handleDraftCreated(res.draft_id);
      recordingStore.clear(id!).catch(() => {});
      setRecoveredChunks([]);
    } catch {
      setRecNote('No se pudo subir la grabación recuperada — intenta de nuevo.');
    } finally {
      setUploadingRecovery(false);
    }
  };

  const handleDiscardRecovery = () => {
    recordingStore.clear(id!).catch(() => {});
    setRecoveredChunks([]);
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
    // Wake the topbar indicator right away — its own poll is slow when idle.
    queryClient.invalidateQueries({ queryKey: ['ai-drafts-indicator'] });
  };

  const tzOffset = () => {
    const off = new Date().getTimezoneOffset();
    const sign = off <= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  };

  const handleReagendar = async (date: string, time: string) => {
    setReagendaring(true); setReagendarErr('');
    try {
      await appointmentsApi.create({
        patient_id:   appt!.patient_id || undefined,
        guest_name:   isGuest ? (appt!.guest_name ?? undefined) : undefined,
        staff_id:     user!.user_id,
        scheduled_at: `${date}T${time}:00${tzOffset()}`,
        duration_min: appt!.duration_min,
        modality:     appt!.modality,
      });
      await appointmentsApi.cancel(id!, 'Reagendado');
      navigate('/');
    } catch (e) {
      setReagendarErr(e instanceof ApiError && e.status === 409
        ? 'Ese horario tiene una reserva pendiente de pago. Quedará libre cuando venza el plazo.'
        : 'No se pudo reagendar. Intenta de nuevo.');
      setReagendaring(false);
    }
  };

  const openSetup = () => {
    setSetupType(defaultRecordType);
    setSetupTemplateId('');
    setSetupOpen(true);
    setShowRecordForm(false);
  };

  const confirmSetup = () => {
    setSetupOpen(false);
    setShowRecordForm(true);
  };

  const handleRecordSaved = async () => {
    sessionStorage.removeItem(lateReasonKey);
    try { localStorage.removeItem(setupKey); } catch { /* ignore */ }
    await refetchRecords();
    queryClient.invalidateQueries({ queryKey: ['clinical-records', 'patient', appt?.patient_id] });
    setShowRecordForm(false);
    setSetupOpen(false);
    setSetupType(null);
    setSetupTemplateId('');
    if (recording) setSavedWhileRecording(true);
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
  // Grace window: the note can be written during the session or right after
  // finishing it (next patient may be waiting) — no "extemporáneo" flag here.
  const canWriteNote = isInProgress || (appt.status === 'COMPLETED' && finalizedRecords.length === 0);
  // The note carries the real session date, not the writing date.
  const apptDate = (() => {
    const d = new Date(appt.scheduled_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isGuest = !appt.patient_id;

  const patientName = patient
    ? [patient.first_name, patient.middle_name, patient.paternal_last_name, patient.maternal_last_name].filter(Boolean).join(' ')
    : appt.guest_name || appt.patient_id.slice(0, 8);

  const patientInitials = patient
    ? ((patient.first_name?.[0] ?? '') + (patient.paternal_last_name?.[0] ?? '')).toUpperCase()
    : (appt.guest_name?.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');

  const patientAge = calcAge(patient?.birth_date);
  // A session can only start on the day of the appointment — future
  // appointments show their data but the encounter hasn't happened yet.
  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isFutureDay = apptDate > todayISO;
  // Hard gates before a clinical session can start (Res. 1995/1999 + consent law)
  const canStartSession = !!patient && !!treatmentConsent && !isFutureDay;

  // Writing mode = the clinical record is the screen's primary work surface:
  // the session is in progress, or it just finished and the note is still
  // pending. The layout flips to a focused workspace (record protagonist +
  // recap/AI as a supporting sidebar) instead of the metadata-first header.
  const writingMode = !isGuest && !!appt.patient_id && canWriteNote;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: compactLayout ? '16px 12px' : '24px 24px 40px' }}>
      {writingMode ? (
        <>
          {/* ── Barra de sesión compacta (sticky) ─────────────────────────── */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--s50)', paddingTop: 4, paddingBottom: 12, marginBottom: 4 }}>
            <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 4px 16px rgba(15,23,42,.08)' }}>
              <button
                onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
                aria-label="Volver"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', padding: 8, minWidth: 40, minHeight: 40, flexShrink: 0 }}
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--teal-d))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {patientInitials}
              </div>
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--s800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{patientName}</span>
                  <Badge label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--s400)' }}>{time} · {appt.duration_min} min · {MODALITY_LABEL[appt.modality] ?? appt.modality}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {isInProgress && <SessionTimer startedAt={appt.started_at ?? appt.scheduled_at} durationMin={appt.duration_min} />}
                {isInProgress && recording && <RecChip startMs={recStart} analyser={analyser} paused={recPaused} />}
                {isInProgress && !pureAdmin && recordingConsent && recording && !recPaused && (
                  <button onClick={pauseRecording} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#92400e', border: '1.5px solid #fcd34d', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <Pause size={13} /> Pausar
                  </button>
                )}
                {isInProgress && !pureAdmin && recordingConsent && recording && recPaused && (
                  <button onClick={resumeRecording} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <Mic size={13} /> Reanudar
                  </button>
                )}
                {isInProgress && !pureAdmin && recordingConsent && !recording && (
                  <button onClick={startRecording} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {micError ? <RotateCcw size={13} /> : <Mic size={13} />}
                    {micError ? 'Reintentar' : 'Grabar'}
                  </button>
                )}
                {isInProgress && !pureAdmin && (
                  <button
                    onClick={handleFinishSession}
                    disabled={statusLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: statusLoading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: statusLoading ? 0.7 : 1 }}
                  >
                    {statusLoading ? <Spinner size={15} color="#fff" /> : <CheckCircle2 size={15} />}
                    Finalizar sesión
                  </button>
                )}
                {!isInProgress && !pureAdmin && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 12px' }}>
                    <AlertTriangle size={13} /> Sesión finalizada — registra la nota
                  </span>
                )}
              </div>
            </div>

            {statusErr && (
              <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8 }}>
                <AlertTriangle size={14} color="#dc2626" />
                <span style={{ fontSize: 13, color: '#991b1b', flex: 1 }}>{statusErr}</span>
                {lastStatus && (
                  <button onClick={() => handleStatusChange(lastStatus)} disabled={statusLoading} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', minHeight: 32, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Reintentar
                  </button>
                )}
              </div>
            )}
            {micError && (
              <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, fontSize: 13, color: '#9a3412' }}>
                <MicOff size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 700 }}>Sin acceso al micrófono — la sesión no se está grabando</p>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{micError}</p>
                </div>
              </div>
            )}
            {recNote && (
              <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12.5, color: '#92400e' }}>
                <AlertTriangle size={13} /> {recNote}
              </div>
            )}
            {savedWhileRecording && recording && (
              <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, fontSize: 13, color: '#78350f' }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Registro guardado. La grabación <strong>sigue activa</strong> — usa <strong>Finalizar sesión</strong> para enviar el audio a la IA.</span>
                <button onClick={() => setSavedWhileRecording(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', padding: '2px 6px', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}
            {recoveredChunks.length > 0 && !recording && !pureAdmin && (
              <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 9, fontSize: 13, color: '#713f12' }}>
                <Mic size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Hay una grabación sin finalizar de esta sesión (interrumpida por recarga).</span>
                <button
                  onClick={handleUploadRecovery}
                  disabled={uploadingRecovery}
                  style={{ padding: '5px 12px', background: '#ca8a04', color: '#fff', border: 'none', borderRadius: 6, cursor: uploadingRecovery ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {uploadingRecovery ? 'Subiendo…' : 'Subir grabación'}
                </button>
                <button
                  onClick={handleDiscardRecovery}
                  style={{ padding: '5px 10px', background: 'none', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Descartar
                </button>
              </div>
            )}
          </div>

          {/* ── I. Datos de identificación (encabezado del registro, ancho completo) ──
              Es la Sección I del formato clínico — no metadata: el RecordForm de
              Apertura arranca en "II", esta franja la antecede horizontalmente. */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>I. Datos de identificación</span>
                {patient?.patient_code != null && (
                  <span title="Número de historia clínica" style={{ fontFamily: "'DM Mono',monospace", fontSize: 11.5, fontWeight: 700, color: 'var(--teal-d)', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 6, padding: '3px 8px' }}>
                    HC-{String(patient.patient_code).padStart(6, '0')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {activeConsents.length > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, background: '#d1fae5', color: '#065f46' }}>
                    <CheckCircle2 size={12} /> Consentimiento:
                    {activeConsents.map(c => (
                      <button key={c.id} onClick={() => setViewConsentId(c.id)} title={`Firmado el ${c.signed_at} — ver documento`} style={{ border: 'none', background: 'none', color: '#065f46', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, textDecoration: 'underline', padding: 0 }}>
                        {CONSENT_SHORT[c.consent_type] ?? c.consent_type}
                      </button>
                    ))}
                  </span>
                ) : (
                  <button onClick={() => setSignConsentOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, background: '#fef3c7', color: '#92400e', border: 'none', cursor: 'pointer' }}>
                    <AlertTriangle size={12} /> Consentimiento: No — firmar
                  </button>
                )}
                <button onClick={() => navigate(`/patients/${appt.patient_id}`)} style={{ padding: '5px 11px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={11} /> Ver perfil
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 18px' }}>
              <IdField label="Nombre completo" value={patientName} />
              {patient?.document_number && <IdField label="Documento" value={`${patient.document_type_code ?? ''} ${patient.document_number}`.trim()} />}
              {patientAge !== null && <IdField label="Edad" value={`${patientAge} años`} />}
              {patient?.birth_date && <IdField label="F. nacimiento" value={fmtDateOnly(patient.birth_date, { day: '2-digit', month: '2-digit', year: 'numeric' })} />}
              {patient?.gender && <IdField label="Género" value={patient.gender} />}
              {patient?.marital_status && <IdField label="Estado civil" value={patient.marital_status} />}
              {patient?.education && <IdField label="Escolaridad" value={patient.education} />}
              {patient?.occupation && <IdField label="Ocupación" value={patient.occupation} />}
              {patient?.phone && <IdField label="Teléfono" value={patient.phone} />}
              {(patient?.emergency_contact_name || patient?.emergency_contact_phone) && (
                <IdField label="Contacto emergencia" value={[patient.emergency_contact_name, patient.emergency_contact_relationship, patient.emergency_contact_phone].filter(Boolean).join(' · ')} />
              )}
              {patient?.opened_at && <IdField label="Fecha de apertura" value={new Date(patient.opened_at + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })} />}
            </div>
          </div>

          {/* ── Workspace: registro clínico (protagonista) + apoyo lateral ── */}
          <div style={{ display: 'grid', gridTemplateColumns: compactLayout ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 360px', gap: 20, alignItems: 'start' }}>
            {/* MAIN — el registro clínico es el foco */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f3f2fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color="var(--teal)" />
                  </div>
                  <div>
                    <h1 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: 'var(--s800)' }}>Registro clínico</h1>
                    <span style={{ fontSize: 12, color: 'var(--s400)' }}>
                      {setupOpen ? '¿Qué formato vas a registrar?' : showRecordForm ? `${RECORD_TYPE_LABEL[setupType ?? defaultRecordType] ?? (setupType ?? defaultRecordType)}${setupTemplateId && setupTemplates.find(t => t.id === setupTemplateId) ? ` — ${setupTemplates.find(t => t.id === setupTemplateId)!.name}` : ''}` : isInProgress ? 'Sesión en curso — registra la nota' : 'Sesión finalizada — registra la nota con la fecha real de la sesión'}
                    </span>
                  </div>
                </div>
                {showRecordForm && (
                  <button
                    type="button"
                    onClick={() => {
                      const draftKey = `clinical-draft-${id}`;
                      const hasDraft = (() => { try { return !!localStorage.getItem(draftKey); } catch { return false; } })();
                      if (hasDraft && !confirm('¿Cambiar formato? El contenido que hayas escrito se perderá.')) return;
                      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
                      setShowRecordForm(false);
                      setSetupOpen(true);
                    }}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Cambiar formato
                  </button>
                )}
              </div>
              {lateReason && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 9, padding: '10px 14px', fontSize: 12.5, color: '#92400e' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span><b>Registro extemporáneo</b> — motivo: {lateReason}. Quedará declarado en la historia y en el PDF.</span>
                </div>
              )}

              {/* Format picker — shown on first session start or when changing format */}
              {setupOpen ? (
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {([
                      { type: 'INITIAL' as UIRecordType, label: 'Apertura', desc: 'Historia clínica inicial del proceso' },
                      { type: 'EVOLUTION' as UIRecordType, label: 'Evolución', desc: 'Nota de sesión de seguimiento' },
                      { type: 'PLAN' as UIRecordType, label: 'Plan TCC', desc: 'Plan terapéutico estructurado' },
                      { type: 'DISCHARGE' as UIRecordType, label: 'Alta', desc: 'Cierre y egreso del proceso' },
                    ].filter(f => {
                      const allowed: UIRecordType[] = hasOpenProcess === undefined ? ['INITIAL','PLAN','EVOLUTION','DISCHARGE'] : hasOpenProcess ? ['PLAN','EVOLUTION','DISCHARGE'] : ['INITIAL'];
                      return allowed.includes(f.type);
                    })).map(f => (
                      <button key={f.type} type="button"
                        onClick={() => { setSetupType(f.type); setSetupTemplateId(''); confirmSetup(); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s' }}
                        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--teal)'; (e.currentTarget as HTMLButtonElement).style.background = '#f3f2fb'; }}
                        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--s200)'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{f.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{f.desc}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal-d, var(--teal))', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>integrado</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : showRecordForm ? (
                <RecordForm patientId={appt.patient_id} appointmentId={id!} defaultType={setupType ? (setupType === 'PLAN' ? 'EVOLUTION' : setupType as RecordType) : defaultRecordType} lockedTemplateId={setupType !== null ? setupTemplateId : undefined} sessionDate={apptDate} lateEntryReason={lateReason || undefined} treatmentConsentSigned={!!treatmentConsent} hasOpenProcess={hasOpenProcess} existingDraftId={autosaveDraft?.id} onTypeChange={setSelectedRecordType} onTemplateChange={setSelectedTemplateId} onSaved={handleRecordSaved} />
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '40px 0' }}>
                  <FileText size={32} color="var(--s200)" style={{ marginBottom: 12 }} />
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--s500)' }}>Elige el formato para comenzar el registro</p>
                  <button onClick={openSetup} style={{ padding: '10px 22px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <FileText size={14} /> Elegir formato
                  </button>
                </div>
              )}
            </div>

            {/* ASIDE — recap + borrador IA como apoyo (sticky en desktop) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: compactLayout ? 'static' : 'sticky', top: 84 }}>
              <RiskBanner patientId={appt.patient_id} />
              <RecapCard patientId={appt.patient_id} />
              {(canWriteNote || !!draftId) && (
                <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Brain size={16} color="#f59e0b" />
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--s800)', display: 'block' }}>Borrador IA</span>
                      <span style={{ fontSize: 11, color: 'var(--s400)' }}>Audio → transcripción → borrador</span>
                    </div>
                  </div>
                  {hasApprovedRecord ? (
                    <div style={{ fontSize: 12, color: '#065f46', background: '#d1fae5', borderRadius: 8, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={13} /> Registro clínico aprobado — no se pueden agregar borradores IA a esta sesión.
                    </div>
                  ) : (
                    <AudioSection
                      appointmentId={id!}
                      patientId={appt.patient_id}
                      draftId={draftId}
                      recordType={aiRecordType}
                      templateId={aiTemplateId}
                      sessionDate={apptDate}
                      processing={processingAudio}
                      // The comparison view finalizes THIS record, so it must be
                      // the in-progress autosave draft (status DRAFT) — finalizing
                      // an already-finalized note is rejected by the backend.
                      linkedRecordId={autosaveDraft?.id}
                      onDraftCreated={handleDraftCreated}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
       <>
      {/* Back */}
      <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, marginBottom: 24, padding: '10px 8px 10px 0', minHeight: 44 }}>
        <ArrowLeft size={16} /> Volver
      </button>

      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>

        {/* ── Bloque 1: Datos del sujeto ──────────────────────────────────────── */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--s100)', marginBottom: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Datos del sujeto</p>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal), var(--teal-d))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {patientInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--s800)' }}>{patientName}</h1>
                <Badge label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />
                {isGuest && <Badge label="Reserva — sin paciente" color="#92400e" bg="#fef3c7" />}
                {appt.paid && <Badge label="Pagada" color="#3e6b4e" bg="#e8f2ec" />}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {patient && patientAge !== null && <InfoChip icon={<Cake size={13} />} text={`${patientAge} años`} />}
                {patient?.document_number && <InfoChip icon={<CreditCard size={13} />} text={`${patient.document_type_code ?? ''} ${patient.document_number}`.trim()} />}
                {patient?.phone && <InfoChip icon={<Phone size={13} />} text={patient.phone} />}
              </div>
            </div>
            {!isGuest && (
              <button
                onClick={() => navigate(`/patients/${appt.patient_id}`)}
                style={{ padding: '7px 13px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <User size={12} /> Ver perfil
              </button>
            )}
          </div>
        </div>

        {/* ── Bloque 2: Datos de la cita ──────────────────────────────────────── */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--s100)', marginBottom: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Datos de la cita</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <InfoChip icon={<Calendar size={13} />} text={date} />
            <InfoChip icon={<Clock size={13} />} text={`${time} · ${appt.duration_min} min`} />
            <InfoChip
              icon={isVirtual ? <Video size={13} /> : <MapPin size={13} />}
              text={MODALITY_LABEL[appt.modality] ?? appt.modality}
              color={isVirtual ? '#5b52ad' : undefined}
            />
            {(staffName || user) && <InfoChip icon={<User size={13} />} text={staffName ?? user?.display_name ?? user?.email ?? 'Terapeuta'} />}
            {appt.paid && (
              <InfoChip
                icon={<Wallet size={13} />}
                text={`$${(appt.paid_amount ?? 0).toLocaleString('es-CO')} ${appt.paid_currency || 'COP'}${appt.payment_ref ? ` · MP #${appt.payment_ref}` : ''}`}
                color="#3e6b4e"
              />
            )}
          </div>
        </div>

        {/* ── Bloque 3: Consentimiento ─────────────────────────────────────────── */}
        {!isGuest && (
          <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--s100)', marginBottom: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Consentimiento</p>
            {activeConsents.length > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, background: '#d1fae5', color: '#065f46' }}>
                <CheckCircle2 size={13} /> Firmados:
                {activeConsents.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setViewConsentId(c.id)}
                    title={`Firmado el ${c.signed_at} — ver documento`}
                    style={{ border: 'none', background: 'none', color: '#065f46', cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'underline', padding: '6px 4px', minHeight: 36 }}
                  >
                    {CONSENT_SHORT[c.consent_type] ?? c.consent_type}
                  </button>
                ))}
              </span>
            ) : (
              <button
                onClick={() => setSignConsentOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, background: '#fef3c7', color: '#92400e', border: 'none', cursor: 'pointer' }}
              >
                <AlertTriangle size={13} /> Sin consentimiento — firmar aquí
              </button>
            )}
          </div>
        )}

        {statusErr && (
          <div role="alert" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8 }}>
            <AlertTriangle size={14} color="#dc2626" />
            <span style={{ fontSize: 13, color: '#991b1b', flex: 1 }}>{statusErr}</span>
            {lastStatus && (
              <button
                onClick={() => handleStatusChange(lastStatus)}
                disabled={statusLoading}
                style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', minHeight: 32, borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        {/* ── Guest reservation: associate the patient before anything else ──── */}
        {isActive && isGuest && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--s100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <UserPlus size={15} color="#92400e" />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>Asociar paciente</span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--s500)', lineHeight: 1.6 }}>
              Esta cita se reservó a nombre de <b>{appt.guest_name}</b> sin paciente registrado.
              Busca el paciente o regístralo para poder iniciar la sesión.
            </p>
            <div style={{ maxWidth: 420 }}>
              {pendingAssign ? (
                <div style={{ border: '1.5px solid #fcd34d', background: '#fffbeb', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--s700)', lineHeight: 1.5 }}>
                    ¿Asociar esta cita a <b>{[pendingAssign.first_name, pendingAssign.paternal_last_name].filter(Boolean).join(' ')}</b>
                    {pendingAssign.document_number ? ` (${pendingAssign.document_type_code} ${pendingAssign.document_number})` : ''}?
                    La reserva a nombre de "{appt.guest_name}" quedará a su nombre.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={assigning}
                      onClick={async () => {
                        setAssigning(true); setStatusErr('');
                        try {
                          await appointmentsApi.assignPatient(id!, pendingAssign.id);
                          await queryClient.invalidateQueries({ queryKey: ['appointment', id] });
                          setPendingAssign(null);
                        } catch {
                          setStatusErr('No se pudo asociar el paciente. Intenta de nuevo.');
                        } finally {
                          setAssigning(false);
                        }
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 8, cursor: assigning ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700 }}
                    >
                      {assigning ? <Spinner size={13} color="#fff" /> : <CheckCircle2 size={13} />} Confirmar asociación
                    </button>
                    <button
                      disabled={assigning}
                      onClick={() => setPendingAssign(null)}
                      style={{ padding: '8px 14px', background: '#fff', color: 'var(--s600)', border: '1.5px solid var(--s200)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <PatientSearchBox
                  selected={null}
                  onSelect={p => { if (p) setPendingAssign(p); }}
                  onNewPatient={() => navigate(`/patients/new?appointment_id=${id}`)}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Bloque 4: Acciones ──────────────────────────────────────────────── */}
        {isActive && (
          <>
            {isScheduled && !canStartSession && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 9, marginTop: 16, marginBottom: 4, fontSize: 13, color: '#92400e' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                {isFutureDay
                  ? `La sesión se puede iniciar el día de la cita (${date}).`
                  : isGuest
                  ? 'Asocia el paciente para poder iniciar la sesión.'
                  : 'El paciente debe firmar el consentimiento de tratamiento antes de iniciar.'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {isScheduled && !pureAdmin && (
              <button
                onClick={() => {
                  if (!canStartSession) return;
                  const missing = !patient?.document_number || !patient?.birth_date;
                  if (missing) { setCompleteDataOpen(true); }
                  else { handleStartSession(); openSetup(); }
                }}
                disabled={statusLoading || !canStartSession}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: canStartSession ? '#059669' : 'var(--s200)', color: canStartSession ? '#fff' : 'var(--s400)', border: 'none', borderRadius: 9, cursor: statusLoading || !canStartSession ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: statusLoading ? 0.7 : 1 }}
              >
                {statusLoading ? <Spinner size={15} color="#fff" /> : <Play size={15} />}
                Iniciar sesión
              </button>
            )}
            {isInProgress && <SessionTimer startedAt={appt.started_at ?? appt.scheduled_at} durationMin={appt.duration_min} />}
            {isInProgress && recording && <RecChip startMs={recStart} analyser={analyser} paused={recPaused} />}
            {isInProgress && !pureAdmin && recordingConsent && recording && !recPaused && (
              <button
                onClick={pauseRecording}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#92400e', border: '1.5px solid #fcd34d', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                <Pause size={13} /> Pausar
              </button>
            )}
            {isInProgress && !pureAdmin && recordingConsent && recording && recPaused && (
              <button
                onClick={resumeRecording}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                <Mic size={13} /> Reanudar
              </button>
            )}
            {isInProgress && !pureAdmin && recordingConsent && !recording && (
              <button
                onClick={startRecording}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: micError ? '#fff' : '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {micError ? <RotateCcw size={13} /> : <Mic size={13} />}
                {micError ? 'Reintentar' : 'Grabar'}
              </button>
            )}
            {isInProgress && !pureAdmin && (
              <button
                onClick={handleFinishSession}
                disabled={statusLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: statusLoading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: statusLoading ? 0.7 : 1 }}
              >
                {statusLoading ? <Spinner size={15} color="#fff" /> : <CheckCircle2 size={15} />}
                Finalizar sesión
              </button>
            )}
            {isScheduled && finalizedRecords.length === 0 && (
              <>
                <button
                  onClick={() => { setCancelOpen(v => !v); setReagendarOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                >
                  <X size={14} /> Cancelar
                </button>
                <button
                  onClick={() => { setReagendarOpen(v => !v); setCancelOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#fff', color: '#5b52ad', border: '1.5px solid #cbc7ee', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                >
                  <CalendarClock size={14} /> Reagendar
                </button>
              </>
            )}
            </div>
          </>
        )}

        {recNote && (
          <div role="alert" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12.5, color: '#92400e' }}>
            <AlertTriangle size={13} /> {recNote}
          </div>
        )}

        {micError && (
          <div role="alert" style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, fontSize: 13, color: '#9a3412' }}>
            <MicOff size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700 }}>Sin acceso al micrófono — la sesión no se está grabando</p>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{micError}</p>
            </div>
          </div>
        )}

        {/* Cancel reason input */}
        {cancelOpen && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="cancel-reason" style={{ fontSize: 12, fontWeight: 600, color: 'var(--s600)', display: 'block', marginBottom: 4 }}>Motivo de cancelación</label>
              <input
                id="cancel-reason"
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

        {reagendarOpen && (
          <SlotPicker
            modality={appt.modality}
            onConfirm={handleReagendar}
            onClose={() => { setReagendarOpen(false); setReagendarErr(''); }}
            confirming={reagendaring}
            error={reagendarErr}
          />
        )}
      </div>

      {/* ── Recap pre-sesión + Borrador IA (columna lateral cuando aplica) ── */}
      {!isGuest && appt.patient_id && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: (canWriteNote || !!draftId) && !compactLayout ? 'minmax(0, 1fr) 380px' : 'minmax(0, 1fr)',
          gap: 20,
          marginBottom: 20,
          alignItems: 'start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <RiskBanner patientId={appt.patient_id} />
            <RecapCard patientId={appt.patient_id} />
          </div>
          {(canWriteNote || !!draftId) && (
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
              {hasApprovedRecord ? (
                <div style={{ fontSize: 12, color: '#065f46', background: '#d1fae5', borderRadius: 8, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={13} /> Registro clínico aprobado — no se pueden agregar borradores IA a esta sesión.
                </div>
              ) : (
                <AudioSection
                  appointmentId={id!}
                  patientId={appt.patient_id}
                  draftId={draftId}
                  recordType={aiRecordType}
                  templateId={aiTemplateId}
                  sessionDate={apptDate}
                  processing={processingAudio}
                  onDraftCreated={handleDraftCreated}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Historia clínica — ancho completo ────────────────────────────── */}
      <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#f3f2fb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={17} color="var(--teal)" />
            </div>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--s800)' }}>Historia clínica</span>
          </div>
          {finalizedRecords.length > 0 && !showRecordForm && !setupOpen && canWriteNote && !hasApprovedDraft && (
            <button
              onClick={openSetup}
              style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--teal)', background: '#f3f2fb', color: 'var(--teal)', cursor: 'pointer' }}
            >
              + Nuevo
            </button>
          )}
        </div>

        {finalizedRecords.length > 0 && !showRecordForm && !setupOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {finalizedRecords.map(rec => (
              <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--s50)', borderRadius: 10, border: '1px solid var(--s200)' }}>
                <FileText size={16} color="var(--teal)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>
                      {RECORD_TYPE_LABEL[rec.record_type] ?? rec.record_type}
                    </p>
                    {rec.session_number != null && (
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10.5, fontWeight: 700, color: 'var(--teal-d)', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 5, padding: '1px 6px' }}>
                        #{rec.session_number}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)' }}>{rec.session_date}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: rec.status === 'APPROVED' ? '#d1fae5' : '#fef3c7', color: rec.status === 'APPROVED' ? '#065f46' : '#92400e' }}>
                  {rec.status === 'APPROVED' ? 'Aprobado' : 'Borrador'}
                </span>
                <button
                  onClick={() => navigate(`/clinical-records/${rec.id}`)}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', minHeight: 36, borderRadius: 6, border: '1px solid var(--s200)', background: '#fff', color: 'var(--s700)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Ver
                </button>
              </div>
            ))}
            {hasApprovedDraft && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={13} color="#f59e0b" /> Hay un borrador IA aprobado para esta sesión — no se puede crear un registro clínico adicional.
              </div>
            )}
          </div>
        ) : setupOpen ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s600)' }}>¿Qué formato vas a registrar?</span>
              <button aria-label="Cancelar" onClick={() => setSetupOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 6, minWidth: 32, minHeight: 32 }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Built-in formats — one card per type, filtered by process state */}
              {([
                { type: 'INITIAL' as UIRecordType, label: 'Apertura', desc: 'Historia clínica inicial del proceso' },
                { type: 'EVOLUTION' as UIRecordType, label: 'Evolución', desc: 'Nota de sesión de seguimiento' },
                { type: 'PLAN' as UIRecordType, label: 'Plan TCC', desc: 'Plan terapéutico estructurado' },
                { type: 'DISCHARGE' as UIRecordType, label: 'Alta', desc: 'Cierre y egreso del proceso' },
              ].filter(f => {
                const allowed: UIRecordType[] = hasOpenProcess === undefined ? ['INITIAL','PLAN','EVOLUTION','DISCHARGE'] : hasOpenProcess ? ['PLAN','EVOLUTION','DISCHARGE'] : ['INITIAL'];
                return allowed.includes(f.type);
              })).map(f => (
                <button key={f.type} type="button"
                  onClick={() => { setSetupType(f.type); setSetupTemplateId(''); confirmSetup(); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, border: '1.5px solid var(--s200)', background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s' }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--teal)'; (e.currentTarget as HTMLButtonElement).style.background = '#f3f2fb'; }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--s200)'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--s800)' }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 1 }}>{f.desc}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal-d)', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 5, padding: '2px 7px', flexShrink: 0 }}>integrado</span>
                </button>
              ))}
            </div>
          </div>
        ) : showRecordForm ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s600)' }}>
                  {RECORD_TYPE_LABEL[setupType ?? defaultRecordType] ?? (setupType ?? defaultRecordType)}
                  {setupTemplateId && setupTemplates.find(t => t.id === setupTemplateId) && (
                    <span style={{ fontWeight: 400, color: 'var(--s400)', marginLeft: 6 }}>— {setupTemplates.find(t => t.id === setupTemplateId)!.name}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const draftKey = `clinical-draft-${id}`;
                    const hasDraft = (() => { try { return !!localStorage.getItem(draftKey); } catch { return false; } })();
                    if (hasDraft && !confirm('¿Cambiar formato? El contenido que hayas escrito se perderá.')) return;
                    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
                    setShowRecordForm(false);
                    setSetupOpen(true);
                  }}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal-d, var(--teal))', background: '#f3f2fb', border: '1px solid #cbc7ee', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Cambiar formato
                </button>
              </div>
              <button aria-label="Cerrar registro clínico" onClick={() => { setShowRecordForm(false); setSetupOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s400)', padding: 6, minWidth: 32, minHeight: 32 }}><X size={16} /></button>
            </div>
            {lateReason && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 9, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: '#92400e' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><b>Registro extemporáneo</b> — motivo: {lateReason}. Quedará declarado en la historia y en el PDF.</span>
              </div>
            )}
            <RecordForm patientId={appt.patient_id} appointmentId={id!} defaultType={setupType ? (setupType === 'PLAN' ? 'EVOLUTION' : setupType as RecordType) : defaultRecordType} lockedTemplateId={setupType !== null ? setupTemplateId : undefined} sessionDate={apptDate} lateEntryReason={lateReason || undefined} treatmentConsentSigned={!!treatmentConsent} hasOpenProcess={hasOpenProcess} existingDraftId={autosaveDraft?.id} onTypeChange={setSelectedRecordType} onTemplateChange={setSelectedTemplateId} onSaved={handleRecordSaved} />
          </div>
        ) : canWriteNote && !hasApprovedDraft ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FileText size={36} color="var(--s200)" style={{ marginBottom: 12 }} />
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--s500)' }}>
              {isInProgress ? 'Sin registro para esta sesión' : 'La sesión terminó sin nota — regístrala ahora con la fecha real de la sesión.'}
            </p>
            <button
              onClick={openSetup}
              style={{ padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <FileText size={14} /> Crear registro clínico
            </button>
          </div>
        ) : canWriteNote && hasApprovedDraft ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Brain size={36} color="#f59e0b" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)' }}>
              El borrador IA de esta sesión ya fue aprobado como registro clínico.
            </p>
          </div>
        ) : isScheduled ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FileText size={36} color="var(--s200)" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)' }}>
              La nota clínica se registra durante la sesión — primero pulsa <b>Iniciar sesión</b>.
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--s400)' }}>Sin registros clínicos vinculados</p>
          </div>
        )}
      </div>
      </>
      )}

      {viewConsentId && <ConsentViewModal consentId={viewConsentId} onClose={() => setViewConsentId(null)} />}
      {signConsentOpen && appt.patient_id && (
        <UnifiedConsentSignModal
          patientId={appt.patient_id}
          alreadySigned={(consentsData?.items ?? []).filter(c => !c.revoked_at).map(c => c.consent_type)}
          onClose={() => setSignConsentOpen(false)}
          onSigned={() => {
            queryClient.invalidateQueries({ queryKey: ['consents', appt.patient_id] });
          }}
        />
      )}

      {completeDataOpen && patient && (
        <EditPatientModal
          patient={patient as Patient}
          requiredContext="El número de documento y la fecha de nacimiento son necesarios para iniciar la sesión clínica. Completa los datos y guarda para continuar."
          onClose={() => setCompleteDataOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['patient', appt?.patient_id] });
            handleStartSession();
            openSetup();
          }}
        />
      )}

      {/* Navigation blocker while recording */}
      {blockTarget !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ maxWidth: 420, width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mic size={18} color="#dc2626" />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>¿Salir de la sesión?</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)', lineHeight: 1.6 }}>
                  Hay una grabación en curso. Si sales ahora, el audio se guardará en el dispositivo y podrás subirlo al volver.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setBlockTarget(null)}
                style={{ flex: 1, padding: '10px 0', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                Continuar grabando
              </button>
              <button
                onClick={() => {
                  const target = blockTarget;
                  setBlockTarget(null);
                  exitingRef.current = true;
                  if (typeof target === 'number') {
                    // One extra step to skip the dummy history entry the trap
                    // pushed when recording started, then the real one that
                    // actually leaves this page.
                    rawNavigate(-1);
                    rawNavigate(-1);
                  } else if (target !== null) {
                    rawNavigate(target);
                  }
                }}
                style={{ flex: 1, padding: '10px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                Salir de todos modos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function IdField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--s400)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</div>
    </div>
  );
}

function InfoChip({ icon, text, color }: { icon: React.ReactNode; text: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: color ?? 'var(--s600)', background: 'var(--s50)', border: '1px solid var(--s200)', borderRadius: 20, padding: '4px 12px' }}>
      {icon} {text}
    </span>
  );
}

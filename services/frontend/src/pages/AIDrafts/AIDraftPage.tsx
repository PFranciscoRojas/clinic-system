import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Brain, Clock, CheckCircle2, AlertTriangle, RefreshCw, CalendarClock,
  Edit3, Save, ChevronDown, ChevronUp, Sparkles, FileText, Stethoscope, Search, X,
} from 'lucide-react';
import { aiDraftsApi, type DraftStatus } from '@/api/aiDrafts';
import { ApiError } from '@/api/client';
import { useIsMobile } from '@/lib/useMediaQuery';
import { formatWait, formatQueue } from '@/lib/eta';
import { diagnosesApi, type ICD10Code } from '@/api/diagnoses';
import { recordTemplatesApi } from '@/api/recordTemplates';
import { clinicalRecordsApi, type ClinicalRecord, type DischargeReason, type RiskLevel } from '@/api/clinicalRecords';
import DischargeReasonCard from '@/components/clinical/DischargeReasonCard';
import { TEMPLATE_SECTIONS, RECORD_TYPE_LABELS, type SectionDef } from '@/components/clinical/constants';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { todayLocalISO } from '@/lib/dates';
import TemplatedSectionsForm, { type SectionsState } from '@/components/clinical/TemplatedSectionsForm';
import { MentalExamChecklist, defaultMentalExam, type MentalExam } from '@/components/clinical/MentalExamChecklist';
import {
  RecordSectionsForm, recordToDraft, draftToPayload, validateDraft, toUIRecordType, emptyDraft,
  draftHasContent, mergeSavedDraft,
  type ClinicalDraft, type UIRecordType,
} from '@/components/clinical/RecordSectionsForm';

// Map a stored record type to the UI variant driving the left-pane form when
// there is no manual record to derive it from (the AI never sets is_plan_session,
// so PLAN can't be distinguished — it edits as EVOLUTION, which is harmless).
function apiTypeToUI(rt: string): UIRecordType {
  if (rt === 'INITIAL') return 'INITIAL';
  if (rt === 'DISCHARGE') return 'DISCHARGE';
  return 'EVOLUTION';
}

const STATUS_CONFIG: Record<DraftStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  PENDING:      { label: 'En cola',        color: '#6b7280', bg: '#f3f4f6', Icon: Clock        },
  PROCESSING:   { label: 'Procesando',     color: '#0369a1', bg: '#e0f2fe', Icon: RefreshCw    },
  DRAFT_READY:  { label: 'Listo',          color: '#065f46', bg: '#d1fae5', Icon: CheckCircle2 },
  APPROVED:     { label: 'Aprobado',       color: '#fff',    bg: '#059669', Icon: CheckCircle2 },
  REJECTED:     { label: 'Rechazado',      color: '#92400e', bg: '#fef3c7', Icon: AlertTriangle },
  ERROR:        { label: 'Error',          color: '#991b1b', bg: '#fee2e2', Icon: AlertTriangle },
  SUPERSEDED:   { label: 'Consolidado',    color: '#6b7280', bg: '#f3f4f6', Icon: RefreshCw    },
  EMPTY:        { label: 'Sin contenido',  color: '#92400e', bg: '#fef3c7', Icon: AlertTriangle },
};


export function AIDraftPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // Session context passed by the appointment page so the approved record
  // lands linked to the right appointment, date and record type.
  const qsAppointmentId = params.get('appointment_id') ?? '';
  const qsSessionDate   = params.get('session_date') ?? '';
  const qsRecordType    = params.get('record_type') ?? '';
  const qsRecordId      = params.get('record_id') ?? '';
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  // All sections start open — collapsing is the exception
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draftEdit, setDraftEdit] = useState<Record<string, string>>({});
  // State for custom-template mode (typed sections, not just strings)
  const [customEdit, setCustomEdit] = useState<SectionsState>({});
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');
  const [createdRecordId, setCreatedRecordId] = useState('');
  // Which approve handler to run once the are-you-sure modal is confirmed —
  // approval is irreversible (no edits after), so it always needs a step.
  const [confirmApproveAction, setConfirmApproveAction] = useState<'approve' | 'compare' | null>(null);
  const [riskLevel, setRiskLevel] = useState('NONE');
  const [riskSeeded, setRiskSeeded] = useState(false);
  // Required by the backend for a DISCHARGE approval in any format; the
  // comparison view captures it inside the integrated form instead.
  const [dischargeReason, setDischargeReason] = useState<DischargeReason | ''>('');
  // Mental exam (INITIAL, integrated format): a required section the AI does
  // not generate — the professional fills the checklist here, mirroring the
  // manual record form. Defaulted so approval is never blocked by a section
  // the review page previously never rendered.
  const [mentalExam, setMentalExam] = useState<MentalExam>(defaultMentalExam());
  // Comparison view: the left side is the real, editable clinical record the
  // professional was filling (all widgets), seeded from the autosaved draft.
  // Approving finalizes THIS record (merging any AI text accepted into it),
  // rather than creating a second record.
  const [leftDraft, setLeftDraft] = useState<ClinicalDraft | null>(null);
  // AI sections the professional has already pulled into the record — the right
  // pane collapses these to a "used" accordion row instead of the full card.
  const [usedKeys, setUsedKeys] = useState<Set<string>>(new Set());
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordErr, setRecordErr] = useState('');
  const [recordDone, setRecordDone] = useState(false);
  // Lets the professional correct the record type before approving
  const [showTranscript, setShowTranscript] = useState(false);
  // ICD-10 to assign on approve — seeded from the AI suggestion, confirmable.
  // undefined = not yet initialised from the draft; null = explicitly removed.
  const [icd10, setIcd10] = useState<ICD10Code | null | undefined>(undefined);
  const [aiRiskNote, setAiRiskNote] = useState<string | null | undefined>(undefined);

  const { data: draft, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai-draft', id],
    queryFn: () => aiDraftsApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'PENDING' || status === 'PROCESSING') ? 3000 : false;
    },
  });

  // Load the custom template schema when the draft was created with one
  const { data: customTemplate } = useQuery({
    queryKey: ['record-template', draft?.template_id],
    queryFn: () => recordTemplatesApi.get(draft!.template_id!),
    enabled: !!draft?.template_id,
  });

  // When the URL didn't carry record_id (arriving from the drafts list in
  // Clínico, or an audio upload that never opened the manual editor), resolve
  // the in-progress clinical record for this draft's appointment so the
  // comparison view still shows the professional's record on the left.
  const canResolve = !qsRecordId && !!draft?.patient_id && !!draft?.appointment_id;
  const { data: patientRecords } = useQuery({
    queryKey: ['records-for-draft', draft?.patient_id, draft?.appointment_id],
    queryFn: () => clinicalRecordsApi.list(draft!.patient_id, 'Comparación con borrador IA'),
    enabled: canResolve,
  });
  const autoRecordId = canResolve
    ? (patientRecords?.items ?? []).find(
        r => r.appointment_id === draft?.appointment_id && r.finalized === false && r.status === 'DRAFT',
      )?.id ?? ''
    : '';
  // The record to compare against: the one passed in the URL, or the one we
  // resolved from the appointment. Empty when the appointment has no
  // in-progress record yet — then the left pane starts blank and approving
  // CREATES the record instead of finalizing an existing one.
  const compareRecordId = qsRecordId || autoRecordId;
  // Resolution is settled once we have a record id or know there is none, so the
  // comparison view never flashes an empty left pane while the lookup is pending.
  const resolutionSettled = !!qsRecordId || !draft?.appointment_id || patientRecords !== undefined;

  // Load the resolved manual record for comparison mode
  const { data: manualRecord } = useQuery<ClinicalRecord>({
    queryKey: ['clinical-record', compareRecordId],
    queryFn: () => clinicalRecordsApi.get(compareRecordId, 'Comparación con borrador IA'),
    enabled: !!compareRecordId,
  });

  // Persist the composed left-hand record so pulled AI content and edits survive
  // leaving the page. It shares the appointment's `clinical-draft-*` key with the
  // manual RecordForm, so the two stay one draft; a separate key records which AI
  // sections were already pulled (drives the "used" accordion on the right).
  const draftStorageKey = draft?.appointment_id
    ? `clinical-draft-${draft.appointment_id}`
    : draft?.patient_id ? `clinical-draft-patient-${draft.patient_id}` : '';
  const usedStorageKey = id ? `clinical-draft-ai-used-${id}` : '';
  // Once we adopt a saved draft from localStorage, the server-record seed must
  // not overwrite it (the local copy holds the professional's latest edits).
  const localRestoredRef = useRef(false);
  const restoreAttemptedRef = useRef(false);

  // Restore the left draft + pulled-section markers from localStorage on mount.
  // The pulled-section markers apply to BOTH formats; the leftDraft itself is
  // integrated-only (custom templates keep their content in customEdit).
  // The sync setState here is a one-shot restore gated by restoreAttemptedRef;
  // it shares that ref with the server-seed effect below, so restructuring
  // either alone would break the "local edits win over server seed" contract.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!draftStorageKey || restoreAttemptedRef.current || !draft) return;
    restoreAttemptedRef.current = true;
    try {
      if (!draft.template_id) {
        const raw = localStorage.getItem(draftStorageKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.draft) {
            const merged = mergeSavedDraft(saved.draft as Partial<ClinicalDraft>);
            if (draftHasContent(merged)) {
              setLeftDraft(merged);
              localRestoredRef.current = true;
            }
          }
        }
      }
      if (usedStorageKey) {
        const rawUsed = localStorage.getItem(usedStorageKey);
        if (rawUsed) {
          const arr = JSON.parse(rawUsed);
          if (Array.isArray(arr)) setUsedKeys(new Set(arr as string[]));
        }
      }
    } catch { /* corrupt draft — start clean */ }
  }, [draftStorageKey, usedStorageKey, draft]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Save 600ms after the last change; also on tab hide / SPA navigation, since
  // React Router unmounts without firing beforeunload (mirrors RecordForm).
  useEffect(() => {
    if (!draftStorageKey || draft?.template_id || !leftDraft) return;
    const save = () => {
      try {
        if (draftHasContent(leftDraft)) {
          const uiType: UIRecordType = manualRecord
            ? toUIRecordType(manualRecord.record_type, manualRecord.sections)
            : apiTypeToUI(
                qsRecordType
                || ((draft?.draft_content_plain as Record<string, unknown> | null)?.record_type as string)
                || 'EVOLUTION',
              );
          localStorage.setItem(draftStorageKey, JSON.stringify({ uiType, draft: leftDraft }));
        }
        if (usedStorageKey) localStorage.setItem(usedStorageKey, JSON.stringify([...usedKeys]));
      } catch { /* storage full */ }
    };
    const t = setTimeout(save, 600);
    const onHide = () => save();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(t);
      save();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [draftStorageKey, usedStorageKey, leftDraft, usedKeys, manualRecord, draft, qsRecordType]);

  // An already-approved draft must not re-show the approval UI: send it to the
  // finalized clinical record instead. Skips the in-session approval we just
  // did (recordDone/createdRecordId) so that flow keeps its confirmation.
  useEffect(() => {
    if (draft?.status === 'APPROVED' && draft.clinical_record_id && !recordDone && !createdRecordId) {
      navigate(`/clinical-records/${draft.clinical_record_id}`, { replace: true });
    }
  }, [draft?.status, draft?.clinical_record_id, recordDone, createdRecordId, navigate]);

  // This take was folded into a later recording of the same session: send the
  // professional to the single, consolidated draft (carrying the session
  // context so its approval still lands on the right appointment/record).
  useEffect(() => {
    if (draft?.status === 'SUPERSEDED' && draft.superseded_by) {
      const qs = params.toString();
      navigate(`/ai-drafts/${draft.superseded_by}${qs ? `?${qs}` : ''}`, { replace: true });
    }
  }, [draft?.status, draft?.superseded_by, params, navigate]);

  // Seed the custom-template LEFT pane (the professional's record). The AI
  // content is never auto-poured in — it stays on the right until pulled,
  // mirroring the integrated comparison view. Order: saved local edits (same
  // clinical-draft-* contract as RecordForm) > the in-progress record's
  // sections (same template only) > blank.
  const customSeededRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!customTemplate || !draft?.template_id || customSeededRef.current) return;
    if (!resolutionSettled || (compareRecordId && !manualRecord)) return; // wait for the record lookup
    customSeededRef.current = true;
    try {
      const raw = draftStorageKey ? localStorage.getItem(draftStorageKey) : null;
      if (raw) {
        const saved = JSON.parse(raw);
        const savedSections = (saved.customSections ?? {}) as SectionsState;
        if ((saved.selectedTemplateId ?? '') === draft.template_id && Object.keys(savedSections).length > 0) {
          setCustomEdit(savedSections);
          if (typeof saved.customDischargeReason === 'string' && saved.customDischargeReason) {
            setDischargeReason(saved.customDischargeReason as DischargeReason);
          }
          return;
        }
      }
    } catch { /* corrupt — fall through */ }
    if (manualRecord && (manualRecord.template_id ?? '') === draft.template_id) {
      setCustomEdit((manualRecord.sections ?? {}) as SectionsState);
      if (manualRecord.risk_level) setRiskLevel(manualRecord.risk_level);
      if (manualRecord.discharge_reason) setDischargeReason(manualRecord.discharge_reason);
      return;
    }
    setCustomEdit({});
  }, [customTemplate, draft, resolutionSettled, manualRecord, compareRecordId, draftStorageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist the custom left pane + pulled markers (same key RecordForm uses,
  // so the appointment page and this page stay one draft).
  useEffect(() => {
    if (!draftStorageKey || !draft?.template_id || !customSeededRef.current) return;
    const save = () => {
      try {
        if (Object.keys(customEdit).length > 0) {
          localStorage.setItem(draftStorageKey, JSON.stringify({
            customSections: customEdit,
            selectedTemplateId: draft.template_id,
            customDischargeReason: dischargeReason,
          }));
        }
        if (usedStorageKey) localStorage.setItem(usedStorageKey, JSON.stringify([...usedKeys]));
      } catch { /* storage full */ }
    };
    const t = setTimeout(save, 600);
    const onHide = () => save();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(t);
      save();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [draftStorageKey, usedStorageKey, customEdit, usedKeys, dischargeReason, draft?.template_id]);
  const [seededExamDraft, setSeededExamDraft] = useState<typeof draft>(undefined);
  if (draft && draft !== seededExamDraft) {
    setSeededExamDraft(draft);
    const raw = draft.draft_content_plain as Record<string, unknown> | null;
    const me = (raw?.sections as Record<string, unknown> | undefined)?.mental_exam;
    if (me && typeof me === 'object' && !Array.isArray(me)) {
      setMentalExam({ ...defaultMentalExam(), ...(me as Partial<MentalExam>) });
    }
  }

  // Seed the editable left-hand record for the comparison view: from the manual
  // autosave draft when one exists (all its widgets and text), otherwise a blank
  // record the professional fills by pulling AI sections in and completing the
  // widgets — approving then creates the record.
  // Ref-guarded server seed, counterpart of the localStorage restore above.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // A restored localStorage draft holds the professional's latest edits —
    // never clobber it with the server seed. Custom-template drafts don't use
    // the comparison left pane at all.
    if (localRestoredRef.current || draft?.template_id) return;
    if (manualRecord) {
      setLeftDraft(recordToDraft(
        manualRecord.sections,
        manualRecord.risk_level,
        manualRecord.discharge_reason,
      ));
    } else if (resolutionSettled && !compareRecordId) {
      setLeftDraft(prev => prev ?? emptyDraft());
    }
  }, [manualRecord, resolutionSettled, compareRecordId, draft?.template_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Seed the ICD-10 selector from the AI suggestion once, when the draft loads
  // (render-time adjust: the `icd10 === undefined` guard makes it run at most
  // once — any later change comes from the professional and is never clobbered).
  if (icd10 === undefined) {
    const sug = (draft?.draft_content_plain as Record<string, unknown> | null)?.suggested_icd10 as
      | { code?: string; description?: string } | null | undefined;
    if (sug && typeof sug.code === 'string' && sug.code.trim()) {
      setIcd10({ code: sug.code.trim(), description: sug.description ?? '', chapter: '' });
    }
  }

  // Seed the risk note the same way — an informational flag only. It never
  // pre-marks Ideación Suicida / Antecedente de intento previo; the professional
  // still has to click those by hand (compliance rule: la IA sugiere, el humano decide).
  if (aiRiskNote === undefined) {
    const note = (draft?.draft_content_plain as Record<string, unknown> | null)?.risk_note as
      | string | null | undefined;
    setAiRiskNote(typeof note === 'string' && note.trim() ? note.trim() : null);
  }

  // Seed the risk selector from the AI's top-level risk_level suggestion
  // (drafts since migration 000067; legacy drafts carried it as the `risk`
  // widget section). One-shot: a later change by the professional — or the
  // manual record's own risk_level, fetched after — is never clobbered.
  if (!riskSeeded && draft) {
    const dc = draft.draft_content_plain as Record<string, unknown> | null;
    const suggested = (dc?.risk_level
      ?? (dc?.sections as Record<string, unknown> | undefined)?.risk) as string | undefined;
    if (typeof suggested === 'string' && ['NONE', 'IDEATION', 'PLAN', 'ATTEMPT'].includes(suggested)) {
      setRiskLevel(suggested);
    }
    setRiskSeeded(true);
  }

  // A freshly approved draft/record must stop showing as pending everywhere
  // else in the app — the drafts and records lists on /clinical, plus the
  // dashboard's pending-notes card, only refetch on their own after 30s
  // (or a manual F5) otherwise, which reads as "stuck" entries.
  const invalidateClinicalLists = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-draft', id] });
    queryClient.invalidateQueries({ queryKey: ['ai-drafts-list'] });
    queryClient.invalidateQueries({ queryKey: ['clinical-records-all'] });
    queryClient.invalidateQueries({ queryKey: ['pending-notes'] });
  };

  const handleApprove = async () => {
    // A record was already created from this draft — never create a second one,
    // even if the draft's status refetch hasn't landed yet.
    if (!id || approving || createdRecordId) return;
    if (recordType === 'DISCHARGE' && !dischargeReason) {
      setApproveErr('El motivo de egreso es obligatorio.');
      return;
    }
    setApproving(true);
    setApproveErr('');
    try {
      // Custom comparison with an in-progress record: finalize THAT record
      // (no duplicate) and mark the draft consumed — mirror of the
      // integrated comparison's approve path.
      if (customTemplate && compareRecordId) {
        // The record's type/template/date are already fixed from when it was
        // created as an autosave DRAFT — finalize only fills sections/risk/reason.
        await clinicalRecordsApi.finalize(compareRecordId, {
          sections: customEdit,
          risk_level: riskLevel as RiskLevel,
          ...(recordType === 'DISCHARGE' ? { discharge_reason: dischargeReason as DischargeReason } : {}),
        });
        try { await aiDraftsApi.link(id, compareRecordId); } catch { /* best-effort */ }
        setCreatedRecordId(compareRecordId);
        if (icd10?.code && draft?.patient_id) {
          try {
            await diagnosesApi.create(draft.patient_id, {
              icd10_code: icd10.code,
              clinical_record_id: compareRecordId,
              diagnosis_type: 'PRINCIPAL',
              diagnosed_at: qsSessionDate || todayLocalISO(),
            });
          } catch { /* record approved; diagnosis can be added later */ }
        }
        try {
          if (draftStorageKey) localStorage.removeItem(draftStorageKey);
          if (usedStorageKey) localStorage.removeItem(usedStorageKey);
        } catch { /* ignore */ }
        invalidateClinicalLists();
        navigate(`/clinical-records/${compareRecordId}`);
        return;
      }
      let approveBody: Parameters<typeof aiDraftsApi.approve>[1];
      if (customTemplate) {
        // Custom template path: send typed sections as-is
        approveBody = {
          sections: customEdit,
          record_type: recordType,
          session_date: qsSessionDate || todayLocalISO(),
          appointment_id: qsAppointmentId || undefined,
          template_id: customTemplate.id,
          risk_level: riskLevel,
          ...(recordType === 'DISCHARGE' ? { discharge_reason: dischargeReason } : {}),
        };
      } else {
        // Integrated format path: text sections plus, for an INITIAL record,
        // the mental exam widget — a required section the AI never generates,
        // so it must travel here or the backend rejects the approval.
        const finalSections: Record<string, unknown> = {};
        for (const def of sectionDefs) {
          const v = (draftEdit[def.key] ?? baseContent[def.key] ?? '').trim();
          if (v) finalSections[def.key] = v;
        }
        for (const [k, v] of extraSections) {
          if (!(k in finalSections)) finalSections[k] = v;
        }
        if (recordType === 'INITIAL') {
          finalSections.mental_exam = mentalExam;
        }
        approveBody = {
          sections: finalSections,
          record_type: recordType,
          session_date: qsSessionDate || todayLocalISO(),
          appointment_id: qsAppointmentId || undefined,
          risk_level: riskLevel,
          ...(recordType === 'DISCHARGE' ? { discharge_reason: dischargeReason } : {}),
        };
      }
      const res = await aiDraftsApi.approve(id, approveBody);
      setCreatedRecordId(res.clinical_record_id);
      // Assign the confirmed diagnosis (if any) to the new record
      if (icd10?.code && draft?.patient_id) {
        try {
          await diagnosesApi.create(draft.patient_id, {
            icd10_code: icd10.code,
            clinical_record_id: res.clinical_record_id,
            diagnosis_type: 'PRINCIPAL',
            // Anchor to the session's local date — the DB default is
            // CURRENT_DATE on a UTC server, one day ahead in the evening.
            diagnosed_at: qsSessionDate || todayLocalISO(),
          });
        } catch { /* record is approved; diagnosis can be added later from the profile */ }
      }
      invalidateClinicalLists();
      navigate(`/clinical-records/${res.clinical_record_id}`);
    } catch (e) {
      // Surface the server's specific reason (e.g. "nivel de riesgo es
      // obligatorio", "una sección requerida está vacía") instead of a generic
      // message the professional can't act on.
      setApproveErr(e instanceof ApiError && e.message ? e.message : 'Error al aprobar. Intenta de nuevo.');
      // The draft may have moved on since this page loaded (e.g. a later take
      // got merged into it and this one is now SUPERSEDED) — refetch so the
      // status-based redirect effects can pick up the real current state
      // instead of leaving the professional stuck on a stale error.
      refetch();
    } finally {
      setApproving(false);
    }
  };

  // Comparison view approve: take the composed left-hand record (all widgets +
  // whatever AI text the professional accepted into it) into the clinical
  // history as ONE record. When an in-progress record exists it is finalized in
  // place (no duplicate); otherwise a new record is created from it. Either way
  // the AI draft is marked consumed.
  const handleApproveComparison = async () => {
    if (!leftDraft || !id || recordSaving || recordDone || createdRecordId) return;
    const rt = qsRecordType
      || ((draft?.draft_content_plain as Record<string, unknown> | null)?.record_type as string)
      || 'EVOLUTION';
    const uiType: UIRecordType = manualRecord
      ? toUIRecordType(manualRecord.record_type, manualRecord.sections)
      : apiTypeToUI(rt);
    const miss = validateDraft(uiType, leftDraft);
    if (miss) { setRecordErr(miss.message); return; }
    setRecordSaving(true); setRecordErr('');
    const payload = draftToPayload(uiType, leftDraft);
    try {
      let recordId = compareRecordId;
      if (recordId) {
        // Finalize the in-progress record the professional was filling.
        await clinicalRecordsApi.finalize(recordId, payload);
        // Bookkeeping: mark the draft approved + linked. The record is already
        // saved, so a link failure must not fail the approval.
        try { await aiDraftsApi.link(id, recordId); } catch { /* draft link is best-effort */ }
      } else {
        // No in-progress record — create one from the composed left pane. The
        // approve endpoint both creates the record and marks the draft APPROVED.
        const res = await aiDraftsApi.approve(id, {
          sections: payload.sections,
          risk_level: payload.risk_level,
          record_type: rt,
          session_date: qsSessionDate || todayLocalISO(),
          appointment_id: qsAppointmentId || draft?.appointment_id || undefined,
          // draftToPayload carries the reason the professional picked in the
          // integrated form — dropping it here made DISCHARGE approvals fail.
          discharge_reason: payload.discharge_reason,
        });
        recordId = res.clinical_record_id;
        setCreatedRecordId(recordId);
      }
      if (icd10?.code && draft?.patient_id && recordId) {
        try {
          await diagnosesApi.create(draft.patient_id, {
            icd10_code: icd10.code,
            clinical_record_id: recordId,
            diagnosis_type: 'PRINCIPAL',
            diagnosed_at: qsSessionDate || todayLocalISO(),
          });
        } catch { /* record saved; diagnosis can be added later */ }
      }
      setRecordDone(true);
      // The draft is now part of the clinical history — drop the local scratch
      // copies so a future editor doesn't re-seed the consumed content.
      try {
        if (draftStorageKey) localStorage.removeItem(draftStorageKey);
        if (usedStorageKey) localStorage.removeItem(usedStorageKey);
        localStorage.removeItem(`${draftStorageKey}-serverid`);
      } catch { /* ignore */ }
      invalidateClinicalLists();
      navigate(`/clinical-records/${recordId}`);
    } catch (e) {
      setRecordErr(e instanceof ApiError && e.message ? e.message : 'No se pudo aprobar el registro.');
      // Same race as handleApprove: the draft may have been superseded since
      // this page loaded — refetch so the redirect effects can react.
      refetch();
    } finally {
      setRecordSaving(false);
    }
  };

  const toggleSection = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={28} color="var(--teal)" /></div>;
  }

  if (isError || !draft) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', padding: 24 }}>
        <AlertTriangle size={16} /> Borrador no encontrado
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[draft.status];
  const isPending = draft.status === 'PENDING' || draft.status === 'PROCESSING';
  const isReady = draft.status === 'DRAFT_READY';

  // While the template schema is loading (async), don't show phantom integrated fields.
  const templateLoading = !!draft.template_id && !customTemplate;

  const contentRaw = draft.draft_content_plain as Record<string, unknown> | null;
  // Drafts carry the clinical-record sections for the record type.
  const recordType = (qsRecordType || (contentRaw?.record_type as string) || 'EVOLUTION') as keyof typeof TEMPLATE_SECTIONS;
  const transcription = (draft.transcription ?? '').trim();
  const baseContent: Record<string, string> = (contentRaw?.sections as Record<string, string>) ?? {};
  const sectionDefs: { key: string; label: string; description: string }[] =
    (TEMPLATE_SECTIONS[recordType] ?? TEMPLATE_SECTIONS.EVOLUTION).map((d: SectionDef) => ({ key: d.key, label: d.label, description: d.placeholder }));
  // Whether to render with the data-driven template form or the plain-text form
  const useCustomTemplate = !!customTemplate;

  const getDraftField = (key: string) => draftEdit[key] ?? baseContent[key] ?? '';

  // Sections the AI generated that the current integrated layout doesn't know
  // (e.g. drafts produced with an older AI schema). Shown read-only and sent
  // on approve so no clinical content is ever silently invisible or lost —
  // the server drops any key its whitelist doesn't accept.
  const extraSections: [string, string][] = !useCustomTemplate
    ? Object.entries(baseContent).filter(([k, v]) =>
        !sectionDefs.some(d => d.key === k) && typeof v === 'string' && v.trim() !== '')
    : [];

  // True when there is genuinely no AI content and the professional has not
  // added any manual content either — shows a clean "empty draft" state.
  const isEmptyDraft = isReady && !editing && !useCustomTemplate
    && sectionDefs.every(({ key }) => !getDraftField(key).trim());

  // True while a ready draft is still waiting on the appointment's
  // in-progress-record lookup — both formats seed their left pane from it, so
  // both must hold off rendering until it settles (else a custom-template
  // draft flashes an empty single-pane form before flipping into compare mode).
  const resolving = isReady && !templateLoading && !resolutionSettled;

  // Comparison mode is the default for a ready integrated-format draft, whatever
  // the entry point (appointment button, drafts list, or an audio upload with no
  // manual record yet): the professional's clinical record on the left, the AI
  // draft to pull from on the right. We wait until record resolution settles so
  // the left pane is seeded correctly (existing record vs. blank) before showing.
  const compareMode = isReady && !useCustomTemplate && !templateLoading && resolutionSettled;
  const compareUiType: UIRecordType = manualRecord
    ? toUIRecordType(manualRecord.record_type, manualRecord.sections)
    : apiTypeToUI(recordType);
  // AI text sections to offer on the right of the comparison (only ones the AI
  // actually produced). The professional pulls any into the record on the left.
  const aiTextSections: { key: string; label: string; value: string }[] = compareMode
    ? [
        ...sectionDefs.map(d => ({ key: d.key, label: d.label, value: (baseContent[d.key] ?? '').trim() })),
        ...extraSections.map(([k, v]) => ({ key: k, label: k, value: v.trim() })),
      ].filter(s => s.value !== '')
    : [];
  const usedCount = aiTextSections.filter(s => usedKeys.has(s.key)).length;
  const pullAiSection = (key: string, value: string) => {
    setLeftDraft(prev => prev ? { ...prev, sections: { ...prev.sections, [key]: value } } : prev);
    setUsedKeys(prev => new Set(prev).add(key));
  };
  // Re-open a collapsed "used" section (e.g. to re-paste it after editing the
  // left pane). Only reveals the card again — it doesn't revert what's already
  // in the record.
  const undoAiSection = (key: string) =>
    setUsedKeys(prev => { const next = new Set(prev); next.delete(key); return next; });

  // ── Custom-template comparison — same pull-based UX as the integrated one:
  // the professional's templated record on the left, the AI's typed sections
  // (widgets included) on the right, per-section "usar" buttons.
  const customCompareMode = isReady && useCustomTemplate && resolutionSettled;
  const baseTyped = (contentRaw?.sections ?? {}) as SectionsState;
  // treatment_plan / diagnoses are self-contained widgets: they ignore
  // whatever is stored in sections[key] and always render the patient's live
  // plan/diagnoses via patientId (see WidgetField in TemplatedSectionsForm).
  // Offering them as "pull from AI" would be a no-op the professional can
  // click with zero visible effect, so they never enter the AI list.
  const SELF_CONTAINED_WIDGETS = new Set(['treatment_plan', 'diagnoses']);
  const aiCustomSections = customCompareMode && customTemplate
    ? customTemplate.schema.filter(sec => {
        if (sec.type === 'widget' && SELF_CONTAINED_WIDGETS.has(sec.widget ?? '')) return false;
        const v = baseTyped[sec.key];
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (Array.isArray(v)) return v.length > 0;
        return true;
      })
    : [];
  // Fields the AI left empty: the transcription had no content for them.
  // Named explicitly so an empty checklist reads as "nothing found in the
  // audio", never as a silent failure. Widgets the AI never fills by design
  // (mental exam is manual by compliance rule; treatment plan and diagnoses
  // are self-contained panels) don't belong in this list.
  const AI_MANUAL_WIDGETS = new Set(['mental_exam', 'treatment_plan', 'diagnoses']);
  const aiEmptySections = customCompareMode && customTemplate
    ? customTemplate.schema.filter(sec =>
        !(sec.type === 'widget' && AI_MANUAL_WIDGETS.has(sec.widget ?? ''))
        && !aiCustomSections.some(s => s.key === sec.key))
    : [];
  const customUsedCount = aiCustomSections.filter(s => usedKeys.has(s.key)).length;
  const pullCustomSection = (key: string) => {
    setCustomEdit(prev => ({ ...prev, [key]: baseTyped[key] }));
    setUsedKeys(prev => new Set(prev).add(key));
  };
  const pullAllCustom = () => {
    setCustomEdit(prev => {
      const next = { ...prev };
      for (const sec of aiCustomSections) next[sec.key] = baseTyped[sec.key];
      return next;
    });
    setUsedKeys(prev => {
      const next = new Set(prev);
      for (const sec of aiCustomSections) next.add(sec.key);
      return next;
    });
  };
  const anyCompare = compareMode || customCompareMode;

  return (
    <div style={{ maxWidth: anyCompare ? 1200 : 760, margin: '0 auto', padding: isMobile ? '0 12px 32px' : 0 }}>
      {/* Back — plus a direct way to the session this draft belongs to, so
          arriving from the topbar indicator or the drafts list never leaves
          the professional stranded */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--s500)', fontSize: 14, padding: 0 }}
        >
          <ArrowLeft size={16} /> Volver
        </button>
        {(qsAppointmentId || draft?.appointment_id) && (
          <button
            onClick={() => navigate(`/appointments/${qsAppointmentId || draft?.appointment_id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--s200)', borderRadius: 8, cursor: 'pointer', color: 'var(--s600)', fontSize: 13, fontWeight: 600, padding: '7px 13px' }}
          >
            <CalendarClock size={14} /> Ir a la cita
          </button>
        )}
      </div>

      {/* Header */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Brain size={24} color="#f59e0b" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', margin: 0 }}>{anyCompare ? 'Comparación: Manual vs IA' : 'Borrador IA'}</h1>
              <Badge label={statusCfg.label} color={statusCfg.color} bg={statusCfg.bg} />
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <InfoLine label="Tipo" value={RECORD_TYPE_LABELS[recordType] ?? recordType} />
              <InfoLine label="Modelo" value={draft.ai_model_version ?? '—'} />
              <InfoLine label="Draft ID" value={id?.slice(-8) ?? '—'} />
            </div>
          </div>
          {isReady && !editing && !compareMode && (
            <button
              onClick={() => setEditing(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <Edit3 size={14} /> Editar
            </button>
          )}
        </div>
      </div>

      {/* Processing state */}
      {isPending && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: '#e0f2fe', marginBottom: 20 }}>
            <Spinner size={28} color="#0369a1" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>
            {draft.status === 'PENDING' ? 'En cola de procesamiento' : 'Generando borrador…'}
          </h2>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 20px' }}>
            {draft.status === 'PENDING'
              ? 'El audio está esperando ser transcrito por Whisper'
              : 'Whisper está transcribiendo el audio y el modelo IA está generando el borrador'}
          </p>
          {formatWait(draft.eta_seconds) && (
            <p style={{ color: 'var(--s600)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
              Listo en <b>{formatWait(draft.eta_seconds)}</b>.{' '}
              {formatQueue(draft.jobs_ahead)}{' '}
              No hace falta esperar aquí: puedes empezar la siguiente sesión y volver cuando esté.
            </p>
          )}
          <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto', padding: '8px 16px', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={14} /> Actualizar estado
          </button>
          <p style={{ color: 'var(--s300)', fontSize: 12, marginTop: 12 }}>Se actualiza automáticamente cada 3 segundos</p>
        </div>
      )}

      {/* Error state */}
      {draft.status === 'ERROR' && (
        <div className="card" style={{ padding: 32, textAlign: 'center', border: '1.5px solid #fecaca' }}>
          <AlertTriangle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>Error en el procesamiento</h2>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 20px' }}>El pipeline de IA encontró un error. Contacta al administrador con el Draft ID.</p>
        </div>
      )}

      {draft.status === 'EMPTY' && (
        <div className="card" style={{ padding: 32, textAlign: 'center', border: '1.5px solid #fde68a' }}>
          <AlertTriangle size={40} color="#d97706" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>La grabación no tenía contenido clínico</h2>
          <p style={{ color: 'var(--s400)', fontSize: 14, margin: '0 0 20px' }}>
            No se generó borrador. Vuelve a la sesión para subir otro audio o redactar la nota manualmente.
          </p>
          {(qsAppointmentId || draft.appointment_id) && (
            <button
              onClick={() => navigate(`/appointments/${qsAppointmentId || draft.appointment_id}`)}
              style={{ padding: '10px 22px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              Ir a la sesión
            </button>
          )}
        </div>
      )}

      {/* Template schema loading — avoid showing phantom integrated-format fields */}
      {(isReady || draft.status === 'APPROVED') && templateLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner size={24} color="var(--teal)" />
        </div>
      )}

      {/* Resolving which clinical record to compare against (looking up the
          appointment's in-progress record) — hold the comparison view until we
          know whether to seed the left pane from it or start blank. Applies to
          both formats: a custom-template draft seeds customEdit from the same
          lookup, and would otherwise flash an empty single-pane form. */}
      {resolving && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner size={24} color="var(--teal)" />
        </div>
      )}

      {/* Comparison mode: the editable clinical record (left) + the AI draft as
          a reference to pull text from (right). Approving finalizes the record. */}
      {compareMode && !recordDone && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 10, padding: '11px 14px' }}>
            <Sparkles size={15} color="#0369a1" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: '#0c4a6e', lineHeight: 1.65 }}>
              A la <strong>izquierda</strong> está tu registro clínico (edítalo y completa el examen mental, la formulación y demás). A la <strong>derecha</strong>, lo que redactó la IA del audio: pulsa <strong>"Usar en el registro"</strong> para pasar cada sección a la izquierda. Al final, <strong>Aprobar registro</strong> crea la historia clínica.
            </p>
          </div>

          {/* Transcription — what Whisper heard, always available once processed */}
          {transcription && (
            <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
              <button
                onClick={() => setShowTranscript(v => !v)}
                style={{ width: '100%', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
                  <FileText size={14} color="var(--s400)" /> Transcripción del audio
                </span>
                {showTranscript ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
              </button>
              {showTranscript && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--s100)' }}>
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--s600)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcription}</p>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, marginBottom: 20, alignItems: 'start' }}>
            {/* LEFT — the real, editable clinical record (all widgets) */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--s600)', letterSpacing: 0.3, marginBottom: 10 }}>✍ TU REGISTRO CLÍNICO</div>
              {leftDraft
                ? <RecordSectionsForm recordType={compareUiType} value={leftDraft} onChange={setLeftDraft} />
                : <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner size={20} color="var(--teal)" /></div>}
            </div>

            {/* RIGHT — the AI draft, read-only, pull sections into the record.
                Pulled sections collapse to a "used" accordion row. */}
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', letterSpacing: 0.3 }}>🤖 BORRADOR IA (del audio)</div>
                {aiTextSections.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: usedCount === aiTextSections.length ? '#059669' : 'var(--s400)' }}>
                    {usedCount}/{aiTextSections.length} usadas
                  </span>
                )}
              </div>
              {aiTextSections.length === 0 ? (
                <div className="card" style={{ padding: '16px 18px', fontSize: 13, color: 'var(--s400)' }}>La IA no redactó secciones de texto para esta sesión.</div>
              ) : aiTextSections.map(({ key, label, value }) => usedKeys.has(key) ? (
                /* Used — collapsed accordion row, click to re-open */
                <button
                  key={key}
                  onClick={() => undoAiSection(key)}
                  title="Pasada al registro — clic para volver a mostrarla"
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', marginBottom: 10, borderRadius: 10, border: '1.5px solid #6ee7b7', background: '#f0fdf4', cursor: 'pointer' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#065f46', minWidth: 0 }}>
                    <CheckCircle2 size={14} color="#059669" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                    Usada <ChevronDown size={13} color="#059669" />
                  </span>
                </button>
              ) : (
                <div key={key} className="card" style={{ padding: '14px 16px', marginBottom: 12, border: '1.5px solid #fde68a', background: '#fffdf7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>{label}</span>
                    <button
                      onClick={() => pullAiSection(key, value)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ← Usar en el registro
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ICD-10 suggestion */}
          <Icd10Suggestion value={icd10 ?? null} editable={true} onChange={setIcd10} />

          {/* Approve action — one button, finalizes the record on the left */}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={() => setConfirmApproveAction('compare')}
              disabled={recordSaving || !leftDraft}
              style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--teal)', color: '#fff', border: 'none', cursor: (recordSaving || !leftDraft) ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (recordSaving || !leftDraft) ? 0.7 : 1 }}
            >
              {recordSaving ? <Spinner size={16} color="#fff" /> : <CheckCircle2 size={16} />}
              {recordSaving ? 'Aprobando…' : 'Aprobar registro'}
            </button>
          </div>
          {recordErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fee2e2', borderRadius: 10, border: '1.5px solid #fca5a5', marginTop: 8 }}>
              <AlertTriangle size={15} color="#dc2626" />
              <span style={{ fontSize: 13, color: '#991b1b' }}>{recordErr}</span>
            </div>
          )}
        </>
      )}

      {/* ── Custom-template comparison: templated record left, AI right ── */}
      {customCompareMode && customTemplate && !recordDone && !createdRecordId && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, marginBottom: 20, alignItems: 'start' }}>
            {/* LEFT — the professional's record in their own format */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--s600)', letterSpacing: 0.3, marginBottom: 10 }}>✍ TU REGISTRO CLÍNICO — {customTemplate.name}</div>
              <TemplatedSectionsForm schema={customTemplate.schema} value={customEdit} onChange={setCustomEdit} patientId={draft.patient_id} />
              {recordType === 'DISCHARGE' && (
                <div style={{ marginTop: 14 }}>
                  <DischargeReasonCard value={dischargeReason} onChange={setDischargeReason} />
                </div>
              )}
            </div>

            {/* RIGHT — the AI draft, read-only, pull sections into the record */}
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', letterSpacing: 0.3 }}>🤖 BORRADOR IA (del audio)</div>
                {aiCustomSections.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: customUsedCount === aiCustomSections.length ? '#059669' : 'var(--s400)' }}>
                      {customUsedCount}/{aiCustomSections.length} usadas
                    </span>
                    {customUsedCount < aiCustomSections.length && (
                      <button
                        onClick={pullAllCustom}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        ← Usar todo
                      </button>
                    )}
                  </div>
                )}
              </div>
              {aiCustomSections.length === 0 ? (
                <div className="card" style={{ padding: '16px 18px', fontSize: 13, color: 'var(--s400)' }}>La IA no generó contenido para los campos de este formato.</div>
              ) : aiCustomSections.map(sec => usedKeys.has(sec.key) ? (
                <button
                  key={sec.key}
                  onClick={() => undoAiSection(sec.key)}
                  title="Pasada al registro — clic para volver a mostrarla"
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', marginBottom: 10, borderRadius: 10, border: '1.5px solid #6ee7b7', background: '#f0fdf4', cursor: 'pointer' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#065f46', minWidth: 0 }}>
                    <CheckCircle2 size={14} color="#059669" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.label}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                    Usada <ChevronDown size={13} color="#059669" />
                  </span>
                </button>
              ) : (
                <div key={sec.key} className="card" style={{ padding: '14px 16px', marginBottom: 12, border: '1.5px solid #fde68a', background: '#fffdf7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>{sec.label}</span>
                    <button
                      onClick={() => pullCustomSection(sec.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      ← Usar en el registro
                    </button>
                  </div>
                  {/* Single-section render reuses the real widget, read-only */}
                  <TemplatedSectionsForm schema={[sec]} value={baseTyped} onChange={() => {}} disabled />
                </div>
              ))}
              {/* Fields the transcription had nothing for: say it explicitly,
                  so an empty checklist never reads as a silent failure. */}
              {aiEmptySections.length > 0 && (
                <div className="card" style={{ padding: '14px 16px', border: '1px dashed var(--s200)', background: '#fafafa' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: 'var(--s500)' }}>
                    La transcripción no aportó contenido para:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {aiEmptySections.map(sec => (
                      <li key={sec.key} style={{ fontSize: 12.5, color: 'var(--s500)' }}>{sec.label}</li>
                    ))}
                  </ul>
                  <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--s400)' }}>
                    Si algo de esto sí ocurrió en sesión, complétalo a mano en tu registro.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ICD-10 suggestion */}
          <Icd10Suggestion value={icd10 ?? null} editable={true} onChange={setIcd10} />

          <div style={{ margin: '12px 0' }}>
            <RiskLevelSelector value={riskLevel} onChange={setRiskLevel} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={() => setConfirmApproveAction('approve')}
              disabled={approving}
              style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--teal)', color: '#fff', border: 'none', cursor: approving ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: approving ? 0.7 : 1 }}
            >
              {approving ? <Spinner size={16} color="#fff" /> : <CheckCircle2 size={16} />}
              {approving ? 'Aprobando…' : 'Aprobar registro'}
            </button>
          </div>
          {approveErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fee2e2', borderRadius: 10, border: '1.5px solid #fca5a5', marginTop: 8 }}>
              <AlertTriangle size={15} color="#dc2626" />
              <span style={{ fontSize: 13, color: '#991b1b' }}>{approveErr}</span>
            </div>
          )}
        </>
      )}

      {/* Custom comparison — approved confirmation */}
      {customCompareMode && createdRecordId && (
        <div style={{ padding: '16px 20px', background: '#d1fae5', borderRadius: 12, border: '1.5px solid #6ee7b7', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <CheckCircle2 size={18} color="#059669" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Historia clínica aprobada y firmada</span>
          </div>
          <button
            onClick={() => navigate(`/clinical-records/${createdRecordId}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <FileText size={14} /> Ver registro clínico
          </button>
        </div>
      )}

      {/* Comparison mode — approved confirmation (survives the status refetch
          that flips compareMode off once the draft becomes APPROVED). */}
      {recordDone && (
        <div style={{ padding: '16px 20px', background: '#d1fae5', borderRadius: 12, border: '1.5px solid #6ee7b7', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <CheckCircle2 size={18} color="#059669" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Historia clínica aprobada y firmada</span>
          </div>
          <button
            onClick={() => navigate(`/clinical-records/${compareRecordId || createdRecordId}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <FileText size={14} /> Ver registro clínico
          </button>
        </div>
      )}

      {/* Draft content (normal mode — no manual record to compare) */}
      {!compareMode && !customCompareMode && !resolving && !recordDone && (isReady || draft.status === 'APPROVED') && !templateLoading && (
        <>
          {/* Empty draft with no user edits: skip the form entirely, show a clean state */}
          {isEmptyDraft ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <AlertTriangle size={32} color="#d97706" style={{ marginBottom: 12 }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--s800)', margin: '0 0 8px' }}>
                Sin contenido clínico detectado
              </h2>
              <p style={{ color: 'var(--s500)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
                {transcription
                  ? 'La IA transcribió el audio pero no encontró contenido clínico para estructurar. Revisa la transcripción abajo.'
                  : 'La IA no encontró contenido clínico en este audio. Puedes redactar el registro manualmente.'}
              </p>
              <button
                onClick={() => setEditing(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                <Edit3 size={15} /> Redactar manualmente
              </button>
              {transcription && (
                <div className="card" style={{ padding: 0, marginTop: 20, overflow: 'hidden', textAlign: 'left' }}>
                  <button
                    onClick={() => setShowTranscript(v => !v)}
                    style={{ width: '100%', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
                      <FileText size={14} color="var(--s400)" /> Transcripción del audio
                    </span>
                    {showTranscript ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
                  </button>
                  {showTranscript && (
                    <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--s100)' }}>
                      <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--s600)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcription}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
          <>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16,
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
            padding: '11px 14px',
          }}>
            <Sparkles size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: '#78350f', lineHeight: 1.65 }}>
              <strong>Borrador generado por IA.</strong> Este texto es una sugerencia elaborada a partir de
              texto anonimizado. La responsabilidad clínica, diagnóstica y terapéutica es exclusiva del
              profesional habilitado. Revisa, edita y aprueba antes de incorporarlo a la historia clínica
              (Ley 23/1981 · Res. 1995/1999).
            </p>
          </div>

          {/* Transcription — always available once processed, even if the
              sections are empty, so the professional can confirm what was heard */}
          {transcription && (
            <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
              <button
                onClick={() => setShowTranscript(v => !v)}
                style={{ width: '100%', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
                  <FileText size={14} color="var(--s400)" /> Transcripción del audio
                </span>
                {showTranscript ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
              </button>
              {showTranscript && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--s100)' }}>
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--s600)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{transcription}</p>
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            {useCustomTemplate ? (
              /* Custom template — data-driven form with typed fields and existing widgets */
              <div className="card" style={{ padding: '20px 24px' }}>
                {customTemplate?.name && (
                  <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--s400)', fontStyle: 'italic' }}>
                    Formato: <strong>{customTemplate.name}</strong>
                  </p>
                )}
                <TemplatedSectionsForm
                  schema={customTemplate!.schema}
                  value={customEdit}
                  onChange={setCustomEdit}
                  disabled={!editing}
                  patientId={draft.patient_id}
                />
              </div>
            ) : (
              /* Integrated format — collapsible text sections */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sectionDefs.map(({ key, label, description }) => {
                  const isOpen = !collapsed.has(key);
                  return (
                    <div key={key} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                      <button
                        onClick={() => toggleSection(key)}
                        style={{
                          width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>{label}</p>
                          {!isOpen && <p style={{ margin: 0, fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>{description}</p>}
                        </div>
                        {isOpen ? <ChevronUp size={16} color="var(--s400)" /> : <ChevronDown size={16} color="var(--s400)" />}
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--s100)' }}>
                          <p style={{ fontSize: 12, color: 'var(--s400)', margin: '12px 0 10px', fontStyle: 'italic' }}>{description}</p>
                          {editing ? (
                            <textarea
                              value={getDraftField(key)}
                              onChange={e => setDraftEdit(prev => ({ ...prev, [key]: e.target.value }))}
                              rows={6}
                              style={{
                                width: '100%', padding: '12px 14px', borderRadius: 10,
                                border: '1.5px solid var(--teal)', fontSize: 14, color: 'var(--s700)',
                                resize: 'vertical', background: '#fff', boxSizing: 'border-box',
                                lineHeight: 1.7,
                              }}
                            />
                          ) : (
                            <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                              {getDraftField(key) || <em style={{ color: 'var(--s300)' }}>Sin contenido</em>}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {extraSections.map(([key, value]) => (
                  <div key={key} className="card" style={{ padding: '16px 20px', borderLeft: '3px solid #fde68a' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
                      {key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())}
                    </p>
                    <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#92400e' }}>
                      Sección adicional generada por la IA (formato anterior) — se incluirá al aprobar.
                    </p>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--s700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ICD-10 suggestion — the AI proposes, the professional confirms */}
          {(isReady || draft.status === 'APPROVED') && (
            <Icd10Suggestion
              value={icd10 ?? null}
              editable={isReady}
              onChange={setIcd10}
            />
          )}

          {isReady && recordType === 'INITIAL' && !useCustomTemplate && (
            <MentalExamCard value={mentalExam} onChange={setMentalExam} aiNote={aiRiskNote} />
          )}

          {isReady && recordType === 'DISCHARGE' && (
            <DischargeReasonCard value={dischargeReason} onChange={setDischargeReason} />
          )}

          {isReady && <RiskLevelSelector value={riskLevel} onChange={setRiskLevel} />}

          {/* Action bar */}
          {isReady && (
            <div style={{ display: 'flex', gap: 12 }}>
              {editing ? (
                <>
                  <button
                    onClick={() => { setDraftEdit({}); setEditing(false); }}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}
                  >
                    Descartar cambios
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: '#5b52ad', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Save size={16} /> Listo
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--s100)', color: 'var(--s700)', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Edit3 size={16} /> Editar borrador
                  </button>
                  <button
                    onClick={() => setConfirmApproveAction('approve')}
                    disabled={approving || !!createdRecordId}
                    style={{ flex: 2, padding: 13, borderRadius: 11, background: 'var(--teal)', color: '#fff', border: 'none', cursor: (approving || createdRecordId) ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (approving || createdRecordId) ? 0.7 : 1 }}
                  >
                    {approving ? <Spinner size={16} color="#fff" /> : <CheckCircle2 size={16} />}
                    {approving ? 'Aprobando…' : 'Aprobar historia clínica'}
                  </button>
                </>
              )}
            </div>
          )}

          {approveErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: '#fee2e2', borderRadius: 10, border: '1.5px solid #fca5a5', marginTop: 8 }}>
              <AlertTriangle size={15} color="#dc2626" />
              <span style={{ fontSize: 13, color: '#991b1b' }}>{approveErr}</span>
            </div>
          )}

          {(draft.status === 'APPROVED' || createdRecordId) && (
            <div style={{ padding: '16px 20px', background: '#d1fae5', borderRadius: 12, border: '1.5px solid #6ee7b7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: createdRecordId ? 12 : 0 }}>
                <CheckCircle2 size={18} color="#059669" />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>Historia clínica aprobada y firmada</span>
              </div>
              {createdRecordId && (
                <button
                  onClick={() => navigate(`/clinical-records/${createdRecordId}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  <FileText size={14} /> Ver registro clínico
                </button>
              )}
            </div>
          )}
          </>
          )}
        </>
      )}

      {/* Approve confirmation — in-app replacement for window.confirm (also
          unreliable in standalone PWAs); approval is a one-way door, so this
          gate applies to every "Aprobar" button above regardless of flow. */}
      {confirmApproveAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ maxWidth: 420, width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} color="#dc2626" />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--s800)' }}>¿Aprobar historia clínica?</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--s500)', lineHeight: 1.6 }}>
                  Una vez aprobada queda firmada — ya no podrás hacer modificaciones posteriormente.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmApproveAction(null)}
                style={{ flex: 1, padding: '10px 0', background: 'var(--s100)', color: 'var(--s700)', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                Seguir editando
              </button>
              <button
                onClick={() => {
                  const action = confirmApproveAction;
                  setConfirmApproveAction(null);
                  if (action === 'compare') handleApproveComparison(); else handleApprove();
                }}
                style={{ flex: 1, padding: '10px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 12, color: 'var(--s400)' }}>
      <span style={{ fontWeight: 600 }}>{label}:</span> {value}
    </span>
  );
}

// Shows the AI's ICD-10 suggestion and lets the professional confirm, change
// or remove it before it becomes the record's diagnosis. The suggestion is
// never assigned automatically — clinical responsibility stays with the human.
function Icd10Suggestion({ value, editable, onChange }: {
  value: ICD10Code | null;
  editable: boolean;
  onChange: (v: ICD10Code | null) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ['icd10', debounced],
    queryFn: () => diagnosesApi.searchIcd10(debounced),
    enabled: debounced.length >= 2,
  });
  const results: ICD10Code[] = data?.items ?? [];

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid #e4e2f6', background: '#faf5ff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Stethoscope size={16} color="#5b52ad" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>Diagnóstico CIE-10 sugerido</span>
        <span style={{ fontSize: 11, color: '#5b52ad', background: '#e4e2f6', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>sugerencia IA</span>
      </div>

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1.5px solid #cbc7ee', borderRadius: 9, padding: '10px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#363285' }}>{value.code}</span>
            {value.description && <span style={{ fontSize: 13, color: 'var(--s600)' }}> — {value.description}</span>}
          </div>
          {editable && (
            <button onClick={() => { onChange(null); setSearching(false); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 2 }} title="Quitar diagnóstico">
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--s500)' }}>
          Sin diagnóstico asignado. {editable && 'Puedes buscar uno para asignarlo al aprobar.'}
        </p>
      )}

      {editable && !searching && (
        <button
          onClick={() => setSearching(true)}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid #cbc7ee', background: '#fff', color: '#5b52ad', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          <Search size={13} /> {value ? 'Cambiar diagnóstico' : 'Buscar diagnóstico'}
        </button>
      )}

      {editable && searching && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #cbc7ee', borderRadius: 9, padding: '8px 12px' }}>
            {isFetching ? <Spinner size={13} color="#5b52ad" /> : <Search size={13} color="var(--s400)" />}
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Código o descripción (mín. 2 caracteres)…"
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--s700)', outline: 'none' }}
            />
            <button onClick={() => { setSearching(false); setQuery(''); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--s400)', display: 'flex', padding: 0 }}><X size={13} /></button>
          </div>
          {debounced.length >= 2 && results.length > 0 && (
            <div style={{ marginTop: 6, background: '#fff', border: '1px solid var(--s200)', borderRadius: 9, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
              {results.map(c => (
                <button
                  key={c.code}
                  onClick={() => { onChange(c); setSearching(false); setQuery(''); }}
                  style={{ width: '100%', textAlign: 'left', padding: '9px 13px', border: 'none', borderBottom: '1px solid var(--s50)', background: 'none', cursor: 'pointer', fontSize: 12.5 }}
                >
                  <span style={{ fontWeight: 700, color: '#363285' }}>{c.code}</span>
                  <span style={{ color: 'var(--s600)' }}> — {c.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// MentalExamCard wraps the shared MentalExamChecklist for the AI-draft review
// page. The mental exam is a required INITIAL section the AI never generates,
// so it must be filled here before approving (the manual record form does the
// same). Defaulted, so a blank exam never blocks approval.
function MentalExamCard({ value, onChange, aiNote }: {
  value: MentalExam; onChange: (v: MentalExam) => void; aiNote?: string | null;
}) {
  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
        Examen mental en consulta <span style={{ color: '#dc2626' }}>*</span>
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--s500)', lineHeight: 1.6 }}>
        La IA no completa esta sección — regístrala antes de aprobar.
      </p>
      {aiNote && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 14 }}>
          <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
            <strong>La IA detectó en la transcripción:</strong> {aiNote} Revisa y marca manualmente
            lo que corresponda en Indicadores de Riesgo — la IA no selecciona por ti.
          </p>
        </div>
      )}
      <MentalExamChecklist value={value} onChange={onChange} />
    </div>
  );
}

const RISK_OPTIONS = [
  { value: 'NONE',     label: 'Sin riesgo',           color: '#059669', bg: '#d1fae5' },
  { value: 'IDEATION', label: 'Ideación suicida',      color: '#d97706', bg: '#fef3c7' },
  { value: 'PLAN',     label: 'Plan suicida',          color: '#dc2626', bg: '#fee2e2' },
  { value: 'ATTEMPT',  label: 'Intento / autolesión',  color: '#5b52ad', bg: '#e4e2f6' },
];

function RiskLevelSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 16, border: '1px solid #fecaca', background: '#fff5f5' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={16} color="#dc2626" />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--s800)' }}>Nivel de riesgo</span>
        <span style={{ fontSize: 11, color: '#dc2626', background: '#fee2e2', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>obligatorio</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {RISK_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${value === opt.value ? opt.color : 'var(--s200)'}`,
              background: value === opt.value ? opt.bg : '#fff',
              color: value === opt.value ? opt.color : 'var(--s600)',
              fontSize: 13, fontWeight: value === opt.value ? 700 : 500, cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

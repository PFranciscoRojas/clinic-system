import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Save, Copy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { clinicalRecordsApi, type RecordType, type RiskLevel } from '@/api/clinicalRecords';
import { ApiError } from '@/api/client';
import { recordTemplatesApi } from '@/api/recordTemplates';
import { Spinner } from '@/components/ui/Spinner';
import { RecordSectionsForm, emptyDraft, draftToPayload, recordToDraft, validateDraft, toUIRecordType, type ClinicalDraft, type UIRecordType } from './RecordSectionsForm';
import { RECORD_TYPE_LABELS } from './constants';
import TemplatedSectionsForm, { type SectionsState } from './TemplatedSectionsForm';

// ─── Clinical record form (template v2) ──────────────────────────────────────

interface RecordFormProps {
  patientId: string;
  appointmentId?: string;
  /** Inferred from the patient's history: INITIAL when no open process, else EVOLUTION. */
  defaultType?: RecordType;
  /** Real session date (the appointment's), not the writing date. */
  sessionDate?: string;
  /** Mandatory justification when registering a past session (extemporaneous entry). */
  lateEntryReason?: string;
  /** When the treatment consent is already signed, the reminder is suppressed. */
  treatmentConsentSigned?: boolean;
  /** Whether the patient already has an open clinical process. Constrains which
   *  record types are offerable: open → Plan/Evolución/Alta; closed → Apertura. */
  hasOpenProcess?: boolean;
  /** Emitted when the selected record type changes, so the audio/AI draft can
   *  target the same format the professional is filling. */
  onTypeChange?: (t: RecordType) => void;
  /** Emitted when the selected template changes so the audio upload can pass template_id. */
  onTemplateChange?: (templateId: string | undefined) => void;
  /** When set, the template selector is hidden and this template is used directly. */
  lockedTemplateId?: string;
  /** ID of an existing, not-yet-finalized autosave draft for this appointment
   *  (discovered by the parent from the appointment's linked records) — lets
   *  the form recover server-side content on a fresh device/browser where
   *  localStorage has nothing. */
  existingDraftId?: string;
  onSaved: () => void;
}

const UI_TYPES: UIRecordType[] = ['INITIAL', 'PLAN', 'EVOLUTION', 'DISCHARGE'];

// A draft carries real work the user would lose on a format switch.
function draftHasContent(d: ClinicalDraft): boolean {
  if (Object.values(d.sections).some(v => (v ?? '').trim())) return true;
  if ((d.riskNote ?? '').trim()) return true;
  if (d.distressLevel !== undefined) return true;
  if (d.dischargeReason) return true;
  if ((d.achievementIndicators?.length ?? 0) > 0) return true;
  if ((d.planTechniques?.length ?? 0) > 0) return true;
  if ((d.taskChecklist?.length ?? 0) > 0) return true;
  return false;
}

// Deep-merges a localStorage-saved draft over emptyDraft() so old/partial
// drafts don't crash on render (e.g. spaHistory without alcohol/tobacco/other
// would cause undefined errors). Shared by the normal restore path and the
// blocked-type path (saved format no longer fits the open-process rule) —
// both need the same safe merge, the blocked one just doesn't get applied as
// the live draft.
function mergeSavedDraft(saved: Partial<ClinicalDraft>): ClinicalDraft {
  const def = emptyDraft();
  return {
    ...def,
    ...saved,
    spaHistory: saved.spaHistory ? (() => {
      const defSPA = def.spaHistory!;
      return {
        ...defSPA,
        ...saved.spaHistory,
        alcohol: { ...defSPA.alcohol, ...(saved.spaHistory.alcohol ?? {}) },
        tobacco: { ...defSPA.tobacco, ...(saved.spaHistory.tobacco ?? {}) },
        other:   { ...defSPA.other,   ...(saved.spaHistory.other   ?? {}) },
      };
    })() : def.spaHistory,
    familyMH: saved.familyMH ? { ...def.familyMH, ...saved.familyMH } : def.familyMH,
    taskAdherence: saved.taskAdherence
      ? { ...def.taskAdherence, ...saved.taskAdherence }
      : def.taskAdherence,
  };
}

type AutosaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

// Small ticking "Guardado hace Xs" label, isolated so it doesn't re-render the
// whole form every few seconds — just visible proof the autosave is alive.
// serverState reflects the periodic server-side autosave (Fase 2); "at" is
// always the localStorage save, which is the immediate, always-on net.
function SavedIndicator({ at, serverState }: { at: number; serverState: AutosaveState }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  const localLabel = secs < 5 ? 'Guardado' : secs < 60 ? `Guardado hace ${secs}s` : `Guardado hace ${Math.round(secs / 60)} min`;
  const serverNote = serverState === 'saved' ? ' · en el servidor'
    : serverState === 'saving' ? ' · guardando en el servidor…'
    : serverState === 'offline' ? ' · sin conexión, solo local'
    : '';
  return (
    <span style={{ fontSize: 11.5, color: 'var(--s400)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
      {localLabel}{serverNote}
    </span>
  );
}

export function RecordForm({ patientId, appointmentId, defaultType, sessionDate: sessionDateProp, lateEntryReason, treatmentConsentSigned, hasOpenProcess, onTypeChange, onTemplateChange, lockedTemplateId, existingDraftId, onSaved }: RecordFormProps) {
  const storageKey = appointmentId ? `clinical-draft-${appointmentId}` : `clinical-draft-patient-${patientId}`;
  const serverIdKey = `${storageKey}-serverid`;
  // Only the types the open-process rule permits are offered, so the user can't
  // pick a format the server will reject on save.
  const allowedTypes: UIRecordType[] = hasOpenProcess === undefined
    ? UI_TYPES
    : hasOpenProcess
      ? ['PLAN', 'EVOLUTION', 'DISCHARGE']
      : ['INITIAL'];
  const [uiType, setUIType] = useState<UIRecordType>(defaultType === 'INITIAL' ? 'INITIAL' : defaultType === 'DISCHARGE' ? 'DISCHARGE' : 'EVOLUTION');
  const [draft, setDraft] = useState<ClinicalDraft>(emptyDraft);
  const [sessionDate] = useState(() => sessionDateProp ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [restored, setRestored] = useState(false);
  // Timestamp of the last successful localStorage write — drives a small
  // "Guardado hace Xs" indicator so the professional has visible proof the
  // autosave is actually running (and an early signal if it ever stops).
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Set when a localStorage draft exists but its uiType no longer fits the
  // current open-process rule — content is NOT silently discarded, the
  // professional just needs to know it's there instead of seeing it vanish.
  // blockedRestoreDraft holds the actual content so it can still be shown
  // read-only (and optionally recovered into the active draft) instead of
  // just being described in a message.
  const [blockedRestoreType, setBlockedRestoreType] = useState<UIRecordType | null>(null);
  const [blockedRestoreDraft, setBlockedRestoreDraft] = useState<ClinicalDraft | null>(null);
  const [showBlockedContent, setShowBlockedContent] = useState(false);
  const [pendingType, setPendingType] = useState<UIRecordType | null>(null);
  const [err, setErr] = useState('');

  // Fase 2 — server-side autosave. serverDraftId is the id of the lenient
  // DRAFT row backing this session (created on the first tick with content);
  // dirty tracks whether there's anything new since the last successful tick.
  const [serverDraftId, setServerDraftId] = useState<string | null>(
    existingDraftId ?? (() => { try { return localStorage.getItem(serverIdKey); } catch { return null; } })(),
  );
  const [dirty, setDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');

  const apiType: RecordType = uiType === 'PLAN' ? 'EVOLUTION' : uiType;

  // Custom template selection — overridden by lockedTemplateId from parent
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(lockedTemplateId ?? '');
  const [customSections, setCustomSections] = useState<SectionsState>({});

  const { data: templates = [] } = useQuery({
    queryKey: ['record-templates', apiType],
    queryFn: () => recordTemplatesApi.list(apiType),
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Apply default template when apiType changes and a default is available.
  // Skipped when a template is locked by the parent — it already pre-selected
  // one. lockedTemplateId is '' (not undefined) when the parent explicitly
  // locked to the *built-in* integrated format — `if (lockedTemplateId)`
  // treats '' as falsy and would fall through, silently switching the
  // professional into a default custom template (and wiping customSections)
  // even though they chose the built-in format. Must check !== undefined to
  // match formatLocked's own definition below.
  useEffect(() => {
    if (lockedTemplateId !== undefined) return;
    const def = templates.find(t => t.is_default);
    if (def && !selectedTemplateId) {
      setSelectedTemplateId(def.id);
      setCustomSections({});
    }
  }, [templates, selectedTemplateId, lockedTemplateId]);

  // Notify parent of template changes (for audio upload targeting)
  useEffect(() => {
    onTemplateChange?.(selectedTemplateId || undefined);
  }, [selectedTemplateId, onTemplateChange]);

  // Discard the draft and switch format — wiped because each format has its own fields.
  // The old server-side autosave draft (if any) is left as-is, not deleted —
  // it's harmless (never finalized, doesn't burn a session number or block a
  // real process) and stays recoverable. A fresh format starts a fresh row.
  const switchType = (val: UIRecordType) => {
    setUIType(val);
    setDraft(emptyDraft());
    setSelectedTemplateId('');
    setCustomSections({});
    setErr('');
    setRestored(false);
    setPendingType(null);
    setServerDraftId(null);
    setDirty(false);
    setAutosaveState('idle');
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(serverIdKey);
    } catch { /* ignore */ }
  };

  // Switching with content asks first; empty drafts switch immediately.
  const requestTypeChange = (val: UIRecordType) => {
    if (val === uiType) return;
    if (draftHasContent(draft)) setPendingType(val);
    else switchType(val);
  };

  // Keep the audio/AI draft aligned with the format being filled.
  useEffect(() => { onTypeChange?.(apiType); }, [apiType, onTypeChange]);

  // Restore on mount. Split into two effects on purpose: existingDraftId is
  // discovered by the parent from an async query (the appointment's linked
  // records) and is often still undefined on this component's very first
  // render. A single effect keyed only on [storageKey] would capture that
  // undefined value in its closure and never re-check once the real id
  // arrives — exactly the bug that left a professional's content
  // unrecoverable after a server-only restore was needed (local had nothing,
  // but the fallback to the server draft never fired). Refs (not state) carry
  // the "did local already give us something" result across both effects
  // without retriggering renders.
  const localRestoreDoneRef = useRef(false);
  const gotContentRef = useRef(false);

  // Effect 1 — localStorage, the fast same-device path. Runs once on mount.
  //
  // Custom-template records keep their content in customSections, not draft
  // — a record using a template (lockedTemplateId/setupTemplateId set to a
  // real id) never touches `draft` at all. Restoring only {uiType, draft}
  // here, as this used to, silently restored *nothing* for every
  // template-based record: the saved draft was always present but always
  // empty, so this effect believed it had recovered something and never let
  // effect 2 fall back to the server — while the professional's actual
  // typed content (customSections) was never part of what got saved here in
  // the first place. gotContentRef is only set when there's something a
  // human actually typed, checked with the same logic the autosave tick
  // uses to decide whether there's anything worth sending.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        const savedCustomSections = (saved.customSections ?? {}) as SectionsState;
        const hasTemplateContent = Object.keys(savedCustomSections).length > 0;
        if (saved.uiType && !allowedTypes.includes(saved.uiType)) {
          // Don't load it as the live draft — submitting that type would be
          // rejected by the server — but still show the actual content
          // read-only instead of just describing that it exists.
          setBlockedRestoreType(saved.uiType);
          if (saved.draft) setBlockedRestoreDraft(mergeSavedDraft(saved.draft as Partial<ClinicalDraft>));
          if (hasTemplateContent || saved.draft) gotContentRef.current = true; // a blocked restore still counts — don't also fetch the server
        } else {
          if (saved.uiType) setUIType(saved.uiType);
          if (saved.selectedTemplateId) setSelectedTemplateId(saved.selectedTemplateId);
          if (hasTemplateContent) {
            setCustomSections(savedCustomSections);
            setRestored(true);
            setLastSavedAt(Date.now());
            gotContentRef.current = true;
          } else if (saved.draft && draftHasContent(mergeSavedDraft(saved.draft as Partial<ClinicalDraft>))) {
            setDraft(mergeSavedDraft(saved.draft as Partial<ClinicalDraft>));
            setRestored(true);
            setLastSavedAt(Date.now());
            gotContentRef.current = true;
          }
        }
      }
    } catch { /* corrupt draft — start clean */ }
    localRestoreDoneRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Effect 2 — server fallback. Depends on existingDraftId so it re-runs the
  // moment the parent's query resolves and the prop changes from undefined
  // to a real id, even if that happens well after mount. Only fetches when
  // effect 1 has already run AND found nothing usable locally.
  useEffect(() => {
    if (!localRestoreDoneRef.current || gotContentRef.current || !existingDraftId) return;
    (async () => {
      try {
        const rec = await clinicalRecordsApi.get(existingDraftId);
        if (rec.template_id) {
          setSelectedTemplateId(rec.template_id);
          setCustomSections((rec.sections ?? {}) as SectionsState);
        } else {
          const restoredType = toUIRecordType(rec.record_type, rec.sections);
          if (allowedTypes.includes(restoredType)) {
            setUIType(restoredType);
            setDraft(recordToDraft(rec.sections, rec.risk_level, rec.discharge_reason));
          }
        }
        gotContentRef.current = true;
        setRestored(true);
        setLastSavedAt(Date.now());
      } catch { /* server draft unreachable — start clean, autosave will recreate it */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingDraftId, storageKey]);

  // Persist serverDraftId so a reload picks up the same row instead of
  // creating a duplicate before the parent's existingDraftId prop catches up.
  useEffect(() => {
    try {
      if (serverDraftId) localStorage.setItem(serverIdKey, serverDraftId);
      else localStorage.removeItem(serverIdKey);
    } catch { /* ignore */ }
  }, [serverDraftId, serverIdKey]);

  // Marks the draft as having unsynced changes — cleared after a successful
  // autosave tick. Also fires once on mount with whatever was restored
  // (localStorage or server), which is correct: that content may not be on
  // the server yet, so the next tick should sync it. The autosave tick itself
  // is a no-op while the draft is still empty (see content check below).
  useEffect(() => {
    setDirty(true);
  }, [uiType, draft, customSections, selectedTemplateId]);

  // Save to localStorage 600ms after the last change. The cleanup also saves
  // immediately on SPA navigation (React Router unmounts the component, which
  // does NOT fire window.beforeunload).
  //
  // That cleanup alone is not enough: on a full reload, tab close, or a phone
  // switching apps/locking, the JS context can be torn down before React gets
  // a chance to run effect cleanups at all — there is no unmount in that case,
  // just termination. So we also save on 'pagehide' and 'visibilitychange'
  // (visibilitychange is the reliable one on mobile Safari, where beforeunload
  // is not always fired) as a belt-and-suspenders complement to the cleanup.
  useEffect(() => {
    const save = () => {
      try {
        // customSections/selectedTemplateId must travel with uiType/draft —
        // a custom-template record's real content lives there, not in draft.
        localStorage.setItem(storageKey, JSON.stringify({ uiType, draft, customSections, selectedTemplateId }));
        if (draftHasContent(draft) || Object.keys(customSections).length > 0) setLastSavedAt(Date.now());
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
  }, [storageKey, uiType, draft, customSections, selectedTemplateId]);

  // Fase 2 — server-side autosave. A ref mirrors the latest content-bearing
  // state so the 25s interval (created once, stable) never reads stale
  // closures while still avoiding being torn down and recreated on every
  // keystroke. autosaveTickRef.current is read fresh on every tick.
  const autosaveTickRef = useRef({ uiType, draft, customSections, selectedTemplate, serverDraftId, dirty });
  useEffect(() => {
    autosaveTickRef.current = { uiType, draft, customSections, selectedTemplate, serverDraftId, dirty };
  });

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const { uiType: ut, draft: d, customSections: cs, selectedTemplate: st, serverDraftId: sid, dirty: dt } = autosaveTickRef.current;
      if (!dt) return;
      const hasContent = st ? Object.keys(cs).length > 0 : draftHasContent(d);
      if (!hasContent) return;

      const body: Parameters<typeof clinicalRecordsApi.autosaveCreate>[1] = st
        ? {
            ...(appointmentId ? { appointment_id: appointmentId } : {}),
            record_type: apiType,
            session_date: sessionDate,
            template_id: st.id,
            sections: cs,
            ...(cs.risk ? { risk_level: cs.risk as RiskLevel } : {}),
          }
        : (() => {
            const payload = draftToPayload(ut, d);
            if (lateEntryReason?.trim()) payload.sections.late_entry_reason = lateEntryReason.trim();
            return {
              ...(appointmentId ? { appointment_id: appointmentId } : {}),
              record_type: ut === 'PLAN' ? 'EVOLUTION' as RecordType : ut as RecordType,
              session_date: sessionDate,
              ...payload,
            };
          })();

      setAutosaveState('saving');
      try {
        if (!sid) {
          const { id } = await clinicalRecordsApi.autosaveCreate(patientId, body);
          setServerDraftId(id);
        } else {
          await clinicalRecordsApi.autosaveUpdate(sid, body);
        }
        setDirty(false);
        setAutosaveState('saved');
      } catch (e) {
        // 403/404: the record was approved/deleted, or access was revoked
        // mid-session — stop trying and fall back to localStorage-only.
        // Anything else (network blip, 5xx) just retries on the next tick;
        // never blocks typing, never surfaces an error to the form.
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          stopped = true;
          setServerDraftId(null);
          setAutosaveState('offline');
          return;
        }
        setAutosaveState('error');
      }
    };

    const interval = setInterval(tick, 25_000);
    // Best-effort flush on the same exit signals already wired for
    // localStorage — opportunistic, never awaited (must not delay unload).
    const onHide = () => { void tick(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, appointmentId, sessionDate]);

  // Copy-forward: start from the latest approved-or-draft evolution note.
  // Risk is intentionally NOT copied — it must be re-assessed every session.
  const handleCopyForward = async () => {
    setCopying(true); setErr('');
    try {
      const { items } = await clinicalRecordsApi.list(patientId);
      // finalized excludes scratch autosave drafts that were started and
      // abandoned — only a real, authored evolution is a valid source to copy.
      const lastEvolution = items.find(m => m.record_type === 'EVOLUTION' && m.template_version >= 2 && m.finalized);
      if (!lastEvolution) { setErr('No hay una evolución anterior para copiar.'); return; }
      const rec = await clinicalRecordsApi.get(lastEvolution.id);
      const base = recordToDraft(rec.sections, undefined, undefined);
      base.riskNote = '';
      setDraft(base);
    } catch { setErr('No se pudo cargar la evolución anterior.'); }
    finally { setCopying(false); }
  };

  const handleSave = async () => {
    setSaving(true); setErr('');
    try {
      let createBody: Parameters<typeof clinicalRecordsApi.create>[1];

      if (selectedTemplate) {
        // Custom template path: validate required fields client-side
        const missingRequired = selectedTemplate.schema.find(
          s => s.required && !customSections[s.key]
        );
        if (missingRequired) {
          setErr(`El campo "${missingRequired.label}" es obligatorio.`);
          setSaving(false);
          return;
        }
        createBody = {
          ...(appointmentId ? { appointment_id: appointmentId } : {}),
          record_type: apiType,
          session_date: sessionDate,
          template_id: selectedTemplate.id,
          sections: customSections,
          risk_level: ((customSections.risk as string) || 'NONE') as RiskLevel,
        };
      } else {
        // Integrated format path
        const miss = validateDraft(uiType, draft);
        if (miss) {
          setErr(miss.message);
          if (miss.key) {
            const el = document.getElementById(`clinical-field-${miss.key}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => (el?.querySelector('textarea, input, select') as HTMLElement | null)?.focus(), 350);
          }
          setSaving(false);
          return;
        }
        const payload = draftToPayload(uiType, draft);
        if (lateEntryReason?.trim()) payload.sections.late_entry_reason = lateEntryReason.trim();
        createBody = {
          ...(appointmentId ? { appointment_id: appointmentId } : {}),
          record_type: apiType,
          session_date: sessionDate,
          ...payload,
        };
      }

      // If autosave already created a server-side draft for this session,
      // finalize it (strict validation, same as create) instead of creating
      // a second row. Falls back to today's create when autosave never fired
      // (e.g. the professional was offline the whole time).
      if (serverDraftId) {
        await clinicalRecordsApi.finalize(serverDraftId, createBody);
      } else {
        await clinicalRecordsApi.create(patientId, createBody);
      }
      localStorage.removeItem(storageKey);
      localStorage.removeItem(serverIdKey);
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('open clinical process')) {
        setErr(apiType === 'INITIAL'
          ? 'Este paciente ya tiene un proceso abierto — registra una Evolución o un Cierre.'
          : 'Este paciente no tiene proceso abierto — registra primero la Apertura.');
      } else {
        setErr('Error al guardar el registro. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  // When setup locked the format, lockedTemplateId is a string (even ''); undefined means no lock.
  const formatLocked = lockedTemplateId !== undefined;

  return (
    <div>
      {/* Record type selector — hidden when format was chosen during session setup */}
      {!formatLocked && (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Tipo de registro <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--s400)' }}>— elige el formato y se validan solo sus campos obligatorios</span>
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {UI_TYPES.filter(v => allowedTypes.includes(v)).map(val => (
              <button
                key={val}
                onClick={() => requestTypeChange(val)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                  borderColor: uiType === val ? 'var(--teal)' : 'var(--s200)',
                  background: uiType === val ? 'var(--teal)' : '#fff',
                  color: uiType === val ? '#fff' : 'var(--s600)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >{RECORD_TYPE_LABELS[val]}</button>
            ))}
            {uiType === 'EVOLUTION' && (
              <button
                onClick={handleCopyForward}
                disabled={copying}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, border: '1.5px dashed var(--s300)', background: '#fff', color: 'var(--s600)', fontSize: 12, fontWeight: 600, cursor: copying ? 'wait' : 'pointer' }}
              >
                {copying ? <Spinner size={12} color="var(--s500)" /> : <Copy size={12} />}
                Partir de la evolución anterior
              </button>
            )}
          </div>
          {hasOpenProcess !== undefined && (
            <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--s400)' }}>
              {hasOpenProcess
                ? 'El paciente tiene un proceso abierto — registra Evolución, Plan o Alta (la Apertura ya existe).'
                : 'El paciente no tiene proceso abierto — se registra la Apertura de la historia.'}
            </p>
          )}
        </>
      )}
      {formatLocked && uiType === 'EVOLUTION' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={handleCopyForward}
            disabled={copying}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, border: '1.5px dashed var(--s300)', background: '#fff', color: 'var(--s600)', fontSize: 12, fontWeight: 600, cursor: copying ? 'wait' : 'pointer' }}
          >
            {copying ? <Spinner size={12} color="var(--s500)" /> : <Copy size={12} />}
            Partir de la evolución anterior
          </button>
        </div>
      )}

      {/* Format-switch confirmation: each format has its own fields, so changing
          discards what was typed. */}
      {pendingType && (
        <div role="alertdialog" style={{ marginBottom: 12, padding: '12px 14px', background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
            <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Vas a cambiar a <strong>{RECORD_TYPE_LABELS[pendingType]}</strong>. Cada formato tiene sus propios campos, así que <strong>se borrará lo que escribiste</strong> en {RECORD_TYPE_LABELS[uiType]}. ¿Continuar?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => switchType(pendingType)}
              style={{ padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
            >Cambiar y borrar</button>
            <button
              onClick={() => setPendingType(null)}
              style={{ padding: '7px 14px', background: '#fff', color: 'var(--s600)', border: '1.5px solid var(--s200)', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
            >Cancelar</button>
          </div>
        </div>
      )}
      {restored && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--s400)', fontStyle: 'italic' }}>
          Borrador restaurado automáticamente.
        </p>
      )}
      {blockedRestoreType && (
        <div style={{ margin: '0 0 12px', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
          <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
            Tenías contenido sin guardar en formato <strong>{RECORD_TYPE_LABELS[blockedRestoreType]}</strong>, pero ya no aplica al estado actual del proceso clínico — no se cargó automáticamente para evitar guardar un formato inválido.
          </p>
          {blockedRestoreDraft && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowBlockedContent(v => !v)}
                style={{ padding: '6px 12px', background: '#fff', color: '#92400e', border: '1.5px solid #fde68a', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >{showBlockedContent ? 'Ocultar contenido' : 'Ver contenido'}</button>
              <button
                type="button"
                onClick={() => {
                  setDraft(blockedRestoreDraft);
                  setBlockedRestoreType(null);
                  setBlockedRestoreDraft(null);
                  setShowBlockedContent(false);
                }}
                style={{ padding: '6px 12px', background: '#92400e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >Recuperar en {RECORD_TYPE_LABELS[uiType]}</button>
            </div>
          )}
          {showBlockedContent && blockedRestoreDraft && (
            <div style={{ marginTop: 12, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid var(--s200)' }}>
              <RecordSectionsForm recordType={blockedRestoreType} value={blockedRestoreDraft} onChange={() => {}} disabled />
            </div>
          )}
        </div>
      )}

      {uiType === 'INITIAL' && !treatmentConsentSigned && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
          Recuerda registrar el <strong>consentimiento informado</strong> del paciente (pestaña Consentimientos del perfil) — es obligatorio antes de iniciar tratamiento.
        </p>
      )}
      {/* Template selector — hidden when format was locked in session setup */}
      {templates.length > 0 && !formatLocked && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--s500)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Formato de registro
          </p>
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              setCustomSections({});
            }}
            style={{ borderRadius: 8, border: '1.5px solid var(--s200)', padding: '6px 10px', fontSize: 13, color: 'var(--s700)', width: '100%', maxWidth: 320 }}
          >
            <option value="">Formato integrado (Colombia)</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        {selectedTemplate ? (
          <TemplatedSectionsForm
            schema={selectedTemplate.schema}
            value={customSections}
            onChange={setCustomSections}
          />
        ) : (
          <RecordSectionsForm recordType={uiType} value={draft} onChange={setDraft} />
        )}
      </div>

      {err && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fee2e2', borderRadius: 8, marginBottom: 12 }}>
          <AlertTriangle size={14} color="#dc2626" />
          <span style={{ fontSize: 13, color: '#991b1b' }}>{err}</span>
        </div>
      )}

      {lastSavedAt && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <SavedIndicator at={lastSavedAt} serverState={autosaveState} />
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--teal)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}
      >
        {saving ? <Spinner size={16} color="#fff" /> : <Save size={16} />}
        {saving ? 'Guardando registro…' : 'Guardar registro clínico'}
      </button>
    </div>
  );
}


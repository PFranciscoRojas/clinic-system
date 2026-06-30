import { useState, useEffect } from 'react';
import { AlertTriangle, Save, Copy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { clinicalRecordsApi, type RecordType, type RiskLevel } from '@/api/clinicalRecords';
import { recordTemplatesApi } from '@/api/recordTemplates';
import { Spinner } from '@/components/ui/Spinner';
import { RecordSectionsForm, emptyDraft, draftToPayload, recordToDraft, validateDraft, type ClinicalDraft, type UIRecordType } from './RecordSectionsForm';
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

export function RecordForm({ patientId, appointmentId, defaultType, sessionDate: sessionDateProp, lateEntryReason, treatmentConsentSigned, hasOpenProcess, onTypeChange, onTemplateChange, lockedTemplateId, onSaved }: RecordFormProps) {
  const storageKey = appointmentId ? `clinical-draft-${appointmentId}` : `clinical-draft-patient-${patientId}`;
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
  const [pendingType, setPendingType] = useState<UIRecordType | null>(null);
  const [err, setErr] = useState('');

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
  // Skipped when a template is locked by the parent — it already pre-selected one.
  useEffect(() => {
    if (lockedTemplateId) return;
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
  const switchType = (val: UIRecordType) => {
    setUIType(val);
    setDraft(emptyDraft());
    setSelectedTemplateId('');
    setCustomSections({});
    setErr('');
    setRestored(false);
    setPendingType(null);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  };

  // Switching with content asks first; empty drafts switch immediately.
  const requestTypeChange = (val: UIRecordType) => {
    if (val === uiType) return;
    if (draftHasContent(draft)) setPendingType(val);
    else switchType(val);
  };

  // Keep the audio/AI draft aligned with the format being filled.
  useEffect(() => { onTypeChange?.(apiType); }, [apiType, onTypeChange]);

  // Autosave: the in-progress note survives a closed tab or session lock.
  // Nothing reaches the server until the professional saves explicitly.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        // Ignore a saved draft whose type the process rule no longer permits.
        if (saved.uiType && !allowedTypes.includes(saved.uiType)) return;
        if (saved.uiType) setUIType(saved.uiType);
        if (saved.draft) { setDraft({ ...emptyDraft(), ...saved.draft }); setRestored(true); }
      }
    } catch { /* corrupt draft — start clean */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ uiType, draft })); } catch { /* storage full */ }
    }, 600);
    return () => clearTimeout(t);
  }, [storageKey, uiType, draft]);

  // Force-save immediately on page unload so the 600ms debounce doesn't lose
  // content typed just before F5 or navigating away.
  useEffect(() => {
    const save = () => {
      try { localStorage.setItem(storageKey, JSON.stringify({ uiType, draft })); } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, uiType, draft]);

  // Copy-forward: start from the latest approved-or-draft evolution note.
  // Risk is intentionally NOT copied — it must be re-assessed every session.
  const handleCopyForward = async () => {
    setCopying(true); setErr('');
    try {
      const { items } = await clinicalRecordsApi.list(patientId);
      const lastEvolution = items.find(m => m.record_type === 'EVOLUTION' && m.template_version >= 2);
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

      await clinicalRecordsApi.create(patientId, createBody);
      localStorage.removeItem(storageKey);
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


import { useState, useEffect } from 'react';
import { AlertTriangle, Save, Copy } from 'lucide-react';
import { clinicalRecordsApi, type RecordType } from '@/api/clinicalRecords';
import { Spinner } from '@/components/ui/Spinner';
import { RecordSectionsForm, emptyDraft, draftToPayload, recordToDraft, validateDraft, type ClinicalDraft } from './RecordSectionsForm';
import { RECORD_TYPE_LABELS } from './constants';

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
  onSaved: () => void;
}

const V2_TYPES = ['INITIAL', 'EVOLUTION', 'DISCHARGE'] as const;

export function RecordForm({ patientId, appointmentId, defaultType, sessionDate: sessionDateProp, lateEntryReason, onSaved }: RecordFormProps) {
  const storageKey = appointmentId ? `clinical-draft-${appointmentId}` : `clinical-draft-patient-${patientId}`;
  const [recordType, setRecordType] = useState<RecordType>(defaultType ?? 'EVOLUTION');
  const [draft, setDraft] = useState<ClinicalDraft>(emptyDraft);
  const [sessionDate] = useState(() => sessionDateProp ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [restored, setRestored] = useState(false);
  const [err, setErr] = useState('');

  // Autosave: the in-progress note survives a closed tab or session lock.
  // Nothing reaches the server until the professional saves explicitly.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.recordType) setRecordType(saved.recordType);
        if (saved.draft) { setDraft({ ...emptyDraft(), ...saved.draft }); setRestored(true); }
      }
    } catch { /* corrupt draft — start clean */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ recordType, draft })); } catch { /* storage full */ }
    }, 600);
    return () => clearTimeout(t);
  }, [storageKey, recordType, draft]);

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
    const validation = validateDraft(recordType, draft);
    if (validation) { setErr(validation); return; }
    setSaving(true); setErr('');
    try {
      const payload = draftToPayload(recordType, draft);
      if (lateEntryReason?.trim()) payload.sections.late_entry_reason = lateEntryReason.trim();
      await clinicalRecordsApi.create(patientId, {
        ...(appointmentId ? { appointment_id: appointmentId } : {}),
        record_type: recordType,
        session_date: sessionDate,
        ...payload,
      });
      localStorage.removeItem(storageKey);
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('open clinical process')) {
        setErr(recordType === 'INITIAL'
          ? 'Este paciente ya tiene un proceso abierto — registra una Evolución o un Cierre.'
          : 'Este paciente no tiene proceso abierto — registra primero la Apertura.');
      } else {
        setErr('Error al guardar el registro. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Record type selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {V2_TYPES.map(val => (
          <button
            key={val}
            onClick={() => setRecordType(val)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
              borderColor: recordType === val ? 'var(--teal)' : 'var(--s200)',
              background: recordType === val ? 'var(--teal)' : '#fff',
              color: recordType === val ? '#fff' : 'var(--s600)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >{RECORD_TYPE_LABELS[val]}</button>
        ))}
        {recordType === 'EVOLUTION' && (
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
      {restored && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--s400)', fontStyle: 'italic' }}>
          Borrador restaurado automáticamente.
        </p>
      )}

      {recordType === 'INITIAL' && (
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
          Recuerda registrar el <strong>consentimiento informado</strong> del paciente (pestaña Consentimientos del perfil) — es obligatorio antes de iniciar tratamiento.
        </p>
      )}
      <div style={{ marginBottom: 16 }}>
        <RecordSectionsForm recordType={recordType} value={draft} onChange={setDraft} />
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


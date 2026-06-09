import type { RecordSections, RecordType, RiskLevel, DischargeReason, MentalExamEntry } from '@/api/clinicalRecords';
import { TEMPLATE_SECTIONS, DISCHARGE_REASONS } from './constants';
import { RiskSelector } from './RiskSelector';
import { MentalExamChecklist, defaultMentalExam, type MentalExam } from './MentalExamChecklist';

// Editable state of one template-v2 record, shared by the creation form,
// the edit view, copy-forward and autosave.
export interface ClinicalDraft {
  sections: Record<string, string>;
  mentalExam: MentalExam;
  risk?: RiskLevel;
  riskNote: string;
  dischargeReason?: DischargeReason;
}

export function emptyDraft(): ClinicalDraft {
  return { sections: {}, mentalExam: defaultMentalExam(), riskNote: '' };
}

// draftToPayload shapes the draft into the API body for a given type.
export function draftToPayload(recordType: RecordType, d: ClinicalDraft): {
  sections: RecordSections; risk_level?: RiskLevel; discharge_reason?: DischargeReason;
} {
  const defs = TEMPLATE_SECTIONS[recordType as keyof typeof TEMPLATE_SECTIONS] ?? [];
  const sections: RecordSections = {};
  for (const def of defs) {
    const v = (d.sections[def.key] ?? '').trim();
    if (v) sections[def.key] = v;
  }
  if (recordType === 'INITIAL') sections.mental_exam = d.mentalExam;
  if (d.riskNote.trim()) sections.risk_note = d.riskNote.trim();
  return {
    sections,
    risk_level: d.risk,
    ...(recordType === 'DISCHARGE' ? { discharge_reason: d.dischargeReason } : {}),
  };
}

// recordToDraft rebuilds an editable draft from a stored v2 record
// (edit mode) or from a previous note (copy-forward).
export function recordToDraft(sections: RecordSections | undefined, risk?: RiskLevel, reason?: DischargeReason): ClinicalDraft {
  const d = emptyDraft();
  if (sections) {
    for (const [k, v] of Object.entries(sections)) {
      if (k === 'mental_exam' && typeof v === 'object') {
        d.mentalExam = { ...defaultMentalExam(), ...(v as Record<string, MentalExamEntry>) };
      } else if (k === 'risk_note' && typeof v === 'string') {
        d.riskNote = v;
      } else if (typeof v === 'string') {
        d.sections[k] = v;
      }
    }
  }
  d.risk = risk;
  d.dischargeReason = reason;
  return d;
}

// validateDraft mirrors the backend rules so the user gets instant feedback.
export function validateDraft(recordType: RecordType, d: ClinicalDraft): string | null {
  const defs = TEMPLATE_SECTIONS[recordType as keyof typeof TEMPLATE_SECTIONS];
  if (!defs) return 'Tipo de registro no soportado';
  for (const def of defs) {
    if (def.required && !(d.sections[def.key] ?? '').trim()) {
      return `La sección "${def.label}" es obligatoria`;
    }
  }
  if (!d.risk) return 'La evaluación de riesgo es obligatoria';
  if (recordType === 'DISCHARGE' && !d.dischargeReason) return 'El motivo de egreso es obligatorio';
  return null;
}

interface Props {
  recordType: RecordType;
  value: ClinicalDraft;
  onChange: (d: ClinicalDraft) => void;
  disabled?: boolean;
}

export function RecordSectionsForm({ recordType, value, onChange, disabled }: Props) {
  const defs = TEMPLATE_SECTIONS[recordType as keyof typeof TEMPLATE_SECTIONS] ?? [];
  const setSection = (key: string, v: string) =>
    onChange({ ...value, sections: { ...value.sections, [key]: v } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {recordType === 'DISCHARGE' && (
        <div className="card" style={{ padding: '16px 20px', border: value.dischargeReason ? undefined : '1.5px solid #fde68a' }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            Motivo de egreso <span style={{ color: '#dc2626' }}>*</span>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DISCHARGE_REASONS.map(r => {
              const active = value.dischargeReason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, dischargeReason: r.value })}
                  style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`, background: active ? 'var(--teal)' : '#fff', color: active ? '#fff' : 'var(--s500)' }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {defs.map(def => (
        <div key={def.key} className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            {def.label} {def.required && <span style={{ color: '#dc2626' }}>*</span>}
          </p>
          <textarea
            value={value.sections[def.key] ?? ''}
            disabled={disabled}
            onChange={e => setSection(def.key, e.target.value)}
            placeholder={def.placeholder}
            rows={def.rows ?? 3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--s200)', fontSize: 14, color: 'var(--s700)', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, background: '#fff' }}
          />
        </div>
      ))}

      {recordType === 'INITIAL' && (
        <MentalExamChecklist
          value={value.mentalExam}
          onChange={m => onChange({ ...value, mentalExam: m })}
          disabled={disabled}
        />
      )}

      <RiskSelector value={value.risk} onChange={r => onChange({ ...value, risk: r })} disabled={disabled} />
      {value.risk && value.risk !== 'NONE' && (
        <div className="card" style={{ padding: '14px 20px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>Nota sobre el riesgo</p>
          <textarea
            value={value.riskNote}
            disabled={disabled}
            onChange={e => onChange({ ...value, riskNote: e.target.value })}
            placeholder="Evaluación, factores protectores, plan de seguridad acordado…"
            rows={2}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #fde68a', fontSize: 14, color: 'var(--s700)', resize: 'vertical', boxSizing: 'border-box', background: '#fffbeb' }}
          />
        </div>
      )}
    </div>
  );
}

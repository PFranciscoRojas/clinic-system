import type { RecordSections, RecordType, RiskLevel, DischargeReason, MentalExamEntry } from '@/api/clinicalRecords';
import {
  TEMPLATE_SECTIONS, DISCHARGE_REASONS,
  defaultSPAHistory, defaultFamilyMH, defaultFormulation5F,
  defaultTaskAdherence, defaultSessionEval, defaultFunctionality,
  type SPAHistoryData, type FamilyMentalHealthData, type Formulation5FData,
  type TaskAdherenceData, type SessionEvalData, type FunctionalityData,
} from './constants';
import { RiskSelector } from './RiskSelector';
import { MentalExamChecklist, defaultMentalExam, type MentalExam } from './MentalExamChecklist';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { SubjectiveDistressScale } from './SubjectiveDistressScale';
import { SPAHistoryPanel } from './SPAHistoryPanel';
import { ClinicalFormulation5F } from './ClinicalFormulation5F';
import { TaskAdherencePanel } from './TaskAdherencePanel';
import { SessionEvaluationPanel } from './SessionEvaluationPanel';
import { TaskChecklist } from './TaskChecklist';
import { FunctionalityPanel } from './FunctionalityPanel';

// ── Draft type ────────────────────────────────────────────────────────────────
// Editable state of one template-v2 record, shared by the creation form,
// the edit view, copy-forward and autosave.
export interface ClinicalDraft {
  sections: Record<string, string>;
  mentalExam: MentalExam;
  risk?: RiskLevel;
  riskNote: string;
  dischargeReason?: DischargeReason;
  // structured fields — Formato 1 (INITIAL)
  distressLevel?: number;
  spaHistory?: SPAHistoryData;
  familyMH?: FamilyMentalHealthData;
  clinicalFormulation?: Formulation5FData;
  // structured fields — Formato 3 (EVOLUTION)
  taskAdherence?: TaskAdherenceData;
  sessionEval?: SessionEvalData;
  taskChecklist?: string[];
  // Formato 2 flag: marks an EVOLUTION as a therapeutic plan session
  isPlanSession?: boolean;
  // structured fields — Formato 4 (DISCHARGE)
  functionality?: FunctionalityData;
}

export function emptyDraft(): ClinicalDraft {
  return {
    sections: {},
    mentalExam: defaultMentalExam(),
    riskNote: '',
    spaHistory: defaultSPAHistory(),
    familyMH: defaultFamilyMH(),
    clinicalFormulation: defaultFormulation5F(),
    taskAdherence: defaultTaskAdherence(),
    sessionEval: defaultSessionEval(),
    taskChecklist: [],
    functionality: defaultFunctionality(),
  };
}

// ── Payload builder ───────────────────────────────────────────────────────────
// draftToPayload shapes the draft into the API body for a given record type.
export function draftToPayload(recordType: RecordType, d: ClinicalDraft): {
  sections: RecordSections; risk_level?: RiskLevel; discharge_reason?: DischargeReason;
} {
  const defs = TEMPLATE_SECTIONS[recordType as keyof typeof TEMPLATE_SECTIONS] ?? [];
  const sections: RecordSections = {};

  // Text sections
  for (const def of defs) {
    const v = (d.sections[def.key] ?? '').trim();
    if (v) sections[def.key] = v;
  }

  // INITIAL structured fields
  if (recordType === 'INITIAL') {
    sections.mental_exam = d.mentalExam;
    if (d.distressLevel !== undefined) sections.distress_level = d.distressLevel;
    if (d.spaHistory) sections.spa_history = d.spaHistory as unknown as Record<string, unknown>;
    if (d.familyMH) sections.family_mental_health = d.familyMH as unknown as Record<string, unknown>;
    if (d.clinicalFormulation) {
      sections.clinical_formulation = d.clinicalFormulation as unknown as Record<string, unknown>;
    }
  }

  // EVOLUTION structured fields
  if (recordType === 'EVOLUTION') {
    if (d.distressLevel !== undefined) sections.distress_level = d.distressLevel;
    if (d.taskAdherence) sections.task_adherence = d.taskAdherence as unknown as Record<string, unknown>;
    if (d.sessionEval) sections.session_evaluation = d.sessionEval as unknown as Record<string, unknown>;
    if (d.taskChecklist?.length) sections.task_checklist = d.taskChecklist;
    if (d.isPlanSession) sections.is_plan_session = true;
  }

  // DISCHARGE structured fields
  if (recordType === 'DISCHARGE') {
    if (d.functionality?.level) {
      sections.functionality = d.functionality as unknown as Record<string, unknown>;
    }
  }

  if (d.riskNote.trim()) sections.risk_note = d.riskNote.trim();

  return {
    sections,
    risk_level: d.risk,
    ...(recordType === 'DISCHARGE' ? { discharge_reason: d.dischargeReason } : {}),
  };
}

// ── Draft parser ──────────────────────────────────────────────────────────────
// recordToDraft rebuilds an editable draft from a stored v2 record
// (edit mode) or from a previous note (copy-forward).
export function recordToDraft(sections: RecordSections | undefined, risk?: RiskLevel, reason?: DischargeReason): ClinicalDraft {
  const d = emptyDraft();
  if (sections) {
    for (const [k, v] of Object.entries(sections)) {
      if (k === 'mental_exam' && typeof v === 'object' && !Array.isArray(v)) {
        d.mentalExam = { ...defaultMentalExam(), ...(v as Record<string, MentalExamEntry>) };
      } else if (k === 'risk_note' && typeof v === 'string') {
        d.riskNote = v;
      } else if (k === 'distress_level' && typeof v === 'number') {
        d.distressLevel = v;
      } else if (k === 'spa_history' && typeof v === 'object' && !Array.isArray(v)) {
        d.spaHistory = v as unknown as SPAHistoryData;
      } else if (k === 'family_mental_health' && typeof v === 'object' && !Array.isArray(v)) {
        d.familyMH = v as unknown as FamilyMentalHealthData;
      } else if (k === 'clinical_formulation' && typeof v === 'object' && !Array.isArray(v)) {
        d.clinicalFormulation = v as unknown as Formulation5FData;
      } else if (k === 'task_adherence' && typeof v === 'object' && !Array.isArray(v)) {
        d.taskAdherence = v as unknown as TaskAdherenceData;
      } else if (k === 'session_evaluation' && typeof v === 'object' && !Array.isArray(v)) {
        d.sessionEval = v as unknown as SessionEvalData;
      } else if (k === 'task_checklist' && Array.isArray(v)) {
        d.taskChecklist = v as string[];
      } else if (k === 'is_plan_session' && typeof v === 'boolean') {
        d.isPlanSession = v;
      } else if (k === 'functionality' && typeof v === 'object' && !Array.isArray(v)) {
        d.functionality = v as unknown as FunctionalityData;
      } else if (typeof v === 'string') {
        d.sections[k] = v;
      }
    }
  }
  d.risk = risk;
  d.dischargeReason = reason;
  return d;
}

// ── Validator ─────────────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
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

  // ── Side column ──
  const sideColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {/* DISCHARGE: motivo de egreso */}
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

      {/* DISCHARGE: funcionality + referral destination */}
      {recordType === 'DISCHARGE' && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <FunctionalityPanel
            value={value.functionality ?? defaultFunctionality()}
            onChange={v => onChange({ ...value, functionality: v })}
            dischargeReason={value.dischargeReason}
            disabled={disabled}
          />
        </div>
      )}

      {/* INITIAL: mental exam */}
      {recordType === 'INITIAL' && (
        <MentalExamChecklist
          value={value.mentalExam}
          onChange={m => onChange({ ...value, mentalExam: m })}
          disabled={disabled}
        />
      )}

      {/* INITIAL: SPA history + family mental health */}
      {recordType === 'INITIAL' && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            IV. Antecedentes — SPA y familia
          </p>
          <SPAHistoryPanel
            spa={value.spaHistory ?? defaultSPAHistory()}
            familyMH={value.familyMH ?? defaultFamilyMH()}
            onSPAChange={v => onChange({ ...value, spaHistory: v })}
            onFamilyMHChange={v => onChange({ ...value, familyMH: v })}
            disabled={disabled}
          />
        </div>
      )}

      {/* EVOLUTION: session evaluation (axis + closing eval) */}
      {recordType === 'EVOLUTION' && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            Evaluación de sesión
          </p>
          <SessionEvaluationPanel
            value={value.sessionEval ?? defaultSessionEval()}
            onChange={v => onChange({ ...value, sessionEval: v })}
            disabled={disabled}
          />
        </div>
      )}

      {/* Risk selector — all types */}
      <RiskSelector value={value.risk} onChange={r => onChange({ ...value, risk: r })} disabled={disabled} />
      {value.risk && value.risk !== 'NONE' && (
        <div className="card" style={{ padding: '14px 20px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>Nota sobre el riesgo</p>
          <AutoGrowTextarea
            value={value.riskNote}
            disabled={disabled}
            minRows={3}
            onChange={e => onChange({ ...value, riskNote: e.target.value })}
            placeholder="Evaluación, factores protectores, plan de seguridad acordado…"
            style={{ border: '1.5px solid #fde68a', background: '#fffbeb' }}
          />
        </div>
      )}
    </div>
  );

  // ── Main card sections ──
  const mainCard = (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

      {/* Distress scale — INITIAL and EVOLUTION */}
      {(recordType === 'INITIAL' || recordType === 'EVOLUTION') && (
        <SubjectiveDistressScale
          value={value.distressLevel}
          onChange={v => onChange({ ...value, distressLevel: v })}
          disabled={disabled}
        />
      )}

      {/* Task adherence — EVOLUTION only, before session_development */}
      {recordType === 'EVOLUTION' && (
        <TaskAdherencePanel
          value={value.taskAdherence ?? defaultTaskAdherence()}
          onChange={v => onChange({ ...value, taskAdherence: v })}
          disabled={disabled}
        />
      )}

      {/* Text sections */}
      {defs.map(def => (
        <div key={def.key}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            {def.label} {def.required && <span style={{ color: '#dc2626' }}>*</span>}
          </p>
          <AutoGrowTextarea
            value={value.sections[def.key] ?? ''}
            disabled={disabled}
            minRows={Math.max(def.rows ?? 3, 4)}
            onChange={e => setSection(def.key, e.target.value)}
            placeholder={def.placeholder}
          />
        </div>
      ))}

      {/* Plan session toggle — EVOLUTION only */}
      {recordType === 'EVOLUTION' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${value.isPlanSession ? 'var(--teal)' : 'var(--s200)'}`, background: value.isPlanSession ? '#f0fafa' : '#fafafa' }}>
          <input
            type="checkbox" checked={value.isPlanSession ?? false} disabled={disabled}
            onChange={e => onChange({ ...value, isPlanSession: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: 'var(--teal)', cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
          />
          <span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)', display: 'block' }}>
              Esta es la sesión de formulación y plan terapéutico (Formato 2)
            </span>
            <span style={{ fontSize: 12, color: 'var(--s400)' }}>
              Marca para registrar el análisis funcional y los objetivos terapéuticos consensuados
            </span>
          </span>
        </label>
      )}

      {/* Formato 2 extra fields — EVOLUTION plan session only */}
      {recordType === 'EVOLUTION' && value.isPlanSession && (
        <>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
              Análisis funcional — Antecedentes y respuestas
            </p>
            <AutoGrowTextarea
              value={value.sections['functional_analysis'] ?? ''}
              disabled={disabled}
              minRows={4}
              onChange={e => setSection('functional_analysis', e.target.value)}
              placeholder="Antecedentes de la conducta problema. Triple sistema de respuesta: cognitivo (pensamientos automáticos), fisiológico (síntomas corporales), motor (conductas observables). Consecuencias…"
            />
          </div>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
              Objetivos terapéuticos consensuados
            </p>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{ marginBottom: n < 4 ? 8 : 0 }}>
                <AutoGrowTextarea
                  value={value.sections[`therapeutic_goal_${n}`] ?? ''}
                  disabled={disabled}
                  minRows={2}
                  onChange={e => setSection(`therapeutic_goal_${n}`, e.target.value)}
                  placeholder={`Objetivo ${n}…`}
                />
              </div>
            ))}
          </div>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
              Hipótesis clínica y devolución al paciente (psicoeducación)
            </p>
            <AutoGrowTextarea
              value={value.sections['clinical_hypothesis'] ?? ''}
              disabled={disabled}
              minRows={4}
              onChange={e => setSection('clinical_hypothesis', e.target.value)}
              placeholder="Hipótesis explicativa del problema. Cómo se devolvió la información al consultante en lenguaje no técnico…"
            />
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Two-column grid: main sections card + side column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16, alignItems: 'start' }}>
        {mainCard}
        {sideColumn}
      </div>

      {/* Full-width extras below the two-column grid */}

      {/* EVOLUTION: task checklist */}
      {recordType === 'EVOLUTION' && (
        <TaskChecklist
          selected={value.taskChecklist ?? []}
          onChange={v => onChange({ ...value, taskChecklist: v })}
          disabled={disabled}
        />
      )}

      {/* INITIAL: 5-factor clinical formulation */}
      {recordType === 'INITIAL' && (
        <ClinicalFormulation5F
          value={value.clinicalFormulation ?? defaultFormulation5F()}
          onChange={v => onChange({ ...value, clinicalFormulation: v })}
          disabled={disabled}
        />
      )}
    </div>
  );
}

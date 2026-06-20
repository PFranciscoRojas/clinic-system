import type { RecordSections, RecordType, RiskLevel, DischargeReason, MentalExamEntry } from '@/api/clinicalRecords';
import {
  TEMPLATE_SECTIONS, DISCHARGE_REASONS,
  ACHIEVEMENT_INDICATOR_OPTIONS, TECHNIQUE_OPTIONS,
  defaultSPAHistory, defaultFamilyMH, defaultFormulation5F,
  defaultTaskAdherence, defaultSessionEval, defaultFunctionality, defaultFunctionalAnalysis,
  type SPAHistoryData, type FamilyMentalHealthData, type Formulation5FData,
  type TaskAdherenceData, type SessionEvalData, type FunctionalityData, type FunctionalAnalysisData,
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
import { FunctionalAnalysisPanel } from './FunctionalAnalysisPanel';

// UI-only type — PLAN maps to EVOLUTION in the API (is_plan_session: true).
export type UIRecordType = 'INITIAL' | 'PLAN' | 'EVOLUTION' | 'DISCHARGE';

// Derive the correct UI type from a stored record.
// PLAN sessions are stored as EVOLUTION with is_plan_session: true.
export function toUIRecordType(apiType: RecordType, sections?: RecordSections): UIRecordType {
  if (apiType === 'EVOLUTION' && sections?.is_plan_session === true) return 'PLAN';
  if (apiType === 'INTERCONSULTATION') return 'EVOLUTION'; // no v2 template
  return apiType as UIRecordType;
}

// ── Draft type ────────────────────────────────────────────────────────────────
export interface ClinicalDraft {
  sections: Record<string, string>;
  mentalExam: MentalExam;
  risk?: RiskLevel;
  riskNote: string;
  dischargeReason?: DischargeReason;
  // Formato 1 (INITIAL)
  distressLevel?: number;
  spaHistory?: SPAHistoryData;
  familyMH?: FamilyMentalHealthData;
  clinicalFormulation?: Formulation5FData;
  // Formato 2 (PLAN)
  functionalAnalysis?: FunctionalAnalysisData;
  achievementIndicators?: string[];
  planTechniques?: string[];
  // Formato 3 (EVOLUTION)
  taskAdherence?: TaskAdherenceData;
  sessionEval?: SessionEvalData;
  taskChecklist?: string[];
  // Formato 4 (DISCHARGE)
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
    functionalAnalysis: defaultFunctionalAnalysis(),
    achievementIndicators: [],
    planTechniques: [],
    taskAdherence: defaultTaskAdherence(),
    sessionEval: defaultSessionEval(),
    taskChecklist: [],
    functionality: defaultFunctionality(),
  };
}

// ── Payload builder ───────────────────────────────────────────────────────────
export function draftToPayload(uiType: UIRecordType, d: ClinicalDraft): {
  sections: RecordSections; risk_level?: RiskLevel; discharge_reason?: DischargeReason;
} {
  const apiType: RecordType = uiType === 'PLAN' ? 'EVOLUTION' : uiType;
  const defs = TEMPLATE_SECTIONS[apiType as keyof typeof TEMPLATE_SECTIONS] ?? [];
  const sections: RecordSections = {};

  for (const def of defs) {
    const v = (d.sections[def.key] ?? '').trim();
    if (v) sections[def.key] = v;
  }

  if (uiType === 'INITIAL') {
    sections.mental_exam = d.mentalExam;
    if (d.distressLevel !== undefined) sections.distress_level = d.distressLevel;
    if (d.spaHistory) sections.spa_history = d.spaHistory as unknown as Record<string, unknown>;
    if (d.familyMH) sections.family_mental_health = d.familyMH as unknown as Record<string, unknown>;
    if (d.clinicalFormulation) sections.clinical_formulation = d.clinicalFormulation as unknown as Record<string, unknown>;
  }

  if (uiType === 'PLAN') {
    sections.is_plan_session = true;
    if (d.functionalAnalysis) sections.functional_analysis = d.functionalAnalysis as unknown as Record<string, unknown>;
    // 4 therapeutic goals
    for (let i = 1; i <= 4; i++) {
      const v = (d.sections[`therapeutic_goal_${i}`] ?? '').trim();
      if (v) sections[`therapeutic_goal_${i}`] = v;
    }
    if ((d.sections['clinical_hypothesis'] ?? '').trim()) {
      sections.clinical_hypothesis = d.sections['clinical_hypothesis'].trim();
    }
    if (d.achievementIndicators?.length) sections.achievement_indicators = d.achievementIndicators;
    if (d.planTechniques?.length) sections.techniques = d.planTechniques;
    if (d.taskChecklist?.length) sections.task_checklist = d.taskChecklist;
  }

  if (uiType === 'EVOLUTION') {
    if (d.distressLevel !== undefined) sections.distress_level = d.distressLevel;
    if (d.taskAdherence) sections.task_adherence = d.taskAdherence as unknown as Record<string, unknown>;
    if (d.sessionEval) sections.session_evaluation = d.sessionEval as unknown as Record<string, unknown>;
    if (d.taskChecklist?.length) sections.task_checklist = d.taskChecklist;
  }

  if (uiType === 'DISCHARGE') {
    if (d.functionality?.level) sections.functionality = d.functionality as unknown as Record<string, unknown>;
  }

  if (d.riskNote.trim()) sections.risk_note = d.riskNote.trim();

  return {
    sections,
    risk_level: d.risk,
    ...(apiType === 'DISCHARGE' ? { discharge_reason: d.dischargeReason } : {}),
  };
}

// ── Draft parser ──────────────────────────────────────────────────────────────
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
      } else if (k === 'functional_analysis' && typeof v === 'object' && !Array.isArray(v)) {
        d.functionalAnalysis = v as unknown as FunctionalAnalysisData;
      } else if (k === 'achievement_indicators' && Array.isArray(v)) {
        d.achievementIndicators = v as string[];
      } else if (k === 'techniques' && Array.isArray(v)) {
        d.planTechniques = v as string[];
      } else if (k === 'task_adherence' && typeof v === 'object' && !Array.isArray(v)) {
        d.taskAdherence = v as unknown as TaskAdherenceData;
      } else if (k === 'session_evaluation' && typeof v === 'object' && !Array.isArray(v)) {
        d.sessionEval = v as unknown as SessionEvalData;
      } else if (k === 'task_checklist' && Array.isArray(v)) {
        d.taskChecklist = v as string[];
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
export function validateDraft(uiType: UIRecordType, d: ClinicalDraft): string | null {
  if (uiType === 'PLAN') {
    if (!(d.sections['session_development'] ?? '').trim()) {
      return 'El análisis funcional inicial es obligatorio';
    }
    if (!d.risk) return 'La evaluación de riesgo es obligatoria';
    return null;
  }
  const apiType: RecordType = uiType;
  const defs = TEMPLATE_SECTIONS[apiType as keyof typeof TEMPLATE_SECTIONS];
  if (!defs) return 'Tipo de registro no soportado';
  for (const def of defs) {
    if (def.required && !(d.sections[def.key] ?? '').trim()) {
      return `La sección "${def.label}" es obligatoria`;
    }
  }
  if (!d.risk) return 'La evaluación de riesgo es obligatoria';
  if (uiType === 'DISCHARGE' && !d.dischargeReason) return 'El motivo de egreso es obligatorio';
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  recordType: UIRecordType;
  value: ClinicalDraft;
  onChange: (d: ClinicalDraft) => void;
  disabled?: boolean;
}

function CheckChips({
  options, selected, onToggle, disabled,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (k: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(opt.key)}
            style={{
              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
              cursor: disabled ? 'default' : 'pointer',
              border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`,
              background: active ? 'var(--teal)' : '#fff',
              color: active ? '#fff' : 'var(--s600)',
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  );
}

function toggleArr(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

export function RecordSectionsForm({ recordType, value, onChange, disabled }: Props) {
  const apiType: RecordType = recordType === 'PLAN' ? 'EVOLUTION' : recordType;
  const defs = TEMPLATE_SECTIONS[apiType as keyof typeof TEMPLATE_SECTIONS] ?? [];
  const setSection = (key: string, v: string) =>
    onChange({ ...value, sections: { ...value.sections, [key]: v } });

  // ── Risk + riskNote (shared side element) ──
  const riskPanel = (
    <>
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
    </>
  );

  // ════════════════════════════════════════════════════
  // F2 — PLAN TERAPÉUTICO
  // ════════════════════════════════════════════════════
  if (recordType === 'PLAN') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16, alignItems: 'start' }}>
          {/* Main card */}
          <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* I. Análisis funcional — intro */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
                I. Análisis funcional — Comportamiento objeto <span style={{ color: '#dc2626' }}>*</span>
              </p>
              <AutoGrowTextarea
                value={value.sections['session_development'] ?? ''}
                disabled={disabled}
                minRows={3}
                onChange={e => setSection('session_development', e.target.value)}
                placeholder="¿Cómo estuvo el paciente durante la semana? Retomar el motivo de consulta, conducta problema…"
              />
            </div>

            {/* Triple sistema de respuesta */}
            <FunctionalAnalysisPanel
              value={value.functionalAnalysis ?? defaultFunctionalAnalysis()}
              onChange={v => onChange({ ...value, functionalAnalysis: v })}
              disabled={disabled}
            />

            {/* II. Objetivos terapéuticos */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
                II. Objetivos terapéuticos consensuados
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--s500)' }}>
                ¿Qué quiere lograr el consultante? Máximo 4 puntos concretos.
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

            {/* III. Hipótesis y devolución */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
                III. Hipótesis clínica y devolución al paciente
              </p>
              <AutoGrowTextarea
                value={value.sections['clinical_hypothesis'] ?? ''}
                disabled={disabled}
                minRows={4}
                onChange={e => setSection('clinical_hypothesis', e.target.value)}
                placeholder="Hipótesis explicativa del problema. Cómo se devolvió la información al consultante en lenguaje no técnico (psicoeducación)…"
              />
            </div>

            {/* IV. Indicadores de logro */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
                IV. Indicadores de logro y bienestar
              </p>
              <CheckChips
                options={ACHIEVEMENT_INDICATOR_OPTIONS}
                selected={value.achievementIndicators ?? []}
                onToggle={k => onChange({ ...value, achievementIndicators: toggleArr(value.achievementIndicators ?? [], k) })}
                disabled={disabled}
              />
            </div>

            {/* V. Enfoque y técnicas */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
                V. Enfoque y técnicas a utilizar
              </p>
              <CheckChips
                options={TECHNIQUE_OPTIONS}
                selected={value.planTechniques ?? []}
                onToggle={k => onChange({ ...value, planTechniques: toggleArr(value.planTechniques ?? [], k) })}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Side: risk */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {riskPanel}
          </div>
        </div>

        {/* VI. Tareas */}
        <TaskChecklist
          selected={value.taskChecklist ?? []}
          onChange={v => onChange({ ...value, taskChecklist: v })}
          disabled={disabled}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // F1 / F3 / F4 — standard two-column layout
  // ════════════════════════════════════════════════════

  const sideColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {/* F4: motivo de egreso */}
      {recordType === 'DISCHARGE' && (
        <div className="card" style={{ padding: '16px 20px', border: value.dischargeReason ? undefined : '1.5px solid #fde68a' }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            II. Motivo de egreso <span style={{ color: '#dc2626' }}>*</span>
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

      {/* F4: IV. Estado clínico */}
      {recordType === 'DISCHARGE' && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            IV. Estado clínico al cierre
          </p>
          <FunctionalityPanel
            value={value.functionality ?? defaultFunctionality()}
            onChange={v => onChange({ ...value, functionality: v })}
            dischargeReason={value.dischargeReason}
            disabled={disabled}
          />
        </div>
      )}

      {/* F1: VI. Examen Mental */}
      {recordType === 'INITIAL' && (
        <MentalExamChecklist
          value={value.mentalExam}
          onChange={m => onChange({ ...value, mentalExam: m })}
          disabled={disabled}
        />
      )}

      {/* F1: IV. Antecedentes SPA + familia */}
      {recordType === 'INITIAL' && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            IV. Antecedentes — Consumo SPA y familia
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

      {/* F3: IV. Evaluación de sesión */}
      {recordType === 'EVOLUTION' && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--s800)' }}>
            IV. Evaluación del cierre de sesión
          </p>
          <SessionEvaluationPanel
            value={value.sessionEval ?? defaultSessionEval()}
            onChange={v => onChange({ ...value, sessionEval: v })}
            disabled={disabled}
          />
        </div>
      )}

      {riskPanel}
    </div>
  );

  const mainCard = (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      {/* F1 + F3: I. Escala de malestar subjetivo */}
      {(recordType === 'INITIAL' || recordType === 'EVOLUTION') && (
        <SubjectiveDistressScale
          value={value.distressLevel}
          onChange={v => onChange({ ...value, distressLevel: v })}
          disabled={disabled}
        />
      )}

      {/* F3: II. Seguimiento a compromisos */}
      {recordType === 'EVOLUTION' && (
        <TaskAdherencePanel
          value={value.taskAdherence ?? defaultTaskAdherence()}
          onChange={v => onChange({ ...value, taskAdherence: v })}
          disabled={disabled}
        />
      )}

      {/* Text sections per type */}
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
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16, alignItems: 'start' }}>
        {mainCard}
        {sideColumn}
      </div>

      {/* F3: V. Nuevas tareas */}
      {recordType === 'EVOLUTION' && (
        <TaskChecklist
          selected={value.taskChecklist ?? []}
          onChange={v => onChange({ ...value, taskChecklist: v })}
          disabled={disabled}
        />
      )}

      {/* F1: V. Formulación clínica 5 factores */}
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

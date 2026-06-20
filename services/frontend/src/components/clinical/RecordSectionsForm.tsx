import type { RecordSections, RecordType, RiskLevel, DischargeReason } from '@/api/clinicalRecords';
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
    sections.mental_exam = d.mentalExam as unknown as Record<string, unknown>;
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

  const riskLevel: RiskLevel = uiType === 'INITIAL'
    ? deriveRiskFromMentalExam(d.mentalExam)
    : (d.risk ?? 'NONE');

  return {
    sections,
    risk_level: riskLevel,
    ...(apiType === 'DISCHARGE' ? { discharge_reason: d.dischargeReason } : {}),
  };
}

// ── Draft parser ──────────────────────────────────────────────────────────────
export function recordToDraft(sections: RecordSections | undefined, risk?: RiskLevel, reason?: DischargeReason): ClinicalDraft {
  const d = emptyDraft();
  if (sections) {
    for (const [k, v] of Object.entries(sections)) {
      if (k === 'mental_exam' && typeof v === 'object' && !Array.isArray(v)) {
        d.mentalExam = { ...defaultMentalExam(), ...(v as Partial<MentalExam>) };
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

// ── Risk derivation from mental exam (INITIAL only) ───────────────────────────
function deriveRiskFromMentalExam(exam: MentalExam): RiskLevel {
  if (exam.suicidal_ideation === 'activa_con_plan') return 'PLAN';
  if (exam.prior_attempt === true) return 'ATTEMPT';
  if (exam.suicidal_ideation === 'pasiva') return 'IDEATION';
  return 'NONE';
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
  // INITIAL: risk is derived automatically from the mental exam
  if (uiType !== 'INITIAL' && !d.risk) return 'La evaluación de riesgo es obligatoria';
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
  // F1 — APERTURA (layout lineal, orden exacto del formato)
  // ════════════════════════════════════════════════════
  if (recordType === 'INITIAL') {
    const sectionTitle = (text: string) => (
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--s900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {text}
      </p>
    );

    const textField = (key: string, label: string, placeholder: string, required = false, rows = 3) => (
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          {label} {required && <span style={{ color: '#dc2626' }}>*</span>}
        </p>
        <AutoGrowTextarea
          value={value.sections[key] ?? ''}
          disabled={disabled}
          minRows={Math.max(rows, 2)}
          onChange={e => setSection(key, e.target.value)}
          placeholder={placeholder}
        />
      </div>
    );

    const textInput = (key: string, label: string, placeholder: string) => (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--s700)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {label}:
        </p>
        <input
          type="text"
          value={value.sections[key] ?? ''}
          disabled={disabled}
          onChange={e => setSection(key, e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, padding: '5px 10px', borderRadius: 8, fontSize: 13,
            border: '1px solid var(--s200)', color: 'var(--s700)',
            background: disabled ? '#f9fafb' : '#fff', minWidth: 0,
          }}
        />
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* II. MOTIVO DE CONSULTA */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('II. Motivo de Consulta')}

          {textField('consultation_reason',
            '• Reporte Textual (Lo que refiere el consultante)',
            '"En sus propias palabras, ¿qué lo trae a consulta?"…',
            true, 3)}

          {textField('current_problem',
            '• Análisis Clínico del Motivo de Consulta',
            '¿Cuál es el problema principal actual? ¿Frecuencia, intensidad y duración de los síntomas? ¿Qué factores lo detonan o lo mitigan? ¿Cómo afecta sus áreas de ajuste?',
            true, 4)}

          <SubjectiveDistressScale
            value={value.distressLevel}
            onChange={v => onChange({ ...value, distressLevel: v })}
            disabled={disabled}
          />
        </div>

        {/* III. HISTORIA DE VIDA Y CONTEXTO */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('III. Historia de Vida y Contexto')}

          {textField('family_dynamics',
            '1. Historia Familiar y Dinámica de Crianza',
            '¿Cómo fue la relación con sus padres/cuidadores en la infancia? ¿Qué estilo de crianza predominó? ¿Existen eventos traumáticos, pérdidas significativas o violencia intrafamiliar?',
            false, 3)}

          {textField('academic_history',
            '2. Historia Académica y Laboral',
            '¿Cómo ha sido su rendimiento y adaptación escolar/universitaria? ¿Cómo es su estabilidad laboral actual? ¿Tiene dificultades con figuras de autoridad o compañeros?',
            false, 3)}

          {textField('relational_history',
            '3. Historia Relacional, Social y Red de Apoyo',
            '¿Cómo son sus relaciones interpersonales actuales? ¿Tiene amigos cercanos o personas en quienes confiar? ¿Cómo han sido sus relaciones de pareja pasadas y presente?',
            false, 3)}
        </div>

        {/* IV. ANTECEDENTES RELEVANTES */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sectionTitle('IV. Antecedentes Relevantes')}

          {textInput('medical_history', '- Médicos / Orgánicos', 'Antecedentes médicos u orgánicos relevantes…')}
          {textInput('psychological_history', '- Psicológicos previos', 'Atenciones psicológicas anteriores…')}
          {textInput('psychiatric_history', '- Psiquiátricos previos', 'Atenciones psiquiátricas anteriores…')}
          {textInput('pharmacological_history', '- Farmacológicos (Medicamentos y dosis actuales)', 'Medicamentos actuales y dosis…')}

          <div style={{ borderTop: '1px solid var(--s100)', paddingTop: 12 }}>
            <SPAHistoryPanel
              spa={value.spaHistory ?? defaultSPAHistory()}
              familyMH={value.familyMH ?? defaultFamilyMH()}
              onSPAChange={v => onChange({ ...value, spaHistory: v })}
              onFamilyMHChange={v => onChange({ ...value, familyMH: v })}
              disabled={disabled}
            />
          </div>
        </div>

        {/* V. FORMULACIÓN CLÍNICA 5 FACTORES */}
        <ClinicalFormulation5F
          value={value.clinicalFormulation ?? defaultFormulation5F()}
          onChange={v => onChange({ ...value, clinicalFormulation: v })}
          disabled={disabled}
        />

        {/* VI. EXAMEN MENTAL */}
        <MentalExamChecklist
          value={value.mentalExam}
          onChange={m => onChange({ ...value, mentalExam: m })}
          disabled={disabled}
        />

        {/* VII. HIPÓTESIS DIAGNÓSTICA */}
        <div className="card" style={{ padding: '20px 24px' }}>
          {textField('diagnostic_impression',
            'VII. IMPRESIÓN DIAGNÓSTICA O HIPÓTESIS CLÍNICA PROVISIONAL',
            'Basado en criterios DSM-5/CIE-11 o análisis funcional: conductas problema, antecedentes y consecuentes…',
            false, 4)}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // F3 / F4 — standard two-column layout
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
      {/* F3: I. Escala de malestar subjetivo */}
      {recordType === 'EVOLUTION' && (
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

      {/* Text sections (F3: session_development, interventions; F4: discharge text fields) */}
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
    </div>
  );
}

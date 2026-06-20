import type { RecordSections, RecordType, RiskLevel, DischargeReason } from '@/api/clinicalRecords';
import {
  TEMPLATE_SECTIONS, DISCHARGE_REASONS,
  ACHIEVEMENT_INDICATOR_OPTIONS, TECHNIQUE_OPTIONS,
  SESSION_AXIS_OPTIONS, INSIGHT_LEVELS, RESISTANCE_BARRIER_OPTIONS, AFFECT_EXIT_OPTIONS,
  FUNCTIONALITY_LEVELS, REFERRAL_DESTINATIONS,
  defaultSPAHistory, defaultFamilyMH, defaultFormulation5F,
  defaultTaskAdherence, defaultSessionEval, defaultFunctionality, defaultFunctionalAnalysis,
  type SPAHistoryData, type FamilyMentalHealthData, type Formulation5FData,
  type TaskAdherenceData, type SessionEvalData, type FunctionalityData, type FunctionalAnalysisData,
} from './constants';
import { MentalExamChecklist, defaultMentalExam, type MentalExam } from './MentalExamChecklist';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { SubjectiveDistressScale } from './SubjectiveDistressScale';
import { SPAHistoryPanel } from './SPAHistoryPanel';
import { ClinicalFormulation5F } from './ClinicalFormulation5F';
import { TaskAdherencePanel } from './TaskAdherencePanel';
import { TaskChecklist } from './TaskChecklist';
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
  tasksAssigned?: boolean;
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
    tasksAssigned: false,
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
    if ((d.sections['achievement_indicators_other'] ?? '').trim()) sections.achievement_indicators_other = d.sections['achievement_indicators_other'].trim();
    if (d.planTechniques?.length) sections.techniques = d.planTechniques;
    if ((d.sections['techniques_other'] ?? '').trim()) sections.techniques_other = d.sections['techniques_other'].trim();
    sections.tasks_assigned = d.tasksAssigned ?? false;
    if (d.tasksAssigned && d.taskChecklist?.length) sections.task_checklist = d.taskChecklist;
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
      } else if (k === 'tasks_assigned' && typeof v === 'boolean') {
        d.tasksAssigned = v;
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
  // Risk is not shown on any form — derived from mental exam (INITIAL) or omitted.
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
  options, selected, onToggle, disabled, otherValue, onOtherChange, otherPlaceholder,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (k: string) => void;
  disabled?: boolean;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  otherPlaceholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
      {selected.includes('other') && onOtherChange && (
        <input
          type="text"
          value={otherValue ?? ''}
          disabled={disabled}
          onChange={e => onOtherChange(e.target.value)}
          placeholder={otherPlaceholder ?? 'Especificar…'}
          style={{
            padding: '6px 10px', borderRadius: 8, fontSize: 13,
            border: '1.5px solid var(--teal)', color: 'var(--s700)',
            background: disabled ? '#f9fafb' : '#fff',
          }}
        />
      )}
    </div>
  );
}

function toggleArr(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
}

export function RecordSectionsForm({ recordType, value, onChange, disabled }: Props) {
  const setSection = (key: string, v: string) =>
    onChange({ ...value, sections: { ...value.sections, [key]: v } });

  // ════════════════════════════════════════════════════
  // F2 — PLAN TERAPÉUTICO (layout lineal, orden exacto del formato)
  // ════════════════════════════════════════════════════
  if (recordType === 'PLAN') {
    const sectionTitle = (text: string) => (
      <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--s900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {text}
      </p>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* I. ANÁLISIS FUNCIONAL */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('I. Análisis Funcional de la Conducta Objeto')}
          <AutoGrowTextarea
            value={value.sections['session_development'] ?? ''}
            disabled={disabled}
            minRows={3}
            onChange={e => setSection('session_development', e.target.value)}
            placeholder="¿Cómo estuvo el paciente durante la semana? Retomar el motivo de consulta, conducta problema… *"
          />
          <FunctionalAnalysisPanel
            value={value.functionalAnalysis ?? defaultFunctionalAnalysis()}
            onChange={v => onChange({ ...value, functionalAnalysis: v })}
            disabled={disabled}
          />
        </div>

        {/* II. OBJETIVOS TERAPÉUTICOS */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectionTitle('II. Objetivos Terapéuticos Consensuados')}
          <p style={{ margin: '-6px 0 8px', fontSize: 12, color: 'var(--s500)' }}>
            ¿Qué quiere lograr el consultante? Máximo 4 puntos concretos, priorizar 2.
          </p>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s600)', flexShrink: 0 }}>{n}.</span>
              <AutoGrowTextarea
                value={value.sections[`therapeutic_goal_${n}`] ?? ''}
                disabled={disabled}
                minRows={1}
                onChange={e => setSection(`therapeutic_goal_${n}`, e.target.value)}
                placeholder={`Objetivo ${n}…`}
              />
            </div>
          ))}
        </div>

        {/* III. HIPÓTESIS Y DEVOLUCIÓN */}
        <div className="card" style={{ padding: '20px 24px' }}>
          {sectionTitle('III. Hipótesis y Devolución Clínica (Psicoeducación)')}
          <p style={{ margin: '-6px 0 10px', fontSize: 12, color: 'var(--s500)' }}>
            Breve nota de cómo se le explicó al paciente el funcionamiento de su caso.
          </p>
          <AutoGrowTextarea
            value={value.sections['clinical_hypothesis'] ?? ''}
            disabled={disabled}
            minRows={3}
            onChange={e => setSection('clinical_hypothesis', e.target.value)}
            placeholder="Hipótesis explicativa del problema. Cómo se devolvió la información al consultante en lenguaje no técnico…"
          />
        </div>

        {/* IV. INDICADORES DE LOGRO */}
        <div className="card" style={{ padding: '20px 24px' }}>
          {sectionTitle('IV. Indicadores de Logro y Bienestar')}
          <p style={{ margin: '-6px 0 10px', fontSize: 12, color: 'var(--s500)' }}>
            ¿Cómo sabremos que el proceso está funcionando?
          </p>
          <CheckChips
            options={ACHIEVEMENT_INDICATOR_OPTIONS}
            selected={value.achievementIndicators ?? []}
            onToggle={k => onChange({ ...value, achievementIndicators: toggleArr(value.achievementIndicators ?? [], k) })}
            disabled={disabled}
            otherValue={value.sections['achievement_indicators_other'] ?? ''}
            onOtherChange={v => setSection('achievement_indicators_other', v)}
            otherPlaceholder="Especificar indicador…"
          />
        </div>

        {/* V. ENFOQUE Y TÉCNICAS */}
        <div className="card" style={{ padding: '20px 24px' }}>
          {sectionTitle('V. Enfoque y Técnicas a Utilizar')}
          <CheckChips
            options={TECHNIQUE_OPTIONS}
            selected={value.planTechniques ?? []}
            onToggle={k => onChange({ ...value, planTechniques: toggleArr(value.planTechniques ?? [], k) })}
            disabled={disabled}
            otherValue={value.sections['techniques_other'] ?? ''}
            onOtherChange={v => setSection('techniques_other', v)}
            otherPlaceholder="Especificar técnica…"
          />
        </div>

        {/* VI. TAREAS */}
        <div className="card" style={{ padding: '20px 24px' }}>
          {sectionTitle('VI. Tareas')}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {([{ v: true, label: 'Sí' }, { v: false, label: 'No' }] as const).map(opt => {
              const active = (value.tasksAssigned ?? false) === opt.v;
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...value, tasksAssigned: opt.v })}
                  style={{
                    padding: '6px 20px', borderRadius: 16, fontSize: 13, fontWeight: 600,
                    cursor: disabled ? 'default' : 'pointer',
                    border: `1.5px solid ${active ? 'var(--teal)' : 'var(--s200)'}`,
                    background: active ? 'var(--teal)' : '#fff',
                    color: active ? '#fff' : 'var(--s600)',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
          {value.tasksAssigned && (
            <TaskChecklist
              selected={value.taskChecklist ?? []}
              onChange={v => onChange({ ...value, taskChecklist: v })}
              disabled={disabled}
            />
          )}
        </div>

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
  // F3 — EVOLUCIÓN (layout lineal, orden exacto del formato)
  // ════════════════════════════════════════════════════
  if (recordType === 'EVOLUTION') {
    const sessionEval = value.sessionEval ?? defaultSessionEval();
    const setEval = (patch: Partial<SessionEvalData>) =>
      onChange({ ...value, sessionEval: { ...sessionEval, ...patch } });

    const sectionTitle = (text: string) => (
      <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--s900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {text}
      </p>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* I. ESTADO ACTUAL Y REPORTE SUBJETIVO */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('I. Estado Actual y Reporte Subjetivo')}
          <SubjectiveDistressScale
            value={value.distressLevel}
            onChange={v => onChange({ ...value, distressLevel: v })}
            disabled={disabled}
          />
          <AutoGrowTextarea
            value={value.sections['session_development'] ?? ''}
            disabled={disabled}
            minRows={3}
            onChange={e => setSection('session_development', e.target.value)}
            placeholder="¿Cómo llega el paciente? ¿Qué eventos significativos ocurrieron en la semana? ¿Refiere mejoría, estabilidad o empeoramiento de los síntomas?"
          />
        </div>

        {/* II. SEGUIMIENTO A COMPROMISOS */}
        <div className="card" style={{ padding: '20px 24px' }}>
          {sectionTitle('II. Seguimiento a Compromisos — Actividades')}
          <TaskAdherencePanel
            value={value.taskAdherence ?? defaultTaskAdherence()}
            onChange={v => onChange({ ...value, taskAdherence: v })}
            disabled={disabled}
          />
        </div>

        {/* III. INTERVENCIÓN REALIZADA EN LA SESIÓN */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('III. Intervención Realizada en la Sesión')}

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
              • Enfoque / Eje de la sesión:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SESSION_AXIS_OPTIONS.map(opt => {
                const active = sessionEval.axis.includes(opt.key);
                return (
                  <button
                    key={opt.key} type="button" disabled={disabled}
                    onClick={() => setEval({ axis: toggleArr(sessionEval.axis, opt.key) })}
                    style={{
                      padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                      cursor: disabled ? 'default' : 'pointer',
                      border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
                      background: active ? 'var(--teal)' : '#fff',
                      color: active ? '#fff' : 'var(--s600)',
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
              • Descripción clínica de la sesión:
            </p>
            <AutoGrowTextarea
              value={value.sections['interventions'] ?? ''}
              disabled={disabled}
              minRows={3}
              onChange={e => setSection('interventions', e.target.value)}
              placeholder="Qué temas se abordaron, qué técnicas específicas se aplicaron en vivo, cómo reaccionó el consultante…"
            />
          </div>
        </div>

        {/* IV. EVALUACIÓN DEL CIERRE DE SESIÓN */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sectionTitle('IV. Evaluación del Cierre de Sesión')}

          <div>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
              Consultante genera devoluciones — ¿qué se lleva del espacio?
            </p>
            <AutoGrowTextarea
              value={sessionEval.patient_feedback}
              disabled={disabled}
              minRows={2}
              onChange={e => setEval({ patient_feedback: e.target.value })}
              placeholder="Resonancias del consultante al cierre de la sesión…"
            />
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
              • Nivel de Insight / Comprensión:
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {INSIGHT_LEVELS.map(level => {
                const active = sessionEval.insight === level.key;
                return (
                  <button
                    key={level.key} type="button" disabled={disabled}
                    onClick={() => setEval({ insight: sessionEval.insight === level.key ? '' : level.key })}
                    style={{
                      padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                      cursor: disabled ? 'default' : 'pointer',
                      border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
                      background: active ? level.color : '#fff',
                      color: active ? '#fff' : 'var(--s600)',
                    }}
                  >{level.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
              Barreras de resistencia observadas
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--s400)', marginLeft: 6 }}>(marcar con X solo si aplica)</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: sessionEval.barriers.includes('other') ? 8 : 0 }}>
              {RESISTANCE_BARRIER_OPTIONS.map(opt => {
                const active = sessionEval.barriers.includes(opt.key);
                return (
                  <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox" checked={active} disabled={disabled}
                      onChange={() => setEval({ barriers: toggleArr(sessionEval.barriers, opt.key) })}
                      style={{ accentColor: '#dc2626', cursor: disabled ? 'default' : 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--s700)' }}>{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {sessionEval.barriers.includes('other') && (
              <input
                type="text"
                value={sessionEval.barriers_other ?? ''}
                disabled={disabled}
                onChange={e => setEval({ barriers_other: e.target.value })}
                placeholder="Especificar barrera…"
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 13,
                  border: '1.5px solid var(--teal)', color: 'var(--s700)',
                  background: disabled ? '#f9fafb' : '#fff', boxSizing: 'border-box',
                }}
              />
            )}
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
              • Estado del afecto al salir:
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AFFECT_EXIT_OPTIONS.map(opt => {
                const active = sessionEval.affect_exit === opt.key;
                return (
                  <button
                    key={opt.key} type="button" disabled={disabled}
                    onClick={() => setEval({ affect_exit: sessionEval.affect_exit === opt.key ? '' : opt.key })}
                    style={{
                      padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                      cursor: disabled ? 'default' : 'pointer',
                      border: `1.5px solid ${active ? 'transparent' : 'var(--s200)'}`,
                      background: active ? opt.color : '#fff',
                      color: active ? '#fff' : 'var(--s600)',
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* V. NUEVAS TAREAS */}
        <TaskChecklist
          selected={value.taskChecklist ?? []}
          onChange={v => onChange({ ...value, taskChecklist: v })}
          disabled={disabled}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // F4 — INFORME DE CIERRE (layout lineal, orden exacto del formato)
  // ════════════════════════════════════════════════════
  const functionality = value.functionality ?? defaultFunctionality();
  const setFunc = (patch: Partial<FunctionalityData>) =>
    onChange({ ...value, functionality: { ...functionality, ...patch } });

  const sectionTitle = (text: string) => (
    <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--s900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {text}
    </p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* I. RESUMEN DEL MOTIVO DE CONSULTA INICIAL */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {sectionTitle('I. Resumen del Motivo de Consulta Inicial')}
        <AutoGrowTextarea
          value={value.sections['discharge_summary'] ?? ''}
          disabled={disabled}
          minRows={3}
          onChange={e => setSection('discharge_summary', e.target.value)}
          placeholder="Síntesis del motivo de consulta con el que inició el proceso… *"
        />
      </div>

      {/* II. MOTIVO DEL CIERRE */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {sectionTitle('II. Motivo del Cierre de la Historia Clínica')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DISCHARGE_REASONS.map(r => {
            const active = value.dischargeReason === r.value;
            return (
              <div key={r.value}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
                  <input
                    type="radio" name="discharge-reason" disabled={disabled}
                    checked={active}
                    onChange={() => onChange({ ...value, dischargeReason: r.value })}
                    style={{ marginTop: 3, accentColor: 'var(--teal)', flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>{r.label}: </span>
                    <span style={{ fontSize: 13, color: 'var(--s500)' }}>{r.description}</span>
                  </span>
                </label>

                {active && r.value === 'DROPOUT' && (
                  <div style={{ marginTop: 8, paddingLeft: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--s600)' }}>Inasistencia a</span>
                    <input
                      type="text"
                      value={value.sections['dropout_sessions'] ?? ''}
                      disabled={disabled}
                      onChange={e => setSection('dropout_sessions', e.target.value)}
                      placeholder="___"
                      style={{
                        width: 52, padding: '4px 8px', borderRadius: 8, fontSize: 13, textAlign: 'center',
                        border: '1.5px solid var(--teal)', color: 'var(--s700)', background: disabled ? '#f9fafb' : '#fff',
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--s600)' }}>sesiones consecutivas</span>
                  </div>
                )}

                {active && r.value === 'REFERRAL' && (
                  <div style={{ marginTop: 8, paddingLeft: 26 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>Destino:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {REFERRAL_DESTINATIONS.map(dest => {
                        const destActive = functionality.referral_destination === dest.key;
                        return (
                          <button
                            key={dest.key} type="button" disabled={disabled}
                            onClick={() => setFunc({ referral_destination: destActive ? '' : dest.key })}
                            style={{
                              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                              cursor: disabled ? 'default' : 'pointer',
                              border: `1.5px solid ${destActive ? 'var(--teal)' : 'var(--s200)'}`,
                              background: destActive ? 'var(--teal)' : '#fff',
                              color: destActive ? '#fff' : 'var(--s600)',
                            }}
                          >{dest.label}</button>
                        );
                      })}
                    </div>
                    {functionality.referral_destination === 'other' && (
                      <input
                        type="text"
                        value={functionality.referral_destination_other ?? ''}
                        disabled={disabled}
                        onChange={e => setFunc({ referral_destination_other: e.target.value })}
                        placeholder="Especificar destino…"
                        style={{
                          marginTop: 8, width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 13,
                          border: '1.5px solid var(--teal)', color: 'var(--s700)',
                          background: disabled ? '#f9fafb' : '#fff', boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* III. EVALUACIÓN DE LOGROS */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {sectionTitle('III. Evaluación de Logros Terapéuticos y Evolución')}
        <AutoGrowTextarea
          value={value.sections['final_state'] ?? ''}
          disabled={disabled}
          minRows={3}
          onChange={e => setSection('final_state', e.target.value)}
          placeholder="¿Qué cambios significativos se lograron desde la sesión inicial? ¿Qué herramientas cognitivas o conductuales consolidó el paciente?… *"
        />
      </div>

      {/* IV. ESTADO CLÍNICO AL CIERRE */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {sectionTitle('IV. Estado Clínico Actual al Momento del Cierre')}
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--s700)' }}>
          • Nivel de Funcionalidad General:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FUNCTIONALITY_LEVELS.map(level => {
            const active = functionality.level === level.key;
            return (
              <label key={level.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
                <input
                  type="radio" name="functionality-level" value={level.key} disabled={disabled}
                  checked={active}
                  onChange={() => setFunc({ level: level.key })}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--s700)' }}>{level.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* V. RECOMENDACIONES Y PLAN PREVENTIVO */}
      <div className="card" style={{ padding: '20px 24px' }}>
        {sectionTitle('V. Recomendaciones y Plan Preventivo')}
        <AutoGrowTextarea
          value={value.sections['recommendations'] ?? ''}
          disabled={disabled}
          minRows={3}
          onChange={e => setSection('recommendations', e.target.value)}
          placeholder="¿Señales de alerta tempranas identificadas? ¿Estrategias autónomas ante reaparición del malestar? ¿Cuándo reconsultar?"
        />
      </div>

    </div>
  );
}

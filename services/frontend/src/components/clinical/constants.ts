import type { RecordType, RiskLevel, DischargeReason } from '@/api/clinicalRecords';

export interface SectionDef {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  rows?: number;
}

// Section formats per record type — must mirror the backend template v2
// definitions in internal/clinicalrecords/templates.go.
export const TEMPLATE_SECTIONS: Record<Exclude<RecordType, 'INTERCONSULTATION'>, SectionDef[]> = {
  INITIAL: [
    { key: 'consultation_reason', label: 'Motivo de consulta', placeholder: 'En palabras del paciente…', required: true, rows: 3 },
    { key: 'current_problem', label: 'Problema actual', placeholder: 'Inicio, evolución, intentos previos de solución, tratamientos anteriores…', required: true, rows: 4 },
    { key: 'personal_history', label: 'Antecedentes personales', placeholder: 'Médicos, psicológicos/psiquiátricos previos, medicación actual…', required: false, rows: 3 },
    { key: 'family_history', label: 'Antecedentes familiares', placeholder: 'Salud mental en la familia…', required: false, rows: 2 },
    { key: 'psychosocial_context', label: 'Contexto psicosocial', placeholder: 'Familia, trabajo/estudio, red de apoyo…', required: false, rows: 3 },
    { key: 'diagnostic_impression', label: 'Impresión diagnóstica', placeholder: 'Justificación clínica (los códigos CIE-10 se asignan en Diagnósticos)…', required: false, rows: 3 },
    { key: 'initial_plan', label: 'Plan inicial', placeholder: 'Enfoque terapéutico, frecuencia propuesta, objetivos preliminares…', required: true, rows: 3 },
  ],
  EVOLUTION: [
    { key: 'session_development', label: 'Desarrollo de la sesión', placeholder: 'Qué trajo el paciente, qué se trabajó…', required: true, rows: 5 },
    { key: 'interventions', label: 'Intervenciones aplicadas', placeholder: 'Técnicas usadas: reestructuración cognitiva, exposición, psicoeducación…', required: false, rows: 3 },
    { key: 'patient_response', label: 'Análisis / respuesta del paciente', placeholder: 'Cómo respondió, avance respecto a objetivos…', required: false, rows: 3 },
    { key: 'plan_tasks', label: 'Plan y tareas', placeholder: 'Qué sigue, tareas asignadas para la casa…', required: true, rows: 3 },
  ],
  DISCHARGE: [
    { key: 'discharge_summary', label: 'Resumen del proceso', placeholder: 'Síntesis del proceso terapéutico…', required: true, rows: 4 },
    { key: 'final_state', label: 'Estado final', placeholder: 'Contrastado contra el motivo de consulta inicial…', required: true, rows: 3 },
    { key: 'goals_achieved', label: 'Objetivos logrados', placeholder: 'Respecto al plan inicial…', required: false, rows: 3 },
    { key: 'recommendations', label: 'Recomendaciones', placeholder: 'Indicaciones al paciente…', required: false, rows: 2 },
    { key: 'referral', label: 'Remisión', placeholder: 'A quién se remite, si aplica…', required: false, rows: 2 },
  ],
};

export const RISK_LEVELS: { value: RiskLevel; label: string; color: string; bg: string; border: string }[] = [
  { value: 'NONE', label: 'Sin riesgo', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
  { value: 'IDEATION', label: 'Ideación', color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  { value: 'PLAN', label: 'Plan estructurado', color: '#9a3412', bg: '#ffedd5', border: '#fdba74' },
  { value: 'ATTEMPT', label: 'Intento', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
];

export const riskMeta = (value?: string) => RISK_LEVELS.find(r => r.value === value);

export const DISCHARGE_REASONS: { value: DischargeReason; label: string }[] = [
  { value: 'THERAPEUTIC_DISCHARGE', label: 'Alta terapéutica' },
  { value: 'DROPOUT', label: 'Deserción' },
  { value: 'REFERRAL', label: 'Remisión' },
  { value: 'MUTUAL_AGREEMENT', label: 'Mutuo acuerdo' },
];

export const MENTAL_EXAM_DOMAINS: { key: string; label: string }[] = [
  { key: 'appearance', label: 'Apariencia' },
  { key: 'consciousness_orientation', label: 'Conciencia y orientación' },
  { key: 'attention', label: 'Atención' },
  { key: 'memory', label: 'Memoria' },
  { key: 'language', label: 'Lenguaje' },
  { key: 'thought', label: 'Pensamiento' },
  { key: 'affect', label: 'Afecto' },
  { key: 'perception', label: 'Sensopercepción' },
  { key: 'judgment', label: 'Juicio' },
  { key: 'insight', label: 'Introspección' },
];

export const RECORD_TYPE_LABELS: Record<string, string> = {
  INITIAL: 'Apertura',
  EVOLUTION: 'Evolución',
  DISCHARGE: 'Cierre',
  INTERCONSULTATION: 'Interconsulta',
};

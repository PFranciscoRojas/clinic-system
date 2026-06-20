import type { RecordType, RiskLevel, DischargeReason } from '@/api/clinicalRecords';

// ── Formato 1 / Formato 3: Subjective distress scale ──────────────────────────
export const DISTRESS_LABELS: Record<number, string> = {
  1: 'Mínimo', 2: 'Muy leve', 3: 'Leve', 4: 'Moderado-leve', 5: 'Moderado',
  6: 'Moderado-alto', 7: 'Alto', 8: 'Muy alto', 9: 'Severo', 10: 'Máximo',
};

// ── Formato 1: SPA history ─────────────────────────────────────────────────────
export interface SPASubstance {
  present: boolean;
  frequency: string;
}
export interface SPAHistoryData {
  alcohol: SPASubstance;
  tobacco: SPASubstance;
  other: { present: boolean; substance: string; frequency: string };
}
export interface FamilyMentalHealthData {
  anxiety: boolean;
  depression: boolean;
  suicide: boolean;
  psychosis: boolean;
}
export function defaultSPAHistory(): SPAHistoryData {
  return {
    alcohol: { present: false, frequency: '' },
    tobacco: { present: false, frequency: '' },
    other: { present: false, substance: '', frequency: '' },
  };
}
export function defaultFamilyMH(): FamilyMentalHealthData {
  return { anxiety: false, depression: false, suicide: false, psychosis: false };
}

// ── Formato 1: Formulación clínica 5 factores ─────────────────────────────────
export interface Factor5F {
  selected: string[];
  notes: string;
}
export interface AcquisitionFactor {
  onset: string;   // 'childhood' | 'adolescence' | 'early_adulthood' | 'recent_event'
  pathway: string[]; // 'direct_conditioning' | 'vicarious_learning' | 'information_transmission'
  notes: string;
}
export interface Formulation5FData {
  predisposition: Factor5F;
  acquisition: AcquisitionFactor;
  triggers: Factor5F;
  maintenance: Factor5F;
  protection: Factor5F;
}
export function defaultFormulation5F(): Formulation5FData {
  const emptyFactor = (): Factor5F => ({ selected: [], notes: '' });
  return {
    predisposition: emptyFactor(),
    acquisition: { onset: '', pathway: [], notes: '' },
    triggers: emptyFactor(),
    maintenance: emptyFactor(),
    protection: emptyFactor(),
  };
}

export const PREDISPOSITION_OPTIONS: { key: string; label: string }[] = [
  { key: 'family_mh', label: 'Antecedentes familiares de SM' },
  { key: 'overprotective_parenting', label: 'Estilo parental sobreprotector' },
  { key: 'authoritarian_parenting', label: 'Estilo parental autoritario / rígido' },
  { key: 'neglect_abuse', label: 'Negligencia, abusos o abandono temprano' },
  { key: 'harm_avoidance', label: 'Rasgo: Alta evitación al daño / Temor' },
  { key: 'perfectionism', label: 'Rasgo: Perfeccionismo / Rigidez' },
  { key: 'affective_dependency', label: 'Rasgo: Dependencia afectiva / Inseguridad' },
  { key: 'prior_medical', label: 'Enfermedad médica o crónica previa' },
];

export const ONSET_OPTIONS: { key: string; label: string }[] = [
  { key: 'childhood', label: 'Infancia' },
  { key: 'adolescence', label: 'Adolescencia' },
  { key: 'early_adulthood', label: 'Adultez temprana' },
  { key: 'recent_event', label: 'Evento reciente' },
];

export const PATHWAY_OPTIONS: { key: string; label: string }[] = [
  { key: 'direct_conditioning', label: 'Condicionamiento directo (vivió experiencia estresante/traumática)' },
  { key: 'vicarious_learning', label: 'Aprendizaje vicario (lo observó en figuras cercanas)' },
  { key: 'information_transmission', label: 'Transmisión de información (reglas verbales: "el mundo es peligroso")' },
];

export const TRIGGER_OPTIONS: { key: string; label: string }[] = [
  { key: 'breakup_divorce', label: 'Ruptura de pareja / Divorcio' },
  { key: 'grief', label: 'Duelo / Muerte de un ser querido' },
  { key: 'family_conflict', label: 'Conflictos familiares inmediatos' },
  { key: 'relocation', label: 'Mudanza / Cambio de ciudad o entorno' },
  { key: 'life_cycle', label: 'Cambio de ciclo vital (graduación, vejez)' },
  { key: 'job_loss', label: 'Despido / Desempleo / Crisis económica' },
  { key: 'work_overload', label: 'Aumento drástico de carga laboral / Estrés' },
  { key: 'illness_accident', label: 'Enfermedad o accidente reciente' },
];

export const MAINTENANCE_OPTIONS: { key: string; label: string }[] = [
  { key: 'avoidance', label: 'Evitación / Escape' },
  { key: 'secondary_gain', label: 'Ganancia secundaria' },
  { key: 'skills_deficit', label: 'Déficit de habilidades (asertividad, resolución conflictos)' },
  { key: 'invalidating_env', label: 'Entorno invalidante o permisivo' },
  { key: 'hostile_work', label: 'Ambiente laboral o académico hostil activo' },
];

export const PROTECTION_OPTIONS: { key: string; label: string }[] = [
  { key: 'insight', label: 'Alta capacidad de introspección (Insight)' },
  { key: 'motivation', label: 'Alta motivación manifiesta al cambio' },
  { key: 'adherence', label: 'Adherencia, disciplina y puntualidad' },
  { key: 'support_network', label: 'Red de apoyo familiar / pareja activa' },
  { key: 'economic_stability', label: 'Estabilidad económica' },
  { key: 'healthy_lifestyle', label: 'Estilo de vida saludable (ej. ejercicio)' },
];

// ── Formato 2 / 3: Task checklist (6 areas) ───────────────────────────────────
export interface TaskItem {
  key: string;
  label: string;
  description: string;
}
export interface TaskArea {
  key: string;
  label: string;
  tasks: TaskItem[];
}
export const TASK_CHECKLIST_AREAS: TaskArea[] = [
  {
    key: 'cognitive',
    label: '1. Área cognitiva / Pensamiento',
    tasks: [
      { key: 'autorregistro_abc', label: 'Autorregistro ABC', description: 'Registrar: Situación → Pensamiento automático → Emoción/Conducta' },
      { key: 'identificacion_sesgos', label: 'Identificación de sesgos', description: 'Detectar catastrofismo, leer la mente, todo o nada' },
      { key: 'reatribucion_cognitiva', label: 'Reatribución cognitiva', description: '¿Qué más podría significar esto?' },
      { key: 'parada_pensamiento', label: 'Parada de pensamiento', description: 'Cortar la rumiación con palabra clave "Stop" o distracción activa' },
    ],
  },
  {
    key: 'emotional_regulation',
    label: '2. Área de regulación emocional y fisiológica',
    tasks: [
      { key: 'respiracion_diafragmatica', label: 'Respiración diafragmática', description: 'Inhalar 4s, retener 4s, exhalar 8s' },
      { key: 'relajacion_jacobson', label: 'Relajación de Jacobson', description: 'Tensar 5s, soltar 10s, notar el alivio' },
      { key: 'grounding_54321', label: 'Grounding 5-4-3-2-1', description: 'Nombrar 5 ven, 4 tocan, 3 oyen, 2 huelen, 1 saborean' },
      { key: 'termometro_emocional', label: 'Termómetro emocional', description: 'Registrar intensidad emocional (1-10) durante el día' },
    ],
  },
  {
    key: 'acceptance_mindfulness',
    label: '3. Área de aceptación y mindfulness (ACT / DBT)',
    tasks: [
      { key: 'defusion_cognitiva', label: 'Defusión cognitiva', description: 'Cambiar "Soy un fracaso" por "Estoy pensando que…"' },
      { key: 'aceptacion_radical', label: 'Aceptación radical', description: 'Dejar de luchar contra la realidad dolorosa que no puede cambiarse ahora' },
      { key: 'mindfulness_cotidiano', label: 'Mindfulness cotidiano', description: 'Atención plena en una sola tarea simple (comer, ducharse, caminar)' },
      { key: 'habilidades_tipp', label: 'Habilidades TIPP', description: 'Bajar crisis: hielo en la cara, respiración lenta o cardio intenso' },
    ],
  },
  {
    key: 'behavioral',
    label: '4. Área conductual y acción',
    tasks: [
      { key: 'activacion_conductual', label: 'Activación conductual', description: 'Programar actividades diarias que den placer o sensación de logro' },
      { key: 'exposicion_gradual', label: 'Exposición gradual', description: 'Lista de miedos de menor a mayor, empezar a afrontar el primero' },
      { key: 'experimento_conductual', label: 'Experimento conductual', description: 'Poner a prueba el miedo en la realidad' },
      { key: 'postergacion_preocupacion', label: 'Postergación de la preocupación', description: '15 min al día para preocupaciones; el resto se aplaza' },
    ],
  },
  {
    key: 'problem_solving',
    label: '5. Área de solución de problemas y función ejecutiva',
    tasks: [
      { key: 'solucion_problemas', label: 'Solución de problemas', description: 'Definir → lluvia de ideas → evaluar pros/contras → plan de acción' },
      { key: 'chunking', label: 'Fragmentación / Chunking', description: 'Dividir meta grande en micro-pasos mínimos' },
      { key: 'control_estimulos', label: 'Control de estímulos', description: 'Modificar entorno para quitar distractores' },
    ],
  },
  {
    key: 'interpersonal',
    label: '6. Área interpersonal y autocuidado',
    tasks: [
      { key: 'comunicacion_asertiva', label: 'Comunicación asertiva', description: 'Mensaje Yo: "Me siento X cuando Y, necesito Z"' },
      { key: 'registro_limites', label: 'Registro de límites', description: 'Anotar situaciones en que logró o no decir "No"' },
      { key: 'higiene_sueno', label: 'Higiene del sueño', description: 'Rutina fija, cero pantallas 1h antes, cama solo para dormir' },
      { key: 'escritura_terapeutica', label: 'Escritura terapéutica', description: 'Desahogo emocional libre por 10 min en cuaderno' },
    ],
  },
];

// ── Formato 3: Session evaluation ─────────────────────────────────────────────
export const SESSION_AXIS_OPTIONS: { key: string; label: string }[] = [
  { key: 'emotional_processing', label: 'Procesamiento emocional' },
  { key: 'behavioral_modification', label: 'Modificación conductual' },
  { key: 'technical_training', label: 'Entrenamiento técnico' },
];

export const INSIGHT_LEVELS: { key: string; label: string; color: string }[] = [
  { key: 'high', label: 'Alto', color: '#065f46' },
  { key: 'medium', label: 'Medio', color: '#92400e' },
  { key: 'low', label: 'Bajo', color: '#991b1b' },
];

export const RESISTANCE_BARRIER_OPTIONS: { key: string; label: string }[] = [
  { key: 'tardiness', label: 'Tardanza' },
  { key: 'topic_change', label: 'Cambios de tema / Tácticas de desviación' },
  { key: 'omissions', label: 'Olvidos u omisiones de datos' },
  { key: 'exaggeration', label: 'Exageración o minimización del síntoma' },
  { key: 'contradictions', label: 'Contradicciones en el relato' },
  { key: 'defensiveness', label: 'Conductas defensivas u hostilidad' },
  { key: 'silence_block', label: 'Silencios prolongados / Bloqueo' },
];

export const AFFECT_EXIT_OPTIONS: { key: string; label: string; color: string }[] = [
  { key: 'regulated', label: 'Regulado', color: '#065f46' },
  { key: 'emotionally_moved', label: 'Movilizado emocionalmente', color: '#92400e' },
  { key: 'anxious', label: 'Ansioso', color: '#991b1b' },
];

export interface SessionEvalData {
  axis: string[];
  patient_feedback: string;
  insight: string;   // 'high' | 'medium' | 'low' | ''
  barriers: string[];
  affect_exit: string; // 'regulated' | 'emotionally_moved' | 'anxious' | ''
}
export function defaultSessionEval(): SessionEvalData {
  return { axis: [], patient_feedback: '', insight: '', barriers: [], affect_exit: '' };
}

// ── Formato 3: Task adherence ─────────────────────────────────────────────────
export interface TaskAdherenceData {
  assigned: boolean;
  level: string;  // 'full' | 'partial' | 'none' | ''
  observations: string;
}
export function defaultTaskAdherence(): TaskAdherenceData {
  return { assigned: false, level: '', observations: '' };
}

// ── Formato 4: Discharge functionality ────────────────────────────────────────
export const FUNCTIONALITY_LEVELS: { key: string; label: string }[] = [
  { key: 'full', label: 'Totalmente funcional' },
  { key: 'supported', label: 'Funcional con apoyos' },
  { key: 'restricted', label: 'Restringido' },
];

export const REFERRAL_DESTINATIONS: { key: string; label: string }[] = [
  { key: 'psychiatry', label: 'Psiquiatría' },
  { key: 'neuropsychology', label: 'Neuropsicología' },
  { key: 'general_medicine', label: 'Medicina General' },
  { key: 'other', label: 'Otro' },
];

export interface FunctionalityData {
  level: string;
  referral_destination: string;
}
export function defaultFunctionality(): FunctionalityData {
  return { level: '', referral_destination: '' };
}

// ── Formato 2: Functional analysis (triple system) ────────────────────────────
export const PHYSIOLOGICAL_RESPONSE_OPTIONS: { key: string; label: string }[] = [
  { key: 'tachycardia', label: 'Taquicardia' },
  { key: 'chest_pressure', label: 'Opresión en el pecho' },
  { key: 'sweating', label: 'Sudoración' },
  { key: 'tension', label: 'Tensión muscular' },
];

export const MOTOR_RESPONSE_OPTIONS: { key: string; label: string }[] = [
  { key: 'crying', label: 'Llorar' },
  { key: 'isolating', label: 'Aislarse' },
  { key: 'fleeing', label: 'Huir' },
  { key: 'complaining', label: 'Reclamar' },
  { key: 'smoking', label: 'Fumar' },
];

export const CONSEQUENCE_OPTIONS: { key: string; label: string }[] = [
  { key: 'relief', label: 'Alivio inmediato' },
  { key: 'anger', label: 'Enojo' },
  { key: 'guilt', label: 'Culpa' },
  { key: 'attention', label: 'Atención de otros' },
];

export interface FunctionalAnalysisData {
  antecedents: string;
  cognitive_response: string;
  physiological_response: string[];
  physiological_other: string;
  motor_response: string[];
  motor_other: string;
  consequences: string[];
  consequences_other: string;
}
export function defaultFunctionalAnalysis(): FunctionalAnalysisData {
  return {
    antecedents: '', cognitive_response: '',
    physiological_response: [], physiological_other: '',
    motor_response: [], motor_other: '',
    consequences: [], consequences_other: '',
  };
}

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
    { key: 'consultation_reason', label: 'Cita textual del paciente', placeholder: '"En sus propias palabras, ¿qué lo trae a consulta?"…', required: true, rows: 3 },
    { key: 'current_problem', label: 'Análisis clínico del motivo', placeholder: '¿Cuál es el problema principal? Frecuencia, intensidad, duración de los síntomas, factores que los detonan o mitigan, áreas de ajuste afectadas…', required: true, rows: 4 },
    { key: 'personal_history', label: 'Antecedentes personales', placeholder: 'Médicos/orgánicos, psicológicos previos, psiquiátricos previos, medicación actual…', required: false, rows: 3 },
    { key: 'family_history', label: 'Historia de vida y contexto', placeholder: 'Historia familiar y dinámica de crianza — Historia académica y laboral — Historia relacional, social y red de apoyo…', required: false, rows: 4 },
    { key: 'psychosocial_context', label: 'Contexto psicosocial actual', placeholder: 'Situación laboral, convivencia, red de apoyo disponible…', required: false, rows: 3 },
    { key: 'diagnostic_impression', label: 'Hipótesis diagnóstica provisional', placeholder: 'Basado en criterios DSM-5/CIE-11 o análisis funcional (conductas problema, antecedentes y consecuentes)…', required: false, rows: 3 },
    { key: 'initial_plan', label: 'Plan inicial', placeholder: 'Enfoque terapéutico propuesto, frecuencia de sesiones, objetivos preliminares…', required: true, rows: 3 },
  ],
  EVOLUTION: [
    // Note: plan_tasks is now optional — task_checklist covers structured tasks.
    { key: 'session_development', label: 'Estado actual y descripción de la sesión', placeholder: '¿Cómo llega el paciente? Eventos significativos de la semana, mejoría/estabilidad/empeoramiento de síntomas. Qué se trabajó…', required: true, rows: 5 },
    { key: 'interventions', label: 'Intervenciones aplicadas en sesión', placeholder: 'Técnicas específicas aplicadas en vivo: reestructuración cognitiva, exposición, psicoeducación, mindfulness…', required: false, rows: 3 },
    { key: 'patient_response', label: 'Respuesta del paciente / cierre de sesión', placeholder: 'Cómo respondió, qué se lleva del espacio, avance respecto a objetivos…', required: false, rows: 3 },
    { key: 'plan_tasks', label: 'Notas adicionales de plan y tareas', placeholder: 'Indicaciones particulares, contexto adicional a las tareas seleccionadas…', required: false, rows: 2 },
  ],
  DISCHARGE: [
    { key: 'discharge_summary', label: 'Resumen del motivo de consulta inicial', placeholder: 'Síntesis del motivo de consulta con el que inició el proceso…', required: true, rows: 4 },
    { key: 'final_state', label: 'Evaluación de logros y evolución', placeholder: 'Cambios significativos logrados desde la sesión inicial. Herramientas cognitivas o conductuales consolidadas para el manejo del motivo de consulta…', required: true, rows: 3 },
    { key: 'goals_achieved', label: 'Estado clínico actual al momento del cierre', placeholder: 'Nivel de funcionalidad, autonomía alcanzada…', required: false, rows: 3 },
    { key: 'recommendations', label: 'Recomendaciones y plan preventivo', placeholder: 'Señales de alerta tempranas identificadas, estrategias autónomas ante reaparición del malestar, escenarios para reconsultar…', required: false, rows: 3 },
    { key: 'referral', label: 'Remisión (si aplica)', placeholder: 'A quién se remite y motivo…', required: false, rows: 2 },
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

package aidrafts

// PromptSection is one section the AI worker should generate. It travels in
// the Redis job as `sections_schema` (JSON array) and matches the shape of a
// custom-template SectionDef, so the Python worker builds the Claude prompt
// through the same code path for both formats.
type PromptSection struct {
	Key  string `json:"key"`
	Type string `json:"type"`
	Hint string `json:"hint"`
}

// IntegratedPromptSchema is the single source of truth for what the AI
// generates when a session uses the integrated format (no custom template).
// It mirrors, key by key, the sections the SPA renders and approves
// (frontend components/clinical/constants.ts → TEMPLATE_SECTIONS): anything
// generated outside this list would be invisible in the review page and
// dropped on approve. schema_test.go pins every key to the template-v2
// whitelist in clinicalrecords so the two can never drift apart.
// The hints are the same guiding questions the professional sees as
// placeholders when writing by hand.
var IntegratedPromptSchema = map[string][]PromptSection{
	"INITIAL": {
		{Key: "consultation_reason", Type: "text", Hint: "Motivo de consulta en las propias palabras del paciente."},
		{Key: "current_problem", Type: "text", Hint: "¿Cuál es el problema principal actual? Frecuencia, intensidad y duración de los síntomas; qué factores lo detonan o lo mitigan; cómo afecta sus áreas de ajuste."},
		{Key: "family_dynamics", Type: "text", Hint: "Historia familiar y dinámica de crianza: relación con padres/cuidadores, estilo de crianza, eventos traumáticos, pérdidas significativas o violencia intrafamiliar."},
		{Key: "academic_history", Type: "text", Hint: "Historia académica y laboral: rendimiento y adaptación escolar/universitaria, estabilidad laboral, dificultades con figuras de autoridad o compañeros."},
		{Key: "relational_history", Type: "text", Hint: "Historia relacional, social y red de apoyo: relaciones interpersonales actuales, amigos cercanos, relaciones de pareja pasadas y presente."},
		{Key: "medical_history", Type: "text", Hint: "Antecedentes médicos u orgánicos relevantes."},
		{Key: "psychological_history", Type: "text", Hint: "Atenciones psicológicas anteriores."},
		{Key: "psychiatric_history", Type: "text", Hint: "Atenciones psiquiátricas anteriores."},
		{Key: "pharmacological_history", Type: "text", Hint: "Medicamentos actuales y dosis."},
		{Key: "diagnostic_impression", Type: "text", Hint: "Impresión diagnóstica o hipótesis clínica provisional, basada en criterios DSM-5/CIE-11 o análisis funcional."},
	},
	"EVOLUTION": {
		{Key: "session_development", Type: "text", Hint: "Estado actual: cómo llega el paciente, eventos significativos de la semana, mejoría/estabilidad/empeoramiento de los síntomas."},
		{Key: "interventions", Type: "text", Hint: "Descripción clínica de la sesión: temas abordados, técnicas específicas aplicadas, reacción del consultante."},
	},
	"DISCHARGE": {
		{Key: "discharge_summary", Type: "text", Hint: "Síntesis del motivo de consulta con el que inició el proceso."},
		{Key: "final_state", Type: "text", Hint: "Evaluación de logros: cambios significativos desde la sesión inicial, herramientas consolidadas para el manejo del motivo de consulta."},
		{Key: "recommendations", Type: "text", Hint: "Recomendaciones y plan preventivo: señales de alerta tempranas, estrategias autónomas ante reaparición del malestar, escenarios para reconsultar."},
	},
}

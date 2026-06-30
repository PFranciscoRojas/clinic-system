package pdf

import (
	"bytes"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"sghcp/core-api/internal/clinicalrecords"
)

// DiagnosisLine is one active ICD-10 diagnosis printed in the PDF.
type DiagnosisLine struct {
	Code        string
	Description string
	Type        string // PRINCIPAL | RELATED
}

// PatientInfo is the Resolución 1995/1999 art. 6 identification block.
type PatientInfo struct {
	FullName       string
	DocumentType   string
	DocumentNumber string
	PatientCode    int // Nº de HC correlativo por tenant (0 = no asignado)
	OpenedAt       time.Time
	BirthDate      time.Time
	Age            int
	Gender         string
	Phone          string
	Email          string
	Address        string
}

// ProfessionalInfo identifies the responsible professional (Ley 1090/2006:
// the professional card number is mandatory for psychologists).
type ProfessionalInfo struct {
	FullName  string
	License   string // tarjeta profesional
	Specialty string
}

// OrgInfo is the institutional letterhead.
type OrgInfo struct {
	Name    string
	NIT     string
	Address string
	Phone   string
	Email   string
}

// TemplateSectionDef is one section from a custom clinical_record_template.
// When RenderInput.TemplateSections is non-nil, the PDF uses these instead
// of the hardcoded templateSections map.
type TemplateSectionDef struct {
	Key      string
	Label    string
	Type     string // text | select | scale | checklist | widget
	Widget   string // widget name when type == "widget"
	ScaleMax int    // upper bound for scale; 0 → defaults to 10
}

type RenderInput struct {
	Record         *clinicalrecords.ClinicalRecord
	Org            OrgInfo
	Patient        PatientInfo
	Professional   ProfessionalInfo
	SignaturePNG   []byte // optional handwritten signature stamp
	SupervisorName string // set when the record was cosigned
	RecordType     string // Spanish label (e.g., "Evolución")
	Diagnoses      []DiagnosisLine
	Addenda        []*clinicalrecords.Addendum
	ContentHash    string // SHA-256 integrity fingerprint stored at approval
	// When non-nil, overrides the hardcoded templateSections for rendering.
	TemplateSections []TemplateSectionDef
}

type sectionDef struct {
	key   string
	title string
}

// Section keys and labels mirror TEMPLATE_SECTIONS in
// services/frontend/src/components/clinical/constants.ts — keep both in sync.
// A key missing here is a key the PDF silently drops even when the
// professional filled it in (the original bug report for this file).
//
// EVOLUTION also covers PLAN sessions (stored as record_type=EVOLUTION with
// is_plan_session:true) — both sets of keys are listed together; whichever
// ones are actually present in a given record are the only ones rendered
// (renderSectionsV2 skips any key that doesn't exist on the record).
var templateSections = map[string][]sectionDef{
	"INITIAL": {
		{key: "consultation_reason", title: "Reporte textual"},
		{key: "current_problem", title: "Análisis clínico del motivo de consulta"},
		{key: "distress_level", title: "Nivel de malestar subjetivo"},
		{key: "family_dynamics", title: "Historia familiar y dinámica de crianza"},
		{key: "academic_history", title: "Historia académica y laboral"},
		{key: "relational_history", title: "Historia relacional, social y red de apoyo"},
		{key: "medical_history", title: "Antecedentes médicos y orgánicos"},
		{key: "psychological_history", title: "Antecedentes psicológicos previos"},
		{key: "psychiatric_history", title: "Antecedentes psiquiátricos previos"},
		{key: "pharmacological_history", title: "Antecedentes farmacológicos"},
		{key: "spa_history", title: "Historia de consumo de sustancias"},
		{key: "family_mental_health", title: "Antecedentes familiares en salud mental"},
		{key: "clinical_formulation", title: "Formulación clínica — modelo de los 5 factores"},
		{key: "mental_exam", title: "Examen mental en consulta"},
		{key: "diagnostic_impression", title: "Impresión diagnóstica o hipótesis clínica provisional"},
		// Legacy/back-compat keys from earlier template versions.
		{key: "personal_history", title: "Antecedentes personales"},
		{key: "family_history", title: "Antecedentes familiares"},
		{key: "psychosocial_context", title: "Contexto psicosocial"},
		{key: "initial_plan", title: "Plan inicial"},
		{key: "complaint_verbatim", title: "Motivo de consulta (verbatim)"},
	},
	"EVOLUTION": {
		// Evolución (Formato 3)
		{key: "distress_level", title: "Nivel de malestar subjetivo"},
		{key: "session_development", title: "Estado actual y reporte subjetivo"},
		{key: "task_adherence", title: "Seguimiento a compromisos — actividades"},
		{key: "session_axis", title: "Eje de la sesión"},
		{key: "interventions", title: "Intervención realizada en la sesión"},
		{key: "session_evaluation", title: "Evaluación del cierre de sesión"},
		{key: "task_checklist", title: "Nuevas tareas asignadas"},
		// Plan terapéutico (Formato 2 — is_plan_session: true)
		{key: "functional_analysis", title: "Análisis funcional de la conducta objeto"},
		{key: "therapeutic_goal_1", title: "Objetivo terapéutico 1"},
		{key: "therapeutic_goal_2", title: "Objetivo terapéutico 2"},
		{key: "therapeutic_goal_3", title: "Objetivo terapéutico 3"},
		{key: "therapeutic_goal_4", title: "Objetivo terapéutico 4"},
		{key: "clinical_hypothesis", title: "Hipótesis y devolución clínica"},
		{key: "achievement_indicators", title: "Indicadores de logro y bienestar"},
		{key: "achievement_indicators_other", title: "Otro indicador de logro"},
		{key: "techniques", title: "Enfoque y técnicas a utilizar"},
		{key: "techniques_other", title: "Otra técnica"},
		{key: "tasks_assigned", title: "¿Se asignaron tareas?"},
		// Legacy/back-compat keys.
		{key: "patient_response", title: "Análisis / respuesta del paciente"},
		{key: "plan_tasks", title: "Plan y tareas"},
	},
	"DISCHARGE": {
		{key: "discharge_summary", title: "Resumen del motivo de consulta inicial"},
		{key: "final_state", title: "Evaluación de logros terapéuticos y evolución"},
		{key: "functionality", title: "Estado clínico al cierre"},
		{key: "recommendations", title: "Recomendaciones y plan preventivo"},
		{key: "dropout_sessions", title: "Sesiones consecutivas de inasistencia"},
		// Legacy/back-compat keys.
		{key: "goals_achieved", title: "Objetivos logrados"},
		{key: "referral", title: "Remisión"},
	},
	"INTERCONSULTATION": {
		{key: "consultation_reason", title: "Motivo de la interconsulta"},
		{key: "assessment", title: "Análisis"},
		{key: "recommendations", title: "Recomendaciones"},
	},
}

// Mirrors MENTAL_EXAM_DOMAINS in the frontend — deterministic order, Spanish labels.
var mentalExamDomains = []sectionDef{
	{key: "appearance", title: "Apariencia"},
	{key: "consciousness_orientation", title: "Conciencia y orientación"},
	{key: "attention", title: "Atención"},
	{key: "memory", title: "Memoria"},
	{key: "language", title: "Lenguaje"},
	{key: "thought", title: "Pensamiento"},
	{key: "affect", title: "Afecto"},
	{key: "perception", title: "Sensopercepción"},
	{key: "judgment", title: "Juicio"},
	{key: "insight", title: "Introspección"},
}

var riskLabels = map[string]string{
	"NONE":     "Sin riesgo",
	"IDEATION": "Ideación",
	"PLAN":     "Plan estructurado",
	"ATTEMPT":  "Intento",
}

// Code → Spanish label maps for the structured widgets, mirrored from
// services/frontend/src/components/clinical/constants.ts. Keep both in sync —
// a code added to one side without the other prints the raw key instead of
// its label.
var sessionAxisLabels = map[string]string{
	"emotional_processing":    "Procesamiento emocional",
	"behavioral_modification": "Modificación conductual",
	"technical_training":      "Entrenamiento técnico",
}

var insightLabels = map[string]string{"high": "Alto", "medium": "Medio", "low": "Bajo"}

var resistanceBarrierLabels = map[string]string{
	"tardiness":      "Tardanza",
	"topic_change":   "Cambios de tema / Tácticas de desviación",
	"omissions":      "Olvidos u omisiones de datos",
	"exaggeration":   "Exageración o minimización del síntoma",
	"contradictions": "Contradicciones en el relato",
	"defensiveness":  "Conductas defensivas u hostilidad",
	"silence_block":  "Silencios prolongados / Bloqueo",
	"other":          "Otra",
}

var affectExitLabels = map[string]string{
	"regulated": "Regulado", "emotionally_moved": "Movilizado emocionalmente", "anxious": "Ansioso",
}

var taskAdherenceLevelLabels = map[string]string{
	"full": "Cumplió totalmente", "partial": "Cumplió parcialmente", "none": "No cumplió",
}

var functionalityLevelLabels = map[string]string{
	"full": "Totalmente funcional", "supported": "Funcional con apoyos", "restricted": "Restringido",
}

var referralDestinationLabels = map[string]string{
	"psychiatry": "Psiquiatría", "neuropsychology": "Neuropsicología",
	"general_medicine": "Medicina General", "other": "Otro",
}

var achievementIndicatorLabels = map[string]string{
	"symptom_reduction": "Disminución en frecuencia/intensidad del síntoma principal (Escala subjetiva)",
	"activity_return":   "Retorno a actividades cotidianas que se encontraban evitadas o limitadas",
	"coping_strategies": "Incorporación de estrategias de afrontamiento y autorregulación emocional autónomas",
	"other":             "Otro (especificar en observaciones)",
}

var techniqueLabels = map[string]string{
	"cognitive_restructuring": "Reestructuración Cognitiva",
	"behavioral_activation":   "Activación Conductual",
	"emotional_regulation":    "Regulación Emocional / Mindfulness",
	"gradual_exposure":        "Exposición Gradual",
	"skills_training":         "Entrenamiento en Habilidades",
	"other":                   "Otro",
}

var physiologicalResponseLabels = map[string]string{
	"tachycardia": "Taquicardia", "chest_pressure": "Opresión en el pecho",
	"sweating": "Sudoración", "tension": "Tensión muscular",
}

var motorResponseLabels = map[string]string{
	"crying": "Llorar", "isolating": "Aislarse", "fleeing": "Huir",
	"complaining": "Reclamar", "smoking": "Fumar",
}

var consequenceLabels = map[string]string{
	"relief": "Alivio inmediato", "anger": "Enojo", "guilt": "Culpa", "attention": "Atención de otros",
}

var onsetLabels = map[string]string{
	"childhood": "Infancia", "adolescence": "Adolescencia",
	"early_adulthood": "Adultez temprana", "recent_event": "Evento reciente",
}

var pathwayLabels = map[string]string{
	"direct_conditioning":      "Condicionamiento directo (vivió experiencia estresante/traumática)",
	"vicarious_learning":       "Aprendizaje vicario (lo observó en figuras cercanas)",
	"information_transmission": `Transmisión de información (reglas verbales: "el mundo es peligroso")`,
}

var predispositionLabels = map[string]string{
	"family_mh":                "Antecedentes familiares de SM",
	"overprotective_parenting": "Estilo parental sobreprotector",
	"authoritarian_parenting":  "Estilo parental autoritario / rígido",
	"neglect_abuse":            "Negligencia, abusos o abandono temprano",
	"harm_avoidance":           "Rasgo: Alta evitación al daño / Temor",
	"perfectionism":            "Rasgo: Perfeccionismo / Rigidez",
	"affective_dependency":     "Rasgo: Dependencia afectiva / Inseguridad",
	"prior_medical":            "Enfermedad médica o crónica previa",
}

var triggerLabels = map[string]string{
	"breakup_divorce":  "Ruptura de pareja / Divorcio",
	"grief":            "Duelo / Muerte de un ser querido",
	"family_conflict":  "Conflictos familiares inmediatos",
	"relocation":       "Mudanza / Cambio de ciudad o entorno",
	"life_cycle":       "Cambio de ciclo vital (graduación, vejez)",
	"job_loss":         "Despido / Desempleo / Crisis económica",
	"work_overload":    "Aumento drástico de carga laboral / Estrés",
	"illness_accident": "Enfermedad o accidente reciente",
}

var maintenanceLabels = map[string]string{
	"avoidance":        "Evitación / Escape",
	"secondary_gain":   "Ganancia secundaria",
	"skills_deficit":   "Déficit de habilidades (asertividad, resolución conflictos)",
	"invalidating_env": "Entorno invalidante o permisivo",
	"hostile_work":     "Ambiente laboral o académico hostil activo",
}

var protectionLabels = map[string]string{
	"insight":            "Alta capacidad de introspección (Insight)",
	"motivation":         "Alta motivación manifiesta al cambio",
	"adherence":          "Adherencia, disciplina y puntualidad",
	"support_network":    "Red de apoyo familiar / pareja activa",
	"economic_stability": "Estabilidad económica",
	"healthy_lifestyle":  "Estilo de vida saludable (ej. ejercicio)",
}

var familyMHLabels = map[string]string{
	"anxiety": "Ansiedad", "depression": "Depresión", "suicide": "Suicidio", "psychosis": "Psicosis",
}

// Flattened from TASK_CHECKLIST_AREAS (6 areas, 4 tasks each).
var taskChecklistLabels = map[string]string{
	"autorregistro_abc":         "Autorregistro ABC",
	"identificacion_sesgos":     "Identificación de sesgos",
	"reatribucion_cognitiva":    "Reatribución cognitiva",
	"parada_pensamiento":        "Parada de pensamiento",
	"respiracion_diafragmatica": "Respiración diafragmática",
	"relajacion_jacobson":       "Relajación de Jacobson",
	"grounding_54321":           "Grounding 5-4-3-2-1",
	"termometro_emocional":      "Termómetro emocional",
	"defusion_cognitiva":        "Defusión cognitiva",
	"aceptacion_radical":        "Aceptación radical",
	"mindfulness_cotidiano":     "Mindfulness cotidiano",
	"habilidades_tipp":          "Habilidades TIPP",
	"activacion_conductual":     "Activación conductual",
	"exposicion_gradual":        "Exposición gradual",
	"experimento_conductual":    "Experimento conductual",
	"postergacion_preocupacion": "Postergación de la preocupación",
	"solucion_problemas":        "Solución de problemas",
	"chunking":                  "Fragmentación / Chunking",
	"control_estimulos":         "Control de estímulos",
	"comunicacion_asertiva":     "Comunicación asertiva",
	"registro_limites":          "Registro de límites",
	"higiene_sueno":             "Higiene del sueño",
	"escritura_terapeutica":     "Escritura terapéutica",
}

// labelOf returns the Spanish label for a code, or the raw code itself when
// unmapped — never silently drops content the professional actually entered.
func labelOf(m map[string]string, key string) string {
	if l, ok := m[key]; ok {
		return l
	}
	return key
}

// labelJoin translates each item in a code array and joins for display —
// the fix for values that printed as Go's raw "[code1 code2]" slice syntax.
func labelJoin(m map[string]string, items []string) string {
	if len(items) == 0 {
		return ""
	}
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, labelOf(m, it))
	}
	return strings.Join(out, ", ")
}

// integratedWidgetAlias maps an integrated-format section key to the shared
// widget formatter name when their data shapes differ from the custom
// clinical-record-template widget of the same concept (see WidgetField on
// the frontend, e.g. "spa_history" there is a {spa, familyMH} wrapper, while
// the integrated format stores them as two separate flat top-level keys).
var integratedWidgetAlias = map[string]string{
	"clinical_formulation": "formulation_5f",
	"distress_level":       "distress_scale",
	"spa_history":          "spa_history_flat",
}

const (
	pageLeft  = 18.0
	pageRight = 192.0
)

func Render(w io.Writer, in RenderInput) error {
	doc := fpdf.New("P", "mm", "A4", "")
	doc.SetMargins(pageLeft, 16, 210-pageRight)
	doc.SetAutoPageBreak(true, 30)
	doc.AliasNbPages("")

	// Core fonts are cp1252 — every string must pass through the translator
	// or accented characters render as mojibake.
	tr := doc.UnicodeTranslatorFromDescriptor("")

	// Footer on every page: legal frame, generation time and page numbers.
	generated := time.Now().Format("2006-01-02 15:04")
	doc.SetFooterFunc(func() {
		doc.SetY(-24)
		doc.SetLineWidth(0.2)
		doc.SetDrawColor(180, 180, 180)
		doc.Line(pageLeft, doc.GetY(), pageRight, doc.GetY())
		doc.Ln(2)
		doc.SetFont("Helvetica", "I", 7)
		doc.SetTextColor(110, 110, 110)
		doc.MultiCell(0, 3.4, tr("Documento confidencial sujeto a reserva legal — Resolución 1995/1999 (historia clínica), Ley 23/1981 (secreto profesional), Ley 1090/2006 (ejercicio de la psicología) y Ley 1581/2012 (protección de datos personales). Copia fiel del registro electrónico generada el "+generated+"."), "", "C", false)
		doc.SetFont("Helvetica", "", 8)
		doc.CellFormat(0, 4, tr(fmt.Sprintf("Página %d de {nb}", doc.PageNo())), "", 0, "C", false, 0, "")
		doc.SetTextColor(0, 0, 0)
	})

	doc.AddPage()

	// ── Institutional letterhead ──────────────────────────────────────────
	doc.SetFont("Helvetica", "B", 15)
	doc.SetTextColor(13, 110, 110)
	doc.CellFormat(0, 8, tr(in.Org.Name), "", 1, "C", false, 0, "")
	doc.SetTextColor(90, 90, 90)
	doc.SetFont("Helvetica", "", 8.5)
	letterhead := []string{}
	if in.Org.NIT != "" {
		letterhead = append(letterhead, "NIT "+in.Org.NIT)
	}
	if in.Org.Address != "" {
		letterhead = append(letterhead, in.Org.Address)
	}
	if in.Org.Phone != "" {
		letterhead = append(letterhead, "Tel. "+in.Org.Phone)
	}
	if in.Org.Email != "" {
		letterhead = append(letterhead, in.Org.Email)
	}
	if len(letterhead) > 0 {
		doc.CellFormat(0, 4.5, tr(strings.Join(letterhead, "  ·  ")), "", 1, "C", false, 0, "")
	}
	doc.SetTextColor(0, 0, 0)
	doc.Ln(2)
	doc.SetLineWidth(0.5)
	doc.SetDrawColor(13, 110, 110)
	doc.Line(pageLeft, doc.GetY(), pageRight, doc.GetY())
	doc.SetDrawColor(0, 0, 0)
	doc.Ln(4)

	// ── Document title ────────────────────────────────────────────────────
	doc.SetFont("Helvetica", "B", 12)
	doc.CellFormat(0, 6, tr("HISTORIA CLÍNICA PSICOLÓGICA"), "", 1, "C", false, 0, "")
	doc.SetFont("Helvetica", "", 10)
	doc.CellFormat(0, 5, tr("Nota de "+strings.ToLower(in.RecordType)), "", 1, "C", false, 0, "")

	// Historia clínica No. = patient document number (Res. 1995/1999 art. 6).
	// Also show the correlative HC number assigned at registration when available.
	hcHeader := fmt.Sprintf("Historia clínica No. %s %s", in.Patient.DocumentType, in.Patient.DocumentNumber)
	if in.Patient.PatientCode > 0 {
		hcHeader += fmt.Sprintf("  ·  HC-%06d", in.Patient.PatientCode)
	}
	doc.SetFont("Helvetica", "B", 9.5)
	doc.CellFormat(0, 6, tr(hcHeader), "", 1, "C", false, 0, "")
	doc.SetFont("Helvetica", "", 7.5)
	doc.SetTextColor(120, 120, 120)
	doc.CellFormat(0, 4, tr("Registro electrónico ID: "+in.Record.ID), "", 1, "C", false, 0, "")
	doc.SetTextColor(0, 0, 0)
	doc.Ln(3)

	// ── 1. Patient identification (art. 6) ────────────────────────────────
	section := 0
	nextSection := func(title string) {
		section++
		numberedHeader(doc, tr, fmt.Sprintf("%d. %s", section, title))
	}
	nextSection("Identificación del paciente")
	hcCode := ""
	if in.Patient.PatientCode > 0 {
		hcCode = fmt.Sprintf("HC-%06d", in.Patient.PatientCode)
		if !in.Patient.OpenedAt.IsZero() {
			hcCode += "  (apertura: " + in.Patient.OpenedAt.Format("2006-01-02") + ")"
		}
	}
	rows := [][2]string{
		{"Nº de HC", hcCode},
		{"Nombre completo", in.Patient.FullName},
		{"Documento", strings.TrimSpace(in.Patient.DocumentType + " " + in.Patient.DocumentNumber)},
		{"Fecha de nacimiento", in.Patient.BirthDate.Format("2006-01-02")},
		{"Edad", fmt.Sprintf("%d años", in.Patient.Age)},
		{"Sexo / género", in.Patient.Gender},
		{"Teléfono", in.Patient.Phone},
		{"Correo electrónico", in.Patient.Email},
		{"Dirección", in.Patient.Address},
	}
	fieldGrid(doc, tr, rows)
	doc.Ln(2)

	// ── 2. Responsible professional (Ley 1090/2006) ───────────────────────
	nextSection("Profesional responsable")
	prof := [][2]string{
		{"Nombre completo", in.Professional.FullName},
		{"Tarjeta profesional", in.Professional.License},
		{"Especialidad", in.Professional.Specialty},
	}
	fieldGrid(doc, tr, prof)
	doc.Ln(2)

	// ── 3. Care data (art. 5: date and time of every entry) ───────────────
	nextSection("Datos de la atención")
	care := [][2]string{
		{"Tipo de nota", in.RecordType},
		{"Fecha de la sesión", in.Record.SessionDate.Format("2006-01-02")},
		{"Registro creado", in.Record.CreatedAt.Format("2006-01-02 15:04")},
	}
	// Res. 1995/1999: entries should be simultaneous with care — a gap beyond
	// the same-day grace window is disclosed as an extemporaneous entry.
	lateEntry := in.Record.CreatedAt.Sub(in.Record.SessionDate) > 24*time.Hour
	if lateEntry {
		care = append(care, [2]string{"Carácter del registro", "Extemporáneo (diligenciado con posterioridad)"})
	}
	if in.Record.ApprovedAt != nil {
		care = append(care, [2]string{"Aprobado", in.Record.ApprovedAt.Format("2006-01-02 15:04")})
	}
	if in.Record.RiskLevel != nil && *in.Record.RiskLevel != "" {
		label := riskLabels[*in.Record.RiskLevel]
		if label == "" {
			label = *in.Record.RiskLevel
		}
		care = append(care, [2]string{"Nivel de riesgo", label})
	}
	fieldGrid(doc, tr, care)
	if reason, ok := in.Record.Sections["late_entry_reason"].(string); ok && reason != "" {
		doc.SetFont("Helvetica", "I", 8.5)
		doc.SetTextColor(120, 80, 10)
		doc.MultiCell(0, 4.2, tr("Justificación del registro extemporáneo: "+reason), "", "L", false)
		doc.SetTextColor(0, 0, 0)
	}
	doc.Ln(2)

	// ── 4. Clinical content ───────────────────────────────────────────────
	nextSection("Contenido clínico")
	if len(in.TemplateSections) > 0 {
		renderCustomTemplate(doc, tr, in.Record, in.TemplateSections)
	} else {
		renderSectionsV2(doc, tr, in.Record)
	}

	// ── 5. Active diagnoses ───────────────────────────────────────────────
	if len(in.Diagnoses) > 0 {
		doc.Ln(1)
		nextSection("Diagnósticos activos (CIE-10)")
		doc.SetFont("Helvetica", "", 9.5)
		var b strings.Builder
		for _, d := range in.Diagnoses {
			line := fmt.Sprintf("%s — %s", d.Code, d.Description)
			if d.Type == "PRINCIPAL" {
				line += " (principal)"
			}
			b.WriteString(line + "\n")
		}
		doc.MultiCell(0, 5, tr(strings.TrimSpace(b.String())), "1", "L", false)
	}

	// ── Addenda (Res. 1995/1999: corrections are appended, never edited) ──
	if len(in.Addenda) > 0 {
		doc.Ln(1)
		nextSection("Adendas")
		for _, a := range in.Addenda {
			doc.SetFont("Helvetica", "B", 8.5)
			doc.SetTextColor(100, 100, 100)
			doc.CellFormat(0, 5, tr(fmt.Sprintf("Adenda del %s — %s",
				a.CreatedAt.Format("2006-01-02 15:04"), a.AuthorName)), "", 1, "L", false, 0, "")
			doc.SetTextColor(0, 0, 0)
			doc.SetFont("Helvetica", "", 9.5)
			doc.MultiCell(0, 5, tr(a.Content), "1", "L", false)
			doc.Ln(2)
		}
	}

	// ── 6. Electronic signature (Ley 527/1999) ────────────────────────────
	doc.Ln(3)
	nextSection("Firma del profesional")

	approvedAt := ""
	if in.Record.ApprovedAt != nil {
		approvedAt = in.Record.ApprovedAt.Format("2006-01-02 a las 15:04")
	}
	doc.SetFont("Helvetica", "", 9.5)
	sig := fmt.Sprintf(
		"Este registro fue aprobado y firmado electrónicamente en el sistema de información SGHCP por %s, tarjeta profesional No. %s, el %s. La firma electrónica y este documento tienen plena validez jurídica conforme a la Ley 527/1999 sobre mensajes de datos y firmas electrónicas.",
		in.Professional.FullName, in.Professional.License, approvedAt)
	doc.MultiCell(0, 5, tr(sig), "", "L", false)

	if in.SupervisorName != "" && in.Record.SupervisorCosignedAt != nil {
		doc.Ln(1)
		cosig := fmt.Sprintf("Co-firmado por el supervisor %s el %s.",
			in.SupervisorName, in.Record.SupervisorCosignedAt.Format("2006-01-02 a las 15:04"))
		doc.MultiCell(0, 5, tr(cosig), "", "L", false)
	}

	// Handwritten signature stamp (when uploaded in the professional profile)
	if len(in.SignaturePNG) > 0 {
		doc.Ln(4)
		opts := fpdf.ImageOptions{ImageType: "PNG", ReadDpi: false}
		doc.RegisterImageOptionsReader("prof-signature", opts, bytes.NewReader(in.SignaturePNG))
		// Width 55mm, height auto (keeps aspect ratio); fpdf advances Y itself
		// when flow=true.
		doc.ImageOptions("prof-signature", pageLeft, doc.GetY(), 55, 0, true, opts, 0, "")
		doc.Ln(1)
	} else {
		doc.Ln(8)
	}

	// Signature line representation
	doc.SetLineWidth(0.3)
	doc.Line(pageLeft, doc.GetY(), pageLeft+75, doc.GetY())
	doc.Ln(1.5)
	doc.SetFont("Helvetica", "B", 9.5)
	doc.CellFormat(0, 5, tr(in.Professional.FullName), "", 1, "L", false, 0, "")
	doc.SetFont("Helvetica", "", 8.5)
	doc.CellFormat(0, 4.2, tr("Psicólogo(a) — T.P. No. "+in.Professional.License), "", 1, "L", false, 0, "")
	if in.Professional.Specialty != "" {
		doc.CellFormat(0, 4.2, tr(in.Professional.Specialty), "", 1, "L", false, 0, "")
	}

	// ── Integrity fingerprint ─────────────────────────────────────────────
	if in.ContentHash != "" {
		doc.Ln(4)
		doc.SetFillColor(246, 248, 250)
		doc.SetFont("Helvetica", "B", 7.5)
		doc.SetTextColor(90, 90, 90)
		doc.CellFormat(0, 4.5, tr("Verificación de integridad del documento"), "", 1, "L", true, 0, "")
		doc.SetFont("Courier", "", 7)
		doc.CellFormat(0, 4, "SHA-256: "+in.ContentHash, "", 1, "L", true, 0, "")
		doc.SetFont("Helvetica", "", 7)
		doc.MultiCell(0, 3.6, tr("La huella corresponde al contenido clínico almacenado al momento de la aprobación y permite verificar en el sistema que este documento no ha sido alterado."), "", "L", true)
		doc.SetTextColor(0, 0, 0)
	}

	return doc.Output(w)
}

func numberedHeader(doc *fpdf.Fpdf, tr func(string) string, title string) {
	doc.SetFont("Helvetica", "B", 10.5)
	doc.SetFillColor(234, 246, 245)
	doc.SetTextColor(11, 84, 84)
	doc.CellFormat(0, 6.5, tr("  "+title), "", 1, "L", true, 0, "")
	doc.SetTextColor(0, 0, 0)
	doc.Ln(1.5)
}

// fieldGrid prints label/value pairs in two columns, skipping empty values.
// Values too wide for half a column get a full-width row so long names
// never overlap the neighbouring field.
func fieldGrid(doc *fpdf.Fpdf, tr func(string) string, rows [][2]string) {
	const labelW, valueW = 38.0, 49.0
	fullValueW := pageRight - pageLeft - labelW
	col := 0
	for _, row := range rows {
		if strings.TrimSpace(row[1]) == "" {
			continue
		}
		value := tr(row[1])

		doc.SetFont("Helvetica", "", 9)
		wide := doc.GetStringWidth(value) > valueW-2

		if wide && col == 1 {
			// Close the half-filled line before the full-width row.
			doc.Ln(5.2)
			col = 0
		}

		doc.SetFont("Helvetica", "B", 8.5)
		doc.SetTextColor(100, 100, 100)
		doc.CellFormat(labelW, 5.2, tr(row[0]), "", 0, "L", false, 0, "")
		doc.SetFont("Helvetica", "", 9)
		doc.SetTextColor(0, 0, 0)

		switch {
		case wide:
			doc.MultiCell(fullValueW, 5.2, value, "", "L", false)
		case col == 0:
			doc.CellFormat(valueW, 5.2, value, "", 0, "L", false, 0, "")
			col = 1
		default:
			doc.CellFormat(valueW, 5.2, value, "", 1, "L", false, 0, "")
			col = 0
		}
	}
	if col == 1 {
		doc.Ln(5.2)
	}
}

func writeSectionHeader(doc *fpdf.Fpdf, tr func(string) string, title string) {
	doc.SetFont("Helvetica", "B", 10)
	doc.SetFillColor(240, 253, 250)
	doc.CellFormat(0, 6.5, tr(title), "B", 1, "", true, 0, "")
}

func renderSectionsV2(doc *fpdf.Fpdf, tr func(string) string, rec *clinicalrecords.ClinicalRecord) {
	if len(rec.Sections) == 0 {
		return
	}

	order := templateSections[string(rec.RecordType)]
	if len(order) == 0 {
		order = templateSections["EVOLUTION"]
	}

	for _, sec := range order {
		val, exists := rec.Sections[sec.key]
		if !exists || val == nil {
			continue
		}

		var content string
		if s, ok := val.(string); ok {
			content = s
		} else {
			// Non-string value (e.g. mental_exam object): delegate to the widget
			// renderer so the output is human-readable rather than a raw Go value.
			// integratedWidgetAlias covers keys whose shape differs from the
			// custom-template widget of the same name (see its doc comment).
			widgetName := sec.key
			if alias, ok := integratedWidgetAlias[sec.key]; ok {
				widgetName = alias
			}
			content = renderWidgetValue(widgetName, val)
		}

		if strings.TrimSpace(content) == "" {
			continue
		}

		writeSectionHeader(doc, tr, sec.title)
		doc.SetFont("Helvetica", "", 9.5)
		doc.MultiCell(0, 5, tr(strings.TrimSpace(content)), "1", "L", false)
		doc.Ln(2)
	}
}

// renderCustomTemplate renders sections driven by a custom template schema.
// Each section's value is rendered differently depending on its field type.
// Widgets that are self-contained in the UI (treatment_plan, diagnoses) are
// skipped — they are handled by other sections in the PDF (e.g., §5 diagnoses).
func renderCustomTemplate(doc *fpdf.Fpdf, tr func(string) string, rec *clinicalrecords.ClinicalRecord, schema []TemplateSectionDef) {
	for _, sec := range schema {
		// Skip widgets whose data is rendered in dedicated PDF sections.
		if sec.Type == "widget" && (sec.Widget == "treatment_plan" || sec.Widget == "diagnoses") {
			continue
		}

		val, exists := rec.Sections[sec.Key]
		if !exists || val == nil {
			continue
		}

		content := renderFieldValue(sec, val)
		if strings.TrimSpace(content) == "" {
			continue
		}

		writeSectionHeader(doc, tr, sec.Label)
		doc.SetFont("Helvetica", "", 9.5)
		doc.MultiCell(0, 5, tr(strings.TrimSpace(content)), "1", "L", false)
		doc.Ln(2)
	}
}

// renderFieldValue converts a section value to a printable string based on
// the field type declared in the template schema.
func renderFieldValue(sec TemplateSectionDef, val any) string {
	switch sec.Type {
	case "text", "select":
		if s, ok := val.(string); ok {
			return s
		}
		return fmt.Sprintf("%v", val)

	case "scale":
		max := sec.ScaleMax
		if max == 0 {
			max = 10
		}
		switch v := val.(type) {
		case float64:
			return fmt.Sprintf("%.0f / %d", v, max)
		case int:
			return fmt.Sprintf("%d / %d", v, max)
		}
		return fmt.Sprintf("%v / %d", val, max)

	case "checklist":
		items, ok := toStringSlice(val)
		if !ok || len(items) == 0 {
			return ""
		}
		var b strings.Builder
		for _, item := range items {
			b.WriteString("• " + item + "\n")
		}
		return b.String()

	case "widget":
		return renderWidgetValue(sec.Widget, val)
	}

	// Fallback for unknown types.
	return fmt.Sprintf("%v", val)
}

// renderWidgetValue converts a widget value to a printable string.
func renderWidgetValue(name string, val any) string {
	switch name {
	case "mental_exam":
		exam, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		return formatMentalExam(exam)

	case "distress_scale":
		switch v := val.(type) {
		case float64:
			return fmt.Sprintf("%.0f / 10", v)
		case int:
			return fmt.Sprintf("%d / 10", v)
		}
		return fmt.Sprintf("%v / 10", val)

	case "task_checklist":
		items, ok := toStringSlice(val)
		if !ok || len(items) == 0 {
			return ""
		}
		var b strings.Builder
		for _, item := range items {
			b.WriteString("• " + labelOf(taskChecklistLabels, item) + "\n")
		}
		return b.String()

	case "achievement_indicators":
		items, _ := toStringSlice(val)
		return labelJoin(achievementIndicatorLabels, items)

	case "techniques":
		items, _ := toStringSlice(val)
		return labelJoin(techniqueLabels, items)

	case "tasks_assigned":
		if b, ok := val.(bool); ok {
			if b {
				return "Sí"
			}
			return "No"
		}
		return ""

	case "risk":
		if s, ok := val.(string); ok {
			return labelOf(riskLabels, s)
		}

	// formulation_5f is the custom-template widget name AND the alias target
	// for the integrated format's "clinical_formulation" key (same shape).
	case "formulation_5f":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var b strings.Builder
		factor := func(title, key string, labels map[string]string) {
			f := asMap(m, key)
			if f == nil {
				return
			}
			sel, notes := asStrings(f, "selected"), asString(f, "notes")
			if len(sel) == 0 && notes == "" {
				return
			}
			b.WriteString(title + ":\n")
			if len(sel) > 0 {
				b.WriteString("  • " + labelJoin(labels, sel) + "\n")
			}
			if notes != "" {
				b.WriteString("  Notas: " + notes + "\n")
			}
		}
		factor("Predisposición", "predisposition", predispositionLabels)
		if acq := asMap(m, "acquisition"); acq != nil {
			onset, pathway, notes := asString(acq, "onset"), asStrings(acq, "pathway"), asString(acq, "notes")
			if onset != "" || len(pathway) > 0 || notes != "" {
				b.WriteString("Adquisición:\n")
				if onset != "" {
					b.WriteString("  • Época de inicio: " + labelOf(onsetLabels, onset) + "\n")
				}
				if len(pathway) > 0 {
					b.WriteString("  • Vía de aprendizaje: " + labelJoin(pathwayLabels, pathway) + "\n")
				}
				if notes != "" {
					b.WriteString("  Notas: " + notes + "\n")
				}
			}
		}
		factor("Desencadenantes", "triggers", triggerLabels)
		factor("Mantenimiento", "maintenance", maintenanceLabels)
		factor("Factores de protección", "protection", protectionLabels)
		return b.String()

	case "functional_analysis":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var b strings.Builder
		line := func(label, v string) {
			if v != "" {
				b.WriteString(label + ": " + v + "\n")
			}
		}
		line("Antecedentes", asString(m, "antecedents"))
		line("Respuesta cognitiva", asString(m, "cognitive_response"))
		phys := joinExtra(labelJoin(physiologicalResponseLabels, asStrings(m, "physiological_response")), asString(m, "physiological_other"))
		line("Respuesta fisiológica", phys)
		motor := joinExtra(labelJoin(motorResponseLabels, asStrings(m, "motor_response")), asString(m, "motor_other"))
		line("Respuesta motora/conductual", motor)
		cons := joinExtra(labelJoin(consequenceLabels, asStrings(m, "consequences")), asString(m, "consequences_other"))
		line("Consecuencias", cons)
		return b.String()

	case "task_adherence":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var b strings.Builder
		if asBool(m, "assigned") {
			b.WriteString("Se asignaron tareas: Sí\n")
		}
		if level := asString(m, "level"); level != "" {
			b.WriteString("Nivel de adherencia: " + labelOf(taskAdherenceLevelLabels, level) + "\n")
		}
		if obs := asString(m, "observations"); obs != "" {
			b.WriteString("Observaciones: " + obs + "\n")
		}
		return b.String()

	// The exact bug reported: axis/barriers are code arrays that used to print
	// as Go's raw "[code1 code2]" slice syntax instead of translated labels.
	case "session_evaluation":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var b strings.Builder
		if axis := labelJoin(sessionAxisLabels, asStrings(m, "axis")); axis != "" {
			b.WriteString("Eje de trabajo: " + axis + "\n")
		}
		if fb := asString(m, "patient_feedback"); fb != "" {
			b.WriteString("Percepción del paciente: " + fb + "\n")
		}
		if insight := asString(m, "insight"); insight != "" {
			b.WriteString("Nivel de insight: " + labelOf(insightLabels, insight) + "\n")
		}
		barriers := joinExtra(labelJoin(resistanceBarrierLabels, asStrings(m, "barriers")), asString(m, "barriers_other"))
		if barriers != "" {
			b.WriteString("Barreras identificadas: " + barriers + "\n")
		}
		if exit := asString(m, "affect_exit"); exit != "" {
			b.WriteString("Estado del afecto al salir: " + labelOf(affectExitLabels, exit) + "\n")
		}
		return b.String()

	case "functionality":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var b strings.Builder
		if level := asString(m, "level"); level != "" {
			b.WriteString("Nivel de funcionalidad: " + labelOf(functionalityLevelLabels, level) + "\n")
		}
		if dest := asString(m, "referral_destination"); dest != "" {
			d := labelOf(referralDestinationLabels, dest)
			if other := asString(m, "referral_destination_other"); dest == "other" && other != "" {
				d = other
			}
			b.WriteString("Destino de remisión: " + d + "\n")
		}
		return b.String()

	// spa_history is the custom-template widget name; its data is a single
	// {spa, familyMH} wrapper (see WidgetField on the frontend) — different
	// from the integrated format's two separate flat keys, handled below.
	case "spa_history":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var parts []string
		if spa, ok := m["spa"].(map[string]any); ok {
			parts = append(parts, "[SPA]")
			for k, v := range spa {
				if b, ok := v.(bool); ok && b {
					parts = append(parts, "  • "+k)
				}
			}
		}
		if fmh, ok := m["familyMH"].(map[string]any); ok {
			parts = append(parts, "[Antecedentes familiares SM]")
			for k, v := range fmh {
				if b, ok := v.(bool); ok && b {
					parts = append(parts, "  • "+k)
				}
			}
		}
		return strings.Join(parts, "\n")

	// Integrated format's flat "spa_history" key (aliased here by
	// integratedWidgetAlias) — present + alcohol/tobacco/other sub-objects.
	case "spa_history_flat":
		m, ok := val.(map[string]any)
		if !ok || !asBool(m, "present") {
			return ""
		}
		var parts []string
		sub := func(label, key string) {
			s := asMap(m, key)
			if s == nil || !asBool(s, "present") {
				return
			}
			line := label
			if freq := asString(s, "frequency"); freq != "" {
				line += " (" + freq + ")"
			}
			parts = append(parts, line)
		}
		sub("Alcohol", "alcohol")
		sub("Tabaco", "tobacco")
		if other := asMap(m, "other"); other != nil && asBool(other, "present") {
			line := "Otra"
			if s := asString(other, "substance"); s != "" {
				line += ": " + s
			}
			if freq := asString(other, "frequency"); freq != "" {
				line += " (" + freq + ")"
			}
			parts = append(parts, line)
		}
		if len(parts) == 0 {
			return "Consumo reportado (sin detalle)"
		}
		return strings.Join(parts, "\n")

	case "family_mental_health":
		m, ok := val.(map[string]any)
		if !ok {
			return ""
		}
		var parts []string
		for _, k := range []string{"anxiety", "depression", "suicide", "psychosis"} {
			if asBool(m, k) {
				parts = append(parts, familyMHLabels[k])
			}
		}
		return strings.Join(parts, ", ")
	}

	// Generic fallback for widgets not handled above.
	return fmt.Sprintf("%v", val)
}

// toStringSlice coerces an []any or []string to []string.
func toStringSlice(val any) ([]string, bool) {
	switch v := val.(type) {
	case []string:
		return v, true
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			out = append(out, fmt.Sprintf("%v", item))
		}
		return out, true
	}
	return nil, false
}

// asString/asBool/asMap/asStrings read a typed sub-field from a decoded JSON
// object (map[string]any) — every clinical_records.Sections value comes from
// json.Unmarshal into map[string]any, so nested objects/arrays/bools arrive
// untyped and need this kind of safe access.
func asString(m map[string]any, k string) string {
	s, _ := m[k].(string)
	return s
}

func asBool(m map[string]any, k string) bool {
	b, _ := m[k].(bool)
	return b
}

func asMap(m map[string]any, k string) map[string]any {
	sub, _ := m[k].(map[string]any)
	return sub
}

func asStrings(m map[string]any, k string) []string {
	items, _ := toStringSlice(m[k])
	return items
}

// joinExtra appends an "other" free-text value to an already-translated,
// comma-joined list of labels — the common "selected options + free text"
// pattern used across several widgets (barriers, achievement indicators…).
func joinExtra(base, extra string) string {
	if extra == "" {
		return base
	}
	if base == "" {
		return extra
	}
	return base + ", " + extra
}

// formatMentalExam walks the domains in fixed order so output is deterministic.
func formatMentalExam(exam map[string]any) string {
	var b strings.Builder
	for _, d := range mentalExamDomains {
		raw, ok := exam[d.key]
		if !ok {
			continue
		}
		entry, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		status, _ := entry["status"].(string)
		note, _ := entry["note"].(string)

		line := d.title + ": "
		if status == "ALTERED" {
			line += "Alterado"
			if note != "" {
				line += " — " + note
			}
		} else {
			line += "Normal"
		}
		b.WriteString(line + "\n")
	}
	return b.String()
}

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
	Record           *clinicalrecords.ClinicalRecord
	Org              OrgInfo
	Patient          PatientInfo
	Professional     ProfessionalInfo
	SignaturePNG     []byte // optional handwritten signature stamp
	SupervisorName   string // set when the record was cosigned
	RecordType       string // Spanish label (e.g., "Evolución")
	Diagnoses        []DiagnosisLine
	Addenda          []*clinicalrecords.Addendum
	ContentHash      string // SHA-256 integrity fingerprint stored at approval
	// When non-nil, overrides the hardcoded templateSections for rendering.
	TemplateSections []TemplateSectionDef
}

type sectionDef struct {
	key   string
	title string
}

// Section keys and labels mirror TEMPLATE_SECTIONS in
// services/frontend/src/components/clinical/constants.ts — keep both in sync.
var templateSections = map[string][]sectionDef{
	"INITIAL": {
		{key: "consultation_reason", title: "Motivo de consulta"},
		{key: "current_problem", title: "Problema actual"},
		{key: "personal_history", title: "Antecedentes personales"},
		{key: "family_history", title: "Antecedentes familiares"},
		{key: "psychosocial_context", title: "Contexto psicosocial"},
		{key: "mental_exam", title: "Examen mental"},
		{key: "diagnostic_impression", title: "Impresión diagnóstica"},
		{key: "initial_plan", title: "Plan inicial"},
	},
	"EVOLUTION": {
		{key: "session_development", title: "Desarrollo de la sesión"},
		{key: "interventions", title: "Intervenciones aplicadas"},
		{key: "patient_response", title: "Análisis / respuesta del paciente"},
		{key: "plan_tasks", title: "Plan y tareas"},
	},
	"DISCHARGE": {
		{key: "discharge_summary", title: "Resumen del proceso"},
		{key: "final_state", title: "Estado final"},
		{key: "goals_achieved", title: "Objetivos logrados"},
		{key: "recommendations", title: "Recomendaciones"},
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
			content = renderWidgetValue(sec.key, val)
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
			b.WriteString("• " + item + "\n")
		}
		return b.String()

	case "risk":
		if s, ok := val.(string); ok {
			if label := riskLabels[s]; label != "" {
				return label
			}
			return s
		}

	case "formulation_5f":
		return formatOrderedMap(val, []string{
			"predisposition:Predisposición",
			"acquisition:Adquisición",
			"triggers:Desencadenantes",
			"maintenance:Mantenimiento",
			"protection:Factores de protección",
		})

	case "functional_analysis":
		return formatOrderedMap(val, []string{
			"antecedents:Antecedentes",
			"cognitive_response:Respuesta cognitiva",
			"physiological_response:Respuesta fisiológica",
			"behavioral_response:Respuesta conductual",
			"emotional_response:Respuesta emocional",
			"consequences:Consecuencias",
		})

	case "task_adherence":
		return formatOrderedMap(val, []string{
			"level:Nivel de adherencia",
			"observations:Observaciones",
		})

	case "session_evaluation":
		return formatOrderedMap(val, []string{
			"axis:Eje de trabajo",
			"patient_feedback:Percepción del paciente",
			"insight:Nivel de insight",
			"barriers:Barreras identificadas",
			"next_objective:Objetivo próxima sesión",
		})

	case "functionality":
		return formatOrderedMap(val, []string{
			"level:Nivel de funcionalidad",
			"referral_destination:Remisión",
		})

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
	}

	// Generic fallback for widgets not handled above.
	return fmt.Sprintf("%v", val)
}

// formatOrderedMap renders a map[string]any in a fixed field order, skipping
// empty values. Labels are declared as "key:Label" pairs.
func formatOrderedMap(val any, fields []string) string {
	m, ok := val.(map[string]any)
	if !ok {
		return ""
	}
	var b strings.Builder
	for _, spec := range fields {
		parts := strings.SplitN(spec, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key, label := parts[0], parts[1]
		v, exists := m[key]
		if !exists || v == nil {
			continue
		}
		s := fmt.Sprintf("%v", v)
		if strings.TrimSpace(s) == "" {
			continue
		}
		b.WriteString(label + ": " + s + "\n")
	}
	return b.String()
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

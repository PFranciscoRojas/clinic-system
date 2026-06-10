package pdf

import (
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
// The clinical history number is the patient's identity document number.
type PatientInfo struct {
	FullName       string
	DocumentType   string
	DocumentNumber string
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

type RenderInput struct {
	Record         *clinicalrecords.ClinicalRecord
	Org            OrgInfo
	Patient        PatientInfo
	Professional   ProfessionalInfo
	SupervisorName string // set when the record was cosigned
	RecordType     string // Spanish label (e.g., "Evolución")
	Diagnoses      []DiagnosisLine
	ContentHash    string // SHA-256 integrity fingerprint stored at approval
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

	// Historia clínica No. = patient document number (Res. 1995/1999 art. 6)
	doc.SetFont("Helvetica", "B", 9.5)
	doc.CellFormat(0, 6, tr(fmt.Sprintf("Historia clínica No. %s %s", in.Patient.DocumentType, in.Patient.DocumentNumber)), "", 1, "C", false, 0, "")
	doc.SetFont("Helvetica", "", 7.5)
	doc.SetTextColor(120, 120, 120)
	doc.CellFormat(0, 4, tr("Registro electrónico ID: "+in.Record.ID), "", 1, "C", false, 0, "")
	doc.SetTextColor(0, 0, 0)
	doc.Ln(3)

	// ── 1. Patient identification (art. 6) ────────────────────────────────
	numberedHeader(doc, tr, "1. Identificación del paciente")
	rows := [][2]string{
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
	numberedHeader(doc, tr, "2. Profesional responsable")
	prof := [][2]string{
		{"Nombre completo", in.Professional.FullName},
		{"Tarjeta profesional", in.Professional.License},
		{"Especialidad", in.Professional.Specialty},
	}
	fieldGrid(doc, tr, prof)
	doc.Ln(2)

	// ── 3. Care data (art. 5: date and time of every entry) ───────────────
	numberedHeader(doc, tr, "3. Datos de la atención")
	care := [][2]string{
		{"Tipo de nota", in.RecordType},
		{"Fecha de la sesión", in.Record.SessionDate.Format("2006-01-02")},
		{"Registro creado", in.Record.CreatedAt.Format("2006-01-02 15:04")},
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
	doc.Ln(2)

	// ── 4. Clinical content ───────────────────────────────────────────────
	numberedHeader(doc, tr, "4. Contenido clínico")
	if in.Record.TemplateVersion >= 2 {
		renderSectionsV2(doc, tr, in.Record)
	} else {
		renderSOAPV1(doc, tr, in.Record)
	}

	// ── 5. Active diagnoses ───────────────────────────────────────────────
	if len(in.Diagnoses) > 0 {
		doc.Ln(1)
		numberedHeader(doc, tr, "5. Diagnósticos activos (CIE-10)")
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

	// ── 6. Electronic signature (Ley 527/1999) ────────────────────────────
	doc.Ln(3)
	numberedHeader(doc, tr, "6. Firma del profesional")

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

	// Signature line representation
	doc.Ln(8)
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
func fieldGrid(doc *fpdf.Fpdf, tr func(string) string, rows [][2]string) {
	const labelW, valueW = 38.0, 49.0
	col := 0
	for _, row := range rows {
		if strings.TrimSpace(row[1]) == "" {
			continue
		}
		doc.SetFont("Helvetica", "B", 8.5)
		doc.SetTextColor(100, 100, 100)
		doc.CellFormat(labelW, 5.2, tr(row[0]), "", 0, "L", false, 0, "")
		doc.SetFont("Helvetica", "", 9)
		doc.SetTextColor(0, 0, 0)
		if col == 0 {
			doc.CellFormat(valueW, 5.2, tr(row[1]), "", 0, "L", false, 0, "")
			col = 1
		} else {
			doc.CellFormat(valueW, 5.2, tr(row[1]), "", 1, "L", false, 0, "")
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

func renderSOAPV1(doc *fpdf.Fpdf, tr func(string) string, rec *clinicalrecords.ClinicalRecord) {
	sections := []struct{ title, content string }{
		{"Relato del paciente", rec.Subjective},
		{"Observación clínica", rec.Objective},
		{"Análisis", rec.Assessment},
		{"Plan", rec.Plan},
	}
	for _, sec := range sections {
		if strings.TrimSpace(sec.content) == "" {
			continue
		}
		writeSectionHeader(doc, tr, sec.title)
		doc.SetFont("Helvetica", "", 9.5)
		doc.MultiCell(0, 5, tr(sec.content), "1", "L", false)
		doc.Ln(2)
	}
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
		if sec.key == "mental_exam" {
			exam, ok := val.(map[string]any)
			if !ok {
				continue
			}
			content = formatMentalExam(exam)
		} else if s, ok := val.(string); ok {
			content = s
		} else {
			content = fmt.Sprintf("%v", val)
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

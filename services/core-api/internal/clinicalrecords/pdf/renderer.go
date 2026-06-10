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

type RenderInput struct {
	Record      *clinicalrecords.ClinicalRecord
	PatientName string // "PaternalLastName, FirstName"
	OrgName     string
	StaffName   string // responsible professional, not the exporter
	RecordType  string // Spanish label (e.g., "Evolución")
	Diagnoses   []DiagnosisLine
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
	"IDEATION": "Ideación",
	"PLAN":     "Plan estructurado",
	"ATTEMPT":  "Intento",
}

func Render(w io.Writer, in RenderInput) error {
	doc := fpdf.New("P", "mm", "A4", "")
	doc.SetMargins(20, 20, 20)
	doc.SetAutoPageBreak(true, 25)
	doc.AddPage()

	// Core fonts are cp1252 — every string must pass through the translator
	// or accented characters render as mojibake.
	tr := doc.UnicodeTranslatorFromDescriptor("")

	// Header: organization name
	doc.SetFont("Helvetica", "B", 14)
	doc.Cell(0, 10, tr(in.OrgName))
	doc.Ln(10)
	doc.SetLineWidth(0.5)
	doc.Line(20, doc.GetY(), 190, doc.GetY())
	doc.Ln(6)

	// Metadata
	meta := []struct{ label, value string }{
		{"Paciente:", in.PatientName},
		{"Profesional:", in.StaffName},
		{"Fecha de sesión:", in.Record.SessionDate.Format("2006-01-02")},
		{"Tipo de nota:", in.RecordType},
		{"Estado:", "Aprobado"},
	}
	for _, m := range meta {
		doc.SetFont("Helvetica", "B", 10)
		doc.Cell(40, 6, tr(m.label))
		doc.SetFont("Helvetica", "", 10)
		doc.Cell(0, 6, tr(m.value))
		doc.Ln(6)
	}

	// Risk level (only when present and not NONE)
	if in.Record.RiskLevel != nil && *in.Record.RiskLevel != "" && *in.Record.RiskLevel != "NONE" {
		label := riskLabels[*in.Record.RiskLevel]
		if label == "" {
			label = *in.Record.RiskLevel
		}
		doc.Ln(2)
		doc.SetFont("Helvetica", "B", 10)
		doc.SetTextColor(220, 38, 38)
		doc.Cell(0, 6, tr("Nivel de riesgo: "+label))
		doc.SetTextColor(0, 0, 0)
		doc.Ln(6)
	}

	doc.Ln(4)

	// Body
	if in.Record.TemplateVersion >= 2 {
		renderSectionsV2(doc, tr, in.Record)
	} else {
		renderSOAPV1(doc, tr, in.Record)
	}

	// Active diagnoses
	if len(in.Diagnoses) > 0 {
		writeSectionHeader(doc, tr, "Diagnósticos activos (CIE-10)")
		doc.SetFont("Helvetica", "", 10)
		var b strings.Builder
		for _, d := range in.Diagnoses {
			line := fmt.Sprintf("%s — %s", d.Code, d.Description)
			if d.Type == "PRINCIPAL" {
				line += " (principal)"
			}
			b.WriteString(line + "\n")
		}
		doc.MultiCell(0, 5, tr(strings.TrimSpace(b.String())), "1", "L", false)
		doc.Ln(2)
	}

	// Footer
	doc.Ln(6)
	doc.SetLineWidth(0.5)
	doc.Line(20, doc.GetY(), 190, doc.GetY())
	doc.Ln(4)
	doc.SetFont("Helvetica", "I", 8)
	doc.SetTextColor(100, 100, 100)
	footer := fmt.Sprintf(
		"Documento confidencial — historia clínica protegida por la Ley 1581/2012 y la Resolución 1995/1999. Generado el %s.",
		time.Now().Format("2006-01-02 15:04"))
	doc.MultiCell(0, 4, tr(footer), "", "C", false)
	doc.SetTextColor(0, 0, 0)

	return doc.Output(w)
}

func writeSectionHeader(doc *fpdf.Fpdf, tr func(string) string, title string) {
	doc.SetFont("Helvetica", "B", 11)
	doc.SetFillColor(240, 253, 250)
	doc.CellFormat(0, 7, tr(title), "B", 1, "", true, 0, "")
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
		doc.SetFont("Helvetica", "", 10)
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
		doc.SetFont("Helvetica", "", 10)
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

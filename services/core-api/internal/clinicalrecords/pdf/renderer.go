package pdf

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"

	"sghcp/core-api/internal/clinicalrecords"
)

type RenderInput struct {
	Record      *clinicalrecords.ClinicalRecord
	PatientName string // "PaternalLastName, FirstName"
	OrgName     string
	StaffName   string
	RecordType  string // Spanish label (e.g., "Nota de evolución")
}

type sectionDef struct {
	key   string
	title string
}

var templateSections = map[string][]sectionDef{
	"INITIAL": {
		{key: "chief_complaint", title: "Motivo de consulta"},
		{key: "history_present_illness", title: "Historia de enfermedad actual"},
		{key: "personal_history", title: "Antecedentes personales"},
		{key: "family_history", title: "Antecedentes familiares"},
		{key: "mental_exam", title: "Examen mental"},
		{key: "differential_diagnosis", title: "Diagnóstico diferencial"},
		{key: "assessment", title: "Evaluación"},
		{key: "treatment_plan", title: "Plan de tratamiento"},
		{key: "observations", title: "Observaciones"},
	},
	"EVOLUTION": {
		{key: "subjective", title: "Subjetivo"},
		{key: "objective", title: "Objetivo"},
		{key: "assessment", title: "Análisis"},
		{key: "plan", title: "Plan"},
		{key: "observations", title: "Observaciones"},
	},
	"DISCHARGE": {
		{key: "summary", title: "Resumen del tratamiento"},
		{key: "achievements", title: "Logros y cambios"},
		{key: "discharge_reason", title: "Motivo del egreso"},
		{key: "recommendations", title: "Recomendaciones"},
		{key: "follow_up", title: "Plan de seguimiento"},
	},
	"INTERCONSULTATION": {
		{key: "consultation_reason", title: "Motivo de la interconsulta"},
		{key: "relevant_findings", title: "Hallazgos relevantes"},
		{key: "assessment", title: "Evaluación"},
		{key: "recommendations", title: "Recomendaciones"},
	},
}

func Render(w io.Writer, in RenderInput) error {
	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(20, 20, 20)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "", 11)

	// Header: organization name
	pdf.SetFont("Helvetica", "B", 14)
	pdf.Cell(0, 10, in.OrgName)
	pdf.Ln(5)
	pdf.SetLineWidth(0.5)
	pdf.Line(20, pdf.GetY(), 190, pdf.GetY())
	pdf.Ln(8)

	// Metadata section
	pdf.SetFont("Helvetica", "", 10)
	meta := []struct {
		label string
		value string
	}{
		{"Paciente:", in.PatientName},
		{"Profesional:", in.StaffName},
		{"Fecha de sesión:", in.Record.SessionDate.Format("2006-01-02")},
		{"Tipo de nota:", in.RecordType},
		{"Estado:", "✓ Aprobado"},
	}

	for _, m := range meta {
		pdf.SetFont("Helvetica", "B", 10)
		pdf.Cell(50, 6, m.label)
		pdf.SetFont("Helvetica", "", 10)
		pdf.Cell(0, 6, m.value)
		pdf.Ln(6)
	}

	// Risk level (if not empty/NONE)
	if in.Record.RiskLevel != nil && *in.Record.RiskLevel != "" && *in.Record.RiskLevel != "NONE" {
		pdf.Ln(3)
		pdf.SetFont("Helvetica", "B", 10)
		pdf.SetTextColor(220, 38, 38) // red
		pdf.Cell(0, 6, fmt.Sprintf("⚠ Nivel de riesgo: %s", *in.Record.RiskLevel))
		pdf.SetTextColor(0, 0, 0)
		pdf.Ln(6)
	}

	pdf.Ln(5)

	// Body: SOAP or Sections
	pdf.SetFont("Helvetica", "", 10)

	if in.Record.TemplateVersion >= 2 {
		// v2: render sections from map
		if err := renderSectionsV2(pdf, in.Record); err != nil {
			return fmt.Errorf("render sections v2: %w", err)
		}
	} else {
		// v1: render fixed SOAP
		renderSOAPV1(pdf, in.Record)
	}

	// Footer: confidentiality notice + timestamp
	pdf.Ln(8)
	pdf.SetLineWidth(0.5)
	pdf.Line(20, pdf.GetY(), 190, pdf.GetY())
	pdf.Ln(4)

	pdf.SetFont("Helvetica", "I", 8)
	pdf.SetTextColor(100, 100, 100)
	now := time.Now()
	footer := fmt.Sprintf("Documento generado el %s — conforme Resolución 1995/1999 (Historia clínica: retención mínima 15 años)",
		now.Format("2006-01-02 15:04"))
	pdf.MultiCell(0, 4, footer, "", "C", false)

	pdf.SetTextColor(0, 0, 0)

	// Write to output
	return pdf.Output(w)
}

func renderSOAPV1(pdf *fpdf.Fpdf, rec *clinicalrecords.ClinicalRecord) {
	sections := []struct {
		title   string
		content string
	}{
		{"Subjetivo", rec.Subjective},
		{"Objetivo", rec.Objective},
		{"Análisis", rec.Assessment},
		{"Plan", rec.Plan},
	}

	for _, sec := range sections {
		if sec.content == "" {
			continue
		}
		pdf.SetFont("Helvetica", "B", 11)
		pdf.SetFillColor(240, 253, 250)
		pdf.CellFormat(0, 7, sec.title, "B", 1, "", true, 0, "")
		pdf.SetFont("Helvetica", "", 10)
		pdf.MultiCell(0, 5, sec.content, "1", "L", false)
		pdf.Ln(2)
	}
}

func renderSectionsV2(pdf *fpdf.Fpdf, rec *clinicalrecords.ClinicalRecord) error {
	if rec.Sections == nil || len(rec.Sections) == 0 {
		return nil
	}

	// Determine section order based on record type
	recordTypeStr := string(rec.RecordType)
	order := templateSections[recordTypeStr]
	if len(order) == 0 {
		order = templateSections["EVOLUTION"]
	}

	for _, sectionDef := range order {
		val, exists := rec.Sections[sectionDef.key]
		if !exists || val == nil {
			continue
		}

		content := ""
		switch v := val.(type) {
		case string:
			content = v
		case map[string]interface{}:
			// Flatten nested object (e.g., mental_exam)
			for k, innerVal := range v {
				if innerVal != nil {
					content += fmt.Sprintf("%s: %v\n", k, innerVal)
				}
			}
		default:
			content = fmt.Sprintf("%v", v)
		}

		if strings.TrimSpace(content) == "" {
			continue
		}

		// Section header
		pdf.SetFont("Helvetica", "B", 11)
		pdf.SetFillColor(240, 253, 250)
		pdf.CellFormat(0, 7, sectionDef.title, "B", 1, "", true, 0, "")

		// Section content
		pdf.SetFont("Helvetica", "", 10)
		pdf.MultiCell(0, 5, strings.TrimSpace(content), "1", "L", false)
		pdf.Ln(2)
	}

	return nil
}

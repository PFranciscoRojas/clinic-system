package handler

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/clinicalrecords/pdf"
	"sghcp/core-api/internal/diagnoses"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// Labels mirror RECORD_TYPE_LABELS in the frontend constants.
var recordTypeLabels = map[string]string{
	"INITIAL":           "Apertura",
	"EVOLUTION":         "Evolución",
	"DISCHARGE":         "Cierre",
	"INTERCONSULTATION": "Interconsulta",
}

// GET /api/v1/clinical-records/{id}/export
func (h *Handler) exportPDF(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := middleware.ClaimsFromContext(ctx)
	recordID := chi.URLParam(r, "id")

	rec, err := h.svc.Get(ctx, claims.OrganizationID, recordID)
	if err != nil {
		writeErr(w, err)
		return
	}

	if rec.Status != clinicalrecords.StatusApproved {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "only approved records can be exported")
		return
	}

	patient, err := h.patients.Get(ctx, claims.OrganizationID, rec.PatientID)
	if err != nil {
		writeErr(w, err)
		return
	}

	patientName := patient.PaternalLastName
	if patient.FirstName != "" {
		patientName += ", " + patient.FirstName
	}

	// The PDF must credit the responsible professional, not whoever exports.
	var staffName string
	if err := h.db.QueryRow(ctx,
		`SELECT display_name FROM users WHERE id = $1 AND organization_id = $2`,
		rec.ResponsibleStaffID, claims.OrganizationID,
	).Scan(&staffName); err != nil {
		staffName = "—"
	}

	var orgName string
	if err := h.db.QueryRow(ctx,
		`SELECT name FROM organizations WHERE id = $1`,
		claims.OrganizationID,
	).Scan(&orgName); err != nil {
		orgName = "—"
	}

	var diagLines []pdf.DiagnosisLine
	if all, err := h.diag.ListByPatient(ctx, claims.OrganizationID, rec.PatientID); err == nil {
		for _, d := range all {
			if d.Status != diagnoses.StatusActive {
				continue
			}
			diagLines = append(diagLines, pdf.DiagnosisLine{
				Code:        d.ICD10Code,
				Description: d.Description,
				Type:        string(d.DiagnosisType),
			})
		}
	}

	recordTypeLabel := recordTypeLabels[string(rec.RecordType)]
	if recordTypeLabel == "" {
		recordTypeLabel = "Registro clínico"
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="nota-%s.pdf"`, rec.SessionDate.Format("2006-01-02")))

	err = pdf.Render(w, pdf.RenderInput{
		Record:      rec,
		PatientName: patientName,
		OrgName:     orgName,
		StaffName:   staffName,
		RecordType:  recordTypeLabel,
		Diagnoses:   diagLines,
	})
	if err != nil {
		// Headers already sent — nothing useful to return to the client.
		return
	}

	h.audit.Record(r, "CLINICAL_RECORD_EXPORT", "clinical_record", recordID)
}

package handler

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords/pdf"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/clinical-records/{id}/export
func (h *Handler) exportPDF(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	rec, err := h.svc.Get(r.Context(), claims.OrganizationID, recordID)
	if err != nil {
		writeErr(w, err)
		return
	}

	if rec.Status != "APPROVED" {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "only approved records can be exported")
		return
	}

	patient, err := h.patients.Get(r.Context(), claims.OrganizationID, rec.PatientID)
	if err != nil {
		writeErr(w, err)
		return
	}

	// Format patient name as "PaternalLastName, FirstName"
	patientName := patient.PaternalLastName
	if patient.FirstName != "" {
		patientName += ", " + patient.FirstName
	}

	// Get staff display name
	staffName := ""
	if claims.DisplayName != nil {
		staffName = *claims.DisplayName
	}

	// Resolve organization name (from organization ID as fallback)
	orgName := "Organización"

	// Resolve record type label
	recordTypeLabel := "Registro clínico"
	recordTypeLabels := map[string]string{
		"INITIAL":           "Nota de historia inicial",
		"EVOLUTION":         "Nota de evolución",
		"DISCHARGE":         "Nota de egreso",
		"INTERCONSULTATION": "Interconsulta",
	}
	recTypeStr := string(rec.RecordType)
	if label, ok := recordTypeLabels[recTypeStr]; ok {
		recordTypeLabel = label
	}

	// Render PDF
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="nota-%s.pdf"`, rec.SessionDate.Format("2006-01-02")))

	err = pdf.Render(w, pdf.RenderInput{
		Record:      rec,
		PatientName: patientName,
		OrgName:     orgName,
		StaffName:   staffName,
		RecordType:  recordTypeLabel,
	})
	if err != nil {
		// Headers already sent — log and bail
		h.audit.Record(r, "CLINICAL_RECORD_EXPORT_ERROR", "clinical_record", recordID)
		return
	}

	h.audit.Record(r, "CLINICAL_RECORD_EXPORT", "clinical_record", recordID)
}

package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/clinical-records/{id}
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	rec, err := h.svc.Get(r.Context(), claims.OrganizationID, recordID)
	if err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "CLINICAL_RECORD_READ", "clinical_record", recordID)
	httputil.WriteJSON(w, http.StatusOK, toResponse(rec))
}

// GET /api/v1/patients/{patient_id}/records
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	metas, err := h.svc.List(r.Context(), clinicalrecords.ListFilter{
		OrganizationID: claims.OrganizationID,
		PatientID:      patientID,
		Limit:          limit,
		Offset:         offset,
	})
	if err != nil {
		writeErr(w, err)
		return
	}

	h.audit.Record(r, "CLINICAL_RECORD_LIST", "patient", patientID)
	items := make([]map[string]any, 0, len(metas))
	for _, m := range metas {
		items = append(items, toMetaResponse(m))
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func toResponse(r *clinicalrecords.ClinicalRecord) map[string]any {
	return map[string]any{
		"id":                     r.ID,
		"patient_id":             r.PatientID,
		"responsible_staff_id":   r.ResponsibleStaffID,
		"created_by":             r.CreatedBy,
		"appointment_id":         r.AppointmentID,
		"record_type":            r.RecordType,
		"session_date":           r.SessionDate.Format("2006-01-02"),
		"template_version":       r.TemplateVersion,
		"sections":               r.Sections,
		"risk_level":             r.RiskLevel,
		"discharge_reason":       r.DischargeReason,
		"status":                 r.Status,
		"approved_at":            r.ApprovedAt,
		"requires_cosign":        r.RequiresCosign,
		"supervisor_id":          r.SupervisorID,
		"supervisor_cosigned_at": r.SupervisorCosignedAt,
		"created_at":             r.CreatedAt,
		"updated_at":             r.UpdatedAt,
	}
}

func toMetaResponse(m *clinicalrecords.RecordMeta) map[string]any {
	return map[string]any{
		"id":                   m.ID,
		"patient_id":           m.PatientID,
		"responsible_staff_id": m.ResponsibleStaffID,
		"created_by":           m.CreatedBy,
		"appointment_id":       m.AppointmentID,
		"record_type":          m.RecordType,
		"session_date":         m.SessionDate.Format("2006-01-02"),
		"template_version":     m.TemplateVersion,
		"risk_level":           m.RiskLevel,
		"status":               m.Status,
		"requires_cosign":      m.RequiresCosign,
		"supervisor_id":        m.SupervisorID,
		"created_at":           m.CreatedAt,
	}
}

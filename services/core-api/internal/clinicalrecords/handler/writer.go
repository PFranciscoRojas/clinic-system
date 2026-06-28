package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// POST /api/v1/patients/{patient_id}/records
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	patientID := chi.URLParam(r, "patient_id")

	var body struct {
		ResponsibleStaffID string         `json:"responsible_staff_id"`
		AppointmentID      string         `json:"appointment_id"`
		RecordType         string         `json:"record_type"`
		SessionDate        string         `json:"session_date"` // "2006-01-02"
		// TemplateID is optional. When provided, sections are validated against
		// the custom template schema instead of the hardcoded integrated format.
		TemplateID      string         `json:"template_id"`
		Sections        map[string]any `json:"sections"`
		RiskLevel       string         `json:"risk_level"`
		DischargeReason string         `json:"discharge_reason"`
		SupervisorID    string         `json:"supervisor_id"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	sessionDate, err := time.Parse("2006-01-02", body.SessionDate)
	if err != nil {
		httputil.WriteError(w, http.StatusUnprocessableEntity, "session_date must be YYYY-MM-DD")
		return
	}

	responsibleID := body.ResponsibleStaffID
	if responsibleID == "" {
		responsibleID = claims.UserID
	}

	requiresCosign := false
	for _, role := range claims.Roles {
		if role == "INTERN" {
			requiresCosign = true
			break
		}
	}

	id, err := h.svc.Create(r.Context(), crrsvc.CreateInput{
		OrganizationID:     claims.OrganizationID,
		PatientID:          patientID,
		ResponsibleStaffID: responsibleID,
		CreatedBy:          claims.UserID,
		AppointmentID:      body.AppointmentID,
		RecordType:         clinicalrecords.RecordType(body.RecordType),
		SessionDate:        sessionDate,
		TemplateID:         body.TemplateID,
		Sections:           body.Sections,
		RiskLevel:          clinicalrecords.RiskLevel(body.RiskLevel),
		DischargeReason:    clinicalrecords.DischargeReason(body.DischargeReason),
		RequiresCosign:     requiresCosign,
		SupervisorID:       body.SupervisorID,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	h.audit.Record(r, "CLINICAL_RECORD_CREATE", "clinical_record", id)
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// PATCH /api/v1/clinical-records/{id}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	var body struct {
		Sections        map[string]any `json:"sections"`
		RiskLevel       string         `json:"risk_level"`
		DischargeReason string         `json:"discharge_reason"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if err := h.svc.Update(r.Context(), crrsvc.UpdateInput{
		ID:              recordID,
		OrganizationID:  claims.OrganizationID,
		Sections:        body.Sections,
		RiskLevel:       clinicalrecords.RiskLevel(body.RiskLevel),
		DischargeReason: clinicalrecords.DischargeReason(body.DischargeReason),
	}); err != nil {
		writeErr(w, err)
		return
	}
	h.audit.Record(r, "CLINICAL_RECORD_UPDATE", "clinical_record", recordID)
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/clinical-records/{id}/approve
func (h *Handler) approve(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	patientID, err := h.svc.Approve(r.Context(), claims.OrganizationID, recordID, claims.Roles)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.audit.Record(r, "CLINICAL_RECORD_APPROVE", "clinical_record", recordID)

	// Refresh the AI risk read now that the history includes this record. Best
	// effort: a failed enqueue must never block the approval. Runs on the
	// request's tenant-scoped connection, so it stays before the response.
	if h.risk != nil && patientID != "" {
		if _, err := h.risk.Request(r.Context(), claims.OrganizationID, patientID, "risk_detection"); err != nil {
			slog.WarnContext(r.Context(), "risk-detection enqueue failed", "patient_id", patientID, "err", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/clinical-records/{id}/cosign
func (h *Handler) cosign(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	recordID := chi.URLParam(r, "id")

	if err := h.svc.Cosign(r.Context(), claims.OrganizationID, recordID, claims.UserID); err != nil {
		writeErr(w, err)
		return
	}
	h.audit.Record(r, "CLINICAL_RECORD_COSIGN", "clinical_record", recordID)
	w.WriteHeader(http.StatusNoContent)
}

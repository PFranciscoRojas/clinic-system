package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// draftSOAP is the shape of the JSON stored in ai_drafts.draft_content_enc by the AI worker.
type draftSOAP struct {
	Subjective string `json:"subjective"`
	Objective  string `json:"objective"`
	Assessment string `json:"assessment"`
	Plan       string `json:"plan"`
}

// POST /api/v1/ai-drafts/{id}/approve
// Accepts the final (possibly edited) SOAP content, creates a clinical_record,
// and marks the draft as APPROVED.
func (h *Handler) approveDraft(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	draftID := chi.URLParam(r, "id")

	for _, role := range claims.Roles {
		if role == "INTERN" {
			httputil.WriteError(w, http.StatusForbidden, "interns cannot approve clinical records")
			return
		}
	}

	// Fetch and decrypt the draft to get patient_id and the original SOAP.
	draft, rawContent, err := h.svc.DecryptDraftContent(r.Context(), claims.OrganizationID, draftID)
	if err != nil {
		writeErr(w, err)
		return
	}

	// Start from the AI-generated SOAP; override with any edits from the body.
	soap := draftSOAP{}
	if rawContent != "" {
		_ = json.Unmarshal([]byte(rawContent), &soap)
	}

	var body struct {
		Subjective  string `json:"subjective"`
		Objective   string `json:"objective"`
		Assessment  string `json:"assessment"`
		Plan        string `json:"plan"`
		SessionDate string `json:"session_date"` // "2006-01-02"; defaults to today
		RecordType  string `json:"record_type"`  // defaults to EVOLUTION
		AppointmentID string `json:"appointment_id"`
	}
	// Body is optional — silently ignore decode errors.
	_ = httputil.DecodeJSON(r, &body)

	if body.Subjective != "" {
		soap.Subjective = body.Subjective
	}
	if body.Objective != "" {
		soap.Objective = body.Objective
	}
	if body.Assessment != "" {
		soap.Assessment = body.Assessment
	}
	if body.Plan != "" {
		soap.Plan = body.Plan
	}

	sessionDate := time.Now()
	if body.SessionDate != "" {
		if d, err := time.Parse("2006-01-02", body.SessionDate); err == nil {
			sessionDate = d
		}
	}

	recordType := clinicalrecords.RecordTypeEvolution
	if body.RecordType != "" {
		recordType = clinicalrecords.RecordType(body.RecordType)
	}

	appointmentID := body.AppointmentID
	if appointmentID == "" {
		appointmentID = draft.ClinicalRecordID // reuse existing link if present
	}

	recordID, err := h.crr.Create(r.Context(), crrsvc.CreateInput{
		OrganizationID:     claims.OrganizationID,
		PatientID:          draft.PatientID,
		ResponsibleStaffID: claims.UserID,
		CreatedBy:          claims.UserID,
		AppointmentID:      appointmentID,
		RecordType:         recordType,
		SessionDate:        sessionDate,
		Subjective:         soap.Subjective,
		Objective:          soap.Objective,
		Assessment:         soap.Assessment,
		Plan:               soap.Plan,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create clinical record")
		return
	}

	if err := h.svc.ResolveDraft(r.Context(), claims.OrganizationID, draftID, recordID, claims.UserID); err != nil {
		// Record was created; log but don't fail the request.
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"clinical_record_id": recordID, "warning": "draft status update failed"})
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"clinical_record_id": recordID})
}

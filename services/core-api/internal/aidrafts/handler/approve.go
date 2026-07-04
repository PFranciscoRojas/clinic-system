package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/clinicalrecords"
	crrsvc "sghcp/core-api/internal/clinicalrecords/service"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// draftContent is the shape stored in ai_drafts.draft_content_enc by the AI
// worker: the clinical-record sections for the session's record type. Values
// are strings for the integrated format but can be objects/arrays/numbers for
// custom-template widgets, so they must decode as `any`.
type draftContent struct {
	RecordType string         `json:"record_type"`
	Sections   map[string]any `json:"sections"`
}

// POST /api/v1/ai-drafts/{id}/link — mark the draft APPROVED and link it to an
// existing clinical record, WITHOUT creating a new one. Used by the comparison
// view, where the professional finalizes the manual record they were already
// filling (merging in the accepted AI text) and this only records that the
// draft was consumed by that record. The draft is org-scoped by ResolveDraft.
func (h *Handler) linkDraft(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	draftID := chi.URLParam(r, "id")

	var body struct {
		ClinicalRecordID string `json:"clinical_record_id"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil || body.ClinicalRecordID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "clinical_record_id is required")
		return
	}

	if err := h.svc.ResolveDraft(r.Context(), claims.OrganizationID, draftID, body.ClinicalRecordID, claims.UserID); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/ai-drafts/{id}/approve
// Accepts the final (possibly edited) sections, creates a clinical_record,
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

	// Fetch and decrypt the draft to get patient_id and the original content.
	draft, rawContent, err := h.svc.DecryptDraftContent(r.Context(), claims.OrganizationID, draftID)
	if err != nil {
		writeErr(w, err)
		return
	}

	stored := draftContent{}
	if rawContent != "" {
		_ = json.Unmarshal([]byte(rawContent), &stored)
	}

	var body struct {
		// Sections values are typed (objects, arrays, numbers) when a custom
		// template is in play — decoding them as strings would abort the whole
		// body decode and silently discard the professional's edits.
		Sections      map[string]any `json:"sections"`
		SessionDate   string         `json:"session_date"` // "2006-01-02"; defaults to today
		RecordType    string         `json:"record_type"`
		AppointmentID string         `json:"appointment_id"`
		RiskLevel     string         `json:"risk_level"`
		// TemplateID propagates the custom template used during recording so
		// the resulting clinical_record is validated and stored with it.
		TemplateID string `json:"template_id"`
	}
	// Body is optional — silently ignore decode errors.
	_ = httputil.DecodeJSON(r, &body)

	// Start from the AI-generated sections; the body's edits win wholesale.
	sections := stored.Sections
	if len(body.Sections) > 0 {
		sections = body.Sections
	}

	recordType := clinicalrecords.RecordTypeEvolution
	switch {
	case body.RecordType != "":
		recordType = clinicalrecords.RecordType(body.RecordType)
	case stored.RecordType != "":
		recordType = clinicalrecords.RecordType(stored.RecordType)
	}

	sessionDate := time.Now()
	if body.SessionDate != "" {
		if d, err := time.Parse("2006-01-02", body.SessionDate); err == nil {
			sessionDate = d
		}
	}

	appointmentID := body.AppointmentID
	if appointmentID == "" {
		appointmentID = draft.AppointmentID // reuse existing link if present
	}

	// The template the recording was initiated with wins when the client
	// doesn't (or can't) send it — otherwise a custom-format draft would be
	// validated and stored as if it were the integrated format.
	templateID := body.TemplateID
	if templateID == "" {
		templateID = draft.TemplateID
	}

	in := crrsvc.CreateInput{
		OrganizationID:     claims.OrganizationID,
		PatientID:          draft.PatientID,
		ResponsibleStaffID: claims.UserID,
		CreatedBy:          claims.UserID,
		AppointmentID:      appointmentID,
		RecordType:         recordType,
		SessionDate:        sessionDate,
		TemplateID:         templateID,
	}
	if body.RiskLevel != "" {
		in.RiskLevel = clinicalrecords.RiskLevel(body.RiskLevel)
	}

	if len(sections) > 0 {
		// Integrated format: drop keys outside the template-v2 whitelist so a
		// legacy draft (generated with an older AI schema) stays approvable —
		// ValidateTemplateV2 rejects the whole payload on any unknown key. The
		// original AI content remains readable on the immutable draft.
		var allowed map[string]bool
		if templateID == "" {
			allowed = clinicalrecords.AllowedSectionKeys(recordType)
		}
		in.Sections = make(map[string]any, len(sections))
		for k, v := range sections {
			if clinicalrecords.IsEmptySection(v) {
				continue
			}
			if allowed != nil && !allowed[k] {
				continue
			}
			in.Sections[k] = v
		}
	}

	recordID, err := h.crr.Create(r.Context(), in)
	if err != nil {
		switch {
		case errors.Is(err, clinicalrecords.ErrRiskRequired):
			httputil.WriteError(w, http.StatusUnprocessableEntity, "nivel de riesgo es obligatorio")
		case errors.Is(err, clinicalrecords.ErrMissingSection):
			httputil.WriteError(w, http.StatusUnprocessableEntity, "una sección requerida está vacía")
		case errors.Is(err, clinicalrecords.ErrNoOpenProcess):
			httputil.WriteError(w, http.StatusUnprocessableEntity, "el paciente no tiene proceso clínico abierto — crea primero un registro INICIAL")
		case errors.Is(err, clinicalrecords.ErrOpenProcessExists):
			httputil.WriteError(w, http.StatusUnprocessableEntity, "el paciente ya tiene un proceso clínico abierto")
		case errors.Is(err, clinicalrecords.ErrInvalidInput):
			httputil.WriteError(w, http.StatusBadRequest, "datos inválidos para el registro clínico")
		default:
			httputil.WriteError(w, http.StatusInternalServerError, "error al crear el registro clínico")
		}
		return
	}

	if err := h.svc.ResolveDraft(r.Context(), claims.OrganizationID, draftID, recordID, claims.UserID); err != nil {
		// Record was created; log but don't fail the request.
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"clinical_record_id": recordID, "warning": "draft status update failed"})
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"clinical_record_id": recordID})
}

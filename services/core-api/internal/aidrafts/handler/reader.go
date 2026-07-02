package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/ai-drafts?status=DRAFT_READY
func (h *Handler) listDrafts(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	status := r.URL.Query().Get("status")
	drafts, err := h.svc.ListDrafts(r.Context(), claims.OrganizationID, status)
	if err != nil {
		writeErr(w, err)
		return
	}

	type item struct {
		ID               string `json:"id"`
		Status           string `json:"status"`
		PatientID        string `json:"patient_id"`
		PatientCode      *int   `json:"patient_code"`
		ClinicalRecordID string `json:"clinical_record_id,omitempty"`
		CreatedAt        string `json:"created_at"`
	}
	items := make([]item, 0, len(drafts))
	for _, d := range drafts {
		items = append(items, item{
			ID:               d.ID,
			Status:           d.Status,
			PatientID:        d.PatientID,
			PatientCode:      d.PatientCode,
			ClinicalRecordID: d.ClinicalRecordID,
			CreatedAt:        d.CreatedAt.Format("2006-01-02T15:04:05Z"),
		})
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// GET /api/v1/ai-drafts/{id}
func (h *Handler) getDraft(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	draft, err := h.svc.GetDraft(r.Context(), claims.OrganizationID, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}

	// The reviewer needs the decrypted sections (and transcription) to edit
	// and approve. Content exists once the worker finished — show it for both
	// DRAFT_READY and APPROVED so an approved draft never falls back to a
	// legacy layout.
	var contentPlain map[string]any
	var transcription string
	if draft.Status == "DRAFT_READY" || draft.Status == "APPROVED" {
		_, content, trans, err := h.svc.DecryptForReview(r.Context(), claims.OrganizationID, draft.ID)
		if err != nil {
			writeErr(w, err)
			return
		}
		transcription = trans
		if content != "" {
			if err := json.Unmarshal([]byte(content), &contentPlain); err != nil {
				contentPlain = map[string]any{"subjective": content}
			}
		}
	}

	resp := map[string]any{
		"id":                  draft.ID,
		"organization_id":     draft.OrganizationID,
		"patient_id":          draft.PatientID,
		"status":              draft.Status,
		"ai_model_version":    draft.AIModelVersion,
		"whisper_model":       draft.WhisperModel,
		"draft_content_plain": contentPlain,
		"transcription":       transcription,
		"error_message":       draft.ErrorMessage,
		"processed_at":        draft.ProcessedAt,
		"resolved_at":         draft.ResolvedAt,
		"created_at":          draft.CreatedAt,
	}
	// Without template_id the review page cannot load the custom format the
	// draft was generated with and falls back to the integrated sections.
	if draft.TemplateID != "" {
		resp["template_id"] = draft.TemplateID
	}
	if draft.AppointmentID != "" {
		resp["appointment_id"] = draft.AppointmentID
	}
	httputil.WriteJSON(w, http.StatusOK, resp)
}

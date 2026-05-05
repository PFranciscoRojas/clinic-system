package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/ai-drafts/{id}
func (h *Handler) getDraft(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	draft, err := h.svc.GetDraft(r.Context(), claims.OrganizationID, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"id":               draft.ID,
		"organization_id":  draft.OrganizationID,
		"patient_id":       draft.PatientID,
		"status":           draft.Status,
		"ai_model_version": draft.AIModelVersion,
		"whisper_model":    draft.WhisperModel,
		"error_message":    draft.ErrorMessage,
		"processed_at":     draft.ProcessedAt,
		"resolved_at":      draft.ResolvedAt,
		"created_at":       draft.CreatedAt,
	})
}

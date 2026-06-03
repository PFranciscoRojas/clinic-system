package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// Routes returns the router for the standalone ai-drafts resource.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("ai_drafts:review")).Get("/{id}", h.getDraft)
	r.With(middleware.RequirePermission("clinical_records:approve")).Post("/{id}/approve", h.approveDraft)
	return r
}

// AppointmentAudioRoute returns the handler for POST /appointments/{appointment_id}/audio.
// Mounted as a sub-route on the appointments router.
func (h *Handler) AppointmentAudioRoute() http.Handler {
	return middleware.RequirePermission("ai_drafts:request")(http.HandlerFunc(h.uploadAudio))
}

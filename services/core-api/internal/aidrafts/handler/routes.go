package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// Routes returns the router for the standalone ai-drafts resource.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("ai_drafts:review")).Get("/", h.listDrafts)
	r.With(middleware.RequirePermission("ai_drafts:review")).Get("/feedback/stats", h.feedbackStats)
	r.With(middleware.RequirePermission("ai_drafts:review")).Get("/{id}", h.getDraft)
	r.With(middleware.RequirePermission("clinical_records:approve")).Post("/{id}/approve", h.approveDraft)
	r.With(middleware.RequirePermission("clinical_records:approve")).Post("/{id}/link", h.linkDraft)
	return r
}

// The concurrency limiter goes inside RequirePermission on both audio routes,
// never outside it. A request that is about to be refused for lack of permission
// must not first take a slot away from a professional who has one — otherwise
// anything holding a valid session could close the route to everyone by sending
// requests it is not allowed to make.

// AppointmentAudioRoute returns the handler for POST /appointments/{appointment_id}/audio.
// Mounted as a sub-route on the appointments router.
func (h *Handler) AppointmentAudioRoute() http.Handler {
	return middleware.RequirePermission("ai_drafts:request")(
		h.limitWholeUpload(http.HandlerFunc(h.uploadAudio)))
}

// AppointmentAudioPartRoute handles POST /appointments/{appointment_id}/audio/parts —
// one part of a session being uploaded while it is still being recorded.
func (h *Handler) AppointmentAudioPartRoute() http.Handler {
	return middleware.RequirePermission("ai_drafts:request")(
		h.limitPartUpload(http.HandlerFunc(h.uploadAudioPart)))
}

// AppointmentAudioCompleteRoute handles POST /appointments/{appointment_id}/audio/complete —
// assembles the parts into a take and enqueues the draft.
//
// Deliberately unlimited. This request carries a handful of form fields and no
// audio at all, so it costs the memory the budget in audio_limits.go exists to
// protect; and it is the one request on the critical path the professional is
// actually waiting on. Refusing it to save 64 KB would spend the whole point of
// the parts upload.
func (h *Handler) AppointmentAudioCompleteRoute() http.Handler {
	return middleware.RequirePermission("ai_drafts:request")(http.HandlerFunc(h.completeAudioUpload))
}

package handler

import (
	"github.com/go-chi/chi/v5"
)

// SpecialtyRoutes returns routes for /api/v1/specialties.
func (h *Handler) SpecialtyRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.listSpecialties)
	return r
}

// Routes returns routes for /api/v1/me/professional-profile.
// No extra permission required: the caller manages their own profile.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.getOwn)
	r.Put("/", h.upsertOwn)
	r.Put("/signature", h.putSignature)
	r.Delete("/signature", h.deleteSignature)
	r.Get("/schedule", h.getSchedule)
	r.Put("/schedule", h.putSchedule)
	return r
}

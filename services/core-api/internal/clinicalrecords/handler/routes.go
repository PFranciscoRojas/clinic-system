package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// PatientRoutes returns routes nested under /api/v1/patients/{patient_id}/records.
func (h *Handler) PatientRoutes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("clinical_records:create")).Post("/", h.create)
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/", h.list)
	return r
}

// Routes returns routes for /api/v1/clinical-records.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/", h.listByOrg)
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/{id}", h.get)
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/{id}/export", h.exportPDF)
	r.With(middleware.RequirePermission("clinical_records:read")).Get("/{id}/addenda", h.listAddenda)
	r.With(middleware.RequirePermission("clinical_records:update")).Post("/{id}/addenda", h.addAddendum)
	r.With(middleware.RequirePermission("clinical_records:update")).Patch("/{id}", h.update)
	r.With(middleware.RequirePermission("clinical_records:approve")).Post("/{id}/approve", h.approve)
	r.With(middleware.RequirePermission("clinical_records:cosign")).Post("/{id}/cosign", h.cosign)
	return r
}

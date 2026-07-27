package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// Routes returns the routes for /api/v1/audit-log.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("audit_log:read")).Get("/", h.list)
	return r
}

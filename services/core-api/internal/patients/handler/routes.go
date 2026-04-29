package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(middleware.RequirePermission("patients:create")).Post("/", h.create)
	r.With(middleware.RequirePermission("patients:read")).Get("/", h.search)
	r.With(middleware.RequirePermission("patients:read")).Get("/{id}", h.get)
	r.With(middleware.RequirePermission("patients:update")).Put("/{id}", h.update)
	r.With(middleware.RequirePermission("patients:delete")).Delete("/{id}", h.deactivate)

	return r
}

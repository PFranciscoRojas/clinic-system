package handler

import (
	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(middleware.RequirePermission("appointments:create")).Post("/", h.create)
	r.With(middleware.RequirePermission("appointments:read")).Get("/", h.list)
	r.With(middleware.RequirePermission("appointments:read")).Get("/{id}", h.get)
	r.With(middleware.RequirePermission("appointments:cancel")).Delete("/{id}", h.cancel)

	return r
}

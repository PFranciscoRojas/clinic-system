package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// Handler exposes admin-only maintenance endpoints. It is only mounted when
// the operator enables it (ALLOW_DATA_RESET), so in normal production the
// routes do not exist at all.
type Handler struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	// Permission gate is in addition to the env flag and the CLINIC_ADMIN
	// role check inside the handler — defence in depth for a destructive op.
	r.With(middleware.RequirePermission("organization:configure")).
		Post("/reset-clinical-data", h.resetClinicalData)
	return r
}

package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/middleware"
)

// Handler exposes operator endpoints: the SYSTEM_ADMIN billing console (always
// available) and the destructive data-reset route (only while the operator
// opts in via ALLOW_DATA_RESET).
type Handler struct {
	pool           *pgxpool.Pool
	allowDataReset bool
}

func New(pool *pgxpool.Pool, allowDataReset bool) *Handler {
	return &Handler{pool: pool, allowDataReset: allowDataReset}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// SaaS operator (SYSTEM_ADMIN) billing console — manual activation for
	// tenants who pay out-of-band (cash, Nequi, transfer).
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireRole("SYSTEM_ADMIN"))
		r.Get("/orgs", h.listOrgs)
		r.Post("/orgs/{id}/activate", h.activateOrg)
	})

	// Destructive per-org wipe — exists only during the testing phase.
	if h.allowDataReset {
		// Permission gate is in addition to the env flag and the CLINIC_ADMIN
		// role check inside the handler — defence in depth for a destructive op.
		r.With(middleware.RequirePermission("organization:configure")).
			Post("/reset-clinical-data", h.resetClinicalData)
	}

	return r
}

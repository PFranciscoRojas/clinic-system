package handler

import (
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/middleware"
)

// Handler exposes operator endpoints: the SYSTEM_ADMIN billing console (always
// available) and the destructive data-reset route (only while the operator
// opts in via ALLOW_DATA_RESET).
type Handler struct {
	pool           *pgxpool.Pool
	rdb            *redis.Client
	km             *crypto.KeyManager
	cfg            config.Config
	startedAt      time.Time
	allowDataReset bool
}

func New(pool *pgxpool.Pool, rdb *redis.Client, km *crypto.KeyManager, cfg config.Config, allowDataReset bool) *Handler {
	return &Handler{pool: pool, rdb: rdb, km: km, cfg: cfg, startedAt: time.Now(), allowDataReset: allowDataReset}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// SaaS operator (SYSTEM_ADMIN) billing console — manual activation for
	// tenants who pay out-of-band (cash, Nequi, transfer).
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireRole("SYSTEM_ADMIN"))
		r.Get("/orgs", h.listOrgs)
		r.Post("/orgs/{id}/activate", h.activateOrg)
		r.Post("/orgs/{id}/suspend", h.suspendOrg)
		r.Post("/orgs/{id}/cancel", h.cancelOrg)
		r.Post("/orgs/{id}/extend-trial", h.extendTrial)
		r.Get("/orgs/{id}/users", h.listOrgUsers)
		r.Delete("/orgs/{id}/users/{user_id}", h.removeOrgUser)
		r.Post("/orgs/{id}/users/{user_id}/reactivate", h.reactivateOrgUser)
		r.Get("/system/health", h.systemHealth)
		r.Post("/system/actions", h.systemAction)
		r.Get("/platform/mp", h.getPlatformMP)
		r.Put("/platform/mp", h.updatePlatformMP)
		r.Put("/platform/mp/tokens", h.updatePlatformTokens)
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

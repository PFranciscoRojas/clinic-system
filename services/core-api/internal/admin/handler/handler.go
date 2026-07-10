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

// Handler exposes operator endpoints: the SYSTEM_ADMIN billing console and
// the destructive data-reset route. The latter is scoped inside the handler
// to organizations.is_internal (the operator's own org + the CI-seeded demo
// org) — it can never touch a real paying tenant, regardless of env config.
type Handler struct {
	pool      *pgxpool.Pool
	rdb       *redis.Client
	km        *crypto.KeyManager
	cfg       config.Config
	startedAt time.Time
}

func New(pool *pgxpool.Pool, rdb *redis.Client, km *crypto.KeyManager, cfg config.Config) *Handler {
	return &Handler{pool: pool, rdb: rdb, km: km, cfg: cfg, startedAt: time.Now()}
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
		r.Patch("/orgs/{id}/test-flag", h.setOrgTestFlag)
		r.Delete("/orgs/{id}", h.deleteOrg)
		r.Get("/orgs/{id}/users", h.listOrgUsers)
		r.Delete("/orgs/{id}/users/{user_id}", h.removeOrgUser)
		r.Post("/orgs/{id}/users/{user_id}/reactivate", h.reactivateOrgUser)
		r.Get("/system/health", h.systemHealth)
		r.Get("/platform/mp", h.getPlatformMP)
		r.Put("/platform/mp", h.updatePlatformMP)
		r.Put("/platform/mp/tokens", h.updatePlatformTokens)
	})

	// Destructive per-org wipe. Always mounted; the handler itself rejects
	// any org that isn't flagged is_internal, so it can never reach real
	// tenant data — the permission gate and CLINIC_ADMIN role check below
	// are defence in depth on top of that.
	r.With(middleware.RequirePermission("organization:configure")).
		Post("/reset-clinical-data", h.resetClinicalData)

	return r
}

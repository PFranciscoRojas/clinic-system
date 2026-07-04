package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	authrepo "sghcp/core-api/internal/auth/repository"
	authsvc "sghcp/core-api/internal/auth/service"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	svc           svcPort
	dataResetOpen bool
}

func New(db *pgxpool.Pool, rdb *redis.Client, cfg config.Config) *Handler {
	repo := authrepo.New(db)
	return &Handler{svc: authsvc.New(repo, rdb, cfg), dataResetOpen: cfg.AllowDataReset}
}

// UserRoutes returns a chi.Router for /api/v1/users (team management).
// Mount this inside the tenant-scoped protected group in cmd/api/routes.go.
func (h *Handler) UserRoutes(jwtSecret []byte) chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(jwtSecret))
	r.With(middleware.RequirePermission("users:read")).Get("/", h.listUsers)
	// Scheduling read model — broader gate on purpose (see listProfessionals).
	r.With(middleware.RequirePermission("appointments:read")).Get("/professionals", h.listProfessionals)
	r.With(middleware.RequirePermission("users:update")).Patch("/{user_id}/role", h.changeUserRole)
	r.With(middleware.RequirePermission("users:deactivate")).Delete("/{user_id}", h.deactivateUser)
	r.With(middleware.RequirePermission("users:deactivate")).Post("/{user_id}/reactivate", h.reactivateUser)
	return r
}

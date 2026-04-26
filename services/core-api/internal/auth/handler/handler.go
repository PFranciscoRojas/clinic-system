package handler

import (
	"context"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	authrepo "sghcp/core-api/internal/auth/repository"
	authsvc "sghcp/core-api/internal/auth/service"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/middleware"
	"sghcp/core-api/internal/shared/token"
)

// svcPort is the contract the handler requires from the service layer — DIP.
type svcPort interface {
	Login(ctx context.Context, orgSlug, email, password, ip, userAgent string) (*token.Pair, error)
	Refresh(ctx context.Context, refreshToken string) (*token.Pair, error)
	Logout(ctx context.Context, refreshToken string) error
}

// compile-time guard: *authsvc.Service must satisfy svcPort.
var _ svcPort = (*authsvc.Service)(nil)

type Handler struct {
	svc svcPort
}

func New(db *pgxpool.Pool, rdb *redis.Client, cfg config.Config) *Handler {
	repo := authrepo.New(db)
	return &Handler{svc: authsvc.New(repo, rdb, cfg)}
}

func (h *Handler) Routes(jwtSecret []byte) chi.Router {
	r := chi.NewRouter()

	r.Post("/login", h.login)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout)

	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(jwtSecret))
		r.Get("/me", h.me)
	})

	return r
}

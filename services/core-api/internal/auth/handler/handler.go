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

// svcPort defines the subset of service methods the handler depends on.
// Keeps the handler testable without a real Redis or DB.
type svcPort interface {
	Login(ctx interface{ Done() <-chan struct{} }, orgSlug, email, password, ip, userAgent string) (interface{}, error)
	Refresh(ctx interface{ Done() <-chan struct{} }, refreshToken string) (interface{}, error)
	Logout(ctx interface{ Done() <-chan struct{} }, refreshToken string) error
}

type Handler struct {
	svc *authsvc.Service
}

func New(db *pgxpool.Pool, rdb *redis.Client, cfg config.Config) *Handler {
	repo := authrepo.New(db)
	svc := authsvc.New(repo, rdb, cfg)
	return &Handler{svc: svc}
}

func (h *Handler) Routes(jwtSecret []byte) chi.Router {
	r := chi.NewRouter()

	// Public — no JWT required
	r.Post("/login", h.login)
	r.Post("/refresh", h.refresh)
	r.Post("/logout", h.logout)

	// Protected — JWT required
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(jwtSecret))
		r.Get("/me", h.me)
	})

	return r
}

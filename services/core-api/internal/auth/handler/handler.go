package handler

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	authrepo "sghcp/core-api/internal/auth/repository"
	authsvc "sghcp/core-api/internal/auth/service"
	"sghcp/core-api/internal/shared/config"
)

type Handler struct {
	svc svcPort
}

func New(db *pgxpool.Pool, rdb *redis.Client, cfg config.Config) *Handler {
	repo := authrepo.New(db)
	return &Handler{svc: authsvc.New(repo, rdb, cfg)}
}

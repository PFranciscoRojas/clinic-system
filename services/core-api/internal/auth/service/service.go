package service

import (
	"time"

	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/config"
)

const (
	maxFailedAttempts  = 5
	lockoutDuration    = 15 * time.Minute
	refreshTokenPrefix = "refresh:"
)

type Service struct {
	repo       auth.Repository // domain interface — no pgx dependency here
	rdb        *redis.Client
	jwtSecret  []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func New(repo auth.Repository, rdb *redis.Client, cfg config.Config) *Service {
	return &Service{
		repo:       repo,
		rdb:        rdb,
		jwtSecret:  []byte(cfg.JWTSecret),
		accessTTL:  time.Duration(cfg.JWTAccessTTLMin) * time.Minute,
		refreshTTL: time.Duration(cfg.JWTRefreshTTLDays) * 24 * time.Hour,
	}
}

func ptr(s string) *string { return &s }

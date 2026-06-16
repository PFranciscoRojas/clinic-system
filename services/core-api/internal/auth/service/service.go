package service

import (
	"time"

	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/shared/config"
)

const (
	maxFailedAttempts  = 5
	lockoutDuration    = 15 * time.Minute
	refreshTokenPrefix = "refresh:"
	// pwEpochPrefix keys a per-user counter stamped into every refresh token.
	// Bumping it (on password reset/change) invalidates all outstanding refresh
	// tokens at once, without tracking each one individually.
	pwEpochPrefix = "pwepoch:"
)

type Service struct {
	repo       auth.Repository // domain interface — no pgx dependency here
	rdb        *redis.Client
	jwtSecret  []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
	notifier   notify.Notifier // sends the self-service password-reset email
	appBaseURL string          // public SPA origin, used to build the reset link
}

func New(repo auth.Repository, rdb *redis.Client, cfg config.Config) *Service {
	var notifier notify.Notifier = notify.NoopNotifier{}
	if cfg.ResendAPIKey != "" {
		// Auth only sends the product-branded password-reset email, so it needs
		// no tenant branding resolver.
		notifier = notify.NewResend(cfg.ResendAPIKey, cfg.ResendFrom, nil)
	}
	return &Service{
		repo:       repo,
		rdb:        rdb,
		jwtSecret:  []byte(cfg.JWTSecret),
		accessTTL:  time.Duration(cfg.JWTAccessTTLMin) * time.Minute,
		refreshTTL: time.Duration(cfg.JWTRefreshTTLDays) * 24 * time.Hour,
		notifier:   notifier,
		appBaseURL: cfg.AppBaseURL,
	}
}

func ptr(s string) *string { return &s }

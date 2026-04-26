package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/db"
	"sghcp/core-api/internal/shared/outbox"
)

// app holds every long-lived dependency of the process.
// Constructed once at startup, torn down on shutdown.
type app struct {
	cfg    config.Config
	pool   *pgxpool.Pool
	rdb    *redis.Client
	km     *crypto.KeyManager
	server *http.Server
}

// newApp wires all infrastructure dependencies and builds the HTTP server.
// Any error here is fatal — the process exits before accepting requests.
func newApp(cfg config.Config) (*app, error) {
	// Logger must be initialized first; everything below may emit log entries.
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	}))
	slog.SetDefault(logger)

	// Validate MASTER_KEY at startup rather than on the first encrypted request.
	// A malformed key would cause silent decryption failures on patient data —
	// far harder to diagnose than a clean crash on boot.
	km, err := crypto.NewKeyManager(cfg.MasterKey)
	if err != nil {
		return nil, fmt.Errorf("key manager: %w", err)
	}

	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}

	rdb, err := db.ConnectRedis(cfg.RedisAddr, cfg.RedisPassword)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("redis: %w", err)
	}

	a := &app{cfg: cfg, pool: pool, rdb: rdb, km: km}
	a.server = &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: a.buildRouter(),
		// Timeouts prevent slow clients from holding connections open indefinitely.
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return a, nil
}

// run starts background workers and the HTTP server, then blocks until ctx is cancelled.
// It returns only after a graceful shutdown completes (or times out).
func (a *app) run(ctx context.Context) error {
	defer a.pool.Close()
	defer a.rdb.Close()

	// The outbox publisher is a goroutine inside this process rather than a
	// separate container. It polls domain_events every 5 s and forwards them
	// to Redis Streams. Cancelling ctx first (before HTTP shutdown) ensures no
	// in-flight publish cycle is interrupted mid-transaction.
	pub := outbox.NewPublisher(a.pool, a.rdb, slog.Default())
	go pub.Run(ctx)

	// ListenAndServe blocks forever, so it runs in a goroutine.
	// We capture unexpected errors (anything other than ErrServerClosed,
	// which is the normal result of a graceful Shutdown call) in errCh.
	errCh := make(chan error, 1)
	go func() {
		slog.Info("core-api started", "addr", a.server.Addr, "env", a.cfg.Environment)
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// Block until either the server crashes or a shutdown signal arrives.
	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	}

	// Give in-flight requests up to 30 s to finish before forcefully closing connections.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	slog.Info("shutting down core-api")
	return a.server.Shutdown(shutdownCtx)
}

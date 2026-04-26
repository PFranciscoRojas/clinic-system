package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	authhandler "sghcp/core-api/internal/auth/handler"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/db"
	"sghcp/core-api/internal/shared/middleware"
	"sghcp/core-api/internal/shared/outbox"
)

func main() {
	cfg := config.Load()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	}))
	slog.SetDefault(logger)

	// Key manager: loads and validates MASTER_KEY from environment at startup.
	// Fails hard if the key is missing or malformed — better to crash here than
	// to serve requests that will silently fail to decrypt patient data.
	km, err := crypto.NewKeyManager(cfg.MasterKey)
	if err != nil {
		slog.Error("failed to initialize key manager", "err", err)
		os.Exit(1)
	}

	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	redisClient, err := db.ConnectRedis(cfg.RedisAddr, cfg.RedisPassword)
	if err != nil {
		slog.Error("failed to connect to redis", "err", err)
		os.Exit(1)
	}
	defer redisClient.Close()

	// Outbox publisher: goroutine that polls domain_events and publishes to Redis Streams.
	publisher := outbox.NewPublisher(pool, redisClient, logger)
	publisherCtx, cancelPublisher := context.WithCancel(context.Background())
	defer cancelPublisher()
	go publisher.Run(publisherCtx)

	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.StructuredLogger(logger))
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	})

	r.Mount("/api/v1/auth", authhandler.New(pool, redisClient, cfg).Routes([]byte(cfg.JWTSecret)))

	// Protected routes require a valid JWT. RBAC is enforced per-endpoint with middleware.RequirePermission.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth([]byte(cfg.JWTSecret)))
		// BC-3 patients, BC-4 appointments, BC-5 clinical routes mount here in subsequent phases.
	})

	_ = km // km is used by patient/clinical handlers in Fase 3 — suppress until wired

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("core-api started", "addr", srv.Addr, "env", cfg.Environment)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	slog.Info("shutting down core-api")
	cancelPublisher()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("core-api stopped")
}

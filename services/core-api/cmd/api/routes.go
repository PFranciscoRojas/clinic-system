package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	authhandler "sghcp/core-api/internal/auth/handler"
	"sghcp/core-api/internal/shared/middleware"
)

// buildRouter constructs the chi router with all middleware and route groups.
// Called once during app initialization — the result is assigned to http.Server.Handler.
func (a *app) buildRouter() http.Handler {
	r := chi.NewRouter()

	// ── Global middleware (runs on every request, in order) ───────────────────
	r.Use(chimiddleware.RequestID)                        // injects unique X-Request-ID
	r.Use(chimiddleware.RealIP)                           // reads real IP from X-Real-IP (set by Caddy)
	r.Use(middleware.StructuredLogger(slog.Default()))    // JSON log per request
	r.Use(chimiddleware.Recoverer)                        // turns panics into 500s — never crashes the process
	r.Use(chimiddleware.Timeout(30 * time.Second))        // aborts requests that exceed 30 s

	// ── Infrastructure ────────────────────────────────────────────────────────
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	})

	// ── Public routes — no JWT required ──────────────────────────────────────
	r.Mount("/api/v1/auth", authhandler.New(a.pool, a.rdb, a.cfg).Routes([]byte(a.cfg.JWTSecret)))

	// ── Protected routes — valid JWT required on every request ────────────────
	// RequireAuth validates the Bearer token and injects claims into context.
	// RequirePermission (per-endpoint) checks a specific permission code from those claims.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth([]byte(a.cfg.JWTSecret)))
		// Fase 3: patients, Fase 4: appointments + clinical records mount here.
	})

	return r
}

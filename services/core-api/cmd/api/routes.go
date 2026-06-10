package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	aidraftshandler "sghcp/core-api/internal/aidrafts/handler"
	apptshandler "sghcp/core-api/internal/appointments/handler"
	authhandler "sghcp/core-api/internal/auth/handler"
	bookingrequestshandler "sghcp/core-api/internal/bookingrequests/handler"
	crrhandler "sghcp/core-api/internal/clinicalrecords/handler"
	consentshandler "sghcp/core-api/internal/consents/handler"
	diagnoseshandler "sghcp/core-api/internal/diagnoses/handler"
	"sghcp/core-api/internal/notify"
	patientshandler "sghcp/core-api/internal/patients/handler"
	"sghcp/core-api/internal/shared/middleware"
	tphandler "sghcp/core-api/internal/treatmentplans/handler"
)

// buildRouter constructs the chi router with all middleware and route groups.
// Called once during app initialization — the result is assigned to http.Server.Handler.
func (a *app) buildRouter() http.Handler {
	r := chi.NewRouter()

	// ── CORS — must be first so preflight OPTIONS requests are handled before auth ──
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   a.cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// ── Global middleware (runs on every request, in order) ───────────────────
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.StructuredLogger(slog.Default()))
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	// ── Infrastructure ────────────────────────────────────────────────────────
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "ok")
	})

	// ── Public routes — no JWT required ──────────────────────────────────────
	// Per-IP rate limits: these endpoints are reachable without credentials,
	// so they are the abuse surface (credential stuffing, booking spam that
	// triggers outbound notification emails).
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(20, time.Minute))
		r.Mount("/api/v1/auth", authhandler.New(a.pool, a.rdb, a.cfg).Routes([]byte(a.cfg.JWTSecret)))
	})

	var notifier notify.Notifier = notify.NoopNotifier{}
	if a.cfg.ResendAPIKey != "" {
		notifier = notify.NewResend(a.cfg.ResendAPIKey, a.cfg.ResendFrom)
	}
	bookingH := bookingrequestshandler.New(a.pool, a.km, notifier)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(5, time.Minute))
		r.Mount("/api/v1/public/booking", bookingH.PublicRoutes())
	})

	consentsH := consentshandler.New(a.pool, a.km, notifier, a.cfg.AppBaseURL)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(10, time.Minute))
		r.Mount("/api/v1/public/consents", consentsH.PublicRoutes())
	})

	// ── Protected routes — valid JWT required on every request ────────────────
	// RequireAuth validates the Bearer token and injects claims into context.
	// RequirePermission (per-endpoint) checks a specific permission code from those claims.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth([]byte(a.cfg.JWTSecret)))

		r.Mount("/api/v1/patients", patientshandler.New(a.pool, a.km).Routes())
		r.Mount("/api/v1/appointments", apptshandler.New(a.pool).Routes())

		crr := crrhandler.New(a.pool, a.km)
		r.Mount("/api/v1/patients/{patient_id}/records", crr.PatientRoutes())
		r.Mount("/api/v1/clinical-records", crr.Routes())

		r.Mount("/api/v1/patients/{patient_id}/consents", consentsH.Routes())
		r.Mount("/api/v1/consents", consentsH.OrgRoutes())
		r.Mount("/api/v1/consent-templates", consentsH.TemplateRoutes())

		diag := diagnoseshandler.New(a.pool)
		r.Mount("/api/v1/icd10", diag.CatalogRoutes())
		r.Mount("/api/v1/patients/{patient_id}/diagnoses", diag.PatientRoutes())
		r.Mount("/api/v1/diagnoses", diag.Routes())

		tpH := tphandler.New(a.pool, a.km)
		r.Mount("/api/v1/patients/{patient_id}/treatment-plans", tpH.PatientRoutes())
		r.Mount("/api/v1/treatment-plans", tpH.Routes())

		aiDrafts := aidraftshandler.New(a.pool, a.km, a.rdb, a.cfg.AudioDir)
		r.Mount("/api/v1/ai-drafts", aiDrafts.Routes())
		r.Method(http.MethodPost, "/api/v1/appointments/{appointment_id}/audio", aiDrafts.AppointmentAudioRoute())

		r.Mount("/api/v1/booking-requests", bookingH.Routes())
	})

	return r
}

package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	adminhandler "sghcp/core-api/internal/admin/handler"
	aidraftshandler "sghcp/core-api/internal/aidrafts/handler"
	aisuggestionshandler "sghcp/core-api/internal/aisuggestions"
	apptshandler "sghcp/core-api/internal/appointments/handler"
	auditloghandler "sghcp/core-api/internal/auditlog/handler"
	authhandler "sghcp/core-api/internal/auth/handler"
	availabilityhandler "sghcp/core-api/internal/availability"
	billinghandler "sghcp/core-api/internal/billing/handler"
	bookinghandler "sghcp/core-api/internal/booking"
	crrhandler "sghcp/core-api/internal/clinicalrecords/handler"
	consentshandler "sghcp/core-api/internal/consents/handler"
	diagnoseshandler "sghcp/core-api/internal/diagnoses/handler"
	invoicinghandler "sghcp/core-api/internal/invoicing"
	leadbookinghandler "sghcp/core-api/internal/leadbooking"
	legalhandler "sghcp/core-api/internal/legal"
	"sghcp/core-api/internal/notifications"
	"sghcp/core-api/internal/notify"
	"sghcp/core-api/internal/orgs"
	patientshandler "sghcp/core-api/internal/patients/handler"
	profileshandler "sghcp/core-api/internal/profiles/handler"
	rthandler "sghcp/core-api/internal/recordtemplates/handler"
	rtrepo "sghcp/core-api/internal/recordtemplates/repository"
	"sghcp/core-api/internal/shared/audit"
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
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-Access-Reason"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// ── Global middleware (runs on every request, in order) ───────────────────
	r.Use(chimiddleware.RequestID)
	// Client IP resolution. Read it with httputil.ClientIP, never from a header.
	//
	// chimiddleware.RealIP used to be here and was withdrawn upstream as a
	// vulnerability (GO-2026-5777, GO-2026-5775): it overwrote RemoteAddr with
	// the LEFTMOST X-Forwarded-For entry, which is whatever the client typed.
	// Sending a different one per request gave every request its own
	// rate-limit bucket, and put a forged address into consent evidence.
	//
	// The order below matters. ClientIPFromRemoteAddr sets the TCP peer as the
	// baseline so there is always an IP; ClientIPFromXFF overwrites it with
	// the RIGHTMOST X-Forwarded-For entry — the one Caddy itself appended, the
	// only entry in the chain no client could have written.
	//
	// The no-argument form is correct for exactly one trusted hop, which is
	// what we have: Caddy is the only ingress and core-api is not published to
	// the host (see docker-compose.yml). If a CDN is ever put in front of
	// app.chapni.com — chapni.com is already on Cloudflare, this host is not —
	// the rightmost entry becomes the CDN edge instead of the visitor, and
	// this must become ClientIPFromXFF(<edge CIDRs…>). It fails safe either
	// way: it groups clients, it never trusts them.
	r.Use(chimiddleware.ClientIPFromRemoteAddr)
	r.Use(chimiddleware.ClientIPFromXFF())
	r.Use(middleware.StructuredLogger(slog.Default()))
	r.Use(chimiddleware.Recoverer)
	// 30 s request-context timeout for every route except the session-audio
	// upload, whose body alone can legitimately take minutes to arrive over a
	// slow clinic uplink (the handler bounds its own context instead).
	r.Use(exceptAudioUpload(chimiddleware.Timeout(30 * time.Second)))

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
		brandingResolver := orgs.New(a.pool).ResolveBranding
		notifier = notify.NewResend(a.cfg.ResendAPIKey, a.cfg.ResendFrom, brandingResolver)
	}
	availabilityH := availabilityhandler.NewHandler(a.pool)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(30, time.Minute))
		r.Mount("/api/v1/public/availability", availabilityH.PublicRoutes())
		r.Mount("/api/v1/public/org", availabilityH.InfoRoutes())
	})

	// Lead (sales) agenda — the superadmin's public "book a call" page (/agenda).
	// Global, non-tenant; the booked call lands on the superadmin's Google Calendar.
	leadBookingH := leadbookinghandler.NewHandler(
		leadbookinghandler.New(a.pool), a.gcal, notifier,
		a.cfg.LeadsCalendarUserID, a.cfg.SignupNotifyEmail)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(15, time.Minute))
		r.Mount("/api/v1/public/agenda", leadBookingH.PublicRoutes())
	})

	// In-app notification inbox (the topbar bell). Shared: background emitters
	// (booking, patients, AI drafts) write to it; the mounted routes read it.
	notif := notifications.New(a.pool)

	// Paid booking: checkout (rate-limited) + MercadoPago webhook.
	bookingPayH := bookinghandler.New(a.pool, a.km, notifier, a.wa, a.cfg, notif)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(15, time.Minute))
		r.Mount("/api/v1/public/pay", bookingPayH.PublicRoutes())
	})

	consentsH := consentshandler.New(a.pool, a.km, notifier, a.cfg.AppBaseURL)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RateLimit(10, time.Minute))
		r.Mount("/api/v1/public/consents", consentsH.PublicRoutes())
	})

	// Legal documents — public read, no auth required.
	legalH := legalhandler.New(a.pool)
	legalH.RegisterPublicRoutes(r)

	// MercadoPago webhook — public (the gateway calls it), no JWT.
	billingH := billinghandler.New(a.pool, a.km, a.cfg)
	r.Mount("/api/v1/public/billing", billingH.PublicRoutes())

	// Google Calendar OAuth callback — public (Google redirects here after consent).
	r.Mount("/api/v1/integrations/google", a.gcal.PublicRoutes())

	// ── Protected routes — valid JWT required on every request ────────────────
	// RequireAuth validates the Bearer token and injects claims into context.
	// RequirePermission (per-endpoint) checks a specific permission code from those claims.
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth([]byte(a.cfg.JWTSecret)))
		// Pin a connection with the org GUC set so RLS policies scope every query.
		r.Use(middleware.TenantScope(a.pool))
		// Block clinical access once the trial/subscription lapses (export and
		// the operator console stay open; SYSTEM_ADMIN is never gated).
		r.Use(middleware.SubscriptionGate(a.pool))
		// Leave a trail when a resource is refused (403, or the 404 RLS returns
		// for another tenant's row) — proving the denial is part of the
		// habeas-data story, and the API's answer alone leaves no record.
		r.Use(audit.New(a.pool).Denied())

		r.Mount("/api/v1/patients", patientshandler.New(a.pool, a.km, notif).Routes())
		r.Mount("/api/v1/notifications", notif.Routes())
		r.Mount("/api/v1/appointments", apptshandler.New(a.pool, a.gcal).Routes())

		// Shared so approving a clinical record can refresh the patient's AI
		// risk read through the same enqueue path the on-demand routes use.
		aiSugSvc := aisuggestionshandler.NewService(aisuggestionshandler.NewRepository(a.pool), a.km, a.rdb)

		crr := crrhandler.New(a.pool, a.km, aiSugSvc, rtrepo.New(a.pool))
		r.Mount("/api/v1/patients/{patient_id}/records", crr.PatientRoutes())
		r.Mount("/api/v1/clinical-records", crr.Routes())

		// The tenant's own read of the trail the system has always written.
		r.Mount("/api/v1/audit-log", auditloghandler.New(a.pool, a.km).Routes())

		// Clinical-record templates: professionals create/edit markdown-based formats.
		r.Mount("/api/v1/record-templates", rthandler.New(a.pool).Routes())

		r.Mount("/api/v1/patients/{patient_id}/consents", consentsH.Routes())
		r.Mount("/api/v1/consents", consentsH.OrgRoutes())
		r.Mount("/api/v1/consent-templates", consentsH.TemplateRoutes())

		r.Mount("/api/v1/org", orgs.NewHandler(orgs.New(a.pool), a.km).Routes())

		diag := diagnoseshandler.New(a.pool)
		r.Mount("/api/v1/icd10", diag.CatalogRoutes())
		r.Mount("/api/v1/patients/{patient_id}/diagnoses", diag.PatientRoutes())
		r.Mount("/api/v1/diagnoses", diag.Routes())

		tpH := tphandler.New(a.pool, a.km)
		r.Mount("/api/v1/patients/{patient_id}/treatment-plans", tpH.PatientRoutes())
		r.Mount("/api/v1/treatment-plans", tpH.Routes())

		profH := profileshandler.New(a.pool, a.km)
		r.Mount("/api/v1/specialties", profH.SpecialtyRoutes())
		r.Mount("/api/v1/me/professional-profile", profH.Routes())
		r.Mount("/api/v1/me/availability", availabilityH.PrivateRoutes())
		r.Mount("/api/v1/me/google", a.gcal.Routes())

		aiDrafts := aidraftshandler.New(a.pool, a.km, a.rdb, a.cfg.AudioDir)
		r.Mount("/api/v1/ai-drafts", aiDrafts.Routes())
		r.Method(http.MethodPost, "/api/v1/appointments/{appointment_id}/audio", aiDrafts.AppointmentAudioRoute())
		// Deliberately not in exceptAudioUpload's carve-out below: one part is a
		// few hundred kilobytes and belongs under the same timeouts as every
		// other route. Only the whole-session body needs the exemption.
		r.Method(http.MethodPost, "/api/v1/appointments/{appointment_id}/audio/parts", aiDrafts.AppointmentAudioPartRoute())
		r.Method(http.MethodPost, "/api/v1/appointments/{appointment_id}/audio/complete", aiDrafts.AppointmentAudioCompleteRoute())

		r.Mount("/api/v1/patients/{patient_id}/ai", aisuggestionshandler.NewWithService(aiSugSvc).PatientRoutes())

		// BC-6 internal billing — service-rate catalogue + patient invoices/payments.
		invoicingH := invoicinghandler.New(a.pool, a.km, notifier)
		r.Mount("/api/v1/service-rates", invoicingH.RateRoutes())
		r.Mount("/api/v1/invoices", invoicingH.InvoiceRoutes())

		// Subscription checkout — allowlisted in SubscriptionGate so a lapsed
		// tenant can still reach it to pay.
		r.Mount("/api/v1/billing", billingH.Routes())

		// Team management — list org users and assign roles (CLINIC_ADMIN only).
		r.Mount("/api/v1/users", authhandler.New(a.pool, a.rdb, a.cfg).UserRoutes([]byte(a.cfg.JWTSecret)))

		// Operator console: SYSTEM_ADMIN billing endpoints are always mounted;
		// the destructive data-reset route is always mounted too, but only ever
		// wipes organizations flagged is_internal (operator's own org + the
		// CI-seeded demo org) — enforced inside the handler, not by env flag.
		r.Mount("/api/v1/admin", adminhandler.New(a.pool, a.rdb, a.km, a.cfg).Routes())

		// Legal document CMS — SYSTEM_ADMIN write (public reads are above).
		legalH.RegisterAdminRoutes(r.With(middleware.RequireRole("SYSTEM_ADMIN")))

		// Lead agenda settings + booking list — operator console (SYSTEM_ADMIN).
		r.With(middleware.RequireRole("SYSTEM_ADMIN")).
			Mount("/api/v1/admin/lead-bookings", leadBookingH.AdminRoutes())
	})

	return r
}

// exceptAudioUpload applies mw to every request except the session-audio
// upload (POST /api/v1/appointments/{id}/audio), which is exempt because its
// multipart body can legitimately take minutes to transfer.
func exceptAudioUpload(mw func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		wrapped := mw(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p := r.URL.Path
			if r.Method == http.MethodPost &&
				strings.HasPrefix(p, "/api/v1/appointments/") && strings.HasSuffix(p, "/audio") {
				next.ServeHTTP(w, r)
				return
			}
			wrapped.ServeHTTP(w, r)
		})
	}
}

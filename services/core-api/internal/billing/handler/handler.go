// Package handler wires the MercadoPago subscription flow: a checkout endpoint
// that hands the owner a hosted subscription URL, and a webhook that activates
// the tenant once MercadoPago confirms the subscription/charge. Activation
// writes the same organizations columns the operator console sets by hand, so
// gating treats card and manual payments identically.
package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/billing/mercadopago"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/crypto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
	"sghcp/core-api/internal/shared/token"
)

type livePlatformCfg struct {
	accessToken string
	secret      string
	enforce     bool
	amount      int
	reason      string
}

type Handler struct {
	pool *pgxpool.Pool
	km   *crypto.KeyManager
	cfg  config.Config

	cfgMu   sync.Mutex
	cfgAt   time.Time
	cfgLive livePlatformCfg
}

func New(pool *pgxpool.Pool, km *crypto.KeyManager, cfg config.Config) *Handler {
	return &Handler{pool: pool, km: km, cfg: cfg}
}

// Routes are protected (the checkout needs the caller's org). The webhook is
// public and mounted separately (see PublicRoutes).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("organization:configure")).Post("/checkout", h.checkout)
	r.With(middleware.RequirePermission("organization:configure")).Post("/reconcile", h.reconcile)
	r.With(middleware.RequirePermission("organization:configure")).Get("/plan", h.plan)
	return r
}

func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/webhook", h.webhook)
	return r
}

// platformConfig returns the live platform MP config, reading from the
// platform_settings table with a 5-minute in-memory cache. Falls back to the
// values from config (env vars) when a key is not in the DB.
func (h *Handler) platformConfig(ctx context.Context) livePlatformCfg {
	h.cfgMu.Lock()
	defer h.cfgMu.Unlock()
	if time.Since(h.cfgAt) < 5*time.Minute {
		return h.cfgLive
	}

	rows, err := h.pool.Query(ctx,
		`SELECT key, value, value_enc, key_source FROM platform_settings
		 WHERE key = ANY($1)`,
		[]string{"mp_access_token", "mp_webhook_secret", "mp_plan_amount", "mp_plan_reason", "mp_webhook_enforce"},
	)

	live := livePlatformCfg{
		accessToken: h.cfg.MPAccessToken,
		secret:      h.cfg.MPWebhookSecret,
		enforce:     h.cfg.MPWebhookEnforce,
		amount:      h.cfg.MPPlanAmount,
		reason:      h.cfg.MPPlanReason,
	}

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key string
			var val *string
			var enc []byte
			var ks *string
			if err := rows.Scan(&key, &val, &enc, &ks); err != nil {
				continue
			}
			switch key {
			case "mp_access_token":
				if len(enc) > 0 && ks != nil {
					if plain, err := h.km.OpenSecret(*ks, enc); err == nil {
						live.accessToken = string(plain)
						crypto.Zeroize(plain)
					}
				}
			case "mp_webhook_secret":
				if len(enc) > 0 && ks != nil {
					if plain, err := h.km.OpenSecret(*ks, enc); err == nil {
						live.secret = string(plain)
						crypto.Zeroize(plain)
					}
				}
			case "mp_plan_amount":
				if val != nil {
					if n, err := strconv.Atoi(*val); err == nil {
						live.amount = n
					}
				}
			case "mp_plan_reason":
				if val != nil {
					live.reason = *val
				}
			case "mp_webhook_enforce":
				if val != nil {
					live.enforce = *val == "true"
				}
			}
		}
	}

	h.cfgLive = live
	h.cfgAt = time.Now()
	return live
}

// clinicalSeatsUsed counts the org's active clinical staff (PROFESSIONAL and
// INTERN) — the floor for how many seats a checkout must pay for.
func (h *Handler) clinicalSeatsUsed(ctx context.Context, orgID string) int {
	var used int
	_ = h.pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT u.id)
		FROM   users u
		JOIN   user_roles ur ON ur.user_id = u.id AND ur.organization_id = $1
		JOIN   roles ro      ON ro.id = ur.role_id AND ro.name IN ('PROFESSIONAL', 'INTERN')
		WHERE  u.organization_id = $1 AND u.is_active
	`, orgID).Scan(&used)
	return used
}

// annualPrefix marks the external_reference of a one-time annual-prepay
// Checkout Pro payment, so the webhook and reconcile() can tell it apart from
// a monthly preapproval's recurring charge (both arrive as "payment" events).
const annualPrefix = "annual:"

// annualMonthsCharged is how many months are billed upfront for a 12-month
// prepay — the other 2 are the discount ("2 meses gratis").
const annualMonthsCharged = 10

// POST /api/v1/billing/checkout — create a per-org subscription plan and return
// its hosted checkout URL. Allowed even when the trial has lapsed (the gate
// whitelists /api/v1/billing) so a blocked tenant can still subscribe.
// The monthly amount is per clinical seat: the org chooses how many seats to
// pay for (never fewer than its current active clinical headcount), and the
// chosen count is stored in pending_seats until MercadoPago confirms.
// period "annual" bills 10 months upfront as a one-time Checkout Pro payment
// (2 months free, and unlike the card-only monthly preapproval it accepts
// PSE/Efecty/Nequi too); anything else defaults to the monthly card plan.
func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	pcfg := h.platformConfig(r.Context())
	mp := mercadopago.New(pcfg.accessToken)
	if !mp.Enabled() {
		httputil.WriteError(w, http.StatusServiceUnavailable, "el pago en línea no está disponible todavía")
		return
	}
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		Seats  int    `json:"seats"`
		Period string `json:"period"` // "monthly" (default) | "annual"
	}
	_ = httputil.DecodeJSON(r, &body) // body is optional; default = current headcount, monthly

	seats := body.Seats
	if used := h.clinicalSeatsUsed(r.Context(), claims.OrganizationID); seats < used {
		seats = used
	}
	if seats < 1 {
		seats = 1
	}
	if seats > 100 {
		seats = 100
	}

	var orgName string
	_ = h.pool.QueryRow(r.Context(), `SELECT name FROM organizations WHERE id = $1`, claims.OrganizationID).Scan(&orgName)
	reason := pcfg.reason
	if seats > 1 {
		reason += " × " + strconv.Itoa(seats) + " profesionales"
	}
	if orgName != "" {
		reason += " · " + orgName
	}

	if body.Period == "annual" {
		reason += " · anual (12 meses, pago único)"
		email, first, last := payerInfo(claims)
		prefID, initPoint, err := mp.CreatePreference(
			r.Context(), reason, pcfg.amount*seats*annualMonthsCharged,
			annualPrefix+claims.OrganizationID, email, first, last,
			h.cfg.AppBaseURL+"/billing/return",
			h.cfg.AppBaseURL+"/api/v1/public/billing/webhook",
			true, // allowDeferred: no slot to hold, so PSE/Efecty/Nequi are fine
		)
		if err != nil {
			slog.Error("billing.checkout.annual", "err", err)
			httputil.WriteError(w, http.StatusBadGateway, "no se pudo iniciar el pago")
			return
		}
		_, _ = h.pool.Exec(r.Context(),
			`UPDATE organizations SET provider_customer_id = $2, pending_seats = $3, updated_at = NOW() WHERE id = $1`,
			claims.OrganizationID, annualPrefix+prefID, seats)
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"init_point": initPoint})
		return
	}

	planID, initPoint, err := mp.CreatePlan(
		r.Context(), claims.OrganizationID, reason, pcfg.amount*seats,
		h.cfg.AppBaseURL+"/billing/return",
		h.cfg.AppBaseURL+"/api/v1/public/billing/webhook",
	)
	if err != nil {
		slog.Error("billing.checkout", "err", err)
		httputil.WriteError(w, http.StatusBadGateway, "no se pudo iniciar el pago")
		return
	}

	// Remember the plan we sent them to (handy for support/reconciliation) and
	// the seats it was priced for.
	_, _ = h.pool.Exec(r.Context(),
		`UPDATE organizations SET provider_customer_id = $2, pending_seats = $3, updated_at = NOW() WHERE id = $1`,
		claims.OrganizationID, planID, seats)

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"init_point": initPoint})
}

// payerInfo pulls the email/first/last name Checkout Pro wants for the payer
// straight from the JWT — no extra DB round-trip.
func payerInfo(claims *token.Claims) (email, first, last string) {
	email = claims.Email
	if claims.DisplayName != nil {
		full := strings.TrimSpace(*claims.DisplayName)
		if i := strings.LastIndex(full, " "); i >= 0 {
			first, last = strings.TrimSpace(full[:i]), strings.TrimSpace(full[i+1:])
		} else {
			first = full
		}
	}
	return email, first, last
}

// GET /api/v1/billing/plan — seats and per-seat price for the billing UI.
func (h *Handler) plan(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	pcfg := h.platformConfig(r.Context())

	var status string
	var seatLimit int
	if err := h.pool.QueryRow(r.Context(),
		`SELECT subscription_status, seat_limit FROM organizations WHERE id = $1`,
		claims.OrganizationID).Scan(&status, &seatLimit); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "organización no encontrada")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"subscription_status":    status,
		"seat_limit":             seatLimit,
		"seats_used":             h.clinicalSeatsUsed(r.Context(), claims.OrganizationID),
		"per_seat_amount":        pcfg.amount,
		"per_seat_annual_amount": pcfg.amount * annualMonthsCharged, // 12 months, 2 free
		"currency":               "COP",
	})
}

// POST /api/v1/billing/webhook — MercadoPago notifications. We never trust the
// body: we take only the resource id, fetch it from MercadoPago with our token,
// and act on what the API returns. Always answer 200 so MercadoPago stops
// retrying once we've received it.
func (h *Handler) webhook(w http.ResponseWriter, r *http.Request) {
	defer w.WriteHeader(http.StatusOK)
	pcfg := h.platformConfig(r.Context())
	mp := mercadopago.New(pcfg.accessToken)
	if !mp.Enabled() {
		return
	}
	if ok, detail := mercadopago.VerifyWebhook(pcfg.secret,
		r.Header.Get("x-signature"), r.Header.Get("x-request-id"), r.URL.Query().Get("data.id")); !ok {
		slog.Warn("billing.webhook: signature check failed", "detail", detail, "enforce", pcfg.enforce)
		if pcfg.enforce {
			return
		}
	}

	kind, id := notification(r)
	if id == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	switch {
	case strings.Contains(kind, "payment"):
		// Either a recurring monthly charge (external_reference = org id) or a
		// one-time annual prepay (external_reference = "annual:<org id>").
		pay, err := mp.GetPayment(ctx, id)
		if err != nil || pay.ExternalReference == "" || pay.Status != "approved" {
			return
		}
		paymentID := strconv.FormatInt(pay.ID, 10)
		if orgID, ok := strings.CutPrefix(pay.ExternalReference, annualPrefix); ok {
			h.extendAnnual(ctx, orgID, paymentID)
		} else {
			h.extend(ctx, pay.ExternalReference, 1, paymentID)
		}
	default:
		// The subscription itself (created/authorized/paused/cancelled).
		pre, err := mp.GetPreapproval(ctx, id)
		if err != nil || pre.ExternalReference == "" {
			return
		}
		h.applyPreapproval(ctx, pre)
	}
}

// POST /api/v1/billing/reconcile — called by the frontend after returning from
// the MercadoPago checkout (back_url). Looks up the preapproval tied to the
// org's plan, applies its status, and patches the notification_url so future
// webhook events reach us. This is a safety net for when the webhook is delayed
// or the notification_url was not propagated by the preapproval_plan API.
func (h *Handler) reconcile(w http.ResponseWriter, r *http.Request) {
	pcfg := h.platformConfig(r.Context())
	mp := mercadopago.New(pcfg.accessToken)
	if !mp.Enabled() {
		httputil.WriteError(w, http.StatusServiceUnavailable, "pagos no disponibles")
		return
	}
	claims := middleware.ClaimsFromContext(r.Context())

	var planID string
	_ = h.pool.QueryRow(r.Context(),
		`SELECT provider_customer_id FROM organizations WHERE id = $1`,
		claims.OrganizationID).Scan(&planID)
	if planID == "" {
		httputil.WriteError(w, http.StatusNotFound, "no hay suscripción registrada")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Annual prepay is a one-time Checkout Pro payment, not a preapproval — look
	// it up by external_reference instead of walking the preapproval flow below.
	if strings.HasPrefix(planID, annualPrefix) {
		pay, err := mp.SearchPayment(ctx, annualPrefix+claims.OrganizationID)
		if err != nil {
			slog.Warn("billing.reconcile: annual payment not found", "org", claims.OrganizationID, "err", err)
			httputil.WriteError(w, http.StatusNotFound, "pago no encontrado en MercadoPago")
			return
		}
		if pay.Status == "approved" {
			h.extendAnnual(ctx, claims.OrganizationID, strconv.FormatInt(pay.ID, 10))
		}
		var status string
		_ = h.pool.QueryRow(r.Context(),
			`SELECT subscription_status FROM organizations WHERE id = $1`,
			claims.OrganizationID).Scan(&status)
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"subscription_status": status})
		return
	}

	pre, err := mp.FindPreapprovalByPlan(ctx, planID)
	if err != nil {
		slog.Warn("billing.reconcile: preapproval not found", "plan_id", planID, "err", err)
		httputil.WriteError(w, http.StatusNotFound, "suscripción no encontrada en MercadoPago")
		return
	}

	h.applyPreapproval(ctx, pre)

	// Always patch notification_url so that future status changes (authorized,
	// renewal, cancellation) reach the webhook — even if the current status is
	// still pending (e.g. user returned before completing payment).
	notifURL := h.cfg.AppBaseURL + "/api/v1/public/billing/webhook"
	if err := mp.PatchPreapprovalNotificationURL(ctx, pre.ID, notifURL); err != nil {
		slog.Warn("billing.reconcile: could not patch notification_url", "err", err)
	}

	var status string
	_ = h.pool.QueryRow(r.Context(),
		`SELECT subscription_status FROM organizations WHERE id = $1`,
		claims.OrganizationID).Scan(&status)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"subscription_status": status})
}

// applyPreapproval maps a subscription's status onto the org's billing columns.
func (h *Handler) applyPreapproval(ctx context.Context, pre *mercadopago.Preapproval) {
	switch pre.Status {
	case "authorized":
		until := time.Now().AddDate(0, 1, 0)
		if t, err := time.Parse(time.RFC3339, pre.NextPaymentDate); err == nil {
			until = t
		}
		// Promote the seats the checkout was priced for into the paid limit.
		_, _ = h.pool.Exec(ctx, `
			UPDATE organizations
			SET subscription_status = 'active', current_period_end = $2,
			    seat_limit = GREATEST(COALESCE(pending_seats, seat_limit), 1),
			    pending_seats = NULL, updated_at = NOW()
			WHERE id = $1`, pre.ExternalReference, until)
	case "cancelled":
		_, _ = h.pool.Exec(ctx, `
			UPDATE organizations SET subscription_status = 'canceled', updated_at = NOW() WHERE id = $1`,
			pre.ExternalReference)
	case "paused":
		_, _ = h.pool.Exec(ctx, `
			UPDATE organizations SET subscription_status = 'past_due', updated_at = NOW() WHERE id = $1`,
			pre.ExternalReference)
	}
}

// extend pushes the paid period `months` past the later of now or the current
// end — the recurring-charge counterpart of a manual activation. Guarded by
// paymentID so a duplicate webhook delivery for the same MercadoPago payment
// can't double-extend the period.
func (h *Handler) extend(ctx context.Context, orgID string, months int, paymentID string) {
	_, _ = h.pool.Exec(ctx, `
		UPDATE organizations
		SET subscription_status = 'active',
		    current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + make_interval(months => $3),
		    last_billing_payment_id = $2,
		    updated_at = NOW()
		WHERE id = $1 AND last_billing_payment_id IS DISTINCT FROM $2`, orgID, paymentID, months)
}

// extendAnnual activates or renews a 12-month prepaid period from a one-time
// Checkout Pro payment — the annual-prepay counterpart of applyPreapproval's
// "authorized" case, since a one-time payment never fires that preapproval
// event. Also promotes pending_seats into seat_limit (the first annual
// checkout is this plan's only activation signal) and is guarded by
// paymentID the same way extend() is.
func (h *Handler) extendAnnual(ctx context.Context, orgID, paymentID string) {
	_, _ = h.pool.Exec(ctx, `
		UPDATE organizations
		SET subscription_status = 'active',
		    current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + INTERVAL '12 months',
		    seat_limit = GREATEST(COALESCE(pending_seats, seat_limit), 1),
		    pending_seats = NULL,
		    last_billing_payment_id = $2,
		    updated_at = NOW()
		WHERE id = $1 AND last_billing_payment_id IS DISTINCT FROM $2`, orgID, paymentID)
}

// notification extracts the resource kind and id from a MercadoPago webhook,
// which may arrive as query parameters or as a JSON body.
func notification(r *http.Request) (kind, id string) {
	q := r.URL.Query()
	kind = q.Get("type")
	if kind == "" {
		kind = q.Get("topic")
	}
	id = q.Get("data.id")
	if id == "" {
		id = q.Get("id")
	}

	var body struct {
		Type   string `json:"type"`
		Topic  string `json:"topic"`
		Action string `json:"action"`
		Data   struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
		if kind == "" {
			kind = body.Type
		}
		if kind == "" {
			kind = body.Topic
		}
		if kind == "" {
			kind = body.Action
		}
		if id == "" {
			id = body.Data.ID
		}
	}
	return strings.ToLower(kind), id
}

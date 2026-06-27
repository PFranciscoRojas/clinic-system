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

// POST /api/v1/billing/checkout — create a per-org subscription plan and return
// its hosted checkout URL. Allowed even when the trial has lapsed (the gate
// whitelists /api/v1/billing) so a blocked tenant can still subscribe.
func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	pcfg := h.platformConfig(r.Context())
	mp := mercadopago.New(pcfg.accessToken)
	if !mp.Enabled() {
		httputil.WriteError(w, http.StatusServiceUnavailable, "el pago en línea no está disponible todavía")
		return
	}
	claims := middleware.ClaimsFromContext(r.Context())

	var orgName string
	_ = h.pool.QueryRow(r.Context(), `SELECT name FROM organizations WHERE id = $1`, claims.OrganizationID).Scan(&orgName)
	reason := pcfg.reason
	if orgName != "" {
		reason = pcfg.reason + " · " + orgName
	}

	planID, initPoint, err := mp.CreatePlan(
		r.Context(), claims.OrganizationID, reason, pcfg.amount,
		h.cfg.AppBaseURL+"/billing/return",
		h.cfg.AppBaseURL+"/api/v1/public/billing/webhook",
	)
	if err != nil {
		slog.Error("billing.checkout", "err", err)
		httputil.WriteError(w, http.StatusBadGateway, "no se pudo iniciar el pago")
		return
	}

	// Remember the plan we sent them to (handy for support/reconciliation).
	_, _ = h.pool.Exec(r.Context(),
		`UPDATE organizations SET provider_customer_id = $2, updated_at = NOW() WHERE id = $1`,
		claims.OrganizationID, planID)

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"init_point": initPoint})
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
		// A recurring charge: approved → extend the tenant another month.
		pay, err := mp.GetPayment(ctx, id)
		if err != nil || pay.ExternalReference == "" {
			return
		}
		if pay.Status == "approved" {
			h.extend(ctx, pay.ExternalReference)
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
		_, _ = h.pool.Exec(ctx, `
			UPDATE organizations
			SET subscription_status = 'active', current_period_end = $2, updated_at = NOW()
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

// extend pushes the paid period one month past the later of now or the current
// end — the recurring-charge counterpart of a manual activation.
func (h *Handler) extend(ctx context.Context, orgID string) {
	_, _ = h.pool.Exec(ctx, `
		UPDATE organizations
		SET subscription_status = 'active',
		    current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + make_interval(months => 1),
		    updated_at = NOW()
		WHERE id = $1`, orgID)
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

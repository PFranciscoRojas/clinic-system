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
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sghcp/core-api/internal/billing/mercadopago"
	"sghcp/core-api/internal/shared/config"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

type Handler struct {
	pool *pgxpool.Pool
	mp   *mercadopago.Client
	cfg  config.Config
}

func New(pool *pgxpool.Pool, cfg config.Config) *Handler {
	return &Handler{pool: pool, mp: mercadopago.New(cfg.MPAccessToken), cfg: cfg}
}

// Routes are protected (the checkout needs the caller's org). The webhook is
// public and mounted separately (see PublicRoutes).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.With(middleware.RequirePermission("organization:configure")).Post("/checkout", h.checkout)
	return r
}

func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Post("/webhook", h.webhook)
	return r
}

// POST /api/v1/billing/checkout — create a per-org subscription plan and return
// its hosted checkout URL. Allowed even when the trial has lapsed (the gate
// whitelists /api/v1/billing) so a blocked tenant can still subscribe.
func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	if !h.mp.Enabled() {
		httputil.WriteError(w, http.StatusServiceUnavailable, "el pago en línea no está disponible todavía")
		return
	}
	claims := middleware.ClaimsFromContext(r.Context())

	var orgName string
	_ = h.pool.QueryRow(r.Context(), `SELECT name FROM organizations WHERE id = $1`, claims.OrganizationID).Scan(&orgName)
	reason := h.cfg.MPPlanReason
	if orgName != "" {
		reason = h.cfg.MPPlanReason + " · " + orgName
	}

	planID, initPoint, err := h.mp.CreatePlan(
		r.Context(), claims.OrganizationID, reason, h.cfg.MPPlanAmount,
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
	if !h.mp.Enabled() {
		return
	}
	if !mercadopago.VerifyWebhook(h.cfg.MPWebhookSecret,
		r.Header.Get("x-signature"), r.Header.Get("x-request-id"), r.URL.Query().Get("data.id")) {
		slog.Warn("billing.webhook: invalid signature")
		return
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
		pay, err := h.mp.GetPayment(ctx, id)
		if err != nil || pay.ExternalReference == "" {
			return
		}
		if pay.Status == "approved" {
			h.extend(ctx, pay.ExternalReference)
		}
	default:
		// The subscription itself (created/authorized/paused/cancelled).
		pre, err := h.mp.GetPreapproval(ctx, id)
		if err != nil || pre.ExternalReference == "" {
			return
		}
		h.applyPreapproval(ctx, pre)
	}
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

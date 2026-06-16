package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"sghcp/core-api/internal/shared/httputil"
)

type orgRow struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	SubscriptionStatus string     `json:"subscription_status"`
	TrialEndsAt        *time.Time `json:"trial_ends_at"`
	CurrentPeriodEnd   *time.Time `json:"current_period_end"`
	CreatedAt          time.Time  `json:"created_at"`
}

// GET /api/v1/admin/orgs — SYSTEM_ADMIN: every tenant with its billing state,
// so the operator can see who to activate.
func (h *Handler) listOrgs(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(), `
		SELECT id, name, slug, subscription_status, trial_ends_at, current_period_end, created_at
		FROM organizations
		ORDER BY created_at DESC
	`)
	if err != nil {
		slog.Error("admin.list-orgs", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not list organizations")
		return
	}
	defer rows.Close()

	orgs := []orgRow{}
	for rows.Next() {
		var o orgRow
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.SubscriptionStatus, &o.TrialEndsAt, &o.CurrentPeriodEnd, &o.CreatedAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "scan error")
			return
		}
		orgs = append(orgs, o)
	}
	httputil.WriteJSON(w, http.StatusOK, orgs)
}

// POST /api/v1/admin/orgs/{id}/activate — SYSTEM_ADMIN: manually mark a tenant
// paid for N months (cash, Nequi, transfer). Extends from the later of the
// current period end or now, so renewals never lose unused days.
func (h *Handler) activateOrg(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")

	var body struct {
		Months int `json:"months"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Months < 1 || body.Months > 36 {
		httputil.WriteError(w, http.StatusBadRequest, "months must be between 1 and 36")
		return
	}

	var status string
	var periodEnd time.Time
	err := h.pool.QueryRow(r.Context(), `
		UPDATE organizations
		SET subscription_status = 'active',
		    current_period_end = GREATEST(COALESCE(current_period_end, NOW()), NOW()) + make_interval(months => $2),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING subscription_status, current_period_end
	`, orgID, body.Months).Scan(&status, &periodEnd)
	if err != nil {
		slog.Error("admin.activate-org", "err", err, "org", orgID)
		httputil.WriteError(w, http.StatusNotFound, "organization not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"subscription_status": status,
		"current_period_end":  periodEnd.UTC().Format(time.RFC3339),
	})
}

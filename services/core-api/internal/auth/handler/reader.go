package handler

import (
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/auth/me — returns the authenticated user's identity from the JWT claims.
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Server-side flag — localStorage alone made onboarding reappear on
	// every new browser/device.
	onboarded, err := h.svc.OnboardingCompleted(r.Context(), claims.UserID)
	if err != nil {
		onboarded = true // fail open: never re-show onboarding by accident
	}

	dpaAccepted, err := h.svc.DPAAccepted(r.Context(), claims.UserID)
	if err != nil {
		dpaAccepted = true // fail open: a lookup hiccup must never block the UI
	}

	resp := map[string]any{
		"user_id":              claims.UserID,
		"org_id":               claims.OrganizationID,
		"email":                claims.Email,
		"display_name":         claims.DisplayName,
		"roles":                claims.Roles,
		"permissions":          claims.Permissions,
		"onboarding_completed": onboarded,
		"dpa_accepted":         dpaAccepted,
		"data_reset_enabled":   h.dataResetOpen,
	}

	// Org name labels the current tenant; subscription state drives the trial
	// banner and the reactivation screen. A lookup failure is non-fatal — /me
	// still returns the identity (and entitled defaults to true so a hiccup
	// never locks the user out of their own UI).
	resp["entitled"] = true
	if name, status, trialEndsAt, currentPeriodEnd, err := h.svc.OrgInfo(r.Context(), claims.OrganizationID); err == nil {
		resp["org_name"] = name
		resp["subscription_status"] = status
		accessUntil := currentPeriodEnd
		if accessUntil == nil {
			accessUntil = trialEndsAt
		}
		// SYSTEM_ADMIN (the SaaS operator) is never gated.
		isOperator := false
		for _, role := range claims.Roles {
			if role == "SYSTEM_ADMIN" {
				isOperator = true
			}
		}
		resp["entitled"] = isOperator || middleware.Entitled(status, accessUntil)
		if trialEndsAt != nil {
			resp["trial_ends_at"] = trialEndsAt.UTC().Format(time.RFC3339)
			// Whole days left, rounded up, never negative.
			days := int(math.Ceil(time.Until(*trialEndsAt).Hours() / 24))
			if days < 0 {
				days = 0
			}
			resp["trial_days_left"] = days
		}
		if currentPeriodEnd != nil {
			resp["current_period_end"] = currentPeriodEnd.UTC().Format(time.RFC3339)
		}
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

// GET /api/v1/users — lists all org users with their current role (requires users:read).
func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	users, err := h.svc.ListOrgUsers(r.Context(), claims.OrganizationID)
	if err != nil {
		slog.Error("auth.list-users", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not list users")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]any{"items": users})
}

// DELETE /api/v1/users/{user_id} — soft-deactivates a team member.
// Requires users:deactivate. Cannot target yourself or the last admin.
func (h *Handler) deactivateUser(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	targetID := chi.URLParam(r, "user_id")

	if err := h.svc.DeactivateUser(r.Context(), claims.OrganizationID, claims.UserID, targetID); err != nil {
		slog.Warn("auth.deactivate-user", "err", err, "target", targetID)
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

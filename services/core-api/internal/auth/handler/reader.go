package handler

import (
	"math"
	"net/http"
	"time"

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

	resp := map[string]any{
		"user_id":              claims.UserID,
		"org_id":               claims.OrganizationID,
		"email":                claims.Email,
		"display_name":         claims.DisplayName,
		"roles":                claims.Roles,
		"permissions":          claims.Permissions,
		"onboarding_completed": onboarded,
		"data_reset_enabled":   h.dataResetOpen,
	}

	// Subscription state drives the trial banner. A lookup failure is non-fatal —
	// /me still returns the identity.
	if status, trialEndsAt, err := h.svc.Subscription(r.Context(), claims.OrganizationID); err == nil {
		resp["subscription_status"] = status
		if trialEndsAt != nil {
			resp["trial_ends_at"] = trialEndsAt.UTC().Format(time.RFC3339)
			// Whole days left, rounded up, never negative.
			days := int(math.Ceil(time.Until(*trialEndsAt).Hours() / 24))
			if days < 0 {
				days = 0
			}
			resp["trial_days_left"] = days
		}
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

package handler

import (
	"net/http"

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

	httputil.WriteJSON(w, http.StatusOK, map[string]any{
		"user_id":              claims.UserID,
		"org_id":               claims.OrganizationID,
		"email":                claims.Email,
		"display_name":         claims.DisplayName,
		"roles":                claims.Roles,
		"permissions":          claims.Permissions,
		"onboarding_completed": onboarded,
	})
}

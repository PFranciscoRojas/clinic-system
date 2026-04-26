package handler

import (
	"net/http"

	"sghcp/core-api/internal/shared/middleware"
)

// GET /api/v1/auth/me — returns the authenticated user's identity from the JWT claims.
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user_id": claims.UserID,
		"org_id":  claims.OrganizationID,
		"roles":   claims.Roles,
	})
}

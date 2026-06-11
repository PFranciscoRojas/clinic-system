package handler

import (
	"log/slog"
	"net/http"

	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
)

// POST /api/v1/auth/change-password — the caller rotates their own password.
func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.CurrentPassword == "" || body.NewPassword == "" {
		httputil.WriteError(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}

	if err := h.svc.ChangePassword(r.Context(), claims.UserID, body.CurrentPassword, body.NewPassword); err != nil {
		slog.Error("auth.change-password", "err", err)
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/auth/onboarding-complete — stamps the server-side flag.
func (h *Handler) onboardingComplete(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())
	if err := h.svc.CompleteOnboarding(r.Context(), claims.UserID); err != nil {
		slog.Error("auth.onboarding-complete", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not save onboarding state")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

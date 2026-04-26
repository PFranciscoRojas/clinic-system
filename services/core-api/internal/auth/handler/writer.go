package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/httputil"
)

type loginRequest struct {
	OrgSlug  string `json:"org_slug"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// POST /api/v1/auth/login
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OrgSlug == "" || req.Email == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "org_slug, email and password are required")
		return
	}

	pair, err := h.svc.Login(r.Context(), req.OrgSlug, req.Email, req.Password, httputil.ExtractIP(r), r.UserAgent())
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) || errors.Is(err, auth.ErrAccountLocked) {
			httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		slog.Error("auth.login unexpected error", "err", err)
		httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, pair)
}

// POST /api/v1/auth/refresh
func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken == "" {
		httputil.WriteError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	pair, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, pair)
}

// POST /api/v1/auth/logout
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken != "" {
		_ = h.svc.Logout(r.Context(), req.RefreshToken)
	}
	w.WriteHeader(http.StatusNoContent)
}

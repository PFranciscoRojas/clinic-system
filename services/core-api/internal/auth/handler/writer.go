package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"sghcp/core-api/internal/auth"
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
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OrgSlug == "" || req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "org_slug, email and password are required")
		return
	}

	pair, err := h.svc.Login(r.Context(), req.OrgSlug, req.Email, req.Password, extractIP(r), r.UserAgent())
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) || errors.Is(err, auth.ErrAccountLocked) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		slog.Error("auth.login unexpected error", "err", err)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	writeJSON(w, http.StatusOK, pair)
}

// POST /api/v1/auth/refresh
func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	pair, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	writeJSON(w, http.StatusOK, pair)
}

// POST /api/v1/auth/logout
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken != "" {
		_ = h.svc.Logout(r.Context(), req.RefreshToken)
	}
	w.WriteHeader(http.StatusNoContent)
}

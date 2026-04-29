package handler

import (
	"log/slog"
	"net/http"

	authdto "sghcp/core-api/internal/auth/dto"
	"sghcp/core-api/internal/shared/httputil"
)

// POST /api/v1/auth/login
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req authdto.LoginRequest
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
		slog.Error("auth.login", "err", err)
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, pair)
}

// POST /api/v1/auth/refresh
func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	var req authdto.RefreshRequest
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
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, pair)
}

// POST /api/v1/auth/logout
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	var req authdto.LogoutRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken != "" {
		_ = h.svc.Logout(r.Context(), req.RefreshToken)
	}
	w.WriteHeader(http.StatusNoContent)
}

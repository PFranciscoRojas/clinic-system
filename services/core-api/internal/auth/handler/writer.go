package handler

import (
	"log/slog"
	"net/http"

	authdto "sghcp/core-api/internal/auth/dto"
	"sghcp/core-api/internal/shared/httputil"
	"sghcp/core-api/internal/shared/middleware"
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

// POST /api/v1/auth/register — public, consumes a one-time invite code.
func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var req authdto.RegisterRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.InviteCode == "" || req.Email == "" || req.Password == "" || req.DisplayName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "invite_code, email, password and display_name are required")
		return
	}

	pair, err := h.svc.Register(r.Context(), req.InviteCode, req.Email, req.Password, req.DisplayName)
	if err != nil {
		slog.Error("auth.register", "err", err)
		writeErr(w, err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, pair)
}

// POST /api/v1/auth/invite — protected, requires users:create permission.
func (h *Handler) invite(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var req authdto.InviteRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	code, expiresAt, err := h.svc.Invite(r.Context(), claims.OrganizationID, claims.UserID, req.RoleName)
	if err != nil {
		slog.Error("auth.invite", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not generate invite")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, authdto.InviteResponse{
		InviteCode: code,
		ExpiresAt:  expiresAt.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// POST /api/v1/auth/reset-password — protected, requires users:update permission.
func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var req authdto.ResetPasswordRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TargetEmail == "" || req.NewPassword == "" {
		httputil.WriteError(w, http.StatusBadRequest, "target_email and new_password are required")
		return
	}

	if err := h.svc.ResetPassword(r.Context(), claims.OrganizationID, req.TargetEmail, req.NewPassword); err != nil {
		slog.Error("auth.reset-password", "err", err)
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

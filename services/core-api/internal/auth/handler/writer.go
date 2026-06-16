package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"sghcp/core-api/internal/auth"
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
	if req.Email == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	pair, err := h.svc.Login(r.Context(), req.Email, req.Password, httputil.ExtractIP(r), r.UserAgent())
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

// POST /api/v1/auth/signup — public, self-serve tenant provisioning.
// Creates an organization + owner in 'trialing' and emails a verification link.
// The account cannot log in until the address is confirmed.
func (h *Handler) signup(w http.ResponseWriter, r *http.Request) {
	var req authdto.SignupRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FullName == "" || req.Email == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "full_name, email and password are required")
		return
	}

	err := h.svc.Signup(r.Context(), req.FullName, req.Email, req.Password)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusCreated)
	case errors.Is(err, auth.ErrEmailAlreadyExists):
		httputil.WriteError(w, http.StatusConflict, "ese correo ya tiene una cuenta")
	case errors.Is(err, auth.ErrWeakPassword):
		httputil.WriteError(w, http.StatusUnprocessableEntity, "la contraseña debe tener al menos 8 caracteres")
	case errors.Is(err, auth.ErrInvalidCredentials):
		httputil.WriteError(w, http.StatusBadRequest, "revisa el nombre y el correo")
	default:
		slog.Error("auth.signup", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not create account")
	}
}

// POST /api/v1/auth/verify-email — public, consumes a one-time verification token.
func (h *Handler) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var req authdto.VerifyEmailRequest
	if err := httputil.DecodeJSON(r, &req); err != nil || req.Token == "" {
		httputil.WriteError(w, http.StatusBadRequest, "token is required")
		return
	}
	if err := h.svc.VerifyEmail(r.Context(), req.Token); err != nil {
		if errors.Is(err, auth.ErrInviteInvalid) {
			httputil.WriteError(w, http.StatusBadRequest, "el enlace es inválido o expiró")
			return
		}
		slog.Error("auth.verify-email", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not verify email")
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

// POST /api/v1/auth/forgot-password — public, self-service.
// Always returns 200 regardless of whether the email exists, to avoid
// account enumeration. The email (if any) is sent asynchronously.
func (h *Handler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var req authdto.ForgotPasswordRequest
	if err := httputil.DecodeJSON(r, &req); err != nil || req.Email == "" {
		httputil.WriteError(w, http.StatusBadRequest, "email is required")
		return
	}
	if err := h.svc.RequestPasswordReset(r.Context(), req.Email); err != nil {
		slog.Error("auth.forgot-password", "err", err)
		// Still answer 200 — never leak internal state to the caller.
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/v1/auth/reset-password-confirm — public, consumes a reset token.
func (h *Handler) confirmReset(w http.ResponseWriter, r *http.Request) {
	var req authdto.ConfirmResetRequest
	if err := httputil.DecodeJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Token == "" || req.NewPassword == "" {
		httputil.WriteError(w, http.StatusBadRequest, "token and new_password are required")
		return
	}
	if err := h.svc.ConfirmPasswordReset(r.Context(), req.Token, req.NewPassword); err != nil {
		if errors.Is(err, auth.ErrWeakPassword) {
			httputil.WriteError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
			return
		}
		if errors.Is(err, auth.ErrInviteInvalid) {
			httputil.WriteError(w, http.StatusBadRequest, "el enlace es inválido o expiró")
			return
		}
		slog.Error("auth.reset-password-confirm", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PATCH /api/v1/auth/profile — updates the caller's display_name and returns fresh tokens.
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	claims := middleware.ClaimsFromContext(r.Context())

	var body struct {
		DisplayName string `json:"display_name"`
	}
	if err := httputil.DecodeJSON(r, &body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.DisplayName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "display_name is required")
		return
	}

	pair, err := h.svc.UpdateProfile(r.Context(), claims.UserID, body.DisplayName)
	if err != nil {
		slog.Error("auth.update-profile", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "could not update profile")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, pair)
}

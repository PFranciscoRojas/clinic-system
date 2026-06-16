package handler

import (
	"errors"
	"net/http"

	"sghcp/core-api/internal/auth"
	"sghcp/core-api/internal/shared/httputil"
)

var authErrors = httputil.ErrorMapper(func(err error) (int, string) {
	switch {
	case errors.Is(err, auth.ErrInvalidCredentials) || errors.Is(err, auth.ErrAccountLocked):
		return http.StatusUnauthorized, "invalid credentials"
	case errors.Is(err, auth.ErrAccountInactive):
		return http.StatusUnauthorized, "account inactive"
	case errors.Is(err, auth.ErrInviteInvalid):
		return http.StatusBadRequest, "invite code is invalid or expired"
	case errors.Is(err, auth.ErrEmailAlreadyExists):
		return http.StatusConflict, "ese correo ya tiene una cuenta"
	case errors.Is(err, auth.ErrEmailNotVerified):
		return http.StatusForbidden, "confirma tu correo antes de iniciar sesión"
	case errors.Is(err, auth.ErrWeakPassword):
		return http.StatusBadRequest, "password must be at least 8 characters"
	case errors.Is(err, auth.ErrUserNotFound):
		return http.StatusNotFound, "user not found"
	case errors.Is(err, auth.ErrRoleNotFound):
		return http.StatusBadRequest, "role not found"
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, authErrors)
}

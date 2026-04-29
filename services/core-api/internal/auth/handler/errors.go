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
	default:
		return 0, ""
	}
})

func writeErr(w http.ResponseWriter, err error) {
	httputil.WriteErrorFrom(w, err, authErrors)
}
